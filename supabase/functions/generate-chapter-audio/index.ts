import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RUNPOD_API_KEY = Deno.env.get("RUNPOD_API_KEY");
const RUNPOD_ENDPOINT_ID = Deno.env.get("RUNPOD_ENDPOINT_ID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const WORDS_PER_MINUTE = 160.0;
const MAX_TTS_TOKENS = 400;
const FALLBACK_MAX_TOKENS = 240;
const FALLBACK_MAX_CHARS = 600;
const CHARS_PER_TOKEN = 4;
const MAX_CONCURRENT_JOBS = 5;

// Input validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateInputs(bookId: unknown, chapterIndex: unknown, targetDurationMinutes: unknown): { bookId: string; chapterIndex: number; targetDurationMinutes: number } {
  if (!bookId || typeof bookId !== "string" || !UUID_REGEX.test(bookId)) {
    throw new Error("Invalid bookId format");
  }
  
  if (chapterIndex === undefined || typeof chapterIndex !== "number" || chapterIndex < 0 || !Number.isInteger(chapterIndex)) {
    throw new Error("chapterIndex must be a non-negative integer");
  }
  
  const duration = targetDurationMinutes ?? 5;
  if (typeof duration !== "number" || duration < 1 || duration > 60) {
    throw new Error("targetDurationMinutes must be between 1 and 60");
  }
  
  return { bookId, chapterIndex, targetDurationMinutes: duration };
}

/**
 * Map errors to safe client messages - prevents information leakage
 */
function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid bookid")) return "Invalid book identifier";
    if (msg.includes("chapterindex")) return "Invalid chapter index";
    if (msg.includes("targetdurationminutes")) return "Invalid duration parameter";
    if (msg.includes("book not found") || msg.includes("access denied")) return "Book not found or access denied";
    if (msg.includes("unauthorized") || msg.includes("authorization")) return "Authentication required";
    if (msg.includes("epub") || msg.includes("invalid epub")) return "Invalid book file format";
    if (msg.includes("runpod") || msg.includes("tts")) return "Audio generation service temporarily unavailable";
    if (msg.includes("chapter") && msg.includes("not found")) return "Chapter not found";
  }
  return "An unexpected error occurred. Please try again later.";
}

/**
 * Estimate spoken duration for text in seconds
 */
function estimateDurationSeconds(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  return (words / WORDS_PER_MINUTE) * 60.0;
}

/**
 * Estimate token count (conservative)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Match sentences ending with . ! ? followed by space or end
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Split long text into chunks of max tokens or chars
 */
function splitLongText(text: string): string[] {
  const chunks: string[] = [];
  const maxChars = Math.min(FALLBACK_MAX_TOKENS * CHARS_PER_TOKEN, FALLBACK_MAX_CHARS);
  
  // Try splitting by semicolons first
  const semiParts = text.split(/;+/).map(p => p.trim()).filter(p => p.length > 0);
  
  for (const part of semiParts) {
    if (part.length <= maxChars) {
      chunks.push(part);
    } else {
      // Try splitting by commas
      const commaParts = part.split(/,+/).map(p => p.trim()).filter(p => p.length > 0);
      let currentChunk = "";
      
      for (const commaPart of commaParts) {
        if (commaPart.length > maxChars) {
          // Hard split by character count
          if (currentChunk) {
            chunks.push(currentChunk);
            currentChunk = "";
          }
          for (let i = 0; i < commaPart.length; i += maxChars) {
            chunks.push(commaPart.substring(i, i + maxChars).trim());
          }
        } else if (currentChunk.length + commaPart.length + 2 <= maxChars) {
          currentChunk = currentChunk ? currentChunk + ", " + commaPart : commaPart;
        } else {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = commaPart;
        }
      }
      if (currentChunk) chunks.push(currentChunk);
    }
  }
  
  return chunks.filter(c => c.length > 0);
}

/**
 * Split paragraph into sentence-based chunks
 * If sentence > 400 tokens, split to max 240 tokens or 600 chars
 */
function splitParagraphIntoSentenceChunks(text: string): string[] {
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  
  for (const sentence of sentences) {
    const tokens = estimateTokens(sentence);
    
    if (tokens <= MAX_TTS_TOKENS) {
      // Sentence fits within limit
      chunks.push(sentence);
    } else {
      // Sentence too long, split further
      const subChunks = splitLongText(sentence);
      chunks.push(...subChunks);
    }
  }
  
  return chunks.filter(c => c.length > 0);
}

/**
 * Submit a TTS job to RunPod - FIRE AND FORGET
 * Returns job_id immediately without waiting for completion
 */
async function submitTtsJob(text: string): Promise<string> {
  const runUrl = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`;

  const response = await fetch(runUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RUNPOD_API_KEY}`,
    },
    body: JSON.stringify({
      input: { prompt: text },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`RunPod submit failed: ${error}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Extract text content from HTML, matching frontend logic
 */
function extractTextFromHtml(html: string): string {
  const blockMatches = html.matchAll(/<(p|h[1-6]|div|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi);
  const paragraphs: string[] = [];
  
  for (const match of blockMatches) {
    let text = match[2]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      .replace(/\s+/g, " ")
      .trim();
    
    if (text.length > 0) {
      paragraphs.push(text);
    }
  }
  
  return paragraphs.join("\n\n");
}

/**
 * Parse EPUB and extract paragraphs for a specific chapter
 */
async function parseChapterParagraphs(
  epubArrayBuffer: ArrayBuffer,
  targetChapterIndex: number
): Promise<{ paragraphIndex: number; text: string; estimatedDuration: number }[]> {
  const zip = await JSZip.loadAsync(epubArrayBuffer);

  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("Invalid EPUB: Missing container.xml");

  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootfileMatch) throw new Error("Invalid EPUB: Cannot find rootfile");

  const opfPath = rootfileMatch[1];
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);

  const opfContent = await zip.file(opfPath)?.async("text");
  if (!opfContent) throw new Error("Invalid EPUB: Missing OPF file");

  const spineItemRefs: string[] = [];
  const spineMatches = opfContent.matchAll(/itemref[^>]*idref="([^"]+)"/g);
  for (const match of spineMatches) {
    spineItemRefs.push(match[1]);
  }

  const manifestMap = new Map<string, string>();
  const itemMatches = opfContent.matchAll(/<item\s+([^>]+)>/g);
  for (const match of itemMatches) {
    const attrs = match[1];
    const idMatch = attrs.match(/id="([^"]+)"/);
    const hrefMatch = attrs.match(/href="([^"]+)"/);
    if (idMatch && hrefMatch) {
      manifestMap.set(idMatch[1], hrefMatch[1]);
    }
  }

  let validChapterCount = 0;
  let actualSpineIndex = -1;

  for (let i = 0; i < spineItemRefs.length; i++) {
    const idref = spineItemRefs[i];
    const href = manifestMap.get(idref);
    if (!href) continue;

    const fullPath = opfDir + href;
    const content = await zip.file(fullPath)?.async("text");
    if (!content) continue;

    const textContent = extractTextFromHtml(content);
    
    if (textContent.trim()) {
      if (validChapterCount === targetChapterIndex) {
        actualSpineIndex = i;
        break;
      }
      validChapterCount++;
    }
  }

  if (actualSpineIndex === -1) {
    throw new Error(`Chapter ${targetChapterIndex} not found (only ${validChapterCount} valid chapters)`);
  }

  const idref = spineItemRefs[actualSpineIndex];
  const href = manifestMap.get(idref);
  if (!href) throw new Error(`No href found for chapter at spine index ${actualSpineIndex}`);

  const fullPath = opfDir + href;
  const content = await zip.file(fullPath)?.async("text");
  if (!content) throw new Error(`No content found at: ${fullPath}`);

  const paragraphs: { paragraphIndex: number; text: string; estimatedDuration: number }[] = [];
  
  const blockMatches = content.matchAll(/<(p|h[1-6]|div|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi);
  let paragraphIdx = 0;

  for (const match of blockMatches) {
    let text = match[2]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      .replace(/\s+/g, " ")
      .trim();

    if (text.length > 0) {
      const estimatedDuration = estimateDurationSeconds(text);
      paragraphs.push({
        paragraphIndex: paragraphIdx,
        text,
        estimatedDuration,
      });
      paragraphIdx++;
    }
  }

  return paragraphs;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
      throw new Error("RunPod credentials not configured");
    }

    const rawInput = await req.json();
    
    // Validate inputs with proper type checking
    const { bookId, chapterIndex, targetDurationMinutes } = validateInputs(
      rawInput.bookId,
      rawInput.chapterIndex,
      rawInput.targetDurationMinutes
    );
    
    console.log(`[generate-chapter-audio] Request: book=${bookId}, chapter=${chapterIndex}, target=${targetDurationMinutes}min`);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Authorization header required");
    }

    const supabaseUser = createClient(
      SUPABASE_URL!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { data: book, error: bookError } = await supabaseUser
      .from("books")
      .select("id, epub_url")
      .eq("id", bookId)
      .eq("user_id", user.id)
      .single();

    if (bookError || !book) {
      throw new Error("Book not found or access denied");
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get existing tracks for this chapter
    const { data: existingTracks } = await supabaseAdmin
      .from("audio_tracks")
      .select("paragraph_index, chunk_index, total_chunks, status")
      .eq("book_id", bookId)
      .eq("chapter_index", chapterIndex)
      .order("paragraph_index", { ascending: true })
      .order("chunk_index", { ascending: true });

    // Build set of existing chunks (any status except NOT_GENERATED)
    const existingChunks = new Set<string>();
    for (const t of existingTracks || []) {
      if (t.status !== "NOT_GENERATED") {
        existingChunks.add(`${t.paragraph_index}_${t.chunk_index}`);
      }
    }

    // Get signed URL for EPUB
    const epubPath = book.epub_url.split("/").slice(-2).join("/");
    const { data: signedData, error: signError } = await supabaseUser.storage
      .from("epub-files")
      .createSignedUrl(epubPath, 3600);

    if (signError || !signedData?.signedUrl) {
      throw new Error("Failed to access EPUB file");
    }

    // Download and parse EPUB
    const epubResponse = await fetch(signedData.signedUrl);
    if (!epubResponse.ok) {
      throw new Error(`Failed to download EPUB: ${epubResponse.statusText}`);
    }
    const epubArrayBuffer = await epubResponse.arrayBuffer();
    const paragraphs = await parseChapterParagraphs(epubArrayBuffer, chapterIndex);

    console.log(`[generate-chapter-audio] Chapter ${chapterIndex}: ${paragraphs.length} paragraphs`);

    // Build list of chunks that need generation for first 5 minutes
    interface ChunkToGenerate {
      paragraphIndex: number;
      chunkIndex: number;
      totalChunks: number;
      text: string;
      estimatedDuration: number;
    }
    
    const chunksToGenerate: ChunkToGenerate[] = [];
    const targetDurationSeconds = targetDurationMinutes * 60;
    let accumulatedDuration = 0;

    for (const para of paragraphs) {
      if (accumulatedDuration >= targetDurationSeconds) break;
      
      const sentenceChunks = splitParagraphIntoSentenceChunks(para.text);
      const totalChunks = sentenceChunks.length;
      const durationPerChunk = para.estimatedDuration / totalChunks;
      
      for (let i = 0; i < sentenceChunks.length; i++) {
        const key = `${para.paragraphIndex}_${i}`;
        
        // Skip if already exists (PENDING, GENERATING, or GENERATED)
        if (existingChunks.has(key)) {
          accumulatedDuration += durationPerChunk;
          continue;
        }
        
        if (accumulatedDuration >= targetDurationSeconds) break;
        
        chunksToGenerate.push({
          paragraphIndex: para.paragraphIndex,
          chunkIndex: i,
          totalChunks,
          text: sentenceChunks[i],
          estimatedDuration: durationPerChunk,
        });
        
        accumulatedDuration += durationPerChunk;
      }
    }

    if (chunksToGenerate.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No new chunks need generation",
          submitted: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-chapter-audio] ${chunksToGenerate.length} chunks to generate for ~${targetDurationMinutes}min`);

    // Submit jobs in parallel batches of MAX_CONCURRENT_JOBS
    let submittedCount = 0;
    const batchSize = MAX_CONCURRENT_JOBS;
    
    for (let batchStart = 0; batchStart < chunksToGenerate.length; batchStart += batchSize) {
      const batch = chunksToGenerate.slice(batchStart, batchStart + batchSize);
      
      console.log(`[generate-chapter-audio] Submitting batch ${Math.floor(batchStart / batchSize) + 1}: ${batch.length} jobs`);
      
      // Submit all jobs in batch concurrently
      const jobPromises = batch.map(async (chunk) => {
        try {
          const jobId = await submitTtsJob(chunk.text);
          
          // Store in DB with PENDING status
          await supabaseAdmin
            .from("audio_tracks")
            .upsert({
              book_id: bookId,
              chapter_index: chapterIndex,
              paragraph_index: chunk.paragraphIndex,
              chunk_index: chunk.chunkIndex,
              total_chunks: chunk.totalChunks,
              text: chunk.text,
              estimated_duration_seconds: chunk.estimatedDuration,
              status: "PENDING",
              runpod_job_id: jobId,
            }, { onConflict: "book_id,chapter_index,paragraph_index,chunk_index" });
          
          console.log(`[generate-chapter-audio] Submitted p${chunk.paragraphIndex}c${chunk.chunkIndex} -> job ${jobId}`);
          return { success: true, chunk };
        } catch (err) {
          console.error(`[generate-chapter-audio] Failed to submit p${chunk.paragraphIndex}c${chunk.chunkIndex}:`, err);
          return { success: false, chunk };
        }
      });
      
      // Wait for all jobs in batch to be submitted
      const results = await Promise.all(jobPromises);
      submittedCount += results.filter(r => r.success).length;
    }

    // Update book status to processing
    await supabaseAdmin
      .from("books")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", bookId);

    console.log(`[generate-chapter-audio] Submitted ${submittedCount} jobs total`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Submitted ${submittedCount} TTS jobs`,
        submitted: submittedCount,
        totalChunks: chunksToGenerate.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[generate-chapter-audio] Full error:", error);
    return new Response(
      JSON.stringify({ error: getSafeErrorMessage(error) }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

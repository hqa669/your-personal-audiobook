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
const TARGET_CHUNK_TOKENS = 100;
const MAX_TTS_TOKENS = 400;
const CHARS_PER_TOKEN = 4;

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
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Split text by semicolons first
 */
function splitBySemicolon(text: string): string[] {
  const parts = text.split(/;+/).map(p => p.trim()).filter(p => p.length > 0);
  return parts.length > 1 ? parts : [text];
}

/**
 * Split text by commas
 */
function splitByComma(text: string): string[] {
  const parts = text.split(/,+/).map(p => p.trim()).filter(p => p.length > 0);
  return parts.length > 1 ? parts : [text];
}

/**
 * Hierarchical split: first semicolons, then commas if still too large
 */
function splitByPunctuation(text: string): string[] {
  // First try splitting by semicolons
  const semiParts = splitBySemicolon(text);
  
  const result: string[] = [];
  for (const part of semiParts) {
    if (estimateTokens(part) > TARGET_CHUNK_TOKENS) {
      // If still too large, split by commas
      const commaParts = splitByComma(part);
      result.push(...commaParts);
    } else {
      result.push(part);
    }
  }
  
  return result.length > 0 ? result : [text];
}

/**
 * Split paragraph into ~100 token streaming chunks
 */
function splitParagraphIntoStreamingChunks(text: string): string[] {
  const totalTokens = estimateTokens(text);
  
  if (totalTokens <= TARGET_CHUNK_TOKENS) {
    return [text];
  }

  const chunks: string[] = [];
  const sentences = splitIntoSentences(text);
  let currentChunk = "";

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    const currentTokens = estimateTokens(currentChunk);

    // If sentence exceeds TARGET tokens, split by punctuation (semicolons, then commas)
    if (sentenceTokens > TARGET_CHUNK_TOKENS) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      const subParts = splitByPunctuation(sentence);
      let subChunk = "";

      for (const part of subParts) {
        const partTokens = estimateTokens(part);
        const subChunkTokens = estimateTokens(subChunk);

        if (partTokens > TARGET_CHUNK_TOKENS) {
          // Still too large - try to fit what we can, then hard split
          if (subChunk.trim()) {
            chunks.push(subChunk.trim());
            subChunk = "";
          }
          // Hard split by character count if still over limit
          const maxChars = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;
          for (let i = 0; i < part.length; i += maxChars) {
            const hardChunk = part.substring(i, i + maxChars).trim();
            if (hardChunk) chunks.push(hardChunk);
          }
        } else if (subChunkTokens + partTokens <= TARGET_CHUNK_TOKENS) {
          subChunk = subChunk ? subChunk + " " + part : part;
        } else {
          if (subChunk.trim()) chunks.push(subChunk.trim());
          subChunk = part;
        }
      }
      if (subChunk.trim()) chunks.push(subChunk.trim());
    }
    else if (currentTokens + sentenceTokens > TARGET_CHUNK_TOKENS && currentChunk.trim()) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
    else {
      currentChunk = currentChunk ? currentChunk + " " + sentence : sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
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
  console.log(`[generate-chapter-audio] Submitted job ${data.id}`);
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

    const { bookId, chapterIndex, targetDurationMinutes = 5 } = await req.json();
    if (!bookId || chapterIndex === undefined) {
      throw new Error("bookId and chapterIndex are required");
    }

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
      .select("paragraph_index, chunk_index, total_chunks, status, estimated_duration_seconds")
      .eq("book_id", bookId)
      .eq("chapter_index", chapterIndex)
      .order("paragraph_index", { ascending: true })
      .order("chunk_index", { ascending: true });

    // Build map of paragraph -> chunks status
    const paragraphStatus = new Map<number, { 
      chunks: Map<number, string>; 
      totalChunks: number;
      estimatedDuration: number;
    }>();
    
    for (const t of existingTracks || []) {
      if (!paragraphStatus.has(t.paragraph_index)) {
        paragraphStatus.set(t.paragraph_index, { 
          chunks: new Map(), 
          totalChunks: t.total_chunks,
          estimatedDuration: Number(t.estimated_duration_seconds)
        });
      }
      paragraphStatus.get(t.paragraph_index)!.chunks.set(t.chunk_index, t.status);
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

    // Find paragraphs/chunks that need generation
    const targetDurationSeconds = targetDurationMinutes * 60;
    let accumulatedDuration = 0;
    
    interface ChunkToGenerate {
      paragraphIndex: number;
      chunkIndex: number;
      totalChunks: number;
      text: string;
      paragraphDuration: number;
    }
    const chunksToGenerate: ChunkToGenerate[] = [];

    for (const para of paragraphs) {
      const existing = paragraphStatus.get(para.paragraphIndex);
      
      const textChunks = splitParagraphIntoStreamingChunks(para.text);
      const totalChunks = textChunks.length;
      
      // Check if this paragraph is fully generated or pending
      if (existing && existing.totalChunks === totalChunks) {
        let allInProgress = true;
        for (let i = 0; i < totalChunks; i++) {
          const status = existing.chunks.get(i);
          // Skip if already GENERATED, PENDING, or GENERATING
          if (status !== "GENERATED" && status !== "PENDING" && status !== "GENERATING") {
            allInProgress = false;
            break;
          }
        }
        if (allInProgress) {
          accumulatedDuration += para.estimatedDuration;
          continue;
        }
      }

      // Queue chunks that need generation
      if (accumulatedDuration < targetDurationSeconds) {
        for (let i = 0; i < textChunks.length; i++) {
          const existingStatus = existing?.chunks.get(i);
          // Skip already done or in-progress
          if (existingStatus === "GENERATED" || existingStatus === "PENDING" || existingStatus === "GENERATING") {
            continue;
          }
          
          chunksToGenerate.push({
            paragraphIndex: para.paragraphIndex,
            chunkIndex: i,
            totalChunks,
            text: textChunks[i],
            paragraphDuration: para.estimatedDuration,
          });
        }
        accumulatedDuration += para.estimatedDuration;
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

    console.log(`[generate-chapter-audio] Submitting ${chunksToGenerate.length} jobs for ~${targetDurationMinutes} min buffer`);

    // Submit jobs and store job_id in DB - FIRE AND FORGET
    let submittedCount = 0;
    const submittedJobs: { paragraphIndex: number; chunkIndex: number; jobId: string }[] = [];

    for (const chunk of chunksToGenerate) {
      try {
        console.log(`[generate-chapter-audio] Submitting p${chunk.paragraphIndex}c${chunk.chunkIndex} (${estimateTokens(chunk.text)} tokens)`);
        
        // Submit job to RunPod
        const jobId = await submitTtsJob(chunk.text);
        
        // Store in DB with PENDING status and job_id
        await supabaseAdmin
          .from("audio_tracks")
          .upsert({
            book_id: bookId,
            chapter_index: chapterIndex,
            paragraph_index: chunk.paragraphIndex,
            chunk_index: chunk.chunkIndex,
            total_chunks: chunk.totalChunks,
            text: chunk.text,
            estimated_duration_seconds: chunk.paragraphDuration / chunk.totalChunks,
            status: "PENDING",
            runpod_job_id: jobId,
          }, { onConflict: "book_id,chapter_index,paragraph_index,chunk_index" });

        submittedJobs.push({
          paragraphIndex: chunk.paragraphIndex,
          chunkIndex: chunk.chunkIndex,
          jobId,
        });
        submittedCount++;
      } catch (err) {
        console.error(`[generate-chapter-audio] Error submitting p${chunk.paragraphIndex}c${chunk.chunkIndex}:`, err);
        // Mark as NOT_GENERATED for retry
        await supabaseAdmin
          .from("audio_tracks")
          .upsert({
            book_id: bookId,
            chapter_index: chapterIndex,
            paragraph_index: chunk.paragraphIndex,
            chunk_index: chunk.chunkIndex,
            total_chunks: chunk.totalChunks,
            text: chunk.text,
            estimated_duration_seconds: chunk.paragraphDuration / chunk.totalChunks,
            status: "NOT_GENERATED",
          }, { onConflict: "book_id,chapter_index,paragraph_index,chunk_index" });
      }
    }

    console.log(`[generate-chapter-audio] Submitted ${submittedCount} jobs, returning immediately`);

    // Return immediately - do NOT wait for completion
    return new Response(
      JSON.stringify({
        success: true,
        message: `Submitted ${submittedCount} audio jobs`,
        submitted: submittedCount,
        total: chunksToGenerate.length,
        jobs: submittedJobs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[generate-chapter-audio] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

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

const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 120000;
const WORDS_PER_MINUTE = 160.0;
const MAX_TTS_TOKENS = 400;
const CHARS_PER_TOKEN = 4; // Conservative estimate

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
 * Check if text fits within token limit
 */
function fitsInTokenLimit(text: string): boolean {
  return estimateTokens(text) <= MAX_TTS_TOKENS;
}

/**
 * Split text into sentences
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or end
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Split sentence by secondary punctuation (comma, semicolon)
 */
function splitByPunctuation(text: string): string[] {
  const parts = text.split(/[,;]+/).map(p => p.trim()).filter(p => p.length > 0);
  return parts.length > 0 ? parts : [text];
}

/**
 * Split paragraph into token-safe chunks
 * Priority: sentences > punctuation > fail gracefully
 */
function splitParagraphIntoChunks(text: string): string[] {
  // If it fits, return as-is
  if (fitsInTokenLimit(text)) {
    return [text];
  }

  const chunks: string[] = [];
  const sentences = splitIntoSentences(text);
  let currentChunk = "";

  for (const sentence of sentences) {
    // Check if this sentence alone is too long
    if (!fitsInTokenLimit(sentence)) {
      // Flush current chunk first
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }

      // Try splitting by punctuation
      const subParts = splitByPunctuation(sentence);
      let subChunk = "";

      for (const part of subParts) {
        if (!fitsInTokenLimit(part)) {
          // Single part still too long - last resort: hard split
          console.warn(`[chunker] Sentence part exceeds token limit, hard splitting: ${part.substring(0, 50)}...`);
          if (subChunk.trim()) {
            chunks.push(subChunk.trim());
            subChunk = "";
          }
          // Hard split by character limit
          const maxChars = MAX_TTS_TOKENS * CHARS_PER_TOKEN - 50; // Buffer
          for (let i = 0; i < part.length; i += maxChars) {
            const hardChunk = part.substring(i, i + maxChars).trim();
            if (hardChunk) chunks.push(hardChunk);
          }
        } else if (fitsInTokenLimit(subChunk + " " + part)) {
          subChunk = subChunk ? subChunk + " " + part : part;
        } else {
          if (subChunk.trim()) chunks.push(subChunk.trim());
          subChunk = part;
        }
      }
      if (subChunk.trim()) chunks.push(subChunk.trim());
    } else if (fitsInTokenLimit(currentChunk + " " + sentence)) {
      // Add sentence to current chunk
      currentChunk = currentChunk ? currentChunk + " " + sentence : sentence;
    } else {
      // Flush current chunk and start new one
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }

  // Don't forget remaining chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(c => c.length > 0);
}

/**
 * Submit a TTS job to RunPod
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
 * Wait for a RunPod job to complete
 */
async function waitForCompletion(jobId: string): Promise<string> {
  const statusUrl = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/${jobId}`;
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    });

    if (!response.ok) {
      throw new Error(`RunPod status check failed: ${await response.text()}`);
    }

    const data = await response.json();
    const status = data.status;

    if (status === "COMPLETED") {
      return data.output.audio_base64;
    }

    if (status === "FAILED" || status === "CANCELLED") {
      throw new Error(`RunPod job ${status}: ${JSON.stringify(data)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("RunPod TTS job timed out");
}

/**
 * Convert base64 to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Parse WAV header to get audio data offset and sample info
 */
function parseWavHeader(wavBytes: Uint8Array): {
  dataOffset: number;
  dataSize: number;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
} {
  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  
  // Find 'data' chunk
  let offset = 12; // Skip RIFF header
  while (offset < wavBytes.length - 8) {
    const chunkId = String.fromCharCode(
      wavBytes[offset], wavBytes[offset + 1], 
      wavBytes[offset + 2], wavBytes[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);
    
    if (chunkId === "fmt ") {
      return {
        dataOffset: 0,
        dataSize: 0,
        numChannels: view.getUint16(offset + 10, true),
        sampleRate: view.getUint32(offset + 12, true),
        bitsPerSample: view.getUint16(offset + 22, true),
      };
    }
    offset += 8 + chunkSize;
  }
  
  throw new Error("Invalid WAV: fmt chunk not found");
}

/**
 * Extract raw audio data from WAV (skip header, get data chunk)
 */
function extractWavData(wavBytes: Uint8Array): Uint8Array {
  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
  
  let offset = 12; // Skip RIFF header
  while (offset < wavBytes.length - 8) {
    const chunkId = String.fromCharCode(
      wavBytes[offset], wavBytes[offset + 1], 
      wavBytes[offset + 2], wavBytes[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);
    
    if (chunkId === "data") {
      return wavBytes.slice(offset + 8, offset + 8 + chunkSize);
    }
    offset += 8 + chunkSize;
  }
  
  throw new Error("Invalid WAV: data chunk not found");
}

/**
 * Concatenate multiple WAV files into one
 * Assumes all WAVs have the same format (sample rate, channels, bits)
 */
function concatenateWavFiles(wavArrays: Uint8Array[]): Uint8Array {
  if (wavArrays.length === 0) {
    throw new Error("No WAV files to concatenate");
  }
  
  if (wavArrays.length === 1) {
    return wavArrays[0];
  }

  // Get format info from first file
  const firstView = new DataView(wavArrays[0].buffer, wavArrays[0].byteOffset, wavArrays[0].byteLength);
  
  // Find fmt chunk in first file
  let fmtOffset = 12;
  let numChannels = 1;
  let sampleRate = 22050;
  let bitsPerSample = 16;
  let blockAlign = 2;
  let byteRate = 44100;
  
  while (fmtOffset < wavArrays[0].length - 8) {
    const chunkId = String.fromCharCode(
      wavArrays[0][fmtOffset], wavArrays[0][fmtOffset + 1],
      wavArrays[0][fmtOffset + 2], wavArrays[0][fmtOffset + 3]
    );
    const chunkSize = firstView.getUint32(fmtOffset + 4, true);
    
    if (chunkId === "fmt ") {
      numChannels = firstView.getUint16(fmtOffset + 10, true);
      sampleRate = firstView.getUint32(fmtOffset + 12, true);
      byteRate = firstView.getUint32(fmtOffset + 16, true);
      blockAlign = firstView.getUint16(fmtOffset + 20, true);
      bitsPerSample = firstView.getUint16(fmtOffset + 22, true);
      break;
    }
    fmtOffset += 8 + chunkSize;
  }

  // Extract and concatenate all audio data
  const audioDataArrays: Uint8Array[] = [];
  let totalDataSize = 0;
  
  for (const wav of wavArrays) {
    const data = extractWavData(wav);
    audioDataArrays.push(data);
    totalDataSize += data.length;
  }

  // Build new WAV file
  const headerSize = 44;
  const totalSize = headerSize + totalDataSize;
  const result = new Uint8Array(totalSize);
  const resultView = new DataView(result.buffer);

  // RIFF header
  result.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  resultView.setUint32(4, totalSize - 8, true); // File size - 8
  result.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt chunk
  result.set([0x66, 0x6D, 0x74, 0x20], 12); // "fmt "
  resultView.setUint32(16, 16, true); // Chunk size
  resultView.setUint16(20, 1, true); // Audio format (PCM)
  resultView.setUint16(22, numChannels, true);
  resultView.setUint32(24, sampleRate, true);
  resultView.setUint32(28, byteRate, true);
  resultView.setUint16(32, blockAlign, true);
  resultView.setUint16(34, bitsPerSample, true);

  // data chunk
  result.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  resultView.setUint32(40, totalDataSize, true);

  // Copy audio data
  let dataOffset = 44;
  for (const audioData of audioDataArrays) {
    result.set(audioData, dataOffset);
    dataOffset += audioData.length;
  }

  return result;
}

/**
 * Generate audio for a paragraph, handling chunking if needed
 */
async function generateParagraphAudio(text: string): Promise<Uint8Array> {
  const chunks = splitParagraphIntoChunks(text);
  
  console.log(`[generate-chapter-audio] Paragraph split into ${chunks.length} chunk(s)`);
  
  if (chunks.length === 1) {
    // Simple case: generate directly
    const jobId = await submitTtsJob(chunks[0]);
    const audioBase64 = await waitForCompletion(jobId);
    return base64ToUint8Array(audioBase64);
  }

  // Multi-chunk: generate each and stitch
  const audioChunks: Uint8Array[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[generate-chapter-audio] Generating chunk ${i + 1}/${chunks.length} (${estimateTokens(chunks[i])} tokens)`);
    const jobId = await submitTtsJob(chunks[i]);
    const audioBase64 = await waitForCompletion(jobId);
    audioChunks.push(base64ToUint8Array(audioBase64));
  }

  // Concatenate all chunks
  console.log(`[generate-chapter-audio] Stitching ${audioChunks.length} audio chunks`);
  return concatenateWavFiles(audioChunks);
}

/**
 * Extract text content from HTML, matching frontend logic
 */
function extractTextFromHtml(html: string): string {
  // Match block-level elements (p, h1-h6, div, blockquote)
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
 * Uses the same chapter filtering logic as the frontend to ensure index alignment
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

  // Extract spine itemrefs
  const spineItemRefs: string[] = [];
  const spineMatches = opfContent.matchAll(/itemref[^>]*idref="([^"]+)"/g);
  for (const match of spineMatches) {
    spineItemRefs.push(match[1]);
  }

  // Build manifest map
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

  // Iterate through spine items and find the actual chapter at targetChapterIndex
  // This matches frontend logic: only count chapters that have meaningful content
  let validChapterCount = 0;
  let actualSpineIndex = -1;

  for (let i = 0; i < spineItemRefs.length; i++) {
    const idref = spineItemRefs[i];
    const href = manifestMap.get(idref);
    if (!href) continue;

    const fullPath = opfDir + href;
    const content = await zip.file(fullPath)?.async("text");
    if (!content) continue;

    // Extract text content using the same logic as frontend
    const textContent = extractTextFromHtml(content);
    
    // Only count chapters with meaningful content (matches frontend)
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

  // Now get the content from the correct spine item
  const idref = spineItemRefs[actualSpineIndex];
  const href = manifestMap.get(idref);
  if (!href) throw new Error(`No href found for chapter at spine index ${actualSpineIndex}`);

  const fullPath = opfDir + href;
  const content = await zip.file(fullPath)?.async("text");
  if (!content) throw new Error(`No content found at: ${fullPath}`);

  const paragraphs: { paragraphIndex: number; text: string; estimatedDuration: number }[] = [];
  
  // Match ALL block elements in order - same as frontend's querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, blockquote')
  // This ensures paragraph indices match the Reader's display
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

    // Only include blocks with meaningful text (matches frontend filter: text.length > 0)
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

    // Verify book ownership
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
      .select("paragraph_index, status, estimated_duration_seconds")
      .eq("book_id", bookId)
      .eq("chapter_index", chapterIndex)
      .order("paragraph_index", { ascending: true });

    const existingMap = new Map(
      (existingTracks || []).map((t) => [t.paragraph_index, t])
    );

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

    // Find paragraphs that need generation
    const targetDurationSeconds = targetDurationMinutes * 60;
    let accumulatedDuration = 0;
    const toGenerate: typeof paragraphs = [];

    for (const para of paragraphs) {
      const existing = existingMap.get(para.paragraphIndex);
      
      if (existing) {
        if (existing.status === "GENERATED" || existing.status === "GENERATING") {
          accumulatedDuration += Number(existing.estimated_duration_seconds);
          continue;
        }
      }

      // This paragraph needs generation
      if (accumulatedDuration < targetDurationSeconds) {
        toGenerate.push(para);
        accumulatedDuration += para.estimatedDuration;
      }
    }

    if (toGenerate.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No new paragraphs need generation",
          generated: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-chapter-audio] Generating ${toGenerate.length} paragraphs for ~${targetDurationMinutes} min buffer`);

    // Insert/update paragraphs as GENERATING
    for (const para of toGenerate) {
      await supabaseAdmin
        .from("audio_tracks")
        .upsert({
          book_id: bookId,
          chapter_index: chapterIndex,
          paragraph_index: para.paragraphIndex,
          text: para.text,
          estimated_duration_seconds: para.estimatedDuration,
          status: "GENERATING",
        }, { onConflict: "book_id,chapter_index,paragraph_index" });
    }

    // Process paragraphs sequentially
    let generatedCount = 0;
    for (const para of toGenerate) {
      try {
        console.log(`[generate-chapter-audio] Processing paragraph ${para.paragraphIndex} (${estimateTokens(para.text)} tokens)`);
        
        // Use chunked generation for long paragraphs
        const audioBytes = await generateParagraphAudio(para.text);

        // Upload to storage
        const audioPath = `${user.id}/${bookId}/chapter_${chapterIndex}_para_${para.paragraphIndex}.wav`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("audio-files")
          .upload(audioPath, audioBytes, {
            contentType: "audio/wav",
            upsert: true,
          });

        if (uploadError) {
          console.error(`[generate-chapter-audio] Upload error:`, uploadError);
          continue;
        }

        // Update track as GENERATED
        await supabaseAdmin
          .from("audio_tracks")
          .update({
            audio_url: audioPath,
            status: "GENERATED",
            generated_at: new Date().toISOString(),
          })
          .eq("book_id", bookId)
          .eq("chapter_index", chapterIndex)
          .eq("paragraph_index", para.paragraphIndex);

        generatedCount++;
      } catch (err) {
        console.error(`[generate-chapter-audio] Error processing paragraph ${para.paragraphIndex}:`, err);
        
        // Mark as NOT_GENERATED so it can be retried
        await supabaseAdmin
          .from("audio_tracks")
          .update({ status: "NOT_GENERATED" })
          .eq("book_id", bookId)
          .eq("chapter_index", chapterIndex)
          .eq("paragraph_index", para.paragraphIndex);
      }
    }

    // Update book status if we have some audio
    if (generatedCount > 0) {
      await supabaseAdmin
        .from("books")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", bookId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Generated ${generatedCount} audio segments`,
        generated: generatedCount,
        total: toGenerate.length,
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

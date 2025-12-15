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

/**
 * Estimate spoken duration for text in seconds
 */
function estimateDurationSeconds(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  return (words / WORDS_PER_MINUTE) * 60.0;
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

  // Extract spine itemrefs
  const spineItemRefs: string[] = [];
  const spineMatches = opfContent.matchAll(/itemref[^>]*idref="([^"]+)"/g);
  for (const match of spineMatches) {
    spineItemRefs.push(match[1]);
  }

  if (targetChapterIndex >= spineItemRefs.length) {
    throw new Error(`Chapter ${targetChapterIndex} not found`);
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

  // Get specific chapter content
  const idref = spineItemRefs[targetChapterIndex];
  const href = manifestMap.get(idref);
  if (!href) throw new Error(`No href found for chapter ${targetChapterIndex}`);

  const fullPath = opfDir + href;
  const content = await zip.file(fullPath)?.async("text");
  if (!content) throw new Error(`No content found at: ${fullPath}`);

  const paragraphs: { paragraphIndex: number; text: string; estimatedDuration: number }[] = [];
  const paragraphMatches = content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  let paragraphIdx = 0;

  for (const match of paragraphMatches) {
    let text = match[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      .replace(/\s+/g, " ")
      .trim();

    if (text.length > 20) {
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
        console.log(`[generate-chapter-audio] Processing paragraph ${para.paragraphIndex}`);
        
        const jobId = await submitTtsJob(para.text);
        const audioBase64 = await waitForCompletion(jobId);
        const audioBytes = base64ToUint8Array(audioBase64);

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

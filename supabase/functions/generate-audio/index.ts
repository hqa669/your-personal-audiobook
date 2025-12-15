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

interface ParagraphAudio {
  paragraphIndex: number;
  chapterIndex: number;
  audioBase64: string;
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
      input: {
        prompt: text,
      },
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
      headers: {
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
      },
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

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("RunPod TTS job timed out");
}

/**
 * Parse EPUB and extract paragraphs
 */
async function parseEpubParagraphs(
  epubArrayBuffer: ArrayBuffer
): Promise<{ chapterIndex: number; paragraphIndex: number; text: string }[]> {
  const zip = await JSZip.loadAsync(epubArrayBuffer);

  // Find container.xml
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) throw new Error("Invalid EPUB: Missing container.xml");

  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!rootfileMatch) throw new Error("Invalid EPUB: Cannot find rootfile");

  const opfPath = rootfileMatch[1];
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/") + 1);

  // Parse OPF
  const opfContent = await zip.file(opfPath)?.async("text");
  if (!opfContent) throw new Error("Invalid EPUB: Missing OPF file");

  // Simple XML parsing (Deno doesn't have DOMParser in edge)
  const spineItemRefs: string[] = [];
  const spineMatches = opfContent.matchAll(/itemref\s+idref="([^"]+)"/g);
  for (const match of spineMatches) {
    spineItemRefs.push(match[1]);
  }

  // Build manifest map
  const manifestMap = new Map<string, string>();
  const manifestMatches = opfContent.matchAll(
    /<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/g
  );
  for (const match of manifestMatches) {
    manifestMap.set(match[1], match[2]);
  }

  const paragraphs: { chapterIndex: number; paragraphIndex: number; text: string }[] = [];

  for (let chapterIdx = 0; chapterIdx < spineItemRefs.length; chapterIdx++) {
    const idref = spineItemRefs[chapterIdx];
    const href = manifestMap.get(idref);
    if (!href) continue;

    const fullPath = opfDir + href;
    const content = await zip.file(fullPath)?.async("text");
    if (!content) continue;

    // Extract text from paragraph tags (simple regex approach for edge function)
    const paragraphMatches = content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    let paragraphIdx = 0;

    for (const match of paragraphMatches) {
      // Strip HTML tags
      const text = match[1].replace(/<[^>]+>/g, "").trim();
      if (text.length > 10) {
        // Only meaningful paragraphs
        paragraphs.push({
          chapterIndex: chapterIdx,
          paragraphIndex: paragraphIdx,
          text,
        });
        paragraphIdx++;
      }
    }
  }

  return paragraphs;
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
 * Background task to generate audio for all paragraphs
 */
async function generateAudioBackground(
  bookId: string,
  userId: string,
  epubUrl: string
) {
  console.log(`[generate-audio] Starting background job for book ${bookId}`);

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    // Update book status to processing
    await supabase
      .from("books")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", bookId);

    // Download EPUB
    console.log(`[generate-audio] Downloading EPUB from ${epubUrl}`);
    const epubResponse = await fetch(epubUrl);
    if (!epubResponse.ok) {
      throw new Error(`Failed to download EPUB: ${epubResponse.statusText}`);
    }
    const epubArrayBuffer = await epubResponse.arrayBuffer();

    // Parse paragraphs
    console.log(`[generate-audio] Parsing EPUB paragraphs`);
    const paragraphs = await parseEpubParagraphs(epubArrayBuffer);
    console.log(`[generate-audio] Found ${paragraphs.length} paragraphs`);

    // Process paragraphs (limit to first 50 for MVP to avoid long processing times)
    const maxParagraphs = Math.min(paragraphs.length, 50);
    let processedCount = 0;

    for (let i = 0; i < maxParagraphs; i++) {
      const paragraph = paragraphs[i];
      console.log(
        `[generate-audio] Processing paragraph ${i + 1}/${maxParagraphs}: "${paragraph.text.substring(0, 50)}..."`
      );

      try {
        // Submit TTS job
        const jobId = await submitTtsJob(paragraph.text);
        console.log(`[generate-audio] RunPod job submitted: ${jobId}`);

        // Wait for completion
        const audioBase64 = await waitForCompletion(jobId);
        console.log(`[generate-audio] Got audio for paragraph ${i + 1}`);

        // Convert to bytes
        const audioBytes = base64ToUint8Array(audioBase64);

        // Upload to storage
        const audioPath = `${userId}/${bookId}/paragraph_${paragraph.chapterIndex}_${paragraph.paragraphIndex}.wav`;
        const { error: uploadError } = await supabase.storage
          .from("audio-files")
          .upload(audioPath, audioBytes, {
            contentType: "audio/wav",
            upsert: true,
          });

        if (uploadError) {
          console.error(`[generate-audio] Upload error:`, uploadError);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("audio-files")
          .getPublicUrl(audioPath);

        // Insert audio track record
        await supabase.from("audio_tracks").insert({
          book_id: bookId,
          audio_url: audioPath,
          voice_type: "default",
        });

        processedCount++;
      } catch (err) {
        console.error(`[generate-audio] Error processing paragraph ${i + 1}:`, err);
        // Continue with next paragraph
      }
    }

    // Update book status
    if (processedCount > 0) {
      console.log(`[generate-audio] Completed! Processed ${processedCount} paragraphs`);
      await supabase
        .from("books")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", bookId);
    } else {
      console.error(`[generate-audio] No paragraphs were processed successfully`);
      await supabase
        .from("books")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", bookId);
    }
  } catch (err) {
    console.error(`[generate-audio] Background job failed:`, err);
    await supabase
      .from("books")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", bookId);
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate secrets
    if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
      throw new Error("RunPod credentials not configured");
    }

    // Parse request
    const { bookId } = await req.json();
    if (!bookId) {
      throw new Error("bookId is required");
    }

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Authorization header required");
    }

    // Create client with user token to verify ownership
    const supabaseUser = createClient(
      SUPABASE_URL!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Get user
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Verify book ownership and get EPUB URL
    const { data: book, error: bookError } = await supabaseUser
      .from("books")
      .select("id, epub_url, status")
      .eq("id", bookId)
      .eq("user_id", user.id)
      .single();

    if (bookError || !book) {
      throw new Error("Book not found or access denied");
    }

    if (book.status === "processing") {
      return new Response(
        JSON.stringify({ message: "Audio generation already in progress" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get signed URL for EPUB
    const epubPath = book.epub_url.split("/").slice(-2).join("/");
    const { data: signedData, error: signError } = await supabaseUser.storage
      .from("epub-files")
      .createSignedUrl(epubPath, 3600);

    if (signError || !signedData?.signedUrl) {
      throw new Error("Failed to access EPUB file");
    }

    // Start background processing
    console.log(`[generate-audio] Starting background task for book ${bookId}`);
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    (globalThis as any).EdgeRuntime?.waitUntil?.(
      generateAudioBackground(bookId, user.id, signedData.signedUrl)
    ) ?? generateAudioBackground(bookId, user.id, signedData.signedUrl);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Audio generation started. This may take a few minutes.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("[generate-audio] Error:", error);
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

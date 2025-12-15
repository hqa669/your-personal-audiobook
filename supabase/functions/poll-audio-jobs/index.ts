import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RUNPOD_API_KEY = Deno.env.get("RUNPOD_API_KEY");
const RUNPOD_ENDPOINT_ID = Deno.env.get("RUNPOD_ENDPOINT_ID");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const MAX_JOBS_PER_CALL = 10; // Limit to prevent timeout

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
 * Check RunPod job status
 */
async function checkJobStatus(jobId: string): Promise<{ status: string; output?: { audio_base64: string } }> {
  const statusUrl = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/${jobId}`;
  
  const response = await fetch(statusUrl, {
    headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
  });

  if (!response.ok) {
    console.error(`[poll-audio-jobs] Status check failed for ${jobId}: ${response.status}`);
    throw new Error(`Status check failed: ${response.status}`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
      throw new Error("RunPod credentials not configured");
    }

    const { bookId, chapterIndex } = await req.json();
    if (!bookId) {
      throw new Error("bookId is required");
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

    // Verify user owns this book
    const { data: book, error: bookError } = await supabaseUser
      .from("books")
      .select("id")
      .eq("id", bookId)
      .eq("user_id", user.id)
      .single();

    if (bookError || !book) {
      throw new Error("Book not found or access denied");
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get PENDING jobs for this book/chapter
    let query = supabaseAdmin
      .from("audio_tracks")
      .select("id, book_id, chapter_index, paragraph_index, chunk_index, runpod_job_id")
      .eq("book_id", bookId)
      .eq("status", "PENDING")
      .not("runpod_job_id", "is", null)
      .order("paragraph_index", { ascending: true })
      .order("chunk_index", { ascending: true })
      .limit(MAX_JOBS_PER_CALL);

    if (chapterIndex !== undefined) {
      query = query.eq("chapter_index", chapterIndex);
    }

    const { data: pendingTracks, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch pending tracks: ${fetchError.message}`);
    }

    if (!pendingTracks || pendingTracks.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending jobs to process",
          processed: 0,
          completed: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[poll-audio-jobs] Processing ${pendingTracks.length} pending jobs`);

    let completedCount = 0;
    let failedCount = 0;
    const results: { paragraphIndex: number; chunkIndex: number; status: string }[] = [];

    for (const track of pendingTracks) {
      try {
        const jobStatus = await checkJobStatus(track.runpod_job_id!);
        console.log(`[poll-audio-jobs] Job ${track.runpod_job_id} status: ${jobStatus.status}`);

        if (jobStatus.status === "COMPLETED" && jobStatus.output?.audio_base64) {
          // Download and upload audio
          const audioBytes = base64ToUint8Array(jobStatus.output.audio_base64);
          
          const audioPath = `${user.id}/${bookId}/chapter_${track.chapter_index}_para_${track.paragraph_index}_chunk_${track.chunk_index}.wav`;
          
          const { error: uploadError } = await supabaseAdmin.storage
            .from("audio-files")
            .upload(audioPath, audioBytes, {
              contentType: "audio/wav",
              upsert: true,
            });

          if (uploadError) {
            console.error(`[poll-audio-jobs] Upload error for ${track.id}:`, uploadError);
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
            .eq("id", track.id);

          completedCount++;
          results.push({
            paragraphIndex: track.paragraph_index,
            chunkIndex: track.chunk_index,
            status: "GENERATED",
          });
        } else if (jobStatus.status === "FAILED" || jobStatus.status === "CANCELLED") {
          console.error(`[poll-audio-jobs] Job ${track.runpod_job_id} failed`);
          
          // Mark as NOT_GENERATED for retry
          await supabaseAdmin
            .from("audio_tracks")
            .update({
              status: "NOT_GENERATED",
              runpod_job_id: null,
            })
            .eq("id", track.id);

          failedCount++;
          results.push({
            paragraphIndex: track.paragraph_index,
            chunkIndex: track.chunk_index,
            status: "FAILED",
          });
        } else {
          // Still IN_QUEUE or IN_PROGRESS - leave as PENDING
          results.push({
            paragraphIndex: track.paragraph_index,
            chunkIndex: track.chunk_index,
            status: "PENDING",
          });
        }
      } catch (err) {
        console.error(`[poll-audio-jobs] Error processing job ${track.runpod_job_id}:`, err);
        // Don't mark as failed on transient errors - leave as PENDING for retry
        results.push({
          paragraphIndex: track.paragraph_index,
          chunkIndex: track.chunk_index,
          status: "ERROR",
        });
      }
    }

    // Update book status if we have completed audio
    if (completedCount > 0) {
      await supabaseAdmin
        .from("books")
        .update({ status: "ready", updated_at: new Date().toISOString() })
        .eq("id", bookId);
    }

    console.log(`[poll-audio-jobs] Processed ${pendingTracks.length} jobs: ${completedCount} completed, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${pendingTracks.length} jobs`,
        processed: pendingTracks.length,
        completed: completedCount,
        failed: failedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[poll-audio-jobs] Error:", error);
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

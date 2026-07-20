import { parseBuffer } from 'music-metadata';

import type { AudioMetadata } from './audioAnalyser';

// ============================================================
// 2026-07-20 (per Reza) — Video Analyser
//
// Mirrors audioAnalyser.ts exactly, deliberately reusing its
// AudioMetadata shape (dominantInstrument/bpm/mood/keySignature stay
// null — meaningless for video — duration/title/aiListenAnalysis get
// populated). This is intentional, not laziness: every downstream
// consumer (generateArtDirection, buildNarrativeSource, the admin review
// panel, broadcastJobStatus's audioMetadata field) already reads THIS
// exact shape and already null-checks every optional field. Reusing it
// means zero changes needed anywhere else in the pipeline for video to
// get AI-driven cover art + captions "for free".
//
// duration comes from music-metadata's own container-format parsing —
// the same library already used for audio also reads MP4/MOV/WebM
// container-level duration boxes (it isn't purely ID3-specific), so no
// new dependency (e.g. ffprobe) was needed for that part.
// ============================================================

const FALLBACK: AudioMetadata = {
  dominantInstrument: null,
  bpm: null,
  mood: null,
  keySignature: null,
  duration: 0,
  title: null,
  genre: null,
  aiListenAnalysis: null,
};

export async function analyzeVideo(videoUrl: string): Promise<AudioMetadata> {
  if (!videoUrl) return { ...FALLBACK };
  try {
    // Same hard ceiling as analyzeAudio, same reasoning: never let a
    // slow/unreachable file hang the whole pipeline job.
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { ...FALLBACK };
    const buffer = Buffer.from(await res.arrayBuffer());
    const mimeType = res.headers.get('content-type') || 'video/mp4';

    let duration = 0;
    let title: string | null = null;
    try {
      const meta = await parseBuffer(buffer, mimeType);
      duration = Math.round(meta.format.duration ?? 0);
      title = meta.common.title ?? null;
    } catch (parseErr) {
      // Not every container music-metadata reads cleanly (some MOV/MKV
      // variants) — duration/title just stay at their null-first
      // defaults rather than failing the whole analysis.
      console.warn('[Video Analyser] Could not parse container metadata (duration/title will be unknown):', parseErr);
    }

    return {
      ...FALLBACK,
      duration,
      title,
      aiListenAnalysis: await analyzeVideoContentWithAI(buffer, mimeType),
    };
  } catch (error) {
    console.warn('[Video Analyser] Could not analyze video, using null-first metadata:', error);
    return { ...FALLBACK };
  }
}

// Gemini's inline-data request ceiling is tighter in practice for video
// than audio (a few seconds of video is already several MB) — capped
// more conservatively than audioAnalyser's 15MB. Larger uploads simply
// skip AI watching and fall back to container-only duration/title, same
// graceful-degradation philosophy as the rest of this pipeline.
const MAX_INLINE_VIDEO_BYTES = 8 * 1024 * 1024; // ~8MB

/**
 * Has Gemini actually WATCH the video (multimodal video input, same
 * :generateContent endpoint and inline_data mechanism as
 * analyzeAudioContentWithAI) and describe what it sees — subject,
 * setting, mood, motion, color/lighting — so downstream cover-art and
 * caption prompts are specific to THIS video instead of a generic
 * template. Returns null — never throws — on any failure; this is
 * optional enrichment, never a hard requirement for the pipeline to work.
 */
async function analyzeVideoContentWithAI(buffer: Buffer, mimeType: string): Promise<string | null> {
  if (buffer.length > MAX_INLINE_VIDEO_BYTES) {
    console.warn(`[Video Analyser] File too large for inline AI watching (${Math.round(buffer.length / 1_000_000)}MB) — skipping.`);
    return null;
  }
  try {
    // Lazy import — same circular-dependency reasoning as audioAnalyser.ts.
    const { findTextProvider, getProviderApiKey } = await import('./aiProviders');
    const gemini = findTextProvider('gemini');
    if (!gemini) return null;
    const apiKey = await getProviderApiKey(gemini);
    if (!apiKey) {
      console.warn('[Video Analyser] No Gemini key configured — skipping AI video watching, falling back to container metadata only.');
      return null;
    }

    const model = 'gemini-3.5-flash';
    const prompt =
      'Watch this video closely and describe it in 3-4 rich, specific sentences for a creative director briefing — ' +
      'this description will directly drive an AI image generator and a copywriter, so it must be vivid and ' +
      'concrete, not generic. Cover: the actual subject/scene you see, the mood and energy, the visual style ' +
      '(lighting, color palette, camera movement), and any distinctive production characteristics. Reply with ' +
      'ONLY the description, no preamble.';

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
            ],
          }],
        }),
        signal: AbortSignal.timeout(45_000),
      }
    );
    if (!res.ok) {
      console.warn(`[Video Analyser] Gemini video-watching call failed: ${res.status} ${await res.text().catch(() => '')}`);
      return null;
    }
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    return text || null;
  } catch (error) {
    console.warn('[Video Analyser] AI video watching failed, falling back to container metadata only:', error);
    return null;
  }
}

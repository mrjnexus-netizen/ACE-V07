import { parseBuffer } from 'music-metadata';

// Real audio metadata extraction. duration/title/bpm/key/genre come from the
// file's own metadata when available (music-metadata, no API key needed).
// aiListenAnalysis (2026-07-09, per Reza) comes from actually having an AI
// LISTEN to the audio — genre/bpm ID3 tags are frequently missing or wrong,
// which was producing generic, disconnected-from-the-actual-music prompts.
// Fields still require deeper AI analysis are left null until filled —
// null-first, never fake values.
export interface AudioMetadata {
  dominantInstrument: string | null;
  bpm: number | null;
  mood: string | null;
  keySignature: string | null;
  duration: number;
  title: string | null;
  genre: string | null;
  aiListenAnalysis: string | null;
  [key: string]: unknown;
}

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

/**
 * Fetches the audio file and extracts real metadata. If the file cannot be
 * reached or parsed (e.g. storage not configured), returns a safe null-first
 * object so the pipeline degrades gracefully instead of crashing.
 */
export async function analyzeAudio(audioUrl: string): Promise<AudioMetadata> {
  if (!audioUrl) return { ...FALLBACK };
  try {
    // Hard 30s ceiling — a fetch with no timeout here once let the whole
    // pipeline hang forever when the audio URL was slow/unreachable
    // (2026-07-09). Degrading to null-first metadata is always better
    // than a frozen job.
    const res = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { ...FALLBACK };
    const buffer = Buffer.from(await res.arrayBuffer());
    const meta = await parseBuffer(buffer);
    const mimeType = res.headers.get('content-type') || 'audio/mpeg';

    return {
      dominantInstrument: null,
      bpm: meta.common.bpm ?? null,
      mood: null,
      keySignature: meta.common.key ?? null,
      duration: Math.round(meta.format.duration ?? 0),
      title: meta.common.title ?? null,
      genre: meta.common.genre?.[0] ?? null,
      aiListenAnalysis: await analyzeAudioContentWithAI(buffer, mimeType),
    };
  } catch (error) {
    console.warn('[Audio Analyser] Could not analyze audio, using null-first metadata:', error);
    return { ...FALLBACK };
  }
}

const MAX_INLINE_AUDIO_BYTES = 15 * 1024 * 1024; // ~15MB — safely under Gemini's inline-data ceiling

/**
 * Has Gemini actually LISTEN to the track (multimodal audio input) and
 * describe what it hears — genre, mood, energy, instrumentation, era/style.
 * This is what makes downstream cover-art and caption prompts specific to
 * THIS track instead of a generic template (2026-07-09).
 *
 * Uses the Gemini key directly (regardless of which text provider is
 * "active" in Gatekeeper Hub) since audio understanding is a Gemini-
 * specific capability, not something every provider offers. Returns null
 * — never throws — if no Gemini key is configured, the file is too large
 * to send inline, or the call fails; callers already treat this as
 * optional enrichment on top of ID3-tag metadata.
 */
async function analyzeAudioContentWithAI(buffer: Buffer, mimeType: string): Promise<string | null> {
  if (buffer.length > MAX_INLINE_AUDIO_BYTES) {
    console.warn(`[Audio Analyser] File too large for inline AI listening (${Math.round(buffer.length / 1_000_000)}MB) — skipping.`);
    return null;
  }
  try {
    // Lazy import to avoid a circular dependency with aiProviders.ts.
    const { findTextProvider, getProviderApiKey } = await import('./aiProviders');
    const gemini = findTextProvider('gemini');
    if (!gemini) return null;
    const apiKey = await getProviderApiKey(gemini);
    if (!apiKey) {
      console.warn('[Audio Analyser] No Gemini key configured — skipping AI audio listening, falling back to file-tag metadata only.');
      return null;
    }

    const model = 'gemini-3.5-flash';
    const prompt =
      'Listen to this piece of music closely and describe it in 3-4 rich, specific sentences for a creative ' +
      "director briefing — this description will directly drive an AI image generator and a copywriter, so it " +
      'must be vivid and concrete, not generic. Cover: the actual genre/style you hear, the emotional mood and ' +
      'energy level, the specific instruments/sounds present, the tempo feel, and any distinctive production or ' +
      'era characteristics. Reply with ONLY the description, no preamble.';

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
      console.warn(`[Audio Analyser] Gemini audio-listening call failed: ${res.status} ${await res.text().catch(() => '')}`);
      return null;
    }
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    return text || null;
  } catch (error) {
    console.warn('[Audio Analyser] AI audio listening failed, falling back to file-tag metadata only:', error);
    return null;
  }
}
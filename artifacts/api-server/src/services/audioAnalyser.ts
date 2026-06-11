import { parseBuffer } from 'music-metadata';

// Real audio metadata extraction. duration/title/bpm/key/genre come from the
// file's own metadata when available (music-metadata, no API key needed).
// Fields that require deeper AI analysis (mood, dominant instrument) are left
// null until the AI pipeline fills them — null-first, never fake values.
export interface AudioMetadata {
  dominantInstrument: string | null;
  bpm: number | null;
  mood: string | null;
  keySignature: string | null;
  duration: number;
  title: string | null;
  genre: string | null;
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
};

/**
 * Fetches the audio file and extracts real metadata. If the file cannot be
 * reached or parsed (e.g. storage not configured), returns a safe null-first
 * object so the pipeline degrades gracefully instead of crashing.
 */
export async function analyzeAudio(audioUrl: string): Promise<AudioMetadata> {
  if (!audioUrl) return { ...FALLBACK };
  try {
    const res = await fetch(audioUrl);
    if (!res.ok) return { ...FALLBACK };
    const buffer = Buffer.from(await res.arrayBuffer());
    const meta = await parseBuffer(buffer);
    return {
      dominantInstrument: null,
      bpm: meta.common.bpm ?? null,
      mood: null,
      keySignature: meta.common.key ?? null,
      duration: Math.round(meta.format.duration ?? 0),
      title: meta.common.title ?? null,
      genre: meta.common.genre?.[0] ?? null,
    };
  } catch (error) {
    console.warn('[Audio Analyser] Could not analyze audio, using null-first metadata:', error);
    return { ...FALLBACK };
  }
}
// ============================================================
// Document Assistant — Track Intelligence, 2026-07-16.
//
// When the AI notices a music track/file name mentioned in a document
// (a brief saying "please score the attached demo_v2.mp3", or "our
// piece titled 'Midnight Departure'"), this cross-references it against
// the real tracks library and, if a match is found, pulls that track's
// REAL audio-derived characteristics -- BPM, mood, key, genre, and
// (if it went through Media Pipeline) the AI's own prior listening
// analysis (`pipelineJobs.audioMetadata.aiListenAnalysis`) -- then asks
// the AI for a single honest sentence on whether the brief's stated
// requirements (deliverables/risks/checklist) actually fit what the
// track really sounds like.
//
// Reuses existing infrastructure end-to-end: the SAME matching pattern
// as posterStudioRoutes.ts's /track-audio-context endpoint (most recent
// pipelineJobs row per track), and the SAME provider-resolution +
// keyless-fallback machinery documentAnalysis.ts already built (no
// separate AI configuration).
// ============================================================
import { desc, eq, ilike, or, sql } from 'drizzle-orm';

import { db } from '../db/db';
import { pipelineJobs, tracks } from '../db/schema';
import { callWithFallback, resolveProviderWithFallback } from './documentAnalysis';

export interface TrackMatch {
  trackId: string;
  title: string;
  coverUrl: string | null;
  audioUrl: string | null;
  bpm: number | null;
  mood: string | null;
  keySignature: string | null;
  genre: string | null;
  aiListenAnalysis: string | null;
  matchedFrom: string;
  fitAssessment: string | null;
}

const MAX_REFERENCES_PROCESSED = 5;
const MAX_MATCHES_RETURNED = 5;
const FIT_SYSTEM_PROMPT = `You are a music supervisor's assistant for a professional composer. You are given (a) a short list of requirements/notes from a client brief, and (b) the REAL audio characteristics of a specific track already in the composer's library. In ONE short sentence (max 30 words), say whether the track's actual characteristics align with what the brief is asking for, or flag a specific potential mismatch worth confirming with the client. If the brief gives no relevant style/tempo/mood requirement to compare against, say plainly that there's nothing specific to compare rather than inventing a judgment. Return ONLY the sentence -- no preamble, no quotes around it.`;

function firstEnglishTitle(titleJsonb: unknown): string {
  if (titleJsonb && typeof titleJsonb === 'object') {
    const t = (titleJsonb as Record<string, unknown>).en;
    if (typeof t === 'string' && t.trim()) return t.trim();
    // Fall back to whatever locale IS populated, rather than showing "Untitled".
    for (const v of Object.values(titleJsonb as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return 'Untitled track';
}

/** Finds candidate tracks for one reference string -- matches against the
 * track's English title OR the filename portion of its audio URL, since
 * brief text is often informal ("the piano demo" vs. a full track
 * title). Capped, cheap ILIKE queries -- no AI involved in the matching
 * step itself, only in the fit-assessment step after. */
async function findCandidateTracks(reference: string): Promise<(typeof tracks.$inferSelect)[]> {
  const cleaned = reference.trim().replace(/["'.]/g, '').slice(0, 120);
  if (cleaned.length < 3) return [];

  const pattern = `%${cleaned.replace(/[%_]/g, '')}%`;

  const rows = await db
    .select()
    .from(tracks)
    .where(or(ilike(sql`${tracks.title}->>'en'`, pattern), ilike(tracks.audioUrl, pattern)))
    .limit(3);

  return rows;
}

async function loadAudioAnalysis(trackId: string): Promise<{ genre: string | null; aiListenAnalysis: string | null }> {
  const job = await db.query.pipelineJobs.findFirst({
    where: eq(pipelineJobs.trackId, trackId),
    orderBy: (j) => [desc(j.createdAt)],
  });
  const meta = (job?.audioMetadata as Record<string, unknown> | null) ?? null;
  return {
    genre: (meta?.genre as string) ?? null,
    aiListenAnalysis: (meta?.aiListenAnalysis as string) ?? null,
  };
}

async function assessFit(
  requirements: string[],
  match: Omit<TrackMatch, 'fitAssessment'>,
  resolved: Awaited<ReturnType<typeof resolveProviderWithFallback>>
): Promise<string | null> {
  if ('error' in resolved) return null;
  if (requirements.length === 0) return null;

  const trackFacts = [
    match.genre ? `Genre: ${match.genre}` : null,
    match.bpm ? `BPM: ${match.bpm}` : null,
    match.mood ? `Mood: ${match.mood}` : null,
    match.keySignature ? `Key: ${match.keySignature}` : null,
    match.aiListenAnalysis ? `AI listening analysis: ${match.aiListenAnalysis}` : null,
  ].filter(Boolean);

  if (trackFacts.length === 0) return null; // nothing real to compare against -- stay silent rather than guess

  const userPrompt = `Brief requirements (from the document's deliverables/risks/checklist):\n${requirements
    .slice(0, 8)
    .map((r) => `- ${r}`)
    .join('\n')}\n\nTrack "${match.title}" real audio characteristics:\n${trackFacts.map((f) => `- ${f}`).join('\n')}`;

  try {
    const raw = await callWithFallback(resolved, FIT_SYSTEM_PROMPT, userPrompt);
    return raw.trim().slice(0, 400) || null;
  } catch (err) {
    console.warn('[documentTrackMatcher] Fit assessment failed (non-fatal):', err);
    return null;
  }
}

/** Cross-references AI-noticed track references against the real tracks
 * library, pulls real audio characteristics for any match, and (when
 * there's something concrete to compare) generates a one-line AI fit
 * assessment against the document's own extracted requirements. Never
 * throws -- a failure anywhere in this pipeline just means fewer/no
 * matches, never blocks the rest of the document analysis. */
export async function matchTracksAndAssessFit(
  trackReferences: string[],
  requirements: string[]
): Promise<TrackMatch[]> {
  if (trackReferences.length === 0) return [];

  const resolved = await resolveProviderWithFallback();
  const seenTrackIds = new Set<string>();
  const matches: TrackMatch[] = [];

  for (const reference of trackReferences.slice(0, MAX_REFERENCES_PROCESSED)) {
    if (matches.length >= MAX_MATCHES_RETURNED) break;
    try {
      const candidates = await findCandidateTracks(reference);
      for (const track of candidates) {
        if (seenTrackIds.has(track.id) || matches.length >= MAX_MATCHES_RETURNED) continue;
        seenTrackIds.add(track.id);

        const { genre, aiListenAnalysis } = await loadAudioAnalysis(track.id);
        const base: Omit<TrackMatch, 'fitAssessment'> = {
          trackId: track.id,
          title: firstEnglishTitle(track.title),
          coverUrl: track.coverUrl,
          audioUrl: track.audioUrl,
          bpm: track.bpm,
          mood: track.mood,
          keySignature: track.keySignature,
          genre: track.genre ?? genre,
          aiListenAnalysis,
          matchedFrom: reference,
        };

        const fitAssessment = await assessFit(requirements, base, resolved);
        matches.push({ ...base, fitAssessment });
      }
    } catch (err) {
      console.warn('[documentTrackMatcher] Matching failed for reference (skipped):', reference, err);
    }
  }

  return matches;
}

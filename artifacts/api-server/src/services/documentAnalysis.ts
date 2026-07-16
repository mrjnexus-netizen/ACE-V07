// ============================================================
// Document Assistant — AI analysis, 2026-07-16 (round 3: solving the
// three known limitations).
//
// 1. Deadlines are now ALSO given a best-effort parsedDate (YYYY-MM-DD)
//    by the AI, using today's real date as reference for relative dates
//    ("in two weeks", "by the end of the month"). Genuinely ambiguous
//    dates stay null -- never a fabricated guess presented as fact.
// 2. Long documents are no longer hard-truncated at a fixed character
//    count. They're split into overlapping chunks, each analyzed
//    separately (lighter schema, no per-chunk summary), then merged +
//    deduplicated, with ONE final small AI call synthesizing the
//    overall summary from the merged structured data (cheap -- it reads
//    the extraction, not the raw document). This raises the effective
//    ceiling from ~30,000 to ~140,000 characters. Beyond that, the same
//    honest `truncated: true` flag still applies -- just at a much
//    higher, transparent bound instead of a low invisible one.
// 3. Every AI call now has an automatic, keyless Pollinations fallback
//    if the admin's selected provider fails (or if no provider is
//    configured at all) -- the exact same resilience pattern already
//    used elsewhere in this project (aiArtGenerator.ts's image
//    fallback). This doesn't change WHICH provider the admin controls;
//    it just means a single provider hiccup no longer breaks the
//    feature outright.
// ============================================================
import { randomUUID } from 'node:crypto';

import { callTextProvider, findTextProvider, resolveActiveTextProvider } from './aiProviders';
import type { TextProvider } from './aiProviders';

export type ChecklistPriority = 'high' | 'medium' | 'low';

export interface ChecklistItem {
  id: string;
  text: string;
  priority: ChecklistPriority;
  category: string;
  done: boolean;
}

export interface DeadlineItem {
  item: string;
  date: string;
  /** Best-effort ISO 8601 (YYYY-MM-DD) resolution of `date`, or null if
   * the AI could not confidently determine an absolute calendar date
   * (e.g. it depends on an unknown reference point). Never a guess
   * dressed up as certainty. */
  parsedDate: string | null;
}

export interface DocumentAnalysisResult {
  summary: string;
  parties: { name: string; role: string }[];
  deliverables: string[];
  deadlines: DeadlineItem[];
  paymentTerms: string[];
  timecodes: string[];
  risks: string[];
  checklist: ChecklistItem[];
  /** Any music track/file names the AI noticed mentioned in the document
   * (e.g. "demo_v2.mp3", a track title in quotes). Cross-referenced
   * against the tracks table by documentTrackMatcher.ts, at the route
   * layer -- kept separate from this pure-text-analysis module. */
  trackReferences: string[];
  degraded: boolean;
  degradedReason?: string;
}

// ------------------------------------------------------------------
// Chunking. A single AI call handles documents up to SINGLE_CALL_LIMIT
// comfortably in one shot (fast, cheapest, and includes a direct
// whole-document summary). Longer documents are split into overlapping
// windows -- the overlap prevents a deadline/deliverable sentence from
// being silently cut in half at a chunk boundary.
// ------------------------------------------------------------------
const SINGLE_CALL_LIMIT = 12_000;
const CHUNK_SIZE = 12_000;
const CHUNK_OVERLAP = 400;
const MAX_CHUNKS = 12; // effective ceiling ~= 12*12000 - 11*400 =~ 139,600 chars
const MAX_OUTPUT_TOKENS = 3000; // was silently 220 project-wide before this feature -- see aiProviders.ts

function splitIntoChunks(text: string): { chunks: string[]; truncated: boolean } {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length && chunks.length < MAX_CHUNKS) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) {
      start = end;
      break;
    }
    start = end - CHUNK_OVERLAP;
  }
  return { chunks, truncated: start < text.length };
}

// ------------------------------------------------------------------
// Provider resolution with a keyless fallback baked in from the start.
// If the admin hasn't configured/selected a text provider at all, this
// still returns a usable provider (Pollinations, free) instead of
// failing outright -- the feature works out of the box, admin
// configuration only IMPROVES quality, it isn't required for it to
// function at all.
// ------------------------------------------------------------------
export async function resolveProviderWithFallback(): Promise<{ provider: TextProvider; model: string; apiKey: string } | { error: string }> {
  const resolved = await resolveActiveTextProvider();
  if (!('error' in resolved)) return resolved;

  const fallback = findTextProvider('pollinations-text');
  if (fallback) {
    return { provider: fallback, model: fallback.models[0]?.id ?? 'openai', apiKey: '' };
  }
  return resolved;
}

/** Calls the resolved provider; on any runtime failure (network, rate
 * limit, bad key), retries once against the same free Pollinations
 * fallback used above -- unless that's already what was tried, in
 * which case there's nowhere further to fall back to. Always surfaces
 * the ORIGINAL error if both attempts fail, since it's usually the
 * more informative one (e.g. "bad API key" vs. a generic fallback
 * failure). */
export async function callWithFallback(
  primary: { provider: TextProvider; model: string; apiKey: string },
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  try {
    return await callTextProvider(primary.provider, primary.model, primary.apiKey, systemPrompt, userPrompt, MAX_OUTPUT_TOKENS);
  } catch (primaryErr) {
    if (primary.provider.id !== 'pollinations-text') {
      const fallback = findTextProvider('pollinations-text');
      if (fallback) {
        try {
          return await callTextProvider(fallback, fallback.models[0]?.id ?? 'openai', '', systemPrompt, userPrompt, MAX_OUTPUT_TOKENS);
        } catch {
          /* fall through to rethrow the original, usually more informative error */
        }
      }
    }
    throw primaryErr;
  }
}

// ------------------------------------------------------------------
// Prompts
// ------------------------------------------------------------------
function fullSystemPrompt(todayIso: string): string {
  return `You are a meticulous project-management assistant for a professional composer's business. You read client briefs, contracts, and project emails and extract exactly the information the composer needs to act on, in English, regardless of the source document's language. Today's date is ${todayIso} -- use it to resolve relative dates ("in two weeks", "by the end of next month") into an absolute calendar date where the document gives you enough information to do so confidently.

Return ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "summary": "2-4 sentence plain-English summary of what this document is and what it's asking for",
  "parties": [{"name": "string", "role": "string, e.g. Client, Producer, Studio"}],
  "deliverables": ["string -- a concrete thing that must be produced/delivered"],
  "deadlines": [{"item": "what is due", "date": "the date or timeframe as stated in the document, verbatim if unclear", "parsedDate": "YYYY-MM-DD if you can confidently resolve an absolute calendar date, otherwise null -- never guess"}],
  "paymentTerms": ["string -- a concrete payment fact: amount, schedule, method, currency"],
  "timecodes": ["string -- any specific timecode, cue point, or timestamp referenced (e.g. '00:42 - explosion cue'), empty array if none"],
  "risks": ["string -- an ambiguity, missing information, or risk worth the composer's attention before agreeing to this"],
  "checklist": [{"text": "a single concrete actionable task derived from the document", "priority": "high|medium|low", "category": "short label, e.g. Deliverable, Deadline, Payment, Legal, Follow-up"}],
  "trackReferences": ["string -- any music track, song, demo, or audio file name/title explicitly mentioned in the document (e.g. a filename like 'demo_v2.mp3', or a track title in quotes), empty array if none mentioned"]
}

Rules: every array can be empty if genuinely nothing applies -- never invent facts not in the document. "checklist" should be the single most useful output: every deadline, deliverable, and payment obligation should also appear there as a plain actionable task, prioritized by real urgency/importance, not just copied verbatim from other fields.`;
}

function chunkSystemPrompt(todayIso: string): string {
  return `You are analyzing ONE SECTION of a longer client brief/contract/email for a professional composer's business (the document was split into sections because of its length -- you are seeing one section, not the whole document, so do not comment on what's missing from other sections). Extract only what is explicitly present in THIS section, in English. Today's date is ${todayIso} -- use it to resolve relative dates into an absolute calendar date where you can do so confidently.

Return ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "parties": [{"name": "string", "role": "string"}],
  "deliverables": ["string"],
  "deadlines": [{"item": "string", "date": "verbatim as stated", "parsedDate": "YYYY-MM-DD or null -- never guess"}],
  "paymentTerms": ["string"],
  "timecodes": ["string"],
  "risks": ["string"],
  "checklist": [{"text": "string", "priority": "high|medium|low", "category": "short label"}],
  "trackReferences": ["string -- any music track, song, demo, or audio file name/title mentioned in this section, empty array if none"]
}

Rules: every array can be empty if this section has nothing relevant for it -- never invent facts.`;
}

const SUMMARY_SYSTEM_PROMPT = `You are a project-management assistant. Based on structured data already extracted from a client brief/contract/email, write a 2-4 sentence plain-English summary of what the document is and what it's asking for. Return ONLY the summary text -- no JSON, no markdown, no preamble.`;

// ------------------------------------------------------------------
// Parsing helpers
// ------------------------------------------------------------------
function safeParseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toChecklist(v: unknown): ChecklistItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const item = raw as Record<string, unknown>;
      const text = typeof item.text === 'string' ? item.text.trim() : '';
      if (!text) return null;
      const priority: ChecklistPriority =
        item.priority === 'high' || item.priority === 'medium' || item.priority === 'low' ? item.priority : 'medium';
      const category = typeof item.category === 'string' && item.category.trim() ? item.category.trim() : 'General';
      return { id: randomUUID() as string, text, priority, category, done: false };
    })
    .filter((x): x is ChecklistItem => x !== null);
}

function toDeadlines(v: unknown): DeadlineItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const d = raw as Record<string, unknown>;
      const item = typeof d.item === 'string' ? d.item.trim() : '';
      if (!item) return null;
      const date = typeof d.date === 'string' && d.date.trim() ? d.date.trim() : 'Not specified';
      const parsedRaw = typeof d.parsedDate === 'string' ? d.parsedDate.trim() : null;
      const parsedDate = parsedRaw && ISO_DATE_RE.test(parsedRaw) && !Number.isNaN(new Date(parsedRaw).getTime()) ? parsedRaw : null;
      return { item, date, parsedDate };
    })
    .filter((x): x is DeadlineItem => x !== null);
}

function toParties(v: unknown): { name: string; role: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Record<string, unknown>;
      const name = typeof p.name === 'string' ? p.name.trim() : '';
      if (!name) return null;
      return { name, role: typeof p.role === 'string' && p.role.trim() ? p.role.trim() : 'Unspecified' };
    })
    .filter((x): x is { name: string; role: string } => x !== null);
}

interface PartialExtraction {
  parties: { name: string; role: string }[];
  deliverables: string[];
  deadlines: DeadlineItem[];
  paymentTerms: string[];
  timecodes: string[];
  risks: string[];
  checklist: ChecklistItem[];
  trackReferences: string[];
}

function parsePartial(parsed: Record<string, unknown>): PartialExtraction {
  return {
    parties: toParties(parsed.parties),
    deliverables: asStringArray(parsed.deliverables),
    deadlines: toDeadlines(parsed.deadlines),
    paymentTerms: asStringArray(parsed.paymentTerms),
    timecodes: asStringArray(parsed.timecodes),
    risks: asStringArray(parsed.risks),
    checklist: toChecklist(parsed.checklist),
    trackReferences: asStringArray(parsed.trackReferences),
  };
}

// ------------------------------------------------------------------
// Merge + dedupe across chunks. Deliberately simple, exact-match
// (case/whitespace-normalized) deduplication -- not fuzzy AI-based
// matching, which would just trade one uncertain judgment for another.
// ------------------------------------------------------------------
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = normalize(item);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function dedupeParties(items: { name: string; role: string }[]): { name: string; role: string }[] {
  const seen = new Set<string>();
  const out: { name: string; role: string }[] = [];
  for (const p of items) {
    const key = normalize(p.name);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function dedupeDeadlines(items: DeadlineItem[]): DeadlineItem[] {
  const seen = new Set<string>();
  const out: DeadlineItem[] = [];
  for (const d of items) {
    const key = `${normalize(d.item)}|${normalize(d.date)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

function dedupeChecklist(items: ChecklistItem[]): ChecklistItem[] {
  const seen = new Set<string>();
  const out: ChecklistItem[] = [];
  for (const c of items) {
    const key = normalize(c.text);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

function mergePartials(parts: PartialExtraction[]): PartialExtraction {
  return {
    parties: dedupeParties(parts.flatMap((p) => p.parties)),
    deliverables: dedupeStrings(parts.flatMap((p) => p.deliverables)),
    deadlines: dedupeDeadlines(parts.flatMap((p) => p.deadlines)),
    paymentTerms: dedupeStrings(parts.flatMap((p) => p.paymentTerms)),
    timecodes: dedupeStrings(parts.flatMap((p) => p.timecodes)),
    risks: dedupeStrings(parts.flatMap((p) => p.risks)),
    checklist: dedupeChecklist(parts.flatMap((p) => p.checklist)),
    trackReferences: dedupeStrings(parts.flatMap((p) => p.trackReferences)),
  };
}

function emptyResult(reason: string): DocumentAnalysisResult {
  return {
    summary: '',
    parties: [],
    deliverables: [],
    deadlines: [],
    paymentTerms: [],
    timecodes: [],
    risks: [],
    checklist: [],
    trackReferences: [],
    degraded: true,
    degradedReason: reason,
  };
}

// ------------------------------------------------------------------
// The single-call path -- unchanged in spirit from before, just with a
// higher token ceiling, date-awareness, and the fallback provider.
// ------------------------------------------------------------------
async function analyzeSingleCall(
  text: string,
  resolved: { provider: TextProvider; model: string; apiKey: string },
  todayIso: string
): Promise<DocumentAnalysisResult> {
  const raw = await callWithFallback(resolved, fullSystemPrompt(todayIso), `Document:\n${text}`);
  const parsed = safeParseJson(raw);
  if (!parsed) {
    return emptyResult(`${resolved.provider.label} did not return valid structured data. Try again or pick a different provider.`);
  }
  const partial = parsePartial(parsed);
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    ...partial,
    degraded: false,
  };
}

// ------------------------------------------------------------------
// The chunked path -- for long documents. Each chunk is analyzed
// independently (allSettled -- one failing chunk doesn't sink the
// rest), results are merged + deduplicated, then a final short call
// synthesizes the whole-document summary from the merged structured
// data (not the raw text, so it stays cheap regardless of document
// length).
// ------------------------------------------------------------------
async function analyzeChunked(
  chunks: string[],
  resolved: { provider: TextProvider; model: string; apiKey: string },
  todayIso: string
): Promise<DocumentAnalysisResult> {
  const chunkPrompt = chunkSystemPrompt(todayIso);

  const settled = await Promise.allSettled(
    chunks.map((chunk) => callWithFallback(resolved, chunkPrompt, `Document section:\n${chunk}`))
  );

  const partials: PartialExtraction[] = [];
  let failures = 0;
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      const parsed = safeParseJson(outcome.value);
      if (parsed) {
        partials.push(parsePartial(parsed));
      } else {
        failures += 1;
      }
    } else {
      failures += 1;
    }
  }

  if (partials.length === 0) {
    return emptyResult(
      `${resolved.provider.label} could not analyze any section of this document. Try again or pick a different provider.`
    );
  }

  const merged = mergePartials(partials);

  if (failures > 0) {
    merged.risks = [
      ...merged.risks,
      `${failures} of ${chunks.length} document sections could not be analyzed due to a temporary AI error — consider re-analyzing this document.`,
    ];
  }

  // Synthesize the summary from the merged structured data (cheap --
  // this is a small JSON payload, not the original long document).
  // A failure here is non-fatal: the rest of the analysis is still
  // fully useful without a one-paragraph summary on top.
  let summary = '';
  try {
    const summaryInput = JSON.stringify({
      parties: merged.parties,
      deliverables: merged.deliverables,
      deadlines: merged.deadlines,
      paymentTerms: merged.paymentTerms,
      risks: merged.risks,
    });
    summary = (await callWithFallback(resolved, SUMMARY_SYSTEM_PROMPT, summaryInput)).trim();
  } catch (err) {
    console.warn('[documentAnalysis] Summary synthesis failed (non-fatal):', err);
  }

  return { summary, ...merged, degraded: false };
}

/** Analyzes raw extracted document text and returns a structured
 * result. Never throws -- a missing/failing AI provider degrades to an
 * empty result with `degraded: true` + a human-readable reason. Long
 * documents are automatically chunked (see module header); the
 * `truncated` flag only becomes true beyond the new, much higher
 * MAX_CHUNKS ceiling. */
export async function analyzeDocumentText(
  text: string
): Promise<{ result: DocumentAnalysisResult; truncated: boolean; sourceLength: number }> {
  const sourceLength = text.length;

  if (!text.trim()) {
    return {
      result: emptyResult('The document appears to be empty, or its text could not be extracted.'),
      truncated: false,
      sourceLength,
    };
  }

  const resolved = await resolveProviderWithFallback();
  if ('error' in resolved) {
    return { result: emptyResult(resolved.error), truncated: false, sourceLength };
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  try {
    if (text.length <= SINGLE_CALL_LIMIT) {
      const result = await analyzeSingleCall(text, resolved, todayIso);
      return { result, truncated: false, sourceLength };
    }

    const { chunks, truncated } = splitIntoChunks(text);
    const result = await analyzeChunked(chunks, resolved, todayIso);
    return { result, truncated, sourceLength };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI analysis failed.';
    console.error('[documentAnalysis] Analysis failed:', err);
    return { result: emptyResult(message), truncated: false, sourceLength };
  }
}

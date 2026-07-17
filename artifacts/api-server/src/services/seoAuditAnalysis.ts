// ============================================================
// SEO & Accessibility -- AI plain-language analysis, 2026-07-16.
//
// Takes real Lighthouse findings (never invents its own) and explains
// them for a non-developer admin: what's actually wrong, why it
// matters, and what to tackle first. Reuses the SAME provider
// resolution + keyless-fallback machinery documentAnalysis.ts already
// built for Document Assistant -- one AI resilience layer for the
// whole project, not a separate one per feature.
// ============================================================
import { callWithFallback, resolveProviderWithFallback } from './documentAnalysis';
import type { LighthouseAuditSummary } from './lighthouseAudit';

export type IssueSeverity = 'high' | 'medium' | 'low';

export interface AuditPriority {
  title: string;
  explanation: string;
  severity: IssueSeverity;
}

export interface AuditAnalysis {
  summary: string;
  priorities: AuditPriority[];
}

const MAX_ISSUES_IN_PROMPT = 25;
const MAX_PRIORITIES = 8;

const SYSTEM_PROMPT = `You are a web performance and SEO consultant explaining a real Google Lighthouse audit to a composer who runs their own portfolio website and is not a developer. You are given the site's four real category scores and a list of the specific checks that failed, each with Lighthouse's own real description. Explain what's actually wrong in plain language and what matters most -- never invent an issue that isn't in the data given to you.

Return ONLY a single valid JSON object, no markdown fences, no commentary, matching exactly this shape:
{
  "summary": "2-3 sentence plain-English overview of the site's overall health right now",
  "priorities": [{"title": "short label for the issue, in plain language", "explanation": "1-2 plain-English sentences on why this matters and what it affects for a visitor or for search ranking", "severity": "high|medium|low"}]
}

List at most 8 priorities, worst/most-impactful first. If there are more failing checks than that, focus on the ones that matter most rather than trying to cover everything.`;

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

function toPriorities(v: unknown): AuditPriority[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const p = raw as Record<string, unknown>;
      const title = typeof p.title === 'string' ? p.title.trim() : '';
      const explanation = typeof p.explanation === 'string' ? p.explanation.trim() : '';
      if (!title || !explanation) return null;
      const severity: IssueSeverity = p.severity === 'high' || p.severity === 'medium' || p.severity === 'low' ? p.severity : 'medium';
      return { title, explanation, severity };
    })
    .filter((x): x is AuditPriority => x !== null)
    .slice(0, MAX_PRIORITIES);
}

/** Analyzes a real Lighthouse audit summary and returns a plain-language
 * overview + prioritized issue list. Returns null (never throws) if no
 * AI provider is available or the call fails -- the raw Lighthouse
 * scores and issue list are still fully useful on their own without
 * this layer, so a failure here should never block saving/showing the
 * audit itself. */
export async function analyzeAuditResults(audit: LighthouseAuditSummary): Promise<AuditAnalysis | null> {
  if (audit.issues.length === 0) {
    return { summary: 'No failing checks were found in this audit -- the site is in good shape across SEO, accessibility, performance, and best practices.', priorities: [] };
  }

  const resolved = await resolveProviderWithFallback();
  if ('error' in resolved) return null;

  const userPrompt = `Scores (0-100): SEO ${audit.scores.seo}, Accessibility ${audit.scores.accessibility}, Performance ${audit.scores.performance}, Best Practices ${audit.scores.bestPractices}.

Failing checks:
${audit.issues
  .slice(0, MAX_ISSUES_IN_PROMPT)
  .map((i) => `- [${i.category}] ${i.title}: ${i.description}`)
  .join('\n')}`;

  try {
    const raw = await callWithFallback(resolved, SYSTEM_PROMPT, userPrompt);
    const parsed = safeParseJson(raw);
    if (!parsed) return null;

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      priorities: toPriorities(parsed.priorities),
    };
  } catch (err) {
    console.warn('[seoAuditAnalysis] AI analysis failed (non-fatal, raw audit still saved):', err);
    return null;
  }
}

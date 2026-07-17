// ============================================================
// SEO & Accessibility -- real Lighthouse audits, 2026-07-16.
//
// Runs the SAME engine Google's own PageSpeed Insights uses (Lighthouse
// + a real headless Chrome), not a heuristic or an AI guess. Requires
// a real Chrome/Chromium installation on the machine running the API
// server -- chrome-launcher auto-detects an existing installation (a
// normal desktop Chrome install is enough; no separate download).
//
// IMPORTANT for Reza: SEO_AUDIT_URL controls what gets audited. It
// defaults to the local dev server, which is fine for checking that
// audits work at all, but a meaningful SEO/Accessibility/Performance
// score only comes from auditing the REAL public domain once deployed
// -- set SEO_AUDIT_URL in the .env once that exists.
// ============================================================
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

export interface LighthouseIssue {
  id: string;
  title: string;
  description: string;
  category: string;
  score: number | null;
}

export interface LighthouseAuditSummary {
  auditedUrl: string;
  scores: {
    seo: number;
    accessibility: number;
    performance: number;
    bestPractices: number;
  };
  issues: LighthouseIssue[];
}

const CATEGORY_IDS = ['performance', 'accessibility', 'seo', 'best-practices'];
const MAX_ISSUES_RETURNED = 40;

function stripMarkdownLinks(text: string | undefined): string {
  if (!text) return '';
  // Lighthouse audit descriptions are Markdown, e.g. "Learn more [here](https://...)."
  // -- strip the link syntax down to just the visible text for a plain-language admin UI.
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}

/** Launches a local headless Chrome, runs a full Lighthouse audit
 * against `url`, and returns the four category scores plus every
 * failing/non-passing check with its real Lighthouse-provided title
 * and description. Always tears down the Chrome process, even on
 * failure. */
export async function runLighthouseAudit(url: string): Promise<LighthouseAuditSummary> {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: CATEGORY_IDS,
    });

    if (!result?.lhr) {
      throw new Error('Lighthouse did not return a result. Is the target URL reachable from the API server?');
    }

    const { lhr } = result;

    const scoreOf = (id: string): number => {
      const cat = lhr.categories[id];
      return cat?.score !== null && cat?.score !== undefined ? Math.round(cat.score * 100) : 0;
    };

    const scores = {
      seo: scoreOf('seo'),
      accessibility: scoreOf('accessibility'),
      performance: scoreOf('performance'),
      bestPractices: scoreOf('best-practices'),
    };

    const issues: LighthouseIssue[] = [];
    const seenAuditIds = new Set<string>();

    for (const [categoryId, category] of Object.entries(lhr.categories)) {
      for (const ref of category.auditRefs ?? []) {
        if (seenAuditIds.has(ref.id)) continue;
        const audit = lhr.audits[ref.id];
        if (!audit) continue;
        // score === null covers "informative" audits with no pass/fail;
        // scoreDisplayMode filters out N/A and manual-only checks --
        // only real, applicable, failing/partial checks are surfaced.
        if (
          audit.score !== null &&
          audit.score < 1 &&
          audit.scoreDisplayMode !== 'notApplicable' &&
          audit.scoreDisplayMode !== 'manual' &&
          audit.scoreDisplayMode !== 'informative'
        ) {
          seenAuditIds.add(ref.id);
          issues.push({
            id: audit.id,
            title: audit.title,
            description: stripMarkdownLinks(audit.description),
            category: categoryId,
            score: audit.score,
          });
        }
      }
    }

    issues.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

    return {
      auditedUrl: url,
      scores,
      issues: issues.slice(0, MAX_ISSUES_RETURNED),
    };
  } finally {
    chrome.kill();
  }
}

// lighthouse ships no type declarations of its own, and there is no
// @types/lighthouse package on npm (confirmed 2026-07-16). This is a
// deliberately minimal declaration covering only the fields
// services/lighthouseAudit.ts actually reads from the real LHR
// (Lighthouse Result) object -- not the full upstream schema, which is
// enormous. If a future Lighthouse upgrade changes these field names,
// `pnpm typecheck` will NOT catch that (this is a hand-written shape,
// not derived from the real package) -- worth a quick smoke-test of
// the SEO tab's "Run Audit" button after any lighthouse version bump.
declare module 'lighthouse' {
  export interface LighthouseAuditResult {
    id: string;
    title: string;
    description?: string;
    score: number | null;
    scoreDisplayMode?: string;
  }

  export interface LighthouseCategoryResult {
    id: string;
    score: number | null;
    auditRefs: { id: string }[];
  }

  export interface LighthouseResult {
    categories: Record<string, LighthouseCategoryResult>;
    audits: Record<string, LighthouseAuditResult>;
  }

  export interface LighthouseRunnerResult {
    lhr: LighthouseResult;
    report: string | string[];
  }

  export interface LighthouseFlags {
    port?: number;
    output?: string | string[];
    onlyCategories?: string[];
    logLevel?: string;
  }

  export default function lighthouse(
    url: string,
    flags?: LighthouseFlags,
    config?: unknown
  ): Promise<LighthouseRunnerResult | undefined>;
}

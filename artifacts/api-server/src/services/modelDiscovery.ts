// ============================================================
// ACE-2026 — AI Model Discovery (2026-07-09, per Reza's request)
//
// The model IDs in aiProviders.ts's TEXT_PROVIDERS list are hand-written
// and go stale the moment a provider ships a new model generation (this
// is exactly what happened with Gemini — the list still said
// gemini-1.5-flash/gemini-2.0-flash months after gemini-3.x shipped).
//
// This service periodically calls each CONFIGURED provider's own
// "list models" API (where one exists) and diffs the live result against
// our hardcoded list. Anything live-but-not-in-our-list becomes an alert
// the admin UI can surface, so stale entries get noticed instead of
// silently causing confusing "model not found" failures.
//
// Scope (2026-07-09): text providers only. Image-provider APIs vary too
// much in shape to safely automate without per-provider verification —
// a good follow-up, not part of this pass.
// ============================================================

import { TEXT_PROVIDERS, getProviderApiKey, type TextProvider } from './aiProviders';

export interface ModelUpdateAlert {
  providerId: string;
  providerLabel: string;
  newModelIds: string[];
  truncatedCount: number; // how many more exist beyond newModelIds, if capped
  importance: 'high' | 'medium';
  description: string;
  checkedAt: string;
}

// Aggregators (OpenRouter, etc.) expose hundreds of long-tail community
// models — "new" there almost every check and not meaningfully comparable
// to a single vendor's curated list. Excluded entirely rather than shown
// as noise (2026-07-09, per Reza — the giant unfiltered dump was "ugly").
const DISCOVERY_SKIP_PROVIDERS = new Set(['openrouter']);

// Direct, major-vendor APIs get "high" importance; everything else
// (smaller/aggregating vendors) gets "medium". A simple, honest heuristic
// — not a claim of real model-quality scoring.
const MAJOR_VENDOR_PROVIDERS = new Set(['openai', 'gemini', 'anthropic']);

const MAX_MODELS_PER_ALERT = 6;

let alerts: ModelUpdateAlert[] = [];
let lastCheckedAt: string | null = null;
let lastCheckError: string | null = null;

export function getModelUpdateAlerts(): { alerts: ModelUpdateAlert[]; lastCheckedAt: string | null; lastCheckError: string | null } {
  return { alerts, lastCheckedAt, lastCheckError };
}

export function dismissModelUpdateAlert(providerId: string): void {
  alerts = alerts.filter((a) => a.providerId !== providerId);
}

/** Removes a single model ID from a provider's alert (after it's been
 * applied or individually dismissed) — the alert itself disappears once
 * empty. */
export function removeModelFromAlert(providerId: string, modelId: string): void {
  alerts = alerts
    .map((a) => a.providerId === providerId ? { ...a, newModelIds: a.newModelIds.filter((id) => id !== modelId) } : a)
    .filter((a) => a.newModelIds.length > 0);
}

/** Fetches the live list of model IDs this provider currently exposes.
 * Returns null (not an error) for providers/compat-modes we don't have a
 * verified list-endpoint integration for yet — those are silently skipped,
 * never flagged as broken. */
async function fetchLiveModelIds(provider: TextProvider, apiKey: string): Promise<string[] | null> {
  try {
    if (provider.compatMode === 'openai') {
      // Standard OpenAI-compatible /v1/models — used by OpenAI itself and
      // most OpenAI-compatible providers (Mistral, Groq, DeepSeek, xAI
      // Grok, OpenRouter, Together AI, ...).
      const listUrl = provider.baseUrl.replace(/\/chat\/completions\/?$/, '/models');
      if (listUrl === provider.baseUrl) return null; // couldn't derive a /models URL, skip rather than guess
      const res = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const data = await res.json() as { data?: { id: string }[] };
      return (data.data ?? []).map((m) => m.id);
    }

    if (provider.compatMode === 'gemini') {
      const res = await fetch(`${provider.baseUrl}?key=${apiKey}`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return null;
      const data = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      return (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''));
    }

    if (provider.compatMode === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const data = await res.json() as { data?: { id: string }[] };
      return (data.data ?? []).map((m) => m.id);
    }

    return null; // cohere, pollinations-text: no verified list-endpoint integration yet
  } catch (err) {
    console.warn(`[Model Discovery] Live model fetch failed for ${provider.label}:`, err);
    return null;
  }
}

/** Checks every configured text provider for models we don't already know
 * about. Safe to call anytime (manual "Check Now" button or the periodic
 * timer) — providers with no key saved, or no list-endpoint support, are
 * skipped quietly rather than producing false alerts. */
export async function refreshModelUpdates(): Promise<ModelUpdateAlert[]> {
  const nextAlerts: ModelUpdateAlert[] = [];
  const checkedAt = new Date().toISOString();

  try {
    for (const provider of TEXT_PROVIDERS) {
      if (provider.noKeyRequired) continue; // keyless providers (Pollinations) have no real versioned model list
      if (DISCOVERY_SKIP_PROVIDERS.has(provider.id)) continue; // aggregators — too noisy, see note above
      const apiKey = await getProviderApiKey(provider);
      if (!apiKey) continue; // not configured — nothing to check

      const liveIds = await fetchLiveModelIds(provider, apiKey);
      if (!liveIds || liveIds.length === 0) continue;

      const knownIds = new Set(provider.models.map((m) => m.id));
      const allNewIds = liveIds.filter((id) => !knownIds.has(id));
      if (allNewIds.length > 0) {
        nextAlerts.push({
          providerId: provider.id,
          providerLabel: provider.label,
          newModelIds: allNewIds.slice(0, MAX_MODELS_PER_ALERT),
          truncatedCount: Math.max(0, allNewIds.length - MAX_MODELS_PER_ALERT),
          importance: MAJOR_VENDOR_PROVIDERS.has(provider.id) ? 'high' : 'medium',
          description: `${allNewIds.length} new model${allNewIds.length === 1 ? '' : 's'} found`,
          checkedAt,
        });
      }
    }
    alerts = nextAlerts;
    lastCheckedAt = checkedAt;
    lastCheckError = null;
  } catch (err) {
    lastCheckError = (err as Error).message || 'Model discovery check failed';
    console.error('[Model Discovery] refreshModelUpdates failed:', err);
  }

  return alerts;
}

/** Starts the periodic background check. Called once at server startup. */
export function startModelDiscoverySchedule(intervalMs: number = 24 * 60 * 60 * 1000): void {
  // Run once shortly after boot (not immediately — let the server finish
  // starting up first), then on the given interval.
  setTimeout(() => { void refreshModelUpdates(); }, 30_000);
  setInterval(() => { void refreshModelUpdates(); }, intervalMs);
}

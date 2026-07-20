// ============================================================
// ACE-2026 — AI Model Discovery (2026-07-09, per Reza's request)
//
// The model IDs in aiProviders.ts's TEXT_PROVIDERS list are hand-written
// and go stale the moment a provider ships a new model generation (this
// is exactly what happened with Gemini — the list still said
// gemini-1.5-flash/gemini-2.0-flash months after gemini-3.x shipped, and
// separately what happened with Imagen 4 being retired outright).
//
// This service periodically calls each CONFIGURED provider's own
// "list models" API (where one exists) and diffs the live result against
// our hardcoded list in both directions: models live-but-not-in-our-list
// (NEW) and models in-our-list-but-no-longer-live (REMOVED). The admin
// UI surfaces both via the bell, with one button to apply everything at
// once — see applyAllModelUpdates() below.
//
// 2026-07-19 (per Reza, round 2): extended from "text providers only" to
// also cover the two image providers we have a verified list-endpoint
// integration for (Gemini and OpenAI — both happen to reuse the exact
// same list endpoint their text counterparts use). The other image
// providers (Stability, Replicate, Leonardo, etc.) still have no
// verified integration and are silently skipped, same as before —
// intentionally not guessed at.
// ============================================================

import {
  TEXT_PROVIDERS, IMAGE_PROVIDERS, getProviderApiKey, applyModelOverride,
  persistModelOverride, removeModelFromProvider, markModelSeen,
  type TextProvider, type ImageProvider,
} from './aiProviders';

export interface ModelUpdateAlert {
  kind: 'text' | 'image';
  providerId: string;
  providerLabel: string;
  newModelIds: string[];
  truncatedCount: number; // how many more new ones exist beyond newModelIds, if capped
  removedModelIds: string[];
  importance: 'high' | 'medium';
  description: string;
  checkedAt: string;
}

// Aggregators (OpenRouter, etc.) expose hundreds of long-tail community
// models — "new" there almost every check and not meaningfully comparable
// to a single vendor's curated list. Excluded entirely rather than shown
// as noise (2026-07-09, per Reza — the giant unfiltered dump was "ugly").
const DISCOVERY_SKIP_PROVIDERS = new Set(['openrouter']);

// Image providers we have a verified, safe list-endpoint integration for
// (2026-07-19 scope — see file header). Every other image provider is
// skipped, same as "no verified integration" text providers.
const DISCOVERY_IMAGE_PROVIDERS = new Set(['gemini-image', 'openai-image']);

// Direct, major-vendor APIs get "high" importance; everything else
// (smaller/aggregating vendors) gets "medium". A simple, honest heuristic
// — not a claim of real model-quality scoring.
const MAJOR_VENDOR_PROVIDERS = new Set(['openai', 'gemini', 'anthropic', 'openai-image', 'gemini-image']);

const MAX_NEW_MODELS_PER_ALERT = 6;

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
 * individually applied/removed or dismissed) — the alert itself
 * disappears once both its new and removed lists are empty. */
export function removeModelFromAlert(providerId: string, modelId: string): void {
  alerts = alerts
    .map((a) => a.providerId === providerId
      ? { ...a, newModelIds: a.newModelIds.filter((id) => id !== modelId), removedModelIds: a.removedModelIds.filter((id) => id !== modelId) }
      : a)
    .filter((a) => a.newModelIds.length > 0 || a.removedModelIds.length > 0);
}

/** Fetches the live list of model IDs this provider currently exposes.
 * Returns null (not an error) for providers/compat-modes we don't have a
 * verified list-endpoint integration for yet — those are silently skipped,
 * never flagged as broken. */
async function fetchLiveModelIds(provider: TextProvider | ImageProvider, apiKey: string): Promise<string[] | null> {
  try {
    if (provider.compatMode === 'openai' || provider.compatMode === 'openai-image') {
      // Text (.../chat/completions) and image (.../images/generations)
      // both live under the same account-wide /v1/models list.
      const listUrl = provider.baseUrl.replace(/\/v1\/.*$/, '/v1/models');
      if (listUrl === provider.baseUrl) return null; // couldn't derive a /models URL, skip rather than guess
      const res = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const data = await res.json() as { data?: { id: string }[] };
      return (data.data ?? []).map((m) => m.id);
    }

    if (provider.compatMode === 'gemini' || provider.compatMode === 'gemini-native-image') {
      // Gemini's ListModels endpoint returns both text- and image-capable
      // models together; the per-provider diff against each provider's
      // OWN known-id list is what actually separates "new for text" from
      // "new for image".
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

    return null; // cohere, pollinations-text, and all other image providers: no verified list-endpoint integration yet
  } catch (err) {
    console.warn(`[Model Discovery] Live model fetch failed for ${provider.label}:`, err);
    return null;
  }
}

/** Checks every configured provider (text, plus the two image providers
 * we have a verified integration for) against its live model list, in
 * both directions — new models to add, and models that vanished upstream
 * to remove. Safe to call anytime (login, manual "Check Now", or the
 * periodic timer) — providers with no key saved, or no list-endpoint
 * support, are skipped quietly rather than producing false alerts. */
export async function refreshModelUpdates(): Promise<ModelUpdateAlert[]> {
  const nextAlerts: ModelUpdateAlert[] = [];
  const checkedAt = new Date().toISOString();

  try {
    const jobs: { kind: 'text' | 'image'; provider: TextProvider | ImageProvider }[] = [
      ...TEXT_PROVIDERS.map((provider) => ({ kind: 'text' as const, provider })),
      ...IMAGE_PROVIDERS
        .filter((provider) => DISCOVERY_IMAGE_PROVIDERS.has(provider.id))
        .map((provider) => ({ kind: 'image' as const, provider })),
    ];

    for (const { kind, provider } of jobs) {
      if (provider.noKeyRequired) continue; // keyless providers (Pollinations) have no real versioned model list
      if (DISCOVERY_SKIP_PROVIDERS.has(provider.id)) continue; // aggregators — too noisy, see note above
      const apiKey = await getProviderApiKey(provider);
      if (!apiKey) continue; // not configured — nothing to check

      const liveIds = await fetchLiveModelIds(provider, apiKey);
      if (!liveIds || liveIds.length === 0) continue;

      const liveIdSet = new Set(liveIds);
      const knownIds = provider.models.map((m) => m.id);
      const knownIdSet = new Set(knownIds);

      const allNewIds = liveIds.filter((id) => !knownIdSet.has(id));
      const removedIds = knownIds.filter((id) => !liveIdSet.has(id));

      if (allNewIds.length > 0 || removedIds.length > 0) {
        const parts: string[] = [];
        if (allNewIds.length > 0) parts.push(`${allNewIds.length} new model${allNewIds.length === 1 ? '' : 's'}`);
        if (removedIds.length > 0) parts.push(`${removedIds.length} removed model${removedIds.length === 1 ? '' : 's'}`);
        nextAlerts.push({
          kind,
          providerId: provider.id,
          providerLabel: provider.label,
          newModelIds: allNewIds.slice(0, MAX_NEW_MODELS_PER_ALERT),
          truncatedCount: Math.max(0, allNewIds.length - MAX_NEW_MODELS_PER_ALERT),
          removedModelIds: removedIds,
          importance: MAJOR_VENDOR_PROVIDERS.has(provider.id) ? 'high' : 'medium',
          description: parts.join(', '),
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

/** "Apply All" (2026-07-19, per Reza): adds every currently-alerted new
 * model into its provider's selectable list AND strips every currently-
 * alerted removed model out, for every provider at once, in one click —
 * the admin never has to go model-by-model. Persists every add so it
 * survives a restart (see persistModelOverride); removals are also
 * deleted from the DB where they exist as a prior override (see
 * removeModelFromProvider). Clears all alerts once done. */
export async function applyAllModelUpdates(): Promise<ModelUpdateAlert[]> {
  for (const alert of alerts) {
    for (const modelId of alert.newModelIds) {
      applyModelOverride(alert.kind, alert.providerId, modelId, modelId, true);
      try {
        await persistModelOverride(alert.kind, alert.providerId, modelId, modelId, true);
      } catch (err) {
        console.warn(`[Model Discovery] Applied "${modelId}" live but failed to persist it — will not survive a restart.`, err);
      }
    }
    for (const modelId of alert.removedModelIds) {
      await removeModelFromProvider(alert.kind, alert.providerId, modelId);
    }
  }
  alerts = [];
  return alerts;
}

/** Clears the NEW badge for one model in the Gatekeeper Hub picker,
 * called when the admin actually selects it there (2026-07-19). Thin
 * re-export point so routes only need to import from one place. */
export const markSeen = markModelSeen;

/** Starts the periodic background check. Called once at server startup. */
export function startModelDiscoverySchedule(intervalMs: number = 24 * 60 * 60 * 1000): void {
  // Run once shortly after boot (not immediately — let the server finish
  // starting up first), then on the given interval.
  setTimeout(() => { void refreshModelUpdates(); }, 30_000);
  setInterval(() => { void refreshModelUpdates(); }, intervalMs);
}

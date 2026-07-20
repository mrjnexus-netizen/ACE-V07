// ============================================================
// ACE-2026 — AI Provider Registry (A3b)
// Central place listing every supported text/image AI provider,
// their models, and how to actually call each one. Admin picks a
// provider+model in Gatekeeper Hub; that choice (not a hardcoded
// default) drives every "Generate" button on the site.
//
// Most text providers speak an OpenAI-compatible REST API (same
// request/response shape as OpenAI's /chat/completions) — one
// shared caller handles all of those. Gemini, Anthropic, and
// Cohere have their own shapes and get small dedicated callers.
// ============================================================

import { and, eq } from 'drizzle-orm';

import { db } from '../db/db';
import { apiKeys, modelOverrides } from '../db/schema';
import { decrypt } from './encryptionService';

export interface ProviderModel {
  id: string;
  label: string;
  /** 1-5 — rendered as signal bars in the admin picker. Rough general
   * capability guide, not a benchmark score — helps a non-technical
   * admin pick something reasonable without knowing the models. */
  quality: 1 | 2 | 3 | 4 | 5;
  /** 2026-07-19 (per Reza): set true for models added via the model-
   * discovery "Apply" / "Apply All" flow — drives the NEW badge in the
   * Gatekeeper Hub picker. Cleared (see markModelSeen) once the admin
   * actually selects that model there. Hardcoded/original models never
   * get this set, so they never show the badge. */
  isNew?: boolean;
}

export interface TextProvider {
  id: string;
  label: string;
  compatMode: 'openai' | 'gemini' | 'anthropic' | 'cohere' | 'pollinations-text';
  baseUrl: string;
  models: ProviderModel[];
  keyName: string; // encrypted key storage name, e.g. AI_PROVIDER_KEY_OPENAI
  docsUrl: string;
  /** Shown as a small tag next to the provider in the list. */
  tier?: 'paid' | 'limited free' | 'free';
  /** If true, no API key is required at all (e.g. Pollinations). */
  noKeyRequired?: boolean;
}

export interface ImageProvider {
  id: string;
  label: string;
  compatMode: 'openai-image' | 'stability' | 'replicate' | 'gemini-image' | 'gemini-native-image' | 'huggingface' | 'pollinations' | 'deepai' | 'clipdrop' | 'ideogram' | 'leonardo';
  baseUrl: string;
  models: ProviderModel[];
  keyName: string;
  docsUrl: string;
  tier?: 'paid' | 'limited free' | 'free';
  noKeyRequired?: boolean;
}

export const TEXT_PROVIDERS: TextProvider[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    compatMode: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (fast, cheap)', quality: 3 },
      { id: 'gpt-4o', label: 'GPT-4o (higher quality)', quality: 5 },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', quality: 4 },
    ],
    keyName: 'AI_PROVIDER_KEY_OPENAI',
    docsUrl: 'https://platform.openai.com/api-keys',
    tier: 'paid',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    compatMode: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: [
      { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (fastest, free tier available)', quality: 3 },
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (free tier available)', quality: 4 },
      { id: 'gemini-3-pro', label: 'Gemini 3 Pro (highest quality)', quality: 5 },
    ],
    keyName: 'AI_PROVIDER_KEY_GEMINI',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    tier: 'limited free',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    compatMode: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    models: [
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (fast)', quality: 3 },
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', quality: 5 },
    ],
    keyName: 'AI_PROVIDER_KEY_ANTHROPIC',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    tier: 'paid',
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    compatMode: 'openai',
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small', quality: 3 },
      { id: 'mistral-large-latest', label: 'Mistral Large', quality: 4 },
    ],
    keyName: 'AI_PROVIDER_KEY_MISTRAL',
    docsUrl: 'https://console.mistral.ai/api-keys',
    tier: 'limited free',
  },
  {
    id: 'groq',
    label: 'Groq',
    compatMode: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    models: [
      { id: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B (very fast, free tier)', quality: 4 },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', quality: 3 },
    ],
    keyName: 'AI_PROVIDER_KEY_GROQ',
    docsUrl: 'https://console.groq.com/keys',
    tier: 'limited free',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    compatMode: 'openai',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    models: [{ id: 'deepseek-chat', label: 'DeepSeek Chat (cheap)', quality: 4 }],
    keyName: 'AI_PROVIDER_KEY_DEEPSEEK',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    tier: 'paid',
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    compatMode: 'openai',
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    models: [{ id: 'grok-beta', label: 'Grok Beta', quality: 4 }],
    keyName: 'AI_PROVIDER_KEY_XAI',
    docsUrl: 'https://console.x.ai',
    tier: 'paid',
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    compatMode: 'openai',
    baseUrl: 'https://api.perplexity.ai/chat/completions',
    models: [{ id: 'sonar', label: 'Sonar', quality: 3 }],
    keyName: 'AI_PROVIDER_KEY_PERPLEXITY',
    docsUrl: 'https://www.perplexity.ai/settings/api',
    tier: 'paid',
  },
  {
    id: 'cohere',
    label: 'Cohere',
    compatMode: 'cohere',
    baseUrl: 'https://api.cohere.com/v1/chat',
    models: [{ id: 'command-r', label: 'Command R', quality: 3 }, { id: 'command-r-plus', label: 'Command R+', quality: 4 }],
    keyName: 'AI_PROVIDER_KEY_COHERE',
    docsUrl: 'https://dashboard.cohere.com/api-keys',
    tier: 'limited free',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (many models, one key)',
    compatMode: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      { id: 'openai/gpt-4o-mini', label: 'via OpenRouter: GPT-4o mini', quality: 3 },
      { id: 'anthropic/claude-3.5-sonnet', label: 'via OpenRouter: Claude 3.5 Sonnet', quality: 5 },
      { id: 'meta-llama/llama-3.1-70b-instruct', label: 'via OpenRouter: Llama 3.1 70B', quality: 4 },
    ],
    keyName: 'AI_PROVIDER_KEY_OPENROUTER',
    docsUrl: 'https://openrouter.ai/keys',
    tier: 'limited free',
  },
  {
    id: 'together',
    label: 'Together AI',
    compatMode: 'openai',
    baseUrl: 'https://api.together.xyz/v1/chat/completions',
    models: [{ id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo', quality: 4 }],
    keyName: 'AI_PROVIDER_KEY_TOGETHER',
    docsUrl: 'https://api.together.ai/settings/api-keys',
    tier: 'paid',
  },
  {
    id: 'pollinations-text',
    label: 'Pollinations.ai (text)',
    compatMode: 'pollinations-text',
    baseUrl: 'https://text.pollinations.ai',
    models: [{ id: 'openai', label: 'Default (routes to an open model)', quality: 2 }],
    keyName: 'AI_PROVIDER_KEY_POLLINATIONS_TEXT',
    docsUrl: 'https://pollinations.ai/',
    tier: 'free',
    noKeyRequired: true,
  },

];

export const IMAGE_PROVIDERS: ImageProvider[] = [
  {
    id: 'openai-image',
    label: 'OpenAI (DALL-E)',
    compatMode: 'openai-image',
    baseUrl: 'https://api.openai.com/v1/images/generations',
    models: [
      { id: 'dall-e-3', label: 'DALL-E 3', quality: 5 },
      { id: 'dall-e-2', label: 'DALL-E 2 (cheaper)', quality: 3 },
    ],
    keyName: 'AI_PROVIDER_KEY_OPENAI_IMAGE',
    docsUrl: 'https://platform.openai.com/api-keys',
    tier: 'paid',
  },
  {
    id: 'stability',
    label: 'Stability AI',
    compatMode: 'stability',
    baseUrl: 'https://api.stability.ai/v2beta/stable-image/generate/core',
    models: [{ id: 'core', label: 'Stable Image Core', quality: 4 }],
    keyName: 'AI_PROVIDER_KEY_STABILITY',
    docsUrl: 'https://platform.stability.ai/account/keys',
    tier: 'paid',
  },
  {
    id: 'replicate',
    label: 'Replicate',
    compatMode: 'replicate',
    baseUrl: 'https://api.replicate.com/v1/predictions',
    models: [{ id: 'black-forest-labs/flux-schnell', label: 'FLUX Schnell (fast)', quality: 4 }],
    keyName: 'AI_PROVIDER_KEY_REPLICATE',
    docsUrl: 'https://replicate.com/account/api-tokens',
    tier: 'paid',
  },
  {
    // 2026-07-19: migrated off the Imagen 4 family (imagen-4.0-*) per
    // Google's own deprecation notice — the entire Imagen line is being
    // shut down (full family retirement by 2026-08-17; some preview
    // variants were already shut down 2026-02-17). Google's official
    // migration path is its Gemini-native image models ("Nano Banana"),
    // which use the standard :generateContent endpoint (inlineData in
    // the response) instead of Imagen's :predict/instances shape — see
    // the new 'gemini-native-image' compatMode below. Kept the same
    // provider id + keyName so Reza's existing stored API key in
    // Gatekeeper Hub keeps working with zero reconfiguration.
    id: 'gemini-image',
    label: 'Google Gemini (Nano Banana)',
    compatMode: 'gemini-native-image',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: [
      { id: 'gemini-2.5-flash-image', label: 'Nano Banana (cheapest, fastest)', quality: 3 },
      { id: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2 (fast, higher quality)', quality: 4 },
      { id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro (highest quality)', quality: 5 },
    ],
    keyName: 'AI_PROVIDER_KEY_GEMINI_IMAGE',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    tier: 'limited free',
  },
  {
    id: 'huggingface',
    label: 'Hugging Face Inference API',
    compatMode: 'huggingface',
    baseUrl: 'https://api-inference.huggingface.co/models',
    models: [
      { id: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'Stable Diffusion XL', quality: 3 },
      { id: 'black-forest-labs/FLUX.1-schnell', label: 'FLUX.1 Schnell', quality: 4 },
    ],
    keyName: 'AI_PROVIDER_KEY_HUGGINGFACE',
    docsUrl: 'https://huggingface.co/settings/tokens',
    tier: 'limited free',
  },
  {
    id: 'pollinations',
    label: 'Pollinations.ai',
    compatMode: 'pollinations',
    baseUrl: 'https://image.pollinations.ai/prompt',
    models: [{ id: 'flux', label: 'Flux (default)', quality: 2 }],
    keyName: 'AI_PROVIDER_KEY_POLLINATIONS',
    docsUrl: 'https://pollinations.ai/',
    tier: 'free',
    noKeyRequired: true,
  },
  {
    id: 'deepai',
    label: 'DeepAI',
    compatMode: 'deepai',
    baseUrl: 'https://api.deepai.org/api/text2img',
    models: [{ id: 'text2img', label: 'Text2Img', quality: 2 }],
    keyName: 'AI_PROVIDER_KEY_DEEPAI',
    docsUrl: 'https://deepai.org/dashboard/profile',
    tier: 'limited free',
  },
  {
    id: 'clipdrop',
    label: 'Clipdrop (by Stability)',
    compatMode: 'clipdrop',
    baseUrl: 'https://clipdrop-api.co/text-to-image/v1',
    models: [{ id: 'text-to-image', label: 'Text to Image', quality: 3 }],
    keyName: 'AI_PROVIDER_KEY_CLIPDROP',
    docsUrl: 'https://clipdrop.co/apis/dashboard',
    tier: 'limited free',
  },
  {
    id: 'ideogram',
    label: 'Ideogram',
    compatMode: 'ideogram',
    baseUrl: 'https://api.ideogram.ai/generate',
    models: [{ id: 'V_2', label: 'Ideogram V2', quality: 4 }],
    keyName: 'AI_PROVIDER_KEY_IDEOGRAM',
    docsUrl: 'https://ideogram.ai/manage-api',
    tier: 'limited free',
  },
  {
    id: 'leonardo',
    label: 'Leonardo.ai',
    compatMode: 'leonardo',
    baseUrl: 'https://cloud.leonardo.ai/api/rest/v1',
    models: [{ id: 'b24e16ff-06e3-43eb-8d33-4416c2d75876', label: 'Leonardo Phoenix', quality: 4 }],
    keyName: 'AI_PROVIDER_KEY_LEONARDO',
    docsUrl: 'https://app.leonardo.ai/settings/api-keys',
    tier: 'limited free',
  },
];

export function findTextProvider(id: string): TextProvider | undefined {
  return TEXT_PROVIDERS.find((p) => p.id === id);
}
export function findImageProvider(id: string): ImageProvider | undefined {
  return IMAGE_PROVIDERS.find((p) => p.id === id);
}

async function getDecryptedKeyValue(keyName: string): Promise<string | null> {
  const record = await db.query.apiKeys.findFirst({ where: eq(apiKeys.keyName, keyName) });
  if (!record || !record.isActive || !record.encryptedValue) return null;
  try {
    return decrypt({ encryptedValue: record.encryptedValue, iv: record.iv, authTag: record.authTag });
  } catch {
    return null;
  }
}

/** Looks up the saved key for ANY provider (not just whichever one is
 * currently selected in Gatekeeper Hub) — used by modelDiscovery.ts to
 * check every configured provider for new models, not just the active one. */
export async function getProviderApiKey(provider: TextProvider | ImageProvider): Promise<string | null> {
  if (provider.noKeyRequired) return '';
  return getDecryptedKeyValue(provider.keyName);
}

/** Adds a newly-discovered model into a provider's selectable list —
 * this is what the Gatekeeper Hub "Apply" button calls. Mutates the
 * TEXT_PROVIDERS/IMAGE_PROVIDERS arrays in place (const only prevents
 * reassignment, not mutation), so it's picked up immediately by the
 * existing /api/keys/ai-providers picker with zero other changes needed.
 *
 * NOTE (2026-07-09): this is in-memory only for now — it resets on server
 * restart. Persisting it to the DB needs the same encrypt/decrypt path
 * used for API keys; wire that in once encryptionService.ts's exact
 * signature is confirmed. */
export function applyModelOverride(kind: 'text' | 'image', providerId: string, modelId: string, label: string, isNew: boolean = true): boolean {
  const list = kind === 'text' ? TEXT_PROVIDERS : IMAGE_PROVIDERS;
  const provider = list.find((p) => p.id === providerId);
  if (!provider) return false;
  const existing = provider.models.find((m) => m.id === modelId);
  if (existing) {
    existing.isNew = isNew; // already there — keep isNew in sync (e.g. re-applying, or a hydrate replay)
    return true;
  }
  provider.models.push({ id: modelId, label, quality: 3, isNew });
  return true;
}

/** Removes a model that's vanished from the provider's live list (2026-07-19,
 * per Reza's "removed models should leave the list too"). For models that
 * were originally hand-written in TEXT_PROVIDERS/IMAGE_PROVIDERS above (not
 * added via override), this only removes it from the in-memory list for
 * this running process — since the hardcoded array lives in source code,
 * it comes back on the next deploy/restart until someone edits the source.
 * Overrides are also deleted from the DB so they don't come back via
 * hydrateModelOverrides() either. */
export async function removeModelFromProvider(kind: 'text' | 'image', providerId: string, modelId: string): Promise<boolean> {
  const list = kind === 'text' ? TEXT_PROVIDERS : IMAGE_PROVIDERS;
  const provider = list.find((p) => p.id === providerId);
  if (!provider) return false;
  const before = provider.models.length;
  provider.models = provider.models.filter((m) => m.id !== modelId);
  try {
    await db.delete(modelOverrides).where(
      and(eq(modelOverrides.kind, kind), eq(modelOverrides.providerId, providerId), eq(modelOverrides.modelId, modelId))
    );
  } catch (err) {
    console.warn(`[modelOverrides] Removed "${modelId}" from the live list but failed to delete its DB override row (harmless if it was never an override):`, err);
  }
  return provider.models.length < before;
}

/** Clears the NEW badge for one model — called when the admin actually
 * selects it in the Gatekeeper Hub picker (2026-07-19, per Reza). */
export async function markModelSeen(kind: 'text' | 'image', providerId: string, modelId: string): Promise<void> {
  const list = kind === 'text' ? TEXT_PROVIDERS : IMAGE_PROVIDERS;
  const provider = list.find((p) => p.id === providerId);
  const model = provider?.models.find((m) => m.id === modelId);
  if (model) model.isNew = false;
  try {
    await db.update(modelOverrides).set({ isNew: false }).where(
      and(eq(modelOverrides.kind, kind), eq(modelOverrides.providerId, providerId), eq(modelOverrides.modelId, modelId))
    );
  } catch {
    // Fine if this wasn't an override row (a hardcoded model never has a
    // DB row to update) — the in-memory clear above is what actually
    // drives the badge anyway.
  }
}

/** Durable half of "Apply" (2026-07-10 fix) — writes the override to the
 * model_overrides table so it survives a server restart. Call AFTER
 * applyModelOverride() has already updated the in-memory registry; this
 * only persists the record for next boot's hydrateModelOverrides(). Safe
 * to call even if the row already exists (onConflictDoNothing). */
export async function persistModelOverride(kind: 'text' | 'image', providerId: string, modelId: string, label: string, isNew: boolean = true): Promise<void> {
  await db
    .insert(modelOverrides)
    .values({ kind, providerId, modelId, label, quality: 3, isNew })
    .onConflictDoNothing();
}

/** Replays every persisted override into the in-memory registry. Must run
 * once at server boot, before any request that reads TEXT_PROVIDERS/
 * IMAGE_PROVIDERS (model dropdowns, Generate calls, etc.). A failure here
 * degrades gracefully — logs and continues with the hardcoded registry
 * only, never blocks server startup. */
export async function hydrateModelOverrides(): Promise<void> {
  try {
    const rows = await db.query.modelOverrides.findMany();
    for (const row of rows) {
      applyModelOverride(row.kind as 'text' | 'image', row.providerId, row.modelId, row.label, row.isNew ?? false);
    }
    if (rows.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[modelOverrides] Hydrated ${rows.length} persisted model override(s) from DB.`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[modelOverrides] Failed to hydrate persisted overrides — continuing with base registry.', err);
  }
}

export interface ResolvedTextProvider {
  provider: TextProvider;
  model: string;
  apiKey: string;
}
export interface ResolvedImageProvider {
  provider: ImageProvider;
  model: string;
  apiKey: string;
}

/** Reads whichever text provider the admin picked in Gatekeeper Hub
 * (TEXT_AI_SELECTED) and its key. Returns null with a reason if nothing
 * is set up yet — callers should degrade gracefully, never fabricate a
 * default. Shared by the manual "Generate" buttons AND the automatic
 * H9 pipeline, so both always use the exact same admin choice. */
export async function resolveActiveTextProvider(): Promise<ResolvedTextProvider | { error: string }> {
  const selectionValue = await getDecryptedKeyValue('TEXT_AI_SELECTED');
  if (!selectionValue) return { error: 'No text AI provider selected yet — pick one in Gatekeeper Hub → AI Models.' };
  const selection = JSON.parse(selectionValue) as { providerId: string; model: string };
  const provider = findTextProvider(selection.providerId);
  if (!provider) return { error: 'The selected text provider is no longer supported.' };
  const apiKey = provider.noKeyRequired ? '' : await getDecryptedKeyValue(provider.keyName);
  if (!provider.noKeyRequired && !apiKey) {
    return { error: `No API key saved for ${provider.label} yet — add one in Gatekeeper Hub.` };
  }
  return { provider, model: selection.model, apiKey: apiKey ?? '' };
}

/** Same as above, for the image provider (IMAGE_AI_SELECTED). */
export async function resolveActiveImageProvider(): Promise<ResolvedImageProvider | { error: string }> {
  const selectionValue = await getDecryptedKeyValue('IMAGE_AI_SELECTED');
  if (!selectionValue) return { error: 'No image AI provider selected yet — pick one in Gatekeeper Hub → AI Models.' };
  const selection = JSON.parse(selectionValue) as { providerId: string; model: string };
  const provider = findImageProvider(selection.providerId);
  if (!provider) return { error: 'The selected image provider is no longer supported.' };
  const apiKey = provider.noKeyRequired ? '' : await getDecryptedKeyValue(provider.keyName);
  if (!provider.noKeyRequired && !apiKey) {
    return { error: `No API key saved for ${provider.label} yet — add one in Gatekeeper Hub.` };
  }
  return { provider, model: selection.model, apiKey: apiKey ?? '' };
}

// ------------------------------------------------------------------
// Text generation — one call per provider shape.
// ------------------------------------------------------------------
// A non-technical admin should never see a raw JSON error dump. This
// tries to pull just the human message out of whatever shape the
// provider returned; falls back to a generic, still-useful line.
async function friendlyProviderError(providerLabel: string, status: number, res: Response): Promise<string> {
  let detail = '';
  try {
    const body = await res.clone().json();
    detail =
      body?.error?.message || // OpenAI/Gemini/Mistral/etc shape
      body?.message || // some providers put it at the top level
      (typeof body?.error === 'string' ? body.error : '') ||
      '';
  } catch {
    // not JSON — leave detail empty, use the generic fallback below
  }
  if (status === 401 || status === 403) return `${providerLabel} rejected this API key — check it's correct and active.`;
  if (status === 429) return `${providerLabel} rate limit reached — wait a moment and try again, or pick a different provider.`;
  if (status === 404 && !detail) return `${providerLabel} couldn't find that model — it may have been renamed or retired.`;
  if (detail) return `${providerLabel}: ${detail.slice(0, 180)}`;
  return `${providerLabel} returned an error (status ${status}) — try again or pick a different provider.`;
}

// Every provider call in this file goes through this instead of raw
// fetch(). Before this fix, a single hanging/slow provider (bad key,
// dead endpoint, network stall — no error, just silence) would hang
// callTextProvider/callImageProvider forever. Since the pipeline waits
// on BOTH via Promise.allSettled, that one hung call froze the entire
// job's progress bar indefinitely with no error ever surfacing
// (2026-07-09). A hard ceiling turns "hangs forever" into a normal,
// catchable error the pipeline already knows how to handle.
const PROVIDER_TIMEOUT_MS = 45_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

// `maxTokens` is optional and defaults to the original hardcoded 220 —
// every existing caller (narrative captions, business-scanner AI
// scoring, chat, etc.) keeps its exact prior behavior unchanged. Added
// 2026-07-16 for the Document Assistant, whose structured JSON
// responses (multiple arrays + a checklist) were silently getting cut
// off mid-generation at 220 tokens and failing to parse — this was a
// real, previously-undiagnosed cause of inconsistent analysis quality,
// not just "which provider is active."
export async function callTextProvider(
  provider: TextProvider,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 220
): Promise<string> {
  if (provider.compatMode === 'openai') {
    const res = await fetchWithTimeout(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error(`${provider.label} returned no text.`);
    return text;
  }

  if (provider.compatMode === 'gemini') {
    const url = `${provider.baseUrl}/${model}:generateContent?key=${apiKey}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error(`${provider.label} returned no text.`);
    return text;
  }

  if (provider.compatMode === 'anthropic') {
    const res = await fetchWithTimeout(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const text = data.content?.[0]?.text?.trim();
    if (!text) throw new Error(`${provider.label} returned no text.`);
    return text;
  }

  if (provider.compatMode === 'cohere') {
    const res = await fetchWithTimeout(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, message: userPrompt, preamble: systemPrompt, temperature: 0.85, max_tokens: maxTokens }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const text = data.text?.trim();
    if (!text) throw new Error(`${provider.label} returned no text.`);
    return text;
  }

  if (provider.compatMode === 'pollinations-text') {
    // Genuinely keyless — a GET request with the combined prompt in the URL path.
    // A random `seed` is required here: Pollinations (and any CDN/cache in
    // front of it) serves an identical cached response for an identical
    // URL, which made every "Regenerate" click return the exact same text
    // since the prompt itself doesn't change between clicks (2026-07-09).
    const combined = `${systemPrompt}\n\n${userPrompt}`;
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const res = await fetchWithTimeout(`${provider.baseUrl}/${encodeURIComponent(combined)}?seed=${seed}`);
    if (!res.ok) throw new Error(`${provider.label} error ${res.status}.`);
    const text = (await res.text()).trim();
    if (!text) throw new Error(`${provider.label} returned no text.`);
    return text;
  }

  throw new Error(`Unsupported provider compatMode: ${provider.compatMode}`);
}

// ------------------------------------------------------------------
// Image generation — returns a Buffer ready to re-upload to our S3.
// ------------------------------------------------------------------
export async function callImageProvider(provider: ImageProvider, model: string, apiKey: string, prompt: string): Promise<Buffer> {
  if (provider.compatMode === 'openai-image') {
    const res = await fetchWithTimeout(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024', quality: 'hd', response_format: 'url' }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const url = data.data?.[0]?.url;
    if (!url) throw new Error(`${provider.label} returned no image.`);
    const img = await fetchWithTimeout(url);
    if (!img.ok) throw new Error(`Could not download image from ${provider.label}.`);
    return Buffer.from(await img.arrayBuffer());
  }

  if (provider.compatMode === 'stability') {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('output_format', 'png');
    const res = await fetchWithTimeout(provider.baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
      body: form as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    return Buffer.from(await res.arrayBuffer());
  }

  if (provider.compatMode === 'replicate') {
    const create = await fetchWithTimeout(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, Prefer: 'wait' },
      body: JSON.stringify({ version: model, input: { prompt } }),
    });
    if (!create.ok) throw new Error(await friendlyProviderError(provider.label, create.status, create));
    const prediction = await create.json();
    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!outputUrl) throw new Error(`${provider.label} returned no image.`);
    const img = await fetchWithTimeout(outputUrl);
    if (!img.ok) throw new Error(`Could not download image from ${provider.label}.`);
    return Buffer.from(await img.arrayBuffer());
  }

  // Legacy Imagen (:predict / instances-and-predictions shape). Kept only
  // so this doesn't hard-crash if a stale model override in the DB still
  // points at an old imagen-4.0-* id; the Imagen family itself is being
  // shut down by Google (full retirement 2026-08-17) so this path should
  // no longer be reachable via the provider registry above.
  if (provider.compatMode === 'gemini-image') {
    const url = `${provider.baseUrl}/${model}:predict?key=${apiKey}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error(`${provider.label} returned no image.`);
    return Buffer.from(b64, 'base64');
  }

  // Current Gemini image models ("Nano Banana" family: gemini-2.5-flash-image,
  // gemini-3.1-flash-image-preview, gemini-3-pro-image-preview) — these speak
  // the standard :generateContent endpoint (same shape as Gemini text calls),
  // NOT Imagen's :predict/instances shape. The generated image comes back as
  // inline_data (base64) inside one of the response's content parts, mixed in
  // with any text parts the model may also return, so we scan for it.
  if (provider.compatMode === 'gemini-native-image') {
    const url = `${provider.baseUrl}/${model}:generateContent?key=${apiKey}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts as
      | Array<{ inlineData?: { data?: string }; inline_data?: { data?: string } }>
      | undefined;
    const imagePart = parts?.find(p => p.inlineData?.data || p.inline_data?.data);
    const b64 = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;
    if (!b64) throw new Error(`${provider.label} returned no image.`);
    return Buffer.from(b64, 'base64');
  }

  if (provider.compatMode === 'huggingface') {
    const res = await fetchWithTimeout(`${provider.baseUrl}/${model}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ inputs: prompt }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    // HF Inference API returns the raw image bytes directly.
    return Buffer.from(await res.arrayBuffer());
  }

  if (provider.compatMode === 'pollinations') {
    // Genuinely keyless — a GET request with the prompt in the URL path.
    // Same caching issue as pollinations-text above: without a random
    // seed, every regenerate returned the identical cached image
    // (2026-07-09).
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const res = await fetchWithTimeout(`${provider.baseUrl}/${encodeURIComponent(prompt)}?nologo=true&seed=${seed}`);
    if (!res.ok) throw new Error(`${provider.label} error ${res.status}.`);
    return Buffer.from(await res.arrayBuffer());
  }

  if (provider.compatMode === 'deepai') {
    const form = new URLSearchParams();
    form.append('text', prompt);
    const res = await fetchWithTimeout(provider.baseUrl, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const outputUrl = data.output_url;
    if (!outputUrl) throw new Error(`${provider.label} returned no image.`);
    const img = await fetchWithTimeout(outputUrl);
    if (!img.ok) throw new Error(`Could not download image from ${provider.label}.`);
    return Buffer.from(await img.arrayBuffer());
  }

  if (provider.compatMode === 'clipdrop') {
    const form = new FormData();
    form.append('prompt', prompt);
    const res = await fetchWithTimeout(provider.baseUrl, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: form as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    // Clipdrop returns the raw image bytes directly.
    return Buffer.from(await res.arrayBuffer());
  }

  if (provider.compatMode === 'ideogram') {
    const res = await fetchWithTimeout(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Key': apiKey },
      body: JSON.stringify({ image_request: { prompt, model, aspect_ratio: 'ASPECT_1_1' } }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const url = data.data?.[0]?.url;
    if (!url) throw new Error(`${provider.label} returned no image.`);
    const img = await fetchWithTimeout(url);
    if (!img.ok) throw new Error(`Could not download image from ${provider.label}.`);
    return Buffer.from(await img.arrayBuffer());
  }

  if (provider.compatMode === 'leonardo') {
    const create = await fetchWithTimeout(`${provider.baseUrl}/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ prompt, modelId: model, num_images: 1, width: 1024, height: 1024 }),
    });
    if (!create.ok) throw new Error(await friendlyProviderError(provider.label, create.status, create));
    const created = await create.json();
    const genId = created.sdGenerationJob?.generationId;
    if (!genId) throw new Error(`${provider.label} did not return a generation id.`);

    // Poll for completion — Leonardo generations are async.
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await fetchWithTimeout(`${provider.baseUrl}/generations/${genId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!poll.ok) continue;
      const polled = await poll.json();
      const images = polled.generations_by_pk?.generated_images;
      if (Array.isArray(images) && images[0]?.url) {
        const img = await fetchWithTimeout(images[0].url);
        if (!img.ok) throw new Error(`Could not download image from ${provider.label}.`);
        return Buffer.from(await img.arrayBuffer());
      }
    }
    throw new Error(`${provider.label} generation timed out.`);
  }

  throw new Error(`Unsupported image provider compatMode: ${provider.compatMode}`);
}

// 2026-07-19 (per Reza): "Cover Art" and "Banner" now have fully
// independent Generate buttons in the admin UI — the banner's button
// doesn't roll a brand-new random image, it RECOMPOSES the already-
// generated square cover into a wide banner, so the two stay visually
// identical (same subject/lighting/palette), just reframed. This needs
// an image-input-capable provider, which today only means the configured
// Gemini "Nano Banana" provider (gemini-native-image compatMode) — its
// :generateContent endpoint accepts an inlineData image part alongside
// the text instruction. No other provider registered here supports
// image-conditioned generation, so this throws a clear, specific error
// for anything else; aiArtGenerator.ts's caller catches that and falls
// back to a fresh TEXT-ONLY wide generation via Pollinations instead.
export async function callImageProviderWithReference(
  provider: ImageProvider,
  model: string,
  apiKey: string,
  prompt: string,
  referenceImageBase64: string,
  referenceMimeType: string
): Promise<Buffer> {
  if (provider.compatMode === 'gemini-native-image') {
    const url = `${provider.baseUrl}/${model}:generateContent?key=${apiKey}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: referenceMimeType, data: referenceImageBase64 } },
            { text: prompt },
          ],
        }],
      }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts as
      | Array<{ inlineData?: { data?: string }; inline_data?: { data?: string } }>
      | undefined;
    const imagePart = parts?.find(p => p.inlineData?.data || p.inline_data?.data);
    const b64 = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;
    if (!b64) throw new Error(`${provider.label} returned no image.`);
    return Buffer.from(b64, 'base64');
  }

  throw new Error(
    `${provider.label} does not support image-reference (image-to-image) generation — ` +
    `only the Gemini Nano Banana provider does. Pick that as the active image provider ` +
    `in Gatekeeper Hub to use "recompose from square" for the wide banner.`
  );
}

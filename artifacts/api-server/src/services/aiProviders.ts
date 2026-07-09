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

export interface ProviderModel {
  id: string;
  label: string;
  /** 1-5 — rendered as signal bars in the admin picker. Rough general
   * capability guide, not a benchmark score — helps a non-technical
   * admin pick something reasonable without knowing the models. */
  quality: 1 | 2 | 3 | 4 | 5;
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
  compatMode: 'openai-image' | 'stability' | 'replicate' | 'gemini-image' | 'huggingface' | 'pollinations' | 'deepai' | 'clipdrop' | 'ideogram' | 'leonardo';
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
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (free tier available)', quality: 3 },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (newer, free tier available)', quality: 4 },
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
    id: 'gemini-image',
    label: 'Google Gemini (Imagen)',
    compatMode: 'gemini-image',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: [{ id: 'imagen-3.0-generate-001', label: 'Imagen 3', quality: 4 }],
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

export async function callTextProvider(
  provider: TextProvider,
  model: string,
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (provider.compatMode === 'openai') {
    const res = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 220,
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
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 220 },
      }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error(`${provider.label} returned no text.`);
    return text;
  }

  if (provider.compatMode === 'anthropic') {
    const res = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 220,
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
    const res = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, message: userPrompt, preamble: systemPrompt, temperature: 0.85 }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const text = data.text?.trim();
    if (!text) throw new Error(`${provider.label} returned no text.`);
    return text;
  }

  if (provider.compatMode === 'pollinations-text') {
    // Genuinely keyless — a GET request with the combined prompt in the URL path.
    const combined = `${systemPrompt}\n\n${userPrompt}`;
    const res = await fetch(`${provider.baseUrl}/${encodeURIComponent(combined)}`);
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
    const res = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024', quality: 'hd', response_format: 'url' }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const url = data.data?.[0]?.url;
    if (!url) throw new Error(`${provider.label} returned no image.`);
    const img = await fetch(url);
    if (!img.ok) throw new Error(`Could not download image from ${provider.label}.`);
    return Buffer.from(await img.arrayBuffer());
  }

  if (provider.compatMode === 'stability') {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('output_format', 'png');
    const res = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
      body: form as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    return Buffer.from(await res.arrayBuffer());
  }

  if (provider.compatMode === 'replicate') {
    const create = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, Prefer: 'wait' },
      body: JSON.stringify({ version: model, input: { prompt } }),
    });
    if (!create.ok) throw new Error(await friendlyProviderError(provider.label, create.status, create));
    const prediction = await create.json();
    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!outputUrl) throw new Error(`${provider.label} returned no image.`);
    const img = await fetch(outputUrl);
    if (!img.ok) throw new Error(`Could not download image from ${provider.label}.`);
    return Buffer.from(await img.arrayBuffer());
  }

  if (provider.compatMode === 'gemini-image') {
    const url = `${provider.baseUrl}/${model}:predict?key=${apiKey}`;
    const res = await fetch(url, {
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

  if (provider.compatMode === 'huggingface') {
    const res = await fetch(`${provider.baseUrl}/${model}`, {
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
    const res = await fetch(`${provider.baseUrl}/${encodeURIComponent(prompt)}?nologo=true`);
    if (!res.ok) throw new Error(`${provider.label} error ${res.status}.`);
    return Buffer.from(await res.arrayBuffer());
  }

  if (provider.compatMode === 'deepai') {
    const form = new URLSearchParams();
    form.append('text', prompt);
    const res = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const outputUrl = data.output_url;
    if (!outputUrl) throw new Error(`${provider.label} returned no image.`);
    const img = await fetch(outputUrl);
    if (!img.ok) throw new Error(`Could not download image from ${provider.label}.`);
    return Buffer.from(await img.arrayBuffer());
  }

  if (provider.compatMode === 'clipdrop') {
    const form = new FormData();
    form.append('prompt', prompt);
    const res = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: form as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    // Clipdrop returns the raw image bytes directly.
    return Buffer.from(await res.arrayBuffer());
  }

  if (provider.compatMode === 'ideogram') {
    const res = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Api-Key': apiKey },
      body: JSON.stringify({ image_request: { prompt, model, aspect_ratio: 'ASPECT_1_1' } }),
    });
    if (!res.ok) throw new Error(await friendlyProviderError(provider.label, res.status, res));
    const data = await res.json();
    const url = data.data?.[0]?.url;
    if (!url) throw new Error(`${provider.label} returned no image.`);
    const img = await fetch(url);
    if (!img.ok) throw new Error(`Could not download image from ${provider.label}.`);
    return Buffer.from(await img.arrayBuffer());
  }

  if (provider.compatMode === 'leonardo') {
    const create = await fetch(`${provider.baseUrl}/generations`, {
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
      const poll = await fetch(`${provider.baseUrl}/generations/${genId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!poll.ok) continue;
      const polled = await poll.json();
      const images = polled.generations_by_pk?.generated_images;
      if (Array.isArray(images) && images[0]?.url) {
        const img = await fetch(images[0].url);
        if (!img.ok) throw new Error(`Could not download image from ${provider.label}.`);
        return Buffer.from(await img.arrayBuffer());
      }
    }
    throw new Error(`${provider.label} generation timed out.`);
  }

  throw new Error(`Unsupported image provider compatMode: ${provider.compatMode}`);
}

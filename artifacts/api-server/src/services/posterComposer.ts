import { findTextProvider, findImageProvider, getProviderApiKey } from './aiProviders';

// Gemini's native image-generation/editing model (the "Nano Banana"
// family) accepts MULTIPLE input images plus a text prompt and returns a
// single composed/edited image — exactly what's needed to blend a
// composer portrait into a poster template. Nothing else in our provider
// registry supports true multi-image composition, so this is
// intentionally Gemini-specific (2026-07-09, confirmed with Reza).
const POSTER_MODEL = 'gemini-3.1-flash-image-preview';

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type') || 'image/jpeg';
  return { data: buffer.toString('base64'), mimeType };
}

/**
 * Composes ONE image via Gemini's multi-image model: an optional base
 * template image, an optional portrait image, and a text prompt.
 * templateUrl is null for the Track Cover generator (2026-07-10) — that
 * flow generates purely from the prompt (+ optional portrait), with no
 * pre-made background template involved at all.
 */
export async function composeOnePoster(
  templateUrl: string | null,
  portraitUrl: string | null,
  prompt: string
): Promise<Buffer> {
  const gemini = findTextProvider('gemini');
  if (!gemini) throw new Error('Gemini provider not found in registry.');
  let apiKey = await getProviderApiKey(gemini);
  if (!apiKey) {
    // Fall back to the separate "Google Gemini (Imagen)" image-provider
    // key slot in Gatekeeper Hub — same underlying Google AI Studio key,
    // just stored under a different slot than the text Gemini one. Admin
    // configured that slot but not the text one, which looked like "no
    // key configured" even though a valid Gemini key genuinely existed.
    const geminiImage = findImageProvider('gemini-image');
    if (geminiImage) apiKey = await getProviderApiKey(geminiImage);
  }
  if (!apiKey) throw new Error('No Gemini API key configured — Poster Studio requires Gemini (Google AI Studio) for multi-image composition. Add it under either "Google Gemini" (text) or "Google Gemini (Imagen)" in Gatekeeper Hub.');

  const template = templateUrl ? await fetchAsBase64(templateUrl) : null;
  const portrait = portraitUrl ? await fetchAsBase64(portraitUrl) : null;

  const parts: Record<string, unknown>[] = [{ text: prompt }];
  if (template) {
    parts.push({ inline_data: { mime_type: template.mimeType, data: template.data } });
  }
  if (portrait) {
    parts.push({ inline_data: { mime_type: portrait.mimeType, data: portrait.data } });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${POSTER_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
      signal: AbortSignal.timeout(60_000),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini poster composition failed (${res.status}): ${await res.text().catch(() => '')}`);
  }
  const data = await res.json() as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string }; inline_data?: { data?: string } }[] } }[];
  };
  const imagePart = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data || p.inline_data?.data);
  const base64Image = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
  if (!base64Image) throw new Error('Gemini did not return an image — it may have replied with text instead (try rephrasing the prompt).');

  return Buffer.from(base64Image, 'base64');
}

// ---------------------------------------------------------------------
// Track Cover Generator (2026-07-10, per Reza) — a structured prompt
// builder adapted from a reference "fill-in-the-blanks" premium cover
// prompt he provided, but scoped ONLY to track covers for this site
// (never generic business/Instagram content). Admin fills in the
// colored fields manually; everything else is fixed, high-end art
// direction consistent across every track.
// ---------------------------------------------------------------------
export interface TrackCoverInputs {
  trackTitle: string;
  genreMood: string;
  coverText?: string;
  hasPortrait: boolean;
}

export function buildTrackCoverPrompt(inputs: TrackCoverInputs): string {
  const { trackTitle, genreMood, coverText, hasPortrait } = inputs;

  const faceRule = hasPortrait
    ? "A composer reference photo is provided — it may be a single portrait OR a multi-angle/multi-expression reference sheet (front, profile, various expressions). Study it to understand the person's true likeness, then use that identity as the primary subject, preserving facial accuracy. Integrate it naturally into the design in a premium, cinematic way that matches the track's genre and mood — do not simply crop/paste one panel from the sheet."
    : 'No portrait photo is provided — do NOT generate or include any human face. Build the cover entirely from music-specific instruments, environments, abstract sound-inspired visuals, or other relevant elements.';

  const textBlock = coverText?.trim()
    ? `Include the following text on the cover, written EXACTLY as given (do not translate, rewrite, or summarize it), in elegant, minimal, modern typography appropriate to its language and script: "${coverText.trim()}"`
    : 'Do not include any text on the cover — visual only.';

  return `Create a premium, high-end cover artwork for a track titled "${trackTitle}" on a luxury cinematic composer's portfolio website. This must look like it was designed by a world-class creative director for a major label release — never generic AI art or a stock template.

GENRE / MOOD: ${genreMood}

${faceRule}

${textBlock}

Design direction: ultra premium, cinematic, modern, minimal but visually powerful, elegant, timeless, exclusive, editorial-quality, scroll-stopping, extremely polished. Every element — objects, environment, lighting, texture, color, composition — must feel authentic to the track's genre and mood while remaining luxurious and sophisticated. Avoid generic stock-music imagery and clichés.

Composition: strong visual hierarchy, intentional negative space, dynamic but balanced layout, a clear focal point, perfect alignment — nothing random.

Lighting: professional commercial/cinematic lighting — soft directional light, subtle rim lighting, realistic shadows, balanced contrast, believable depth.

Color palette: chosen deliberately to match the genre/mood, harmonious, tasteful contrast, never oversaturated or childish.

Image quality: ultra-realistic where appropriate, extremely sharp, professional retouching, no compression artifacts, no noise, no blur, no distorted anatomy, no broken objects, no AI artifacts.

Technical: square 1:1 aspect ratio, 4K quality, crisp at thumbnail size, premium production finish. The result must instantly communicate artistry, emotion, and professionalism — the kind of cover that makes a listener stop scrolling.`;
}

import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';

import { resolveActiveImageProvider, callImageProvider, resolveActiveTextProvider, callTextProvider, findImageProvider } from './aiProviders';
import { getS3Config } from './awsConfig';


export interface AudioMetadata {
  dominantInstrument?: string;
  bpm?: number;
  mood?: string;
  keySignature?: string;
  duration?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------
// AI-driven art direction (2026-07-09, per Reza's spec): instead of a
// fixed lookup table, the ACTIVE TEXT PROVIDER acts as an art director.
// It receives every piece of real analyzed data about THIS track (genre,
// BPM, key, title, duration) and writes a bespoke, richly detailed,
// music-informed image prompt — a fresh, unique visual concept on every
// single call, so Regenerate genuinely explores new creative territory
// each time instead of re-rolling the same template.
// The tiny genre map below survives ONLY as an offline fallback for when
// no text provider is configured at all — it is not the primary path.
// ---------------------------------------------------------------------

const ART_DIRECTOR_SYSTEM_PROMPT =
  "Art director for a luxury composer's portfolio. Given a track's musical traits, write ONE photorealistic " +
  'cover-art prompt that visually embodies its tempo, key, and genre — inventive, never a cliché "piano in a room". ' +
  'Must specify: photorealistic, cinematic lighting (source/temperature/direction), camera/lens feel, 16:9, ' +
  'no text, no watermarks, no faces. Reply with ONLY the prompt, 40-80 words.';

const FALLBACK_VISUAL_CONCEPTS: Record<string, string> = {
  trap: 'Nocturnal urban tension; modular synthesizer rig with glowing patch cables; cold blue rim light',
  cinematic: 'Sweeping monumental emotion; full orchestral string section; warm cinematic grade',
  orchestral: 'Grand timeless resonance; concert grand piano beside an empty conductor\'s podium; golden hour warmth',
  ambient: 'Weightless dreamlike calm; synthesizer bathed in soft haze; cold blue atmosphere',
  electronic: 'Kinetic futuristic energy; analog synthesizer with pulsing LED grid; emerald neon',
  jazz: 'Smoky late-night intimacy; brass saxophone under a single spotlight; amber glow',
};

/**
 * Asks the active text provider to write a bespoke image prompt for this
 * specific track. Falls back to a static template only if no text provider
 * is configured or the call fails — art generation should degrade, never
 * abort, over prompt-authoring problems.
 */
export async function generateArtDirection(audioMetadata: AudioMetadata, themeColorGrade?: string): Promise<string> {
  const genre = (audioMetadata.genre as string | undefined) ?? 'cinematic';
  const listenAnalysis = audioMetadata.aiListenAnalysis as string | undefined;
  const parts = [
    // The AI's actual listening analysis (2026-07-09) is the primary,
    // track-specific input when available — genre/BPM/key from file tags
    // are frequently missing or generic on their own and were producing
    // disconnected-from-the-music prompts. Tags become supporting facts.
    listenAnalysis ? `What the music actually sounds like (from listening to it): ${listenAnalysis}` : null,
    `Genre tag: ${genre}`,
    audioMetadata.title ? `Title: "${audioMetadata.title as string}"` : null,
    audioMetadata.bpm ? `Tempo: ${audioMetadata.bpm} BPM` : null,
    audioMetadata.keySignature ? `Key: ${audioMetadata.keySignature as string}` : null,
    audioMetadata.duration ? `Duration: ${Math.round((audioMetadata.duration as number) / 60)}m${Math.round((audioMetadata.duration as number) % 60)}s` : null,
    themeColorGrade ? `Site color theme to harmonize with: ${themeColorGrade}` : null,
    `Creative variation seed: ${Math.floor(Math.random() * 1_000_000)} (produce a concept unlike previous ones)`,
  ].filter(Boolean).join('\n');

  const resolved = await resolveActiveTextProvider();
  if (!('error' in resolved)) {
    try {
      const directed = await callTextProvider(
        resolved.provider,
        resolved.model,
        resolved.apiKey,
        ART_DIRECTOR_SYSTEM_PROMPT,
        parts
      );
      if (directed && directed.length > 40) return directed;
    } catch (err) {
      console.warn('[AI Art Generator] Art-director text call failed, using fallback template:', err);
    }
  } else {
    console.warn('[AI Art Generator] No text provider for art direction, using fallback template:', resolved.error);
  }

  // Offline fallback — static but still genre-aware.
  const concept = FALLBACK_VISUAL_CONCEPTS[genre.toLowerCase().trim()] ??
    'Cinematic evocative emotion; grand piano in an empty concert hall; warm cinematic grade';
  return `Photorealistic cinematic artwork for a luxury composer's portfolio.
Visual concept: ${concept}.
${audioMetadata.title ? `Represents a piece titled "${audioMetadata.title as string}".` : ''}
Shot on Phase One IQ4 medium format sensor, 85mm f/1.4 lens, razor-thin depth of field.
Dramatic cinematic lighting. Aspect ratio 16:9.
No text, no watermarks, no people's faces.
Ultra-high detail, award-winning composition.`;
}

export interface MediaAsset {
  id: string;
  url: string;
  filename: string;
  mimetype: string;
  size: number;
  blurhash: string | null;
  dominantColors: string[];
  vibrantPalette: Record<string, string | null> | null;
}

/**
 * Exponential backoff retry wrapper
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        const backoffDelay = delay * Math.pow(2, i);
        console.warn(`[AI Art Generator] Attempt ${i + 1} failed. Retrying in ${backoffDelay}ms... Error:`, error);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }
  throw lastError;
}

/**
 * Core render pipeline: takes an already-generated image buffer, applies
 * the theme color tint, extracts blurhash/palette, uploads to S3. Shared
 * by both the primary (admin-selected) provider path and the Pollinations
 * fallback path below, so the tinting/upload logic only exists once.
 */
async function processAndUploadArt(
  trackId: string,
  originalBuffer: Buffer,
  colorGrade: string
): Promise<MediaAsset> {
  const { createCanvas, loadImage } = await import('canvas');
  const sharp = (await import('sharp')).default;
  const Vibrant = (await import('node-vibrant')).default;
  const { encode } = await import('blurhash');

  const img = await loadImage(originalBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  let fillColor = 'rgba(255, 215, 0, 0.15)'; // default subtle gold/amber tint
  const grade = colorGrade.toLowerCase();
  if (grade.includes('warm') || grade.includes('amber')) {
    fillColor = 'rgba(255, 191, 0, 0.2)';
  } else if (grade.includes('cold') || grade.includes('blue') || grade.includes('rim')) {
    fillColor = 'rgba(0, 191, 255, 0.2)';
  } else if (grade.includes('green') || grade.includes('emerald')) {
    fillColor = 'rgba(0, 255, 128, 0.2)';
  } else if (grade.includes('red') || grade.includes('crimson')) {
    fillColor = 'rgba(255, 0, 64, 0.2)';
  } else if (grade.startsWith('#') || grade.startsWith('rgb') || grade.startsWith('hsl')) {
    fillColor = colorGrade;
  }

  ctx.fillStyle = fillColor;
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.15;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';

  const pngBuffer = canvas.toBuffer('image/png');
  const webpBuffer = await sharp(pngBuffer).webp({ quality: 90 }).toBuffer();

  const bhCanvas = createCanvas(32, 32);
  const bhCtx = bhCanvas.getContext('2d');
  bhCtx.drawImage(canvas, 0, 0, 32, 32);
  const bhImageData = bhCtx.getImageData(0, 0, 32, 32);
  const blurhash = encode(bhImageData.data, bhImageData.width, bhImageData.height, 4, 4);

  // Jimp (used internally by node-vibrant) can't decode WebP — pass the
  // PNG buffer here, not webpBuffer (2026-07-09).
  const swatches = await Vibrant.from(pngBuffer).getPalette();
  const vibrantPalette: Record<string, string | null> = {
    Vibrant: swatches.Vibrant?.getHex() || null,
    Muted: swatches.Muted?.getHex() || null,
    DarkVibrant: swatches.DarkVibrant?.getHex() || null,
    DarkMuted: swatches.DarkMuted?.getHex() || null,
    LightVibrant: swatches.LightVibrant?.getHex() || null,
    LightMuted: swatches.LightMuted?.getHex() || null,
  };
  const dominantColors = Object.values(vibrantPalette).filter((c): c is string => !!c);

  const s3 = await getS3Config();
  const s3Key = `tracks/${trackId}/cover.webp`;
  await s3.client.send(new PutObjectCommand({
    Bucket: s3.bucket,
    Key: s3Key,
    Body: webpBuffer,
    ContentType: 'image/webp',
  }));
  const fileUrl = `https://${s3.bucket}.s3.${s3.region}.amazonaws.com/${s3Key}`;

  return {
    id: randomUUID(),
    url: fileUrl,
    filename: s3Key,
    mimetype: 'image/webp',
    size: webpBuffer.length,
    blurhash,
    dominantColors,
    vibrantPalette,
  };
}

/**
 * Generates an AI artwork for a given track, processes it, and uploads it to S3.
 * Returns the MediaAsset or null on permanent failure.
 *
 * Guarantee added 2026-07-09: if the admin's chosen image provider fails
 * for ANY reason (bad key, requires a paid plan, rate-limited, down) after
 * its retries are exhausted, this automatically falls back to Pollinations
 * (free, no key required) before giving up — so "Generate" keeps working
 * even when the selected provider can't, as long as Pollinations itself is
 * reachable.
 */
export async function generateAIArt(
  trackId: string,
  audioMetadata: AudioMetadata,
  themeColorGrade?: string
): Promise<MediaAsset | null> {
  const colorGrade = themeColorGrade || 'Cinematic Warmth';

  // Written ONCE — reused for both the primary attempt and the fallback,
  // so a failing provider doesn't cost extra art-director calls either.
  const prompt = await generateArtDirection(audioMetadata, themeColorGrade);
  console.log('[AI Art Generator] Art direction:', prompt.slice(0, 160) + (prompt.length > 160 ? '…' : ''));

  try {
    return await retryWithBackoff(async () => {
      const resolved = await resolveActiveImageProvider();
      if ('error' in resolved) throw new Error(resolved.error);
      const originalBuffer = await callImageProvider(resolved.provider, resolved.model, resolved.apiKey, prompt);
      return processAndUploadArt(trackId, originalBuffer, colorGrade);
    });
  } catch (primaryError) {
    console.warn(`[AI Art Generator] Selected provider failed after retries for track ${trackId}, trying Pollinations fallback:`, primaryError);
    try {
      const pollinations = findImageProvider('pollinations');
      if (!pollinations) throw new Error('Pollinations fallback provider not found in registry.');
      const originalBuffer = await callImageProvider(pollinations, 'default', '', prompt);
      const asset = await processAndUploadArt(trackId, originalBuffer, colorGrade);
      console.log(`[AI Art Generator] Pollinations fallback succeeded for track ${trackId}.`);
      return asset;
    } catch (fallbackError) {
      console.error(`[AI Art Generator] Permanent failure for track ${trackId} (both selected provider and fallback failed):`, fallbackError);
      return null;
    }
  }
}
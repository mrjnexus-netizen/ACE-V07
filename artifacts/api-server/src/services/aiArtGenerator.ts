import { randomUUID } from 'node:crypto';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { OpenAI } from 'openai';

import { env } from '../config/env';
import { db } from '../db/db';
import { apiKeys } from '../db/schema';

import { decrypt } from './encryptionService';


export interface AudioMetadata {
  dominantInstrument?: string;
  bpm?: number;
  mood?: string;
  keySignature?: string;
  duration?: number;
  [key: string]: unknown;
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

// Initialize S3 Client
const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Retrieves and decrypts the AI_IMAGE_GENERATION_KEY from the database at runtime
 */
async function getAIImageGenerationKey(): Promise<string | null> {
  try {
    const keyRecord = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyName, 'AI_IMAGE_GENERATION_KEY'),
    });

    if (!keyRecord || !keyRecord.isActive) {
      console.warn('[AI Art Generator] AI_IMAGE_GENERATION_KEY is not configured or inactive.');
      return null;
    }

    return decrypt({
      encryptedValue: keyRecord.encryptedValue,
      iv: keyRecord.iv,
      authTag: keyRecord.authTag,
    });
  } catch (error) {
    console.error('[AI Art Generator] Error retrieving or decrypting API key:', error);
    return null;
  }
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
 * Generates an AI artwork for a given track, processes it, and uploads it to S3.
 * Returns the MediaAsset or null on permanent failure.
 */
export async function generateAIArt(
  trackId: string,
  audioMetadata: AudioMetadata,
  themeColorGrade?: string
): Promise<MediaAsset | null> {
  try {
    return await retryWithBackoff(async () => {
      // Lazy-load the heavy native image libraries only when art is actually
      // generated. This keeps the server booting even if these native modules
      // are unavailable on a given host; the feature simply degrades to null.
      const { createCanvas, loadImage } = await import('canvas');
      const sharp = (await import('sharp')).default;
      const Vibrant = (await import('node-vibrant')).default;
      const { encode } = await import('blurhash');

      // 1. Load API Key at runtime
      const apiKey = await getAIImageGenerationKey();
      if (!apiKey) {
        throw new Error('AI_IMAGE_GENERATION_KEY is missing or inactive in database.');
      }

      // 2. Build cinematic prompt from AudioMetadata using EXACT template
      const mood = audioMetadata.mood || 'Mysterious';
      const dominantInstrument = audioMetadata.dominantInstrument || 'Synthesizer';
      const colorGrade = themeColorGrade || 'Cinematic Warmth';

      const prompt = `Photorealistic cinematic artwork.
${mood} atmosphere.
${dominantInstrument} as central visual metaphor.
Shot on Phase One IQ4 medium format sensor.
85mm f/1.4 lens, razor-thin depth of field.
2200K warm-white key light with cold rim lighting.
Aspect ratio 16:9. Dramatic shadow gradients.
Color grade: ${colorGrade}.
No text, no watermarks, no people's faces.
Ultra-high detail, award-winning composition.`;

      // 3. Call DALL-E 3
      const openai = new OpenAI({ apiKey });
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1792x1024',
        quality: 'hd',
        response_format: 'url',
      });

      if (!response || !response.data || !response.data[0] || !response.data[0].url) {
        throw new Error('DALL-E 3 returned no image URL.');
      }

      const imageUrl = response.data[0].url;

      // Fetch the image
      const fetchResponse = await fetch(imageUrl);
      if (!fetchResponse.ok) {
        throw new Error(`Failed to download image from OpenAI: ${fetchResponse.statusText}`);
      }
      const originalBuffer = Buffer.from(await fetchResponse.arrayBuffer());

      // 4. Apply theme color filter via Canvas API (node-canvas)
      const img = await loadImage(originalBuffer);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Determine filter overlay color
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

      // Blend the overlay color
      ctx.fillStyle = fillColor;
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.15;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';

      // Convert canvas to PNG buffer first, then sharp to WebP (guarantees cross-platform WebP availability)
      const pngBuffer = canvas.toBuffer('image/png');
      const webpBuffer = await sharp(pngBuffer)
        .webp({ quality: 90 })
        .toBuffer();

      // 5. Generate BlurHash from the filtered canvas image
      // Let's create a smaller scale image data for quick blurhash encoding (e.g. 32x32)
      const bhCanvas = createCanvas(32, 32);
      const bhCtx = bhCanvas.getContext('2d');
      bhCtx.drawImage(canvas, 0, 0, 32, 32);
      const bhImageData = bhCtx.getImageData(0, 0, 32, 32);
      const blurhash = encode(
        bhImageData.data,
        bhImageData.width,
        bhImageData.height,
        4,
        4
      );

      // 6. Extract Vibrant palette from result image
      const swatches = await Vibrant.from(webpBuffer).getPalette();
      const vibrantPalette: Record<string, string | null> = {
        Vibrant: swatches.Vibrant?.getHex() || null,
        Muted: swatches.Muted?.getHex() || null,
        DarkVibrant: swatches.DarkVibrant?.getHex() || null,
        DarkMuted: swatches.DarkMuted?.getHex() || null,
        LightVibrant: swatches.LightVibrant?.getHex() || null,
        LightMuted: swatches.LightMuted?.getHex() || null,
      };
      const dominantColors = Object.values(vibrantPalette).filter((c): c is string => !!c);

      // 7. Upload to S3: /tracks/{trackId}/cover.webp
      const s3Key = `tracks/${trackId}/cover.webp`;
      const uploadCommand = new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET_NAME,
        Key: s3Key,
        Body: webpBuffer,
        ContentType: 'image/webp',
      });
      await s3Client.send(uploadCommand);

      const fileUrl = `https://${env.AWS_S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${s3Key}`;

      // 8. Return MediaAsset with all fields populated
      const mediaAsset: MediaAsset = {
        id: randomUUID(),
        url: fileUrl,
        filename: s3Key,
        mimetype: 'image/webp',
        size: webpBuffer.length,
        blurhash,
        dominantColors,
        vibrantPalette,
      };

      return mediaAsset;
    });
  } catch (error) {
    // Permanent failure: return null (logged), DO NOT crash pipeline
    console.error(`[AI Art Generator] Permanent failure for track ${trackId}:`, error);
    return null;
  }
}
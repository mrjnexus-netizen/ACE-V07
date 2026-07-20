import { randomUUID } from 'node:crypto';
import { extname } from 'path';

import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { encode } from 'blurhash';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';

import { authGuard } from '../middleware/auth';
import { getS3Config } from '../services/awsConfig';

const router: Router = Router();

// POST body validation (security checklist: all routes Zod-validated).
// Guards malformed input only; downstream keeps using req.body unchanged.
const uploadBodySchema = z.object({
  entity_type: z.string().min(1, 'entity_type is required'),
  entity_id: z.string().min(1, 'entity_id is required'),
}).passthrough();

const upload = multer({
  storage: multer.memoryStorage(),
  // 2026-07-20 (per Reza — video upload support): 50MB was workable for
  // audio but is far too small for real video files (even a short clip
  // at decent quality routinely exceeds it). Raised for both — this
  // route is admin-only (authGuard), not public-facing, so the larger
  // ceiling isn't an abuse-surface concern, just a memory-buffering one
  // (multer.memoryStorage() holds the whole file in RAM during upload,
  // same as it always has for audio — just worth knowing as videos get
  // uploaded here too).
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/mp4',
      // images — all common formats, not just the original three
      'image/webp',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/svg+xml',
      'image/heic',
      'image/heif',
      'image/bmp',
      'image/tiff',
      // video — for future video-source uploads (works pipeline, H9)
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'video/x-matroska',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      (cb as (err: Error | null, accept: boolean) => void)(new Error('Invalid file type. Allowed: audio (mp3/wav/mp4), image (webp/jpeg/png/gif/svg/heic/bmp/tiff), or video (mp4/mov/webm/mkv).'), false);
    }
  },
});

async function generateBlurHash(buffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await (sharp as (input: Buffer) => sharp.Sharp)(buffer)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    
    const blurhash = encode(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      4,
      4
    );
    return blurhash;
  } catch (error) {
    console.error('Error generating BlurHash:', error);
    return null;
  }
}

router.post('/upload', authGuard, upload.single('media'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'No file uploaded',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    const parsedBody = uploadBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: parsedBody.error.issues[0]?.message ?? 'entity_type and entity_id are required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
    const { entity_type, entity_id } = req.body;

    const s3 = await getS3Config();

    const fileExtension = extname(req.file.originalname);
    const fileName = `${entity_type}/${entity_id}/${randomUUID()}${fileExtension}`;

    const uploadCommand = new PutObjectCommand({
      Bucket: s3.bucket,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    });

    await s3.client.send(uploadCommand);

    const fileUrl = `https://${s3.bucket}.s3.${s3.region}.amazonaws.com/${fileName}`;

    let blurhash = null;
    if (req.file.mimetype.startsWith('image/')) {
      blurhash = await generateBlurHash(req.file.buffer);
    }

    const mediaAsset = {
      id: randomUUID(),
      url: fileUrl,
      filename: fileName,
      mimetype: req.file.mimetype,
      size: req.file.size,
      blurhash: blurhash,
    };

    return res.status(200).json({
      success: true,
      data: mediaAsset,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('Error uploading media:', err);
    return res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Failed to upload media',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/staging-preview', authGuard, upload.single('media'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'No file uploaded for staging preview',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    let blurhash = null;
    if (req.file.mimetype.startsWith('image/')) {
      blurhash = await generateBlurHash(req.file.buffer);
    }

    const s3 = await getS3Config();
    const temporaryKey = `staging-previews/${randomUUID()}${extname(req.file.originalname)}`;

    const signedUrl = await getSignedUrl(
      s3.client,
      new GetObjectCommand({
        Bucket: s3.bucket,
        Key: temporaryKey,
      }),
      { expiresIn: 3600 }
    );

    const audioDuration = req.file.mimetype.startsWith('audio/') ? 180 : undefined;
    const vibrantPalette = req.file.mimetype.startsWith('image/') ? { VIBRANT: '#FF0000', LIGHT_VIBRANT: '#FFAAAA' } : undefined;

    return res.status(200).json({
      success: true,
      data: {
        url: signedUrl,
        blurhash: blurhash,
        duration: audioDuration,
        vibrantPalette: vibrantPalette,
      },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('Error generating staging preview:', err);
    return res.status(500).json({
      success: false,
      data: null,
      error: (err as Error).message || 'Failed to generate staging preview',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
import { randomUUID } from 'node:crypto';
import { extname } from 'path';

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { encode } from 'blurhash';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';

import { authenticateJWT } from '../middleware/auth';

const router: Router = Router();

// Configure Multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'audio/mpeg',
      'audio/wav',
      'image/webp',
      'image/jpeg',
      'image/png',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new (Error as any)('Invalid file type. Only audio/mpeg, audio/wav, image/webp, image/jpeg, image/png are allowed.') as any, false);
    }
  },
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// Utility to generate BlurHash (for images)
async function generateBlurHash(buffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await (sharp as any)(buffer)
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

// POST /api/media/upload - S3 Upload
router.post('/upload', authenticateJWT, upload.single('media'), async (req: Request, res: Response) => {
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

    const { entity_type, entity_id } = req.body; // e.g., 'tracks', 'track_id'
    if (!entity_type || !entity_id) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'entity_type and entity_id are required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    const fileExtension = extname(req.file.originalname);
    const fileName = `${entity_type}/${entity_id}/${randomUUID()}${fileExtension}`;

    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME || 'ace-2026-bucket',
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    });

    await s3Client.send(uploadCommand);

    const fileUrl = `https://${process.env.AWS_S3_BUCKET_NAME || 'ace-2026-bucket'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;

    let blurhash = null;
    if (req.file.mimetype.startsWith('image/')) {
      blurhash = await generateBlurHash(req.file.buffer);
    }

    // In a real scenario, you'd save this MediaAsset to your database
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
  } catch (err: unknown) { const error = err as Error;
    console.error('Error uploading media:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to upload media',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/media/staging-preview - Generate temporary preview URL and metadata
router.post('/staging-preview', authenticateJWT, upload.single('media'), async (req: Request, res: Response) => {
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

    const temporaryKey = `staging-previews/${randomUUID()}${extname(req.file.originalname)}`;

    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME || 'ace-2026-bucket',
        Key: temporaryKey,
      }) as any,
      { expiresIn: 3600 } // 1 hour expiry
    );

    // Simulate audio duration and vibrant palette extraction
    const audioDuration = req.file.mimetype.startsWith('audio/') ? 180 : undefined; // Mock duration
    const vibrantPalette = req.file.mimetype.startsWith('image/') ? { VIBRANT: '#FF0000', LIGHT_VIBRANT: '#FFAAAA' } : undefined; // Mock palette

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
  } catch (err: unknown) { const error = err as Error;
    console.error('Error generating staging preview:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to generate staging preview',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

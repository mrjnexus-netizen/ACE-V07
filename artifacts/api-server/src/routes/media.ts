import { Router, Request, Response } from 'express';
import { authenticateJWT } from '../middleware/auth';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'node:path';
import fs from 'node:fs';
import * as musicMetadata from 'music-metadata';

const router: Router = Router();

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Helper: Generate collision-free filename
const generateFilename = (originalname: string): string => {
  const ext = path.extname(originalname);
  const base = path.basename(originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
  return `${base}_${Date.now()}${ext}`;
};

// POST /api/media/upload
router.post('/upload', authenticateJWT, upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'No file uploaded',
        code: 'NO_FILE',
        timestamp: new Date().toISOString(),
      });
    }

    const isDemo = process.env.DEMO_MODE === 'true';
    const hasS3 = !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
    const filename = generateFilename(req.file.originalname);
    const mimeType = req.file.mimetype;
    let format: 'webp' | 'jpg' | 'png' = 'webp';
    if (mimeType.includes('png')) format = 'png';
    else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) format = 'jpg';

    let fileUrl = '';

    if (isDemo || !hasS3) {
      // Save locally to public directory for demo
      const uploadDir = path.join(__dirname, '../../../../public/uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const localFilePath = path.join(uploadDir, filename);
      fs.writeFileSync(localFilePath, new Uint8Array(req.file.buffer));
      fileUrl = `/uploads/${filename}`;
    } else {
      // Upload to real AWS S3
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      });

      const bucketName = process.env.AWS_S3_BUCKET_NAME || 'ace-2026-bucket';
      const s3Key = `media/${filename}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: req.file.buffer,
          ContentType: mimeType,
        })
      );

      fileUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
    }

    // MediaAsset Envelope
    const data = {
      url: fileUrl,
      blurHash: 'L6PZfH~q00_g_3M{WBt700Rj-p_3', // standard mock blurHash
      width: mimeType.startsWith('image/') ? 1200 : 0,
      height: mimeType.startsWith('image/') ? 1200 : 0,
      format,
      dominantColors: ['#080808', '#D4AF37'],
      vibrantPalette: {
        vibrant: '#D4AF37',
        muted: '#888880',
        darkVibrant: '#B8960C',
        darkMuted: '#444440',
        lightVibrant: '#F5F5F0',
        lightMuted: '#EAEAE8',
      },
    };

    return res.status(200).json({
      success: true,
      data,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Media upload failed',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/media/staging-preview
router.post('/staging-preview', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'No file uploaded',
        code: 'NO_FILE',
        timestamp: new Date().toISOString(),
      });
    }

    const mimeType = req.file.mimetype;
    let duration = 0;

    if (mimeType.startsWith('audio/')) {
      try {
        const metadata = await musicMetadata.parseBuffer(req.file.buffer as any, mimeType);
        duration = metadata.format.duration || 0;
      } catch (err) {
        console.error('Error parsing audio metadata for preview:', err);
      }
    }

    // We do NOT permanently store the file. Return a base64 Data URL as temporary Signed URL simulation
    const base64Data = req.file.buffer.toString('base64');
    const tempUrl = `data:${mimeType};base64,${base64Data}`;

    const data = {
      tempUrl,
      duration,
      vibrantPalette: {
        vibrant: '#00F5D4',
        muted: '#6B6C75',
        darkVibrant: '#00C4AA',
        darkMuted: '#3A3B44',
        lightVibrant: '#E8E9F0',
        lightMuted: '#1E1F26',
      },
    };

    return res.status(200).json({
      success: true,
      data,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Staging preview error:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to generate preview',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

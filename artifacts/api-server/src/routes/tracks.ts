import { Router, Request, Response } from 'express';
import { db } from '../db/db';
import { tracks } from '../db/schema';
import { authenticateJWT } from '../middleware/auth';
import { eq, asc } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const router: Router = Router();

// GET /api/tracks
router.get('/', async (_req: Request, res: Response) => {
  try {
    const list = await db.query.tracks.findMany({
      where: eq(tracks.isLive, true),
      orderBy: [asc(tracks.sortOrder)],
    });

    return res.status(200).json({
      success: true,
      data: list,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error listing tracks:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to list tracks',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/tracks
router.post('/', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const [newTrack] = await db.insert(tracks).values({
      title: data.title,
      narrative: data.narrative,
      audioUrl: data.audioUrl,
      coverUrl: data.coverUrl,
      coverBlur: data.coverBlur,
      dominantColors: data.dominantColors || [],
      vibrantPalette: data.vibrantPalette || null,
      genre: data.genre,
      bpm: data.bpm ? parseInt(data.bpm) : null,
      mood: data.mood,
      keySignature: data.keySignature,
      duration: data.duration ? parseInt(data.duration) : 0,
      sortOrder: data.sortOrder ? parseInt(data.sortOrder) : 0,
      isLive: data.isLive || false,
    }).returning();

    return res.status(201).json({
      success: true,
      data: newTrack,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error creating track:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to create track',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// PUT /api/tracks/reorder
router.put('/reorder', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { trackIds } = req.body; // Array of IDs in sorted order

    if (!trackIds || !Array.isArray(trackIds)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'trackIds array is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    for (let i = 0; i < trackIds.length; i++) {
      await db
        .update(tracks)
        .set({ sortOrder: i })
        .where(eq(tracks.id, trackIds[i]));
    }

    return res.status(200).json({
      success: true,
      data: 'Tracks reordered successfully',
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error reordering tracks:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to reorder tracks',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// PUT /api/tracks/:id
router.put('/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const updatePayload: any = {
      title: data.title,
      narrative: data.narrative,
      audioUrl: data.audioUrl,
      coverUrl: data.coverUrl,
      coverBlur: data.coverBlur,
      dominantColors: data.dominantColors,
      vibrantPalette: data.vibrantPalette,
      genre: data.genre,
      bpm: data.bpm ? parseInt(data.bpm) : null,
      mood: data.mood,
      keySignature: data.keySignature,
      updatedAt: new Date(),
    };

    if (data.duration !== undefined) {
      updatePayload.duration = parseInt(data.duration);
    }
    if (data.isLive !== undefined) {
      updatePayload.isLive = data.isLive;
    }

    const [updatedTrack] = await db
      .update(tracks)
      .set(updatePayload)
      .where(eq(tracks.id, id!))
      .returning();

    if (!updatedTrack) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Track not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      data: updatedTrack,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error updating track:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to update track',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// DELETE /api/tracks/:id
router.delete('/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await db.delete(tracks).where(eq(tracks.id, id!)).returning();

    if (deleted.length === 0) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Track not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      data: 'Track deleted successfully',
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error deleting track:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to delete track',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// GET /api/tracks/:id/stream
router.get('/:id/stream', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const track = await db.query.tracks.findFirst({
      where: eq(tracks.id, id!),
    });

    if (!track || !track.audioUrl) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Audio track not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
    }

    const isDemo = process.env.DEMO_MODE === 'true';
    const isS3 = track.audioUrl.startsWith('s3://') || track.audioUrl.includes('amazonaws.com');

    // Headers required for premium streaming
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const range = req.headers.range;

    if (isDemo || !isS3) {
      // Stream local fallback files
      // If the url contains "/public" or "assets", find the local file
      let localPath = path.join(__dirname, '../../../../public', track.audioUrl.replace(/^\/public/, ''));
      if (!fs.existsSync(localPath)) {
        // Fallback to a mock silent mp3 file if it doesn't exist, or just read whatever audio we can find
        // Let's check if the directory exists
        const publicAudioDir = path.join(__dirname, '../../../../public/audio');
        if (fs.existsSync(publicAudioDir)) {
          const files = fs.readdirSync(publicAudioDir);
          if (files.length > 0) {
            localPath = path.join(publicAudioDir, files[0]!);
          }
        }
      }

      if (!fs.existsSync(localPath)) {
        return res.status(404).send('Audio file not found on disk');
      }

      const stat = fs.statSync(localPath);
      const fileSize = stat.size;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0]!, 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const fileStream = fs.createReadStream(localPath, { start, end });

        res.status(206).set({
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': chunksize,
        });
        fileStream.pipe(res);
      } else {
        res.status(200).set({
          'Content-Length': fileSize,
        });
        fs.createReadStream(localPath).pipe(res);
      }
    } else {
      // AWS S3 Streaming
      const bucketName = process.env.AWS_S3_BUCKET_NAME || 'ace-2026-bucket';
      const s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
        },
      });

      // Extract key from S3 URL
      let key = track.audioUrl.split('.com/')[1] || track.audioUrl;
      if (track.audioUrl.startsWith('s3://')) {
        key = track.audioUrl.replace(/^s3:\/\/[^\/]+\//, '');
      }

      // First get object details for content length
      // For range queries, we issue GetObject with Range parameter
      const rangeParam = range ? range : 'bytes=0-';

      const s3Response = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
          Range: rangeParam,
        })
      );

      if (range) {
        res.status(206).set({
          'Content-Range': s3Response.ContentRange,
          'Content-Length': s3Response.ContentLength,
        });
      } else {
        res.status(200).set({
          'Content-Length': s3Response.ContentLength,
        });
      }

      const stream = s3Response.Body as any;
      stream.pipe(res);
    }
  } catch (error: any) {
    console.error('Streaming error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        data: null,
        error: error.message || 'Streaming failed',
        code: 'STREAMING_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  }
});

export default router;

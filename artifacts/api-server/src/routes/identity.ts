import { Router, Request, Response } from 'express';
import { db } from '../db/db';
import { composerIdentity, projects as projectsTable } from '../db/schema';
import { authenticateJWT } from '../middleware/auth';
import { translateText } from '../services/translationService';
import { eq } from 'drizzle-orm';

const router: Router = Router();

// GET /api/identity
router.get('/', async (req: Request, res: Response) => {
  try {
    const identity = await db.query.composerIdentity.findFirst();
    if (!identity) {
      return res.status(200).json({
        success: true,
        data: null,
        error: null,
        code: null,
        timestamp: new Date().toISOString(),
      });
    }

    const projects = await db.query.projects.findMany({
      where: eq(projectsTable.composerId, identity.id),
    });

    const data = {
      id: identity.id,
      name: identity.name,
      tagline: identity.tagline,
      biography: identity.biography,
      awards: identity.awards,
      studioAddress: identity.studioAddress,
      portrait: identity.portraitUrl ? {
        url: identity.portraitUrl,
        blurHash: identity.portraitBlur || '',
        width: 1920,
        height: 1080,
        format: 'webp',
        dominantColors: [],
        vibrantPalette: null,
      } : null,
      logo: identity.logoUrl ? {
        url: identity.logoUrl,
        blurHash: '',
        width: 500,
        height: 500,
        format: 'webp',
        dominantColors: [],
        vibrantPalette: null,
      } : null,
      heroVideo: identity.heroVideoUrl,
      socialLinks: identity.socialLinks,
      projects: projects.map(p => ({
        id: p.id,
        title: p.title,
        type: p.type,
        year: p.year,
        description: p.description,
        coverImage: p.coverUrl ? {
          url: p.coverUrl,
          blurHash: p.coverBlur || '',
          width: 800,
          height: 600,
          format: 'webp',
          dominantColors: [],
          vibrantPalette: null,
        } : null,
      })),
    };

    return res.status(200).json({
      success: true,
      data,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching identity:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to fetch identity',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// PUT /api/identity
router.put('/', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const identity = await db.query.composerIdentity.findFirst();
    if (!identity) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Composer identity record not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
    }

    const {
      name,
      tagline,
      biography,
      awards,
      studioAddress,
      portraitUrl,
      portraitBlur,
      logoUrl,
      heroVideoUrl,
      socialLinks,
      projects,
    } = req.body;

    // Update main identity
    await db
      .update(composerIdentity)
      .set({
        name: name || identity.name,
        tagline: tagline || identity.tagline,
        biography: biography || identity.biography,
        awards: awards || identity.awards,
        studioAddress: studioAddress || identity.studioAddress,
        portraitUrl: portraitUrl !== undefined ? portraitUrl : identity.portraitUrl,
        portraitBlur: portraitBlur !== undefined ? portraitBlur : identity.portraitBlur,
        logoUrl: logoUrl !== undefined ? logoUrl : identity.logoUrl,
        heroVideoUrl: heroVideoUrl !== undefined ? heroVideoUrl : identity.heroVideoUrl,
        socialLinks: socialLinks || identity.socialLinks,
        updatedAt: new Date(),
      })
      .where(eq(composerIdentity.id, identity.id));

    // Handle projects list sync
    if (projects && Array.isArray(projects)) {
      // For simplicity, delete all projects and insert new ones
      await db.delete(projectsTable).where(eq(projectsTable.composerId, identity.id));

      for (const proj of projects) {
        await db.insert(projectsTable).values({
          composerId: identity.id,
          title: proj.title,
          type: proj.type,
          year: proj.year,
          description: proj.description,
          coverUrl: proj.coverImage?.url || null,
          coverBlur: proj.coverImage?.blurHash || null,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: 'Identity updated successfully',
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error updating identity:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to update identity',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/identity/translate
router.post('/translate', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { text, sourceLang } = req.body;

    if (!text || !sourceLang) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'text and sourceLang are required fields',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    const translations = await translateText(text, sourceLang);

    return res.status(200).json({
      success: true,
      data: translations,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in translate route:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Translation failed',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

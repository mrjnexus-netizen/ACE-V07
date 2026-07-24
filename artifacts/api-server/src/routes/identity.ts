import { eq } from 'drizzle-orm';
import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';

import { ComposerIdentity, MultiLingual, ApiResponse } from '../../../ace-2026/src/types';
import { db } from '../db/db';
import { composerIdentity, projects as projectsTable, apiKeys } from '../db/schema';
import { authGuard } from '../middleware/auth';
import { decrypt } from '../services/encryptionService';
import { cascadeLocaleFieldIfChanged } from '../services/localeCascadeTranslator';


const router: Router = Router();

// GET /api/identity
router.get('/', async (_req: Request, res: Response<ApiResponse<ComposerIdentity | null>>) => {
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

    const data: ComposerIdentity = {
      id: identity.id,
      name: identity.name as MultiLingual,
      tagline: identity.tagline as MultiLingual,
      biography: identity.biography as MultiLingual,
      awards: identity.awards as MultiLingual[],
      studioAddress: identity.studioAddress as MultiLingual,
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
      socialLinks: identity.socialLinks as ComposerIdentity['socialLinks'],
      projects: projects.map(p => ({
        id: p.id,
        title: p.title as MultiLingual,
        type: p.type as 'film' | 'game' | 'animation' | 'documentary',
        year: p.year || 0,
        description: p.description as MultiLingual,
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
  } catch (err: unknown) { const error = err as Error;
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

const identityPutSchema = z.object({
  name: z.record(z.string(), z.string().nullable()).nullable(),
  tagline: z.record(z.string(), z.string().nullable()).nullable(),
  biography: z.record(z.string(), z.string().nullable()).nullable(),
  awards: z.array(z.record(z.string(), z.string().nullable())).nullable(),
  studioAddress: z.record(z.string(), z.string().nullable()).nullable(),
  portraitUrl: z.string().nullable(),
  portraitBlur: z.string().nullable(),
  logoUrl: z.string().nullable(),
  heroVideoUrl: z.string().nullable(),
  socialLinks: z.object({
    spotify: z.string().nullable(),
    imdb: z.string().nullable(),
    instagram: z.string().nullable(),
    youtube: z.string().nullable(),
  }).nullable(),
  projects: z.array(z.object({
    id: z.string().optional(),
    title: z.record(z.string(), z.string().nullable()),
    type: z.enum(['film', 'game', 'animation', 'documentary']),
    year: z.number().nullable(),
    description: z.record(z.string(), z.string().nullable()),
    coverImage: z.object({
      url: z.string(),
      blurHash: z.string(),
      width: z.number(),
      height: z.number(),
      format: z.enum(['webp', 'jpg', 'png']),
      dominantColors: z.array(z.string()),
      vibrantPalette: z.object({
        vibrant: z.string(),
        muted: z.string(),
        darkVibrant: z.string(),
        darkMuted: z.string(),
        lightVibrant: z.string(),
        lightMuted: z.string(),
      }).nullable(),
    }).nullable(),
  })).nullable(),
}).partial();

// PUT /api/identity
router.put('/', authGuard, async (req: Request, res: Response<ApiResponse<string>>) => {
  try {
    const parsedBody = identityPutSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Invalid request body: ' + parsedBody.error.errors.map(e => e.message).join(', '),
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    const updateData = parsedBody.data;

    let identity = await db.query.composerIdentity.findFirst();

    if (!identity) {
      // If no identity exists, create one
      const [newIdentity] = await db.insert(composerIdentity).values({
        name: updateData.name || { en: "", es: "", fr: "", zh: "", ja: "", ko: "" },
        tagline: updateData.tagline || { en: "", es: "", fr: "", zh: "", ja: "", ko: "" },
        biography: updateData.biography || { en: "", es: "", fr: "", zh: "", ja: "", ko: "" },
        awards: updateData.awards || [],
        studioAddress: updateData.studioAddress || { en: "", es: "", fr: "", zh: "", ja: "", ko: "" },
        portraitUrl: updateData.portraitUrl,
        portraitBlur: updateData.portraitBlur,
        logoUrl: updateData.logoUrl,
        heroVideoUrl: updateData.heroVideoUrl,
        socialLinks: updateData.socialLinks || { spotify: null, imdb: null, instagram: null, youtube: null },
        updatedAt: new Date(),
      }).returning();
      identity = newIdentity;
    } else {
      // 2026-07-23 (per Reza, exhaustive audit): tagline/biography are
      // real prose, same as track titles/narratives -- they need the
      // same cascade-translate-on-change treatment, not a raw pass-
      // through of whatever the admin's edit form sent.
      const cascadedTagline = await cascadeLocaleFieldIfChanged(
        updateData.tagline,
        (identity.tagline as Record<string, unknown> | null)?.en as string | undefined
      );
      const cascadedBiography = await cascadeLocaleFieldIfChanged(
        updateData.biography,
        (identity.biography as Record<string, unknown> | null)?.en as string | undefined
      );

      // Update existing identity
      await db
        .update(composerIdentity)
        .set({
          name: updateData.name !== undefined ? updateData.name : identity.name,
          tagline: cascadedTagline ?? identity.tagline,
          biography: cascadedBiography ?? identity.biography,
          awards: updateData.awards !== undefined ? updateData.awards as unknown[] : identity.awards as unknown[],
          studioAddress: updateData.studioAddress !== undefined ? updateData.studioAddress : identity.studioAddress,
          portraitUrl: updateData.portraitUrl !== undefined ? updateData.portraitUrl : identity.portraitUrl,
          portraitBlur: updateData.portraitBlur !== undefined ? updateData.portraitBlur : identity.portraitBlur,
          logoUrl: updateData.logoUrl !== undefined ? updateData.logoUrl : identity.logoUrl,
          heroVideoUrl: updateData.heroVideoUrl !== undefined ? updateData.heroVideoUrl : identity.heroVideoUrl,
          socialLinks: updateData.socialLinks !== undefined ? updateData.socialLinks : identity.socialLinks,
          updatedAt: new Date(),
        })
        .where(eq(composerIdentity.id, identity.id));
    }

    // Handle projects list sync
    if (identity && updateData.projects && Array.isArray(updateData.projects)) {
      // 2026-07-23 (per Reza, exhaustive audit): this used to store
      // proj.title/proj.description exactly as sent by the admin's edit
      // form, with no cascade-translate step at all -- the identical
      // stale/blank-translation bug already found and fixed in
      // tracks.ts's PUT /:id. Since this whole block deletes ALL
      // projects and reinserts the full list on every save, look up
      // each project's PREVIOUS English text (by id) before deleting,
      // so an edit to one project doesn't trigger pointless retranslation
      // of the other eleven.
      const previousProjects = await db.query.projects.findMany({
        where: eq(projectsTable.composerId, identity.id),
      });
      const previousById = new Map(previousProjects.map((p) => [p.id, p]));

      await db.delete(projectsTable).where(eq(projectsTable.composerId, identity.id));

      for (const proj of updateData.projects) {
        const previous = proj.id ? previousById.get(proj.id) : undefined;
        const cascadedTitle = await cascadeLocaleFieldIfChanged(
          proj.title,
          (previous?.title as Record<string, unknown> | null)?.en as string | undefined
        );
        const cascadedDescription = await cascadeLocaleFieldIfChanged(
          proj.description,
          (previous?.description as Record<string, unknown> | null)?.en as string | undefined
        );

        await db.insert(projectsTable).values({
          composerId: identity.id,
          title: cascadedTitle ?? proj.title,
          type: proj.type,
          year: proj.year || 0,
          description: cascadedDescription ?? proj.description,
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
  } catch (err: unknown) { const error = err as Error;
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

const translatePostSchema = z.object({
  text: z.string(),
  sourceLang: z.enum(['en', 'es', 'fr', 'zh', 'ja', 'ko']),
  fieldType: z.string(),
});

// POST /api/identity/translate
router.post('/translate', authGuard, async (req: Request, res: Response<ApiResponse<MultiLingual>>) => {
  try {
    const parsedBody = translatePostSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Invalid request body: ' + parsedBody.error.errors.map(e => e.message).join(', '),
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    const { text, sourceLang } = parsedBody.data;

    const apiKeyRecord = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyName, 'LLM_NARRATIVE_API_KEY'),
    });

    if (!apiKeyRecord || !apiKeyRecord.isActive) {
      // Missing/inactive key is a configuration precondition, not a server fault.
      return res.status(503).json({
        success: false,
        data: null,
        error: 'AI translation is unavailable. Configure LLM_NARRATIVE_API_KEY in the Admin Dashboard.',
        code: 'AI_KEY_REQUIRED',
        timestamp: new Date().toISOString(),
      });
    }

    const decryptedKey = decrypt({
      encryptedValue: apiKeyRecord.encryptedValue,
      iv: apiKeyRecord.iv,
      authTag: apiKeyRecord.authTag,
    });

    const openai = new OpenAI({ apiKey: decryptedKey });

    const systemPrompt = `You are the world's most celebrated music journalist writing liner notes for an Academy Award-winning composer's portfolio. Audio metadata: {}. Write a captivating dramatic narrative for this piece. Tone: cinematic, sophisticated, emotionally resonant. Length: 2-3 sentences per language. Output ONLY this JSON, no markdown, no preamble: { en: '', es: '', fr: '', zh: '', ja: '', ko: '' }`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Translate the following text from ${sourceLang}: "${text}"`},
      ],
      response_format: { type: "json_object" },
    });

    const translations: MultiLingual = JSON.parse(response.choices?.[0]?.message?.content || '{}');

    return res.status(200).json({
      success: true,
      data: translations,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) { const error = err as Error;
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
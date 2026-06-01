import { Router, Request, Response } from 'express';
import { db } from '../db/db';
import { briefs } from '../db/schema';
import { authenticateJWT } from '../middleware/auth';
import { eq, desc } from 'drizzle-orm';

const router: Router = Router();

// GET /api/briefs - Admin only
router.get('/', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const list = await db.query.briefs.findMany({
      orderBy: [desc(briefs.createdAt)],
    });

    return res.status(200).json({
      success: true,
      data: list,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching briefs:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to fetch briefs',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/briefs - Public
router.post('/', async (req: Request, res: Response) => {
  try {
    const { locale, budgetRange, mediaType, deadline, emotionalDirection, rawConversation } = req.body;

    if (!locale) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Locale is required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    const [newBrief] = await db
      .insert(briefs)
      .values({
        locale,
        budgetRange: budgetRange || null,
        mediaType: mediaType || null,
        deadline: deadline || null,
        emotionalDirection: emotionalDirection || null,
        rawConversation: rawConversation || {},
        isRead: false,
      })
      .returning();

    return res.status(201).json({
      success: true,
      data: newBrief,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error creating brief:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to submit project brief',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

// PUT /api/briefs/:id/read - Admin mark read
router.put('/:id/read', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [updatedBrief] = await db
      .update(briefs)
      .set({ isRead: true })
      .where(eq(briefs.id, id))
      .returning();

    if (!updatedBrief) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Brief not found',
        code: 'NOT_FOUND',
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      data: updatedBrief,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error updating brief read status:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to update brief status',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

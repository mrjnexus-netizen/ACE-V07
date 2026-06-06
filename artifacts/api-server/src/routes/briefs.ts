import { desc } from 'drizzle-orm';
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { db } from '../db/db';
import { briefs } from '../db/schema';
import { authenticateJWT } from '../middleware/auth';

const router: Router = Router();

// GET /api/briefs - Return all briefs, newest first
router.get(
  '/',
  authenticateJWT,
  async (_req: Request, res: Response) => {
    try {
      const allBriefs = await db.query.briefs.findMany({
        orderBy: [desc(briefs.createdAt)],
      });

      return res.status(200).json({
        success: true,
        data: allBriefs,
        error: null,
        code: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) { const error = err as Error;
      console.error('Error fetching briefs:', error);
      return res.status(500).json({
        success: false,
        data: null,
        error: error.message || 'Failed to fetch briefs',
        code: 'SERVER_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// POST /api/briefs - Create new brief record (NO auth)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { locale, mediaType, budgetRange, deadline, emotionalDirection, rawConversation } = req.body;

    // Basic validation
    if (!locale || !rawConversation) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Locale and rawConversation are required',
        code: 'VALIDATION_ERROR',
        timestamp: new Date().toISOString(),
      });
    }

    const [newBrief] = await db.insert(briefs).values({
      id: uuidv4(),
      locale,
      mediaType,
      budgetRange,
      deadline,
      emotionalDirection,
      rawConversation,
      isRead: false, // New briefs are unread by default
    }).returning();

    return res.status(201).json({
      success: true,
      data: { id: newBrief!.id },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) { const error = err as Error;
    console.error('Error creating brief:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to create brief',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

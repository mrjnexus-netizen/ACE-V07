import { desc, eq, inArray } from 'drizzle-orm';
import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { db } from '../db/db';
import { chatLogs } from '../db/schema';
import { authGuard } from '../middleware/auth';

const router: Router = Router();

// GET /api/chat-logs — admin only, newest first
router.get('/', authGuard, async (_req: Request, res: Response) => {
  try {
    const rows = await db.query.chatLogs.findMany({
      orderBy: [desc(chatLogs.updatedAt)],
    });
    return res.status(200).json({
      success: true,
      data: rows,
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Error fetching chat logs:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to fetch chat logs',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

const markReadSchema = z.object({ isRead: z.boolean() });

// PATCH /api/chat-logs/:id — admin only, mark read/unread
router.patch('/:id', authGuard, async (req: Request, res: Response) => {
  const parsed = markReadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: parsed.error.issues[0]?.message ?? 'Invalid payload',
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
  try {
    await db.update(chatLogs).set({ isRead: parsed.data.isRead }).where(eq(chatLogs.id, req.params.id!));
    return res.status(200).json({
      success: true,
      data: { id: req.params.id },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Error updating chat log:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to update chat log',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

const deleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

// POST /api/chat-logs/bulk-delete — admin only, bulk delete by id list
router.post('/bulk-delete', authGuard, async (req: Request, res: Response) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: parsed.error.issues[0]?.message ?? 'Invalid payload',
      code: 'VALIDATION_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
  try {
    await db.delete(chatLogs).where(inArray(chatLogs.id, parsed.data.ids));
    return res.status(200).json({
      success: true,
      data: { deleted: parsed.data.ids.length },
      error: null,
      code: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Error deleting chat logs:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: error.message || 'Failed to delete chat logs',
      code: 'SERVER_ERROR',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;

// ============================================================
// Document Assistant — full rewrite, 2026-07-16.
//
// The original version of this route was a stub: extractTextFromPdf()
// always returned the same hardcoded placeholder sentence regardless of
// the uploaded file, nothing was ever persisted (every analysis was
// disposable — refresh the page and it's gone), and there was no
// archive, no per-item checklist state, no real email sending path
// wired to this project's actual SMTP setup. This rewrite makes the
// feature real end-to-end:
//   - real text extraction (documentExtraction.ts: pdf-parse / mailparser / utf-8)
//   - real structured AI analysis via the SAME provider registry every
//     other AI feature in this project uses (documentAnalysis.ts)
//   - every analysis is saved to `document_analyses` (a real archive,
//     searchable, reopenable, deletable)
//   - checklist items are individually toggleable and the state persists
//   - PDF export is a properly formatted report (documentReport.ts)
//   - email sending reuses the project's existing SMTP_CREDENTIALS setup
//     (emailService.ts's new sendRawEmail(), no separate config)
// ============================================================
import { randomUUID } from 'node:crypto';

import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { desc, eq, ilike, or } from 'drizzle-orm';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { db } from '../db/db';
import { documentAnalyses } from '../db/schema';
import { authGuard } from '../middleware/auth';
import { analyzeDocumentText, type ChecklistItem, type DeadlineItem } from '../services/documentAnalysis';
import { matchTracksAndAssessFit, type TrackMatch } from '../services/documentTrackMatcher';
import { generateAnalysisPdf } from '../services/documentReport';
import { extractDocumentText } from '../services/documentExtraction';
import { sendRawEmail } from '../services/emailService';
import { getS3Config } from '../services/awsConfig';

const router: Router = Router();

// ------------------------------------------------------------------
// Upload handling
// ------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — generous for a brief/contract PDF
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['application/pdf', 'text/plain', 'message/rfc822', 'application/octet-stream'];
    const lowerName = file.originalname.toLowerCase();
    const allowedExt = lowerName.endsWith('.pdf') || lowerName.endsWith('.txt') || lowerName.endsWith('.eml');
    if (allowedMimes.includes(file.mimetype) && allowedExt) {
      cb(null, true);
    } else if (allowedExt) {
      // Some OSes/browsers send generic or missing mimetypes for .eml —
      // trust the extension in that case rather than rejecting a
      // perfectly valid file.
      cb(null, true);
    } else {
      (cb as (err: Error | null, accept: boolean) => void)(
        new Error('Invalid file type. Only PDF, TXT, and EML files are allowed.'),
        false
      );
    }
  },
});

function fileTypeFromName(name: string): 'pdf' | 'txt' | 'eml' {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.eml')) return 'eml';
  return 'txt';
}

function errJson(res: Response, status: number, error: string, code: string) {
  return res.status(status).json({ success: false, data: null, error, code, timestamp: new Date().toISOString() });
}

function okJson<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data, error: null, code: null, timestamp: new Date().toISOString() });
}

// ------------------------------------------------------------------
// POST /api/documents/analyze
// Accepts EITHER a multipart file upload (`document`) OR a JSON body
// { text, filename } for the "paste text instead" path. Always persists
// the result as a new row in the archive.
// ------------------------------------------------------------------
const pasteBodySchema = z.object({
  text: z.string().min(1, 'Pasted text is empty'),
  filename: z.string().min(1).max(200).optional(),
});

router.post('/analyze', authGuard, upload.single('document'), async (req: Request, res: Response) => {
  try {
    let rawText = '';
    let filename: string;
    let fileTypeValue: 'pdf' | 'txt' | 'eml' | 'paste';
    let sourceFileUrl: string | null = null;

    if (req.file) {
      const extracted = await extractDocumentText({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
      });
      rawText = extracted.text;
      filename = req.file.originalname;
      fileTypeValue = fileTypeFromName(req.file.originalname);

      // Best-effort: keep the original file so the admin can re-open the
      // source later. A failure here must never block the analysis
      // itself — the extracted text + AI result are the important part.
      try {
        const s3 = await getS3Config();
        const key = `document-assistant/${randomUUID()}-${req.file.originalname}`;
        await s3.client.send(
          new PutObjectCommand({
            Bucket: s3.bucket,
            Key: key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype || 'application/octet-stream',
          })
        );
        sourceFileUrl = `https://${s3.bucket}.s3.${s3.region}.amazonaws.com/${key}`;
      } catch (s3err) {
        console.warn('[documents] Could not archive original file to S3 (analysis continues):', s3err);
      }
    } else {
      const parsed = pasteBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return errJson(res, 400, parsed.error.issues[0]?.message ?? 'No document uploaded and no text pasted', 'VALIDATION_ERROR');
      }
      rawText = parsed.data.text;
      filename = parsed.data.filename?.trim() || `Pasted text — ${new Date().toLocaleDateString('en-US')}`;
      fileTypeValue = 'paste';
    }

    const { result, truncated, sourceLength } = await analyzeDocumentText(rawText);

    // Track Intelligence (2026-07-16): if the AI noticed any music
    // track/file names mentioned in the document, cross-reference them
    // against the real tracks library and generate a fit assessment.
    // Failure-safe -- an empty array here never blocks saving the rest
    // of the analysis.
    let trackMatches: Awaited<ReturnType<typeof matchTracksAndAssessFit>> = [];
    if (result.trackReferences.length > 0) {
      try {
        const requirementContext = [
          ...result.deliverables,
          ...result.risks,
          ...result.checklist.map((c) => c.text),
        ];
        trackMatches = await matchTracksAndAssessFit(result.trackReferences, requirementContext);
      } catch (err) {
        console.warn('[documents] Track matching failed (analysis saved without it):', err);
      }
    }

    const [row] = await db
      .insert(documentAnalyses)
      .values({
        filename,
        fileType: fileTypeValue,
        sourceFileUrl,
        summary: result.summary || null,
        parties: result.parties,
        deliverables: result.deliverables,
        deadlines: result.deadlines,
        paymentTerms: result.paymentTerms,
        timecodes: result.timecodes,
        risks: result.risks,
        checklist: result.checklist,
        trackMatches,
        degraded: result.degraded,
        sourceTextLength: sourceLength,
        truncated,
      })
      .returning();

    return okJson(res, { ...row, degradedReason: result.degradedReason });
  } catch (err: unknown) {
    console.error('[documents] analyze failed:', err);
    return errJson(res, 500, (err as Error).message || 'Failed to analyze document', 'SERVER_ERROR');
  }
});

// ------------------------------------------------------------------
// GET /api/documents — archive list, newest first, optional search
// ------------------------------------------------------------------
router.get('/', authGuard, async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rows = await db.query.documentAnalyses.findMany({
      where: q
        ? or(ilike(documentAnalyses.filename, `%${q}%`), ilike(documentAnalyses.summary, `%${q}%`))
        : undefined,
      orderBy: [desc(documentAnalyses.createdAt)],
      limit: 200,
    });
    return okJson(res, rows);
  } catch (err: unknown) {
    console.error('[documents] list failed:', err);
    return errJson(res, 500, (err as Error).message || 'Failed to load archive', 'SERVER_ERROR');
  }
});

// ------------------------------------------------------------------
// GET /api/documents/stats — lightweight aggregate counts + upcoming
// deadlines for the overview strip at the top of the Document
// Assistant tab. Kept as its own endpoint (rather than making the
// frontend fetch full archive rows just to compute this) so the
// overview can render immediately, before the admin ever switches to
// the Archive view, and stays cheap even as the archive grows.
// "Upcoming deadlines" now uses ONLY entries the AI could confidently
// resolve to a real calendar date (`parsedDate`, added 2026-07-16) —
// entries with an unparseable/relative date are correctly left out of
// this ranking rather than guessed into a position, per this project's
// own standing principle of not presenting a heuristic as more precise
// than it is.
// ------------------------------------------------------------------
router.get('/stats', authGuard, async (_req: Request, res: Response) => {
  try {
    const rows = await db.query.documentAnalyses.findMany({
      columns: { id: true, filename: true, checklist: true, fileType: true, deadlines: true },
    });

    let openChecklistItems = 0;
    let totalChecklistItems = 0;
    let openHighPriority = 0;
    const byFileType: Record<string, number> = { pdf: 0, txt: 0, eml: 0, paste: 0 };
    const upcoming: { analysisId: string; filename: string; item: string; date: string }[] = [];
    const todayIso = new Date().toISOString().slice(0, 10);

    for (const row of rows) {
      byFileType[row.fileType] = (byFileType[row.fileType] ?? 0) + 1;
      const checklist = (row.checklist as unknown as ChecklistItem[]) || [];
      totalChecklistItems += checklist.length;
      for (const item of checklist) {
        if (!item.done) {
          openChecklistItems += 1;
          if (item.priority === 'high') openHighPriority += 1;
        }
      }

      const deadlines = (row.deadlines as unknown as DeadlineItem[]) || [];
      for (const d of deadlines) {
        if (d.parsedDate && d.parsedDate >= todayIso) {
          upcoming.push({ analysisId: row.id, filename: row.filename, item: d.item, date: d.parsedDate });
        }
      }
    }

    upcoming.sort((a, b) => a.date.localeCompare(b.date));

    return okJson(res, {
      totalAnalyses: rows.length,
      totalChecklistItems,
      openChecklistItems,
      openHighPriority,
      byFileType,
      upcomingDeadlines: upcoming.slice(0, 8),
    });
  } catch (err: unknown) {
    console.error('[documents] stats failed:', err);
    return errJson(res, 500, (err as Error).message || 'Failed to load stats', 'SERVER_ERROR');
  }
});

// ------------------------------------------------------------------
// GET /api/documents/:id — single saved analysis
// ------------------------------------------------------------------
router.get('/:id', authGuard, async (req: Request, res: Response) => {
  try {
    const row = await db.query.documentAnalyses.findFirst({ where: eq(documentAnalyses.id, req.params.id!) });
    if (!row) return errJson(res, 404, 'Analysis not found', 'NOT_FOUND');
    return okJson(res, row);
  } catch (err: unknown) {
    console.error('[documents] get failed:', err);
    return errJson(res, 500, (err as Error).message || 'Failed to load analysis', 'SERVER_ERROR');
  }
});

// ------------------------------------------------------------------
// PUT /api/documents/:id/checklist — toggle an item's done state,
// edit its text/priority, or add a brand-new manual item. The whole
// checklist array is read, mutated, and written back in one go — simple
// and correct for a single-admin tool with no concurrent-edit risk.
// ------------------------------------------------------------------
const toggleSchema = z.object({
  action: z.literal('toggle'),
  itemId: z.string(),
  done: z.boolean(),
});
const addSchema = z.object({
  action: z.literal('add'),
  text: z.string().min(1),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  category: z.string().min(1).default('Manual'),
});
const removeSchema = z.object({
  action: z.literal('remove'),
  itemId: z.string(),
});
const editSchema = z.object({
  action: z.literal('edit'),
  itemId: z.string(),
  text: z.string().min(1).optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  category: z.string().min(1).optional(),
});
const checklistActionSchema = z.discriminatedUnion('action', [toggleSchema, addSchema, removeSchema, editSchema]);

// PUT (not PATCH) — matches the frontend's existing apiClient helper set
// (apiGet/apiPost/apiPut/apiDelete only, no apiPatch), so this reuses
// apiPut() rather than introducing a one-off fetch call.
router.put('/:id/checklist', authGuard, async (req: Request, res: Response) => {
  const parsed = checklistActionSchema.safeParse(req.body);
  if (!parsed.success) {
    return errJson(res, 400, parsed.error.issues[0]?.message ?? 'Invalid checklist update', 'VALIDATION_ERROR');
  }
  try {
    const row = await db.query.documentAnalyses.findFirst({ where: eq(documentAnalyses.id, req.params.id!) });
    if (!row) return errJson(res, 404, 'Analysis not found', 'NOT_FOUND');

    let checklist = (row.checklist as unknown as ChecklistItem[]) || [];
    const action = parsed.data;

    if (action.action === 'toggle') {
      checklist = checklist.map((item) => (item.id === action.itemId ? { ...item, done: action.done } : item));
    } else if (action.action === 'add') {
      checklist = [...checklist, { id: uuidv4(), text: action.text, priority: action.priority, category: action.category, done: false }];
    } else if (action.action === 'remove') {
      checklist = checklist.filter((item) => item.id !== action.itemId);
    } else if (action.action === 'edit') {
      checklist = checklist.map((item) =>
        item.id === action.itemId
          ? {
              ...item,
              text: action.text ?? item.text,
              priority: action.priority ?? item.priority,
              category: action.category ?? item.category,
            }
          : item
      );
    }

    const [updated] = await db
      .update(documentAnalyses)
      .set({ checklist, updatedAt: new Date() })
      .where(eq(documentAnalyses.id, req.params.id!))
      .returning();

    return okJson(res, updated);
  } catch (err: unknown) {
    console.error('[documents] checklist update failed:', err);
    return errJson(res, 500, (err as Error).message || 'Failed to update checklist', 'SERVER_ERROR');
  }
});

// ------------------------------------------------------------------
// DELETE /api/documents/:id — remove from archive (+ best-effort S3
// cleanup of the original source file, if one was archived)
// ------------------------------------------------------------------
router.delete('/:id', authGuard, async (req: Request, res: Response) => {
  try {
    const row = await db.query.documentAnalyses.findFirst({ where: eq(documentAnalyses.id, req.params.id!) });
    if (!row) return errJson(res, 404, 'Analysis not found', 'NOT_FOUND');

    if (row.sourceFileUrl) {
      try {
        const s3 = await getS3Config();
        const key = row.sourceFileUrl.split(`${s3.bucket}.s3.${s3.region}.amazonaws.com/`)[1];
        if (key) await s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: key }));
      } catch (s3err) {
        console.warn('[documents] Could not delete source file from S3 (row deleted anyway):', s3err);
      }
    }

    await db.delete(documentAnalyses).where(eq(documentAnalyses.id, req.params.id!));
    return okJson(res, { deleted: req.params.id });
  } catch (err: unknown) {
    console.error('[documents] delete failed:', err);
    return errJson(res, 500, (err as Error).message || 'Failed to delete analysis', 'SERVER_ERROR');
  }
});

// ------------------------------------------------------------------
// POST /api/documents/:id/export — PDF of a saved analysis
// ------------------------------------------------------------------
router.post('/:id/export', authGuard, async (req: Request, res: Response) => {
  try {
    const row = await db.query.documentAnalyses.findFirst({ where: eq(documentAnalyses.id, req.params.id!) });
    if (!row) return errJson(res, 404, 'Analysis not found', 'NOT_FOUND');

    const pdfBuffer = await generateAnalysisPdf({
      filename: row.filename,
      createdAt: row.createdAt ?? new Date(),
      summary: row.summary,
      parties: (row.parties as unknown as { name: string; role: string }[]) || [],
      deliverables: (row.deliverables as unknown as string[]) || [],
      deadlines: (row.deadlines as unknown as DeadlineItem[]) || [],
      paymentTerms: (row.paymentTerms as unknown as string[]) || [],
      timecodes: (row.timecodes as unknown as string[]) || [],
      risks: (row.risks as unknown as string[]) || [],
      checklist: (row.checklist as unknown as ChecklistItem[]) || [],
      trackMatches: (row.trackMatches as unknown as TrackMatch[]) || [],
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${row.filename.replace(/[^a-z0-9.-]/gi, '_')}-analysis.pdf"`);
    return res.send(pdfBuffer);
  } catch (err: unknown) {
    console.error('[documents] export failed:', err);
    return errJson(res, 500, (err as Error).message || 'Failed to export PDF', 'SERVER_ERROR');
  }
});

// ------------------------------------------------------------------
// POST /api/documents/:id/email — send a saved analysis (PDF attached)
// via the project's existing SMTP setup
// ------------------------------------------------------------------
const emailBodySchema = z.object({
  to: z.string().email('A valid recipient email is required'),
  subject: z.string().min(1).optional(),
  note: z.string().optional(),
});

router.post('/:id/email', authGuard, async (req: Request, res: Response) => {
  const parsed = emailBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return errJson(res, 400, parsed.error.issues[0]?.message ?? 'A valid recipient email is required', 'VALIDATION_ERROR');
  }
  try {
    const row = await db.query.documentAnalyses.findFirst({ where: eq(documentAnalyses.id, req.params.id!) });
    if (!row) return errJson(res, 404, 'Analysis not found', 'NOT_FOUND');

    const pdfBuffer = await generateAnalysisPdf({
      filename: row.filename,
      createdAt: row.createdAt ?? new Date(),
      summary: row.summary,
      parties: (row.parties as unknown as { name: string; role: string }[]) || [],
      deliverables: (row.deliverables as unknown as string[]) || [],
      deadlines: (row.deadlines as unknown as DeadlineItem[]) || [],
      paymentTerms: (row.paymentTerms as unknown as string[]) || [],
      timecodes: (row.timecodes as unknown as string[]) || [],
      risks: (row.risks as unknown as string[]) || [],
      checklist: (row.checklist as unknown as ChecklistItem[]) || [],
      trackMatches: (row.trackMatches as unknown as TrackMatch[]) || [],
    });

    const subject = parsed.data.subject || `Project brief analysis — ${row.filename}`;
    const note = parsed.data.note ? `<p>${parsed.data.note.replace(/</g, '&lt;')}</p>` : '';
    const html = `${note}<p>Attached: the full analysis and action checklist for <strong>${row.filename}</strong>.</p><p>${row.summary ?? ''}</p>`;
    const text = `${parsed.data.note ? parsed.data.note + '\n\n' : ''}Attached: the full analysis and action checklist for ${row.filename}.\n\n${row.summary ?? ''}`;

    const result = await sendRawEmail({
      to: parsed.data.to,
      subject,
      text,
      html,
      attachments: [
        {
          filename: `${row.filename.replace(/[^a-z0-9.-]/gi, '_')}-analysis.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    if (!result.ok) {
      return errJson(res, 502, result.error || 'Failed to send email', 'EMAIL_SEND_FAILED');
    }

    return okJson(res, { sent: true });
  } catch (err: unknown) {
    console.error('[documents] email failed:', err);
    return errJson(res, 500, (err as Error).message || 'Failed to send email', 'SERVER_ERROR');
  }
});

export default router;

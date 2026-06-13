import { eq } from 'drizzle-orm';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import OpenAI from 'openai';
import pdfkit from 'pdfkit';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { db } from '../db/db';
import { apiKeys } from '../db/schema';
import { authGuard } from '../middleware/auth';
import { decrypt } from '../services/encryptionService';

const router: Router = Router();

interface Checklist {
  timecodes?: string[];
  revisions?: string[];
  deliverables?: string[];
  deadlines?: string[];
}

interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

// Zod schemas (security checklist: validate all mutating request bodies).
// Shapes mirror the Checklist interface above so the parsed data is safe to
// hand to generatePdfFromChecklist without a blind `as Checklist` cast.
const checklistSchema = z.object({
  timecodes: z.array(z.string()).optional(),
  revisions: z.array(z.string()).optional(),
  deliverables: z.array(z.string()).optional(),
  deadlines: z.array(z.string()).optional(),
});

const exportBodySchema = z.object({
  checklist: checklistSchema,
});

const emailBodySchema = z
  .object({
    to: z.string().email('A valid recipient email is required'),
    subject: z.string().min(1, 'Subject is required'),
    body: z.string().optional(),
    checklist: checklistSchema.optional(),
  })
  .refine((data) => Boolean(data.body) || Boolean(data.checklist), {
    message: 'Either a body or a checklist is required',
  });

// Configure Multer for memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'text/plain',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      (cb as (err: Error | null, accept: boolean) => void)(new Error('Invalid file type. Only PDF and text files are allowed.'), false);
    }
  },
});

// Retrieves and decrypts the LLM key at runtime (Stage-5 convention).
// Returns null when absent/inactive/undecryptable, or in demo mode â€” never throws.
async function getOpenAIClient(): Promise<OpenAI | null> {
  try {
    if (process.env.DEMO_MODE === 'true') return null;

    const keyRecord = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyName, 'LLM_NARRATIVE_API_KEY'),
    });
    if (!keyRecord || !keyRecord.isActive) return null;

    const apiKey = decrypt({
      encryptedValue: keyRecord.encryptedValue,
      iv: keyRecord.iv,
      authTag: keyRecord.authTag,
    });
    return new OpenAI({ apiKey });
  } catch (err) {
    console.error('[documents] Failed to load/decrypt LLM key:', err);
    return null;
  }
}

// Utility to extract text from PDF (requires a library like pdf-parse)
async function extractTextFromPdf(_buffer: Buffer): Promise<string> {
  // Simplified: In a real app, use a PDF parsing library.
  // For now, return a placeholder text for PDF content.
  return "Extracted text from PDF: This document outlines project requirements, including timecodes, revisions, deliverables, and deadlines.";
}

// Utility to generate structured checklist via GPT-4o
async function generateChecklist(text: string): Promise<Checklist | null> {
  const openai = await getOpenAIClient();
  if (!openai) return null;

  try {
    const completion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are an AI assistant that extracts structured checklist items from project documents.' },
        { role: 'user', content: `Analyze the following document and extract timecodes, revisions, deliverables, and deadlines. Return as JSON.\n\nDocument: ${text}` },
      ],
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as Checklist;
  } catch (err) {
    console.error('[documents] Checklist generation failed:', err);
    return null;
  }
}

// Utility to generate PDF from checklist
async function generatePdfFromChecklist(checklist: Checklist): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new pdfkit();
    const buffers: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
    doc.on('error', reject);

    doc.fontSize(16).text('Project Checklist', { underline: true }).moveDown();

    if (checklist.timecodes) {
      doc.fontSize(12).text('Timecodes:').moveDown(0.5);
      checklist.timecodes.forEach((item: string) => doc.text(`- ${item}`));
      doc.moveDown();
    }
    if (checklist.revisions) {
      doc.fontSize(12).text('Revisions:').moveDown(0.5);
      checklist.revisions.forEach((item: string) => doc.text(`- ${item}`));
      doc.moveDown();
    }
    if (checklist.deliverables) {
      doc.fontSize(12).text('Deliverables:').moveDown(0.5);
      checklist.deliverables.forEach((item: string) => doc.text(`- ${item}`));
      doc.moveDown();
    }
    if (checklist.deadlines) {
      doc.fontSize(12).text('Deadlines:').moveDown(0.5);
      checklist.deadlines.forEach((item: string) => doc.text(`- ${item}`));
      doc.moveDown();
    }

    doc.end();
  });
}

// Utility to send email
async function sendEmail(to: string, subject: string, text: string, html: string, attachments?: EmailAttachment[]): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
    html,
    attachments,
  });
}

// POST /api/documents/analyze - Analyze PDF/txt file
router.post(
  '/analyze',
  authGuard,
  upload.single('document'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          data: null,
          error: 'No document uploaded',
          code: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString(),
        });
      }

      let documentText: string;
      if (req.file.mimetype === 'application/pdf') {
        documentText = await extractTextFromPdf(req.file.buffer);
      } else if (req.file.mimetype === 'text/plain') {
        documentText = req.file.buffer.toString('utf-8');
      } else {
        return res.status(400).json({
          success: false,
          data: null,
          error: 'Unsupported document type for analysis',
          code: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString(),
        });
      }

      const checklist = await generateChecklist(documentText);

      // Graceful degradation: missing LLM key (or AI unavailable) must NOT 500.
      if (!checklist) {
        return res.status(200).json({
          success: true,
          data: {
            timecodes: [],
            revisions: [],
            deliverables: [],
            deadlines: [],
            degraded: true,
            message: 'AI document analysis is unavailable until an LLM key (LLM_NARRATIVE_API_KEY) is configured in the Admin Dashboard.',
          },
          error: null,
          code: null,
          timestamp: new Date().toISOString(),
        });
      }

      return res.status(200).json({
        success: true,
        data: checklist,
        error: null,
        code: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      console.error('Error analyzing document:', err);
      return res.status(500).json({
        success: false,
        data: null,
        error: (err as Error).message || 'Failed to analyze document',
        code: 'SERVER_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// POST /api/documents/export - Generate PDF from checklist
router.post(
  '/export',
  authGuard,
  async (req: Request, res: Response) => {
    try {
      const parsed = exportBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          data: null,
          error: parsed.error.issues[0]?.message ?? 'Checklist data is required for export',
          code: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString(),
        });
      }

      const { checklist } = parsed.data;

      const pdfBuffer = await generatePdfFromChecklist(checklist);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="project-checklist-${uuidv4()}.pdf"`);
      return res.send(pdfBuffer);
    } catch (err: unknown) {
      console.error('Error exporting document:', err);
      return res.status(500).json({
        success: false,
        data: null,
        error: (err as Error).message || 'Failed to export document',
        code: 'SERVER_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// POST /api/documents/email - Send checklist via SMTP
router.post(
  '/email',
  authGuard,
  async (req: Request, res: Response) => {
    try {
      const parsed = emailBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          data: null,
          error: parsed.error.issues[0]?.message ?? 'Recipient, subject, and either a body or checklist are required',
          code: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString(),
        });
      }

      const { to, subject, body, checklist } = parsed.data;

      let htmlContent = body || '';
      const attachments: EmailAttachment[] = [];

      if (checklist) {
        const pdfBuffer = await generatePdfFromChecklist(checklist);
        attachments.push({
          filename: `project-checklist-${uuidv4()}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        });
        htmlContent += 
          (body ? ", including your attached checklist." : "Please find your project checklist attached.")
      }

      await sendEmail(to, subject, htmlContent, htmlContent, attachments);

      return res.status(200).json({
        success: true,
        data: 'Email sent successfully',
        error: null,
        code: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      console.error('Error sending email:', err);
      return res.status(500).json({
        success: false,
        data: null,
        error: (err as Error).message || 'Failed to send email',
        code: 'SERVER_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default router;
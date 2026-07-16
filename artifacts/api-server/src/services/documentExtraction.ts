// ============================================================
// Document Assistant — text extraction, 2026-07-16.
//
// The original Document Assistant never actually extracted real text
// from anything (`extractTextFromPdf` returned a hardcoded placeholder
// string regardless of the uploaded file — the AI was always analyzing
// the same fake sentence, never the real document). This is the real
// implementation: pdf-parse for PDFs, mailparser for .eml (subject/
// from/to/date + body, HTML stripped to plain text), plain utf-8 decode
// for .txt.
// ============================================================
import { simpleParser } from 'mailparser';
// Same default-import style already used across this codebase for other
// CommonJS packages (nodemailer, pdfkit, multer) — esModuleInterop makes
// this a plain, safe default import, no require() needed.
import pdfParse from 'pdf-parse';

export interface ExtractedDocument {
  text: string;
  meta: {
    subject?: string;
    from?: string;
    to?: string;
    date?: string;
    pageCount?: number;
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function extractFromPdf(buffer: Buffer): Promise<ExtractedDocument> {
  const result = await pdfParse(buffer);
  return {
    text: result.text.trim(),
    meta: { pageCount: result.numpages },
  };
}

async function extractFromEml(buffer: Buffer): Promise<ExtractedDocument> {
  const parsed = await simpleParser(buffer);
  const body = parsed.text?.trim() || (parsed.html ? stripHtml(parsed.html) : '') || '';
  const header = [
    parsed.subject ? `Subject: ${parsed.subject}` : null,
    parsed.from?.text ? `From: ${parsed.from.text}` : null,
    parsed.to && 'text' in parsed.to ? `To: ${parsed.to.text}` : null,
    parsed.date ? `Date: ${parsed.date.toISOString()}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    text: [header, body].filter(Boolean).join('\n\n').trim(),
    meta: {
      subject: parsed.subject,
      from: parsed.from?.text,
      to: parsed.to && 'text' in parsed.to ? parsed.to.text : undefined,
      date: parsed.date?.toISOString(),
    },
  };
}

function extractFromTxt(buffer: Buffer): ExtractedDocument {
  return { text: buffer.toString('utf-8').trim(), meta: {} };
}

/** Dispatches by mimetype (falls back to filename extension for .eml,
 * which browsers/OSes report under several different inconsistent
 * mimetypes — 'message/rfc822', 'application/octet-stream', or none at
 * all). Never throws for an unreadable file — returns empty text with
 * a note baked into it, so the AI step degrades gracefully rather than
 * the whole request 500ing. */
export async function extractDocumentText(file: {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}): Promise<ExtractedDocument> {
  const lowerName = file.originalname.toLowerCase();
  try {
    if (file.mimetype === 'application/pdf' || lowerName.endsWith('.pdf')) {
      return await extractFromPdf(file.buffer);
    }
    if (
      file.mimetype === 'message/rfc822' ||
      lowerName.endsWith('.eml')
    ) {
      return await extractFromEml(file.buffer);
    }
    if (file.mimetype === 'text/plain' || lowerName.endsWith('.txt')) {
      return extractFromTxt(file.buffer);
    }
    return { text: '', meta: {} };
  } catch (err) {
    console.error('[documentExtraction] Failed to extract text:', err);
    return { text: '', meta: {} };
  }
}

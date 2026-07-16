// ============================================================
// Email verification — sending service, 2026-07-13.
//
// Reads SMTP_CREDENTIALS straight from the DB (same table, same
// decrypt() call keys.ts's own /status route uses — no HTTP round-trip
// to itself). Plain SMTP via nodemailer, so it works with whichever
// provider Reza picks (Gmail app password, SendGrid, Resend, etc.) — no
// provider-specific SDK.
// ============================================================
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';

import { db } from '../db/db';
import { adminUsers } from '../db/schema';
import { decrypt } from './encryptionService';
import { createChildLogger } from '../utils/logger';

const logger = createChildLogger('EmailService');

interface SmtpCredentials {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromAddress: string;
  secure: boolean;
}

// Exported (was previously module-private) so other features that need
// to send arbitrary email — not just the verification-code flow this
// file was originally built for — can reuse the exact same DB-first
// credential loading instead of duplicating the decrypt() call. Added
// 2026-07-16 for the Document Assistant's "Send to Email" feature.
export async function loadSmtpCredentials(): Promise<SmtpCredentials | null> {
  const row = await db.query.apiKeys.findFirst({ where: (k, { eq: e }) => e(k.keyName, 'SMTP_CREDENTIALS') });
  if (!row?.encryptedValue) return null;
  try {
    const raw = decrypt({ encryptedValue: row.encryptedValue, iv: row.iv, authTag: row.authTag });
    return JSON.parse(raw) as SmtpCredentials;
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : err }, 'Failed to decrypt/parse SMTP_CREDENTIALS.');
    return null;
  }
}

/** Generates a 6-digit numeric code, stores it (with a 10-minute
 * expiry) on the admin's row, and emails it to `targetEmail`. Returns
 * false (never throws) if SMTP isn't configured yet — callers should
 * treat that as "email verification isn't available right now", the same
 * graceful-skip pattern googleSearchSource.ts uses for an unconfigured key. */
export async function sendVerificationCode(userId: string, targetEmail: string, purpose: 'confirm' | 'login'): Promise<boolean> {
  const creds = await loadSmtpCredentials();
  if (!creds) {
    logger.info('SMTP_CREDENTIALS not configured — cannot send verification email.');
    return false;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db
    .update(adminUsers)
    .set({ pendingEmailCode: code, pendingEmailTarget: targetEmail, pendingEmailExpiresAt: expiresAt })
    .where(eq(adminUsers.id, userId));

  const subject = purpose === 'confirm' ? 'Confirm your email — ACE Admin' : 'Your sign-in code — ACE Admin';
  const heading = purpose === 'confirm' ? 'Confirm this email address' : 'Sign-in verification code';

  try {
    const transporter = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.secure,
      auth: { user: creds.user, pass: creds.pass },
    });
    await transporter.sendMail({
      from: creds.fromAddress,
      to: targetEmail,
      subject,
      text: `${heading}\n\nYour code: ${code}\n\nThis code expires in 10 minutes.`,
      html: `<p><strong>${heading}</strong></p><p style="font-size:28px;letter-spacing:0.2em;font-weight:600">${code}</p><p>This code expires in 10 minutes.</p>`,
    });
    return true;
  } catch (err) {
    logger.error({ error: err instanceof Error ? err.message : err }, 'Failed to send verification email.');
    return false;
  }
}

/** Checks a submitted code against the stored pending code + expiry for
 * this user. Clears the pending code either way (a used or expired code
 * should never be checkable twice). */
export async function verifyPendingCode(userId: string, code: string): Promise<{ ok: boolean; email?: string }> {
  const admin = await db.query.adminUsers.findFirst({ where: eq(adminUsers.id, userId) });
  if (!admin?.pendingEmailCode || !admin.pendingEmailTarget || !admin.pendingEmailExpiresAt) {
    return { ok: false };
  }

  const expired = new Date(admin.pendingEmailExpiresAt) < new Date();
  const matches = admin.pendingEmailCode === code;
  const target = admin.pendingEmailTarget;

  // Clear the pending code regardless of outcome — one-time use.
  await db
    .update(adminUsers)
    .set({ pendingEmailCode: null, pendingEmailTarget: null, pendingEmailExpiresAt: null })
    .where(eq(adminUsers.id, userId));

  if (expired || !matches) return { ok: false };
  return { ok: true, email: target };
}

export interface RawEmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/** Generic "send whatever" helper, added 2026-07-16 for the Document
 * Assistant's "Send to Email" feature — same SMTP_CREDENTIALS source
 * and transporter setup as sendVerificationCode() above, generalized to
 * take an arbitrary subject/body/attachments instead of a fixed
 * verification-code template. Returns a result object instead of
 * throwing so the calling route can turn a missing/misconfigured SMTP
 * setup into a friendly, actionable error message rather than a raw
 * 500. */
export async function sendRawEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: RawEmailAttachment[];
}): Promise<{ ok: boolean; error?: string }> {
  const creds = await loadSmtpCredentials();
  if (!creds) {
    return { ok: false, error: 'Email sending is not configured yet — add SMTP credentials in Gatekeeper Hub → Security.' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.secure,
      auth: { user: creds.user, pass: creds.pass },
    });
    await transporter.sendMail({
      from: creds.fromAddress,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: params.attachments,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send email.';
    logger.error({ error: message }, 'sendRawEmail failed.');
    return { ok: false, error: message };
  }
}

// ============================================================
// Two-factor authentication (TOTP) service, 2026-07-13.
//
// Standard 6-digit TOTP (Google Authenticator / Authy compatible), via
// otplib. The secret is encrypted at rest with the exact same
// encrypt()/decrypt() pair keys.ts already uses for API keys — no second
// encryption scheme introduced. Since admin_users.two_factor_secret is a
// single TEXT column (not three separate columns like api_keys has), the
// {encryptedValue, iv, authTag} triple is JSON-stringified into it.
//
// 2026-07-14 — migrated off otplib's old `authenticator` object API.
// The installed version (^13.4.1) is a complete rewrite: the separate
// `authenticator` export was REMOVED entirely (confirmed against
// otplib's own docs/migration guide, not guessed), replaced by plain
// functions (generateSecret/generate/verify/generateURI) exported
// directly from 'otplib'. The new verify() is ASYNC and returns
// { valid: boolean } instead of a raw boolean — which is why
// verifySetupCode/verifyStoredCode below are now async too. Any
// caller of those two functions elsewhere in the codebase needs an
// `await` added — flagged to Reza, not silently patched blind since
// this file doesn't show every call site.
// ============================================================
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';

import { encrypt, decrypt } from './encryptionService';

const ISSUER = 'ACE Admin';

export interface TwoFactorSetup {
  secret: string; // base32, shown to the admin once during setup (also encoded in the QR)
  qrCodeDataUrl: string; // data:image/png;base64,... — ready to <img src=...>
}

/** Generates a brand-new TOTP secret + QR code. NOT persisted here —
 * setup only becomes real once verifyAndEnable() confirms the admin
 * actually scanned it and can produce a valid code. */
export async function generateTwoFactorSetup(username: string): Promise<TwoFactorSetup> {
  const secret = generateSecret();
  const otpauthUrl = generateURI({ issuer: ISSUER, label: username, secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });
  return { secret, qrCodeDataUrl };
}

/** Verifies a 6-digit code against a (not-yet-persisted) secret from
 * generateTwoFactorSetup — used only during the setup confirmation step.
 * NOTE: now async (otplib v13's verify() is async) — was sync before. */
export async function verifySetupCode(secret: string, code: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token: code });
    return result.valid;
  } catch {
    return false;
  }
}

/** Encrypts a verified secret for storage in admin_users.two_factor_secret. */
export function encryptSecret(secret: string): string {
  const { encryptedValue, iv, authTag } = encrypt(secret);
  return JSON.stringify({ encryptedValue, iv, authTag });
}

/** Decrypts a stored secret and verifies a login-time 6-digit code
 * against it. Returns false (never throws) on any malformed/corrupt
 * stored value — a decrypt failure should read as "wrong code", not
 * crash the login route.
 * NOTE: now async (otplib v13's verify() is async) — was sync before. */
export async function verifyStoredCode(storedSecret: string, code: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(storedSecret) as { encryptedValue: string; iv: string; authTag: string };
    const secret = decrypt(parsed);
    const result = await verify({ secret, token: code });
    return result.valid;
  } catch {
    return false;
  }
}

import { S3Client } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';

import { env } from '../config/env';
import { db } from '../db/db';
import { apiKeys } from '../db/schema';

import { decrypt } from './encryptionService';

export interface S3Config {
  client: S3Client;
  bucket: string;
  region: string;
}

// Short cache so we're not hitting the DB on every single upload, but a
// credential change in Gatekeeper Hub still takes effect quickly without
// needing a server restart. invalidateS3ConfigCache() clears it
// immediately after a save, so the very next upload already uses the
// fresh credentials.
let cached: { config: S3Config; expiresAt: number } | null = null;
const CACHE_MS = 30_000;

/**
 * The ONE place that decides which AWS credentials/bucket/region to use.
 * Every route/service that touches S3 (media uploads, AI-generated
 * cover art, AI-generated content images, staging previews) should call
 * this instead of building its own S3Client from process.env — otherwise
 * whatever the admin configures in Gatekeeper Hub silently has no effect
 * on the actual uploads (exactly the bug this fixes, 2026-07-09).
 */
export async function getS3Config(): Promise<S3Config> {
  if (cached && cached.expiresAt > Date.now()) return cached.config;

  let accessKeyId = env.AWS_ACCESS_KEY_ID;
  let secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  let region = env.AWS_REGION;
  let bucket = env.AWS_S3_BUCKET_NAME;

  try {
    const record = await db.query.apiKeys.findFirst({ where: eq(apiKeys.keyName, 'AWS_S3_CREDENTIALS') });
    if (record?.isActive && record.encryptedValue) {
      const parsed = JSON.parse(
        decrypt({ encryptedValue: record.encryptedValue, iv: record.iv, authTag: record.authTag })
      ) as { accessKeyId?: string; secretAccessKey?: string; region?: string; bucket?: string };
      if (parsed.accessKeyId) accessKeyId = parsed.accessKeyId;
      if (parsed.secretAccessKey) secretAccessKey = parsed.secretAccessKey;
      if (parsed.region) region = parsed.region;
      if (parsed.bucket) bucket = parsed.bucket;
    }
  } catch {
    // DB lookup/decrypt failed for any reason — fall back to whatever
    // .env has (may itself be empty; that's the caller's problem, not
    // something to hide behind a swallowed error here).
  }

  const config: S3Config = {
    client: new S3Client({ region, credentials: { accessKeyId, secretAccessKey } }),
    bucket,
    region,
  };
  cached = { config, expiresAt: Date.now() + CACHE_MS };
  return config;
}

/** Call right after saving AWS_S3_CREDENTIALS so the next upload picks up
 * the change immediately instead of waiting for the cache to expire. */
export function invalidateS3ConfigCache(): void {
  cached = null;
}

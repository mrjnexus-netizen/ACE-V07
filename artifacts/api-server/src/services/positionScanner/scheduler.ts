// ============================================================
// Business Scanner — scheduler (Phase 5 / A3c, step 7)
//
// Two cron jobs, exactly as the blueprint specifies:
//   - "0 */2 * * *"  — a scan every 2 hours, around the clock
//   - "0 8 * * *"    — an Excel report built at 8:00 AM, America/Chicago
//
// Off by default. The blueprint itself flags the real constraint: this
// needs the server PROCESS to actually be running at those times, which
// only matters once hosting is decided (still open as of 2026-07-13,
// per Reza) — running it against today's local dev machine would just
// mean it silently stops firing the moment the terminal closes. So this
// ships fully wired but disabled, controlled by a persisted setting (the
// same content_entries override pattern EditableText/EditableImage
// already use everywhere else — no new table for one on/off flag and one
// email string) — flipping it on is a single toggle once there's
// somewhere for it to actually keep running.
// ============================================================
import { and, eq } from 'drizzle-orm';
import cron, { type ScheduledTask } from 'node-cron';

import { db } from '../../db/db';
import { contentEntries } from '../../db/schema';
import { createChildLogger } from '../../utils/logger';
import { generateExcelReport } from './excelReport';
import { runScan } from './scan';

const logger = createChildLogger('PositionScheduler');

const ENABLED_KEY = 'business-scanner-schedule-enabled';
const EMAIL_KEY = 'business-scanner-delivery-email';
const SETTINGS_LOCALE = 'en'; // not a real locale choice — content_entries requires some value; these two settings aren't per-language, same convention as the Ambient Tracks keys

let scanTask: ScheduledTask | null = null;
let reportTask: ScheduledTask | null = null;

async function readFlag(key: string): Promise<string | null> {
  const row = await db.query.contentEntries.findFirst({
    where: and(eq(contentEntries.key, key), eq(contentEntries.locale, SETTINGS_LOCALE)),
  });
  return row?.value ?? null;
}

async function writeFlag(key: string, value: string): Promise<void> {
  const existing = await db.query.contentEntries.findFirst({
    where: and(eq(contentEntries.key, key), eq(contentEntries.locale, SETTINGS_LOCALE)),
  });
  if (existing) {
    await db.update(contentEntries).set({ value, updatedAt: new Date() }).where(eq(contentEntries.id, existing.id));
  } else {
    await db.insert(contentEntries).values({ key, locale: SETTINGS_LOCALE, type: 'text', value });
  }
}

export interface SchedulerSettings {
  enabled: boolean;
  deliveryEmail: string;
}

export async function getSchedulerSettings(): Promise<SchedulerSettings> {
  const [enabledRaw, email] = await Promise.all([readFlag(ENABLED_KEY), readFlag(EMAIL_KEY)]);
  return { enabled: enabledRaw === 'true', deliveryEmail: email ?? '' };
}

function startTasks(): void {
  if (scanTask) return; // already running
  scanTask = cron.schedule('0 */2 * * *', () => {
    logger.info('Scheduled scan starting.');
    runScan()
      .then((summary) => logger.info(summary, 'Scheduled scan finished.'))
      .catch((err) => logger.error({ error: err }, 'Scheduled scan failed.'));
  });
  reportTask = cron.schedule(
    '0 8 * * *',
    () => {
      logger.info('Scheduled report build starting.');
      generateExcelReport()
        .then((result) => {
          logger.info(result, 'Scheduled report ready.');
          // Email delivery is an explicitly open decision in the blueprint
          // (no SMTP config exists yet) — the report is saved to the
          // panel's Reports tab either way; wiring an actual send is a
          // separate step once SMTP settings have somewhere to live.
        })
        .catch((err) => logger.error({ error: err }, 'Scheduled report build failed.'));
    },
    { timezone: 'America/Chicago' }
  );
  logger.info('Scheduler tasks started (scan every 2h, report daily 8AM America/Chicago).');
}

function stopTasks(): void {
  scanTask?.stop();
  reportTask?.stop();
  scanTask = null;
  reportTask = null;
  logger.info('Scheduler tasks stopped.');
}

/** Sets the enabled flag AND immediately starts/stops the live cron tasks
 * to match — a toggle in the admin panel takes effect the same second,
 * same pattern as the model-override "Apply" persistence (live update +
 * durable record, not just one or the other). */
export async function setSchedulerEnabled(enabled: boolean): Promise<void> {
  await writeFlag(ENABLED_KEY, enabled ? 'true' : 'false');
  if (enabled) startTasks();
  else stopTasks();
}

export async function setDeliveryEmail(email: string): Promise<void> {
  await writeFlag(EMAIL_KEY, email);
}

/** Called once at server boot — replays whatever the admin last set, so a
 * restart doesn't silently reset the schedule back to off (or leave it
 * "on" with no actual cron task running, the same bug class the
 * modelOverrides hydration step exists to prevent). */
export async function initScheduler(): Promise<void> {
  try {
    const settings = await getSchedulerSettings();
    if (settings.enabled) startTasks();
    logger.info({ enabled: settings.enabled }, 'Scheduler initialized from persisted settings.');
  } catch (err) {
    logger.error({ error: err }, 'Failed to initialize scheduler from persisted settings — leaving it off.');
  }
}

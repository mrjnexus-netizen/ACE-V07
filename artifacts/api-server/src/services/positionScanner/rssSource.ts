// ============================================================
// Business Scanner — RSS source adapter (Phase 5 / A3c, step 2)
//
// Needs zero API keys. FEED_URLS below is a starting, legitimate,
// verified-working set (EntertainmentCareers.Net's own public RSS —
// confirmed real XML, not scraped/ToS-violating) covering categories
// relevant to a composer's own work. Extending this list (or moving it to
// an admin-editable list under the Sources & Keys tab) is a natural next
// step, not a redesign — scanRssFeeds() takes the URL list as a parameter
// specifically so it isn't hardcoded to only ever read this one array.
// ============================================================
import Parser from 'rss-parser';

import { createChildLogger } from '../../utils/logger';

const logger = createChildLogger('RssSource');

export const DEFAULT_FEED_URLS: string[] = [
  'https://www.entertainmentcareers.net/ecnjcat119', // Music
  'https://www.entertainmentcareers.net/ecnjcat105', // Broadcasting/Sound/Music Engineering
  'https://www.entertainmentcareers.net/ecnjcat104', // Animation
  'https://www.entertainmentcareers.net/ecnjcat138', // Video Game
  'https://www.entertainmentcareers.net/ecnjcat112', // Film and TV Production
  'https://www.entertainmentcareers.net/ecnjcat111', // Film and TV Development
  'https://www.entertainmentcareers.net/ecnjcat124', // Theatre/Live Events
  'https://www.entertainmentcareers.net/ecnjcat102', // Advertising
  'https://www.entertainmentcareers.net/ecnjcat121', // Post Production
];

export interface RawLead {
  source: 'rss' | 'google-search';
  sourceUrl: string; // which feed/query this came from
  url: string; // the actual listing URL
  title: string;
  summary: string;
  publishedAt: Date | null;
}

const parser = new Parser({ timeout: 15000 });

/** Fetches + parses every feed URL given. A single feed failing (timeout,
 * bad XML, temporarily down) never aborts the whole scan — it's logged and
 * skipped, the rest still run. */
export async function scanRssFeeds(feedUrls: string[] = DEFAULT_FEED_URLS): Promise<RawLead[]> {
  const results: RawLead[] = [];

  await Promise.all(
    feedUrls.map(async (feedUrl) => {
      try {
        const feed = await parser.parseURL(feedUrl);
        for (const item of feed.items) {
          if (!item.link || !item.title) continue;
          results.push({
            source: 'rss',
            sourceUrl: feedUrl,
            url: item.link,
            title: item.title,
            summary: item.contentSnippet || item.content || '',
            publishedAt: item.pubDate ? new Date(item.pubDate) : null,
          });
        }
      } catch (err) {
        logger.warn({ feedUrl, error: err instanceof Error ? err.message : err }, 'RSS feed fetch/parse failed — skipping this one feed.');
      }
    })
  );

  return results;
}

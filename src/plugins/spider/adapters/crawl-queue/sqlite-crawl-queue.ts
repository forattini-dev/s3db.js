/**
 * SQLite CrawlQueue Driver
 *
 * Wraps recker's SqliteCrawlQueue.
 * Persistent queue that survives crashes and supports resume.
 * Peer dependency: better-sqlite3
 */

import type { AdapterContext } from '../index.js';

export async function create(config: Record<string, any> = {}, _context?: AdapterContext) {
  const { SqliteCrawlQueue } = await import('recker/scrape') as any;
  return new SqliteCrawlQueue(config);
}

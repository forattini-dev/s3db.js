/**
 * SQLite CrawlStorage Driver
 *
 * Wraps recker's SqliteCrawlStorage.
 * Persistent storage that survives crashes and supports resume.
 * Peer dependency: better-sqlite3
 */

import type { AdapterContext } from '../index.js';

export async function create(config: Record<string, any> = {}, _context?: AdapterContext) {
  const { SqliteCrawlStorage } = await import('recker/scrape') as any;
  return new SqliteCrawlStorage(config);
}

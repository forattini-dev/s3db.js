/**
 * Memory CrawlStorage Driver
 *
 * Wraps recker's InMemoryCrawlStorage.
 * Default driver — fast, ephemeral, single-process only.
 */

import type { AdapterContext } from '../index.js';

export async function create(_config: Record<string, any> = {}, _context?: AdapterContext) {
  const { InMemoryCrawlStorage } = await import('recker/scrape') as any;
  return new InMemoryCrawlStorage();
}

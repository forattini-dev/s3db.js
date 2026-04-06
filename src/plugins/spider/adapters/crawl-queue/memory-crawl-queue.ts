/**
 * Memory CrawlQueue Driver
 *
 * Wraps recker's InMemoryCrawlQueue.
 * Default driver — fast, ephemeral, single-process only.
 */

import type { AdapterContext } from '../index.js';

export async function create(_config: Record<string, any> = {}, _context?: AdapterContext) {
  const { InMemoryCrawlQueue } = await import('recker/scrape') as any;
  return new InMemoryCrawlQueue();
}

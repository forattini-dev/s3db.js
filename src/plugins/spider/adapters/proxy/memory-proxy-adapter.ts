/**
 * Memory Proxy Driver
 *
 * Wraps recker's ListProxyAdapter.
 * Simple round-robin rotation from a static proxy list.
 */

import type { AdapterContext } from '../index.js';

export async function create(config: Record<string, any> = {}, _context?: AdapterContext) {
  const { ListProxyAdapter } = await import('recker/scrape') as any;
  const proxies = config.proxies || [];

  if (!Array.isArray(proxies) || proxies.length === 0) {
    throw new Error('memory proxy driver requires config.proxies: string[]');
  }

  return new ListProxyAdapter(proxies);
}

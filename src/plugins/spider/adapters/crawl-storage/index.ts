/**
 * CrawlStorage Adapter Factory
 *
 * Lazy-loaded drivers to avoid loading peer dependencies at initialization.
 *
 * Drivers:
 * - memory: In-memory storage (recker built-in, default)
 * - s3: s3db resource-backed results/errors storage
 * - filesystem: Local FS JSON/JSONL storage
 */

import type { AdapterContext } from '../index.js';

type CrawlStorageFactory = (config: Record<string, any>, context?: AdapterContext) => Promise<any>;
type CrawlStorageLoader = () => Promise<{ create: CrawlStorageFactory }>;

const CRAWL_STORAGE_LOADERS: Record<string, CrawlStorageLoader> = {
  memory:     () => import('./memory-crawl-storage.js'),
  sqlite:     () => import('./sqlite-crawl-storage.js'),
  s3:         () => import('./s3-crawl-storage.js'),
  filesystem: () => import('./filesystem-crawl-storage.js'),
};

export const AVAILABLE_CRAWL_STORAGE_DRIVERS = Object.keys(CRAWL_STORAGE_LOADERS);

export async function createCrawlStorage(
  driver: string,
  config: Record<string, any> = {},
  context?: AdapterContext
): Promise<any> {
  const loader = CRAWL_STORAGE_LOADERS[driver];

  if (!loader) {
    throw new Error(
      `Unknown crawl storage driver: "${driver}". Available drivers: ${AVAILABLE_CRAWL_STORAGE_DRIVERS.join(', ')}`
    );
  }

  const mod = await loader();
  return mod.create(config, context);
}

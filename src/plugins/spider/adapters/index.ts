/**
 * Spider Adapters
 *
 * Driver-based adapters implementing recker's pluggable interfaces
 * for CrawlQueue, CrawlStorage, and Proxy.
 *
 * Config pattern: { driver: 'memory|s3|sqs|rabbitmq', config: {...} }
 */

export interface AdapterContext {
  database?: any;
  namespace?: string;
  logger?: any;
}

export interface AdapterDriverConfig {
  driver: string;
  config?: Record<string, any>;
}

export {
  createCrawlQueue,
  AVAILABLE_CRAWL_QUEUE_DRIVERS
} from './crawl-queue/index.js';

export {
  createCrawlStorage,
  AVAILABLE_CRAWL_STORAGE_DRIVERS
} from './crawl-storage/index.js';

export {
  createProxyAdapter,
  AVAILABLE_PROXY_DRIVERS
} from './proxy/index.js';

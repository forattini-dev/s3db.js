/**
 * CrawlQueue Adapter Factory
 *
 * Lazy-loaded drivers to avoid loading peer dependencies at initialization.
 *
 * Drivers:
 * - memory: In-memory queue (recker built-in, default)
 * - s3: s3db resource-backed queue with visited set
 * - sqs: AWS SQS (peer: @aws-sdk/client-sqs)
 * - rabbitmq: RabbitMQ (peer: amqplib)
 */

import type { AdapterContext } from '../index.js';

type CrawlQueueFactory = (config: Record<string, any>, context?: AdapterContext) => Promise<any>;
type CrawlQueueLoader = () => Promise<{ create: CrawlQueueFactory }>;

const CRAWL_QUEUE_LOADERS: Record<string, CrawlQueueLoader> = {
  memory:   () => import('./memory-crawl-queue.js'),
  s3:       () => import('./s3-crawl-queue.js'),
  sqs:      () => import('./sqs-crawl-queue.js'),
  rabbitmq: () => import('./rabbitmq-crawl-queue.js'),
};

export const AVAILABLE_CRAWL_QUEUE_DRIVERS = Object.keys(CRAWL_QUEUE_LOADERS);

export async function createCrawlQueue(
  driver: string,
  config: Record<string, any> = {},
  context?: AdapterContext
): Promise<any> {
  const loader = CRAWL_QUEUE_LOADERS[driver];

  if (!loader) {
    throw new Error(
      `Unknown crawl queue driver: "${driver}". Available drivers: ${AVAILABLE_CRAWL_QUEUE_DRIVERS.join(', ')}`
    );
  }

  const mod = await loader();
  return mod.create(config, context);
}

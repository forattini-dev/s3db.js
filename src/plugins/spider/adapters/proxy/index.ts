/**
 * Proxy Adapter Factory
 *
 * Lazy-loaded drivers to avoid loading peer dependencies at initialization.
 *
 * Drivers:
 * - memory: Static proxy list with round-robin (recker built-in)
 * - s3: s3db resource-backed proxy list with health tracking
 */

import type { AdapterContext } from '../index.js';

type ProxyFactory = (config: Record<string, any>, context?: AdapterContext) => Promise<any>;
type ProxyLoader = () => Promise<{ create: ProxyFactory }>;

const PROXY_LOADERS: Record<string, ProxyLoader> = {
  memory: () => import('./memory-proxy-adapter.js'),
  s3:     () => import('./s3-proxy-adapter.js'),
};

export const AVAILABLE_PROXY_DRIVERS = Object.keys(PROXY_LOADERS);

export async function createProxyAdapter(
  driver: string,
  config: Record<string, any> = {},
  context?: AdapterContext
): Promise<any> {
  const loader = PROXY_LOADERS[driver];

  if (!loader) {
    throw new Error(
      `Unknown proxy driver: "${driver}". Available drivers: ${AVAILABLE_PROXY_DRIVERS.join(', ')}`
    );
  }

  const mod = await loader();
  return mod.create(config, context);
}

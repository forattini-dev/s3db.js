export const RESERVED_RESOURCE_API_KEYS = [
  'guard',
  'protected',
  'description',
  'readonly',
  'readOnly',
  'writable',
  'write',
  'views',
  'bulk'
] as const;

export interface ResourceCustomRouteDefinition {
  key: string;
  method: string;
  path: string;
  handler: (c: unknown, ctx: unknown) => Promise<unknown> | unknown;
}

function parseResourceCustomRouteKey(routeDef: string): { method: string; path: string } {
  let def = routeDef.trim();

  if (def.startsWith('async ')) {
    def = def.slice(6).trim();
  }

  const parts = def.split(/\s+/);

  if (parts.length < 2 || !parts[0]) {
    throw new Error(`Invalid route definition: "${routeDef}". Expected format: "METHOD /path"`);
  }

  const method = parts[0].toUpperCase();
  const path = parts.slice(1).join(' ').trim();
  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

  if (!validMethods.includes(method)) {
    throw new Error(`Invalid HTTP method: "${method}". Must be one of: ${validMethods.join(', ')}`);
  }

  if (!path.startsWith('/')) {
    throw new Error(`Invalid route path: "${path}". Path must start with "/"`);
  }

  return { method, path };
}

export function getResourceCustomRoutes(
  apiConfig: Record<string, unknown> | null | undefined
): ResourceCustomRouteDefinition[] {
  if (!apiConfig || typeof apiConfig !== 'object') {
    return [];
  }

  const routes: ResourceCustomRouteDefinition[] = [];

  for (const [key, handler] of Object.entries(apiConfig)) {
    if (RESERVED_RESOURCE_API_KEYS.includes(key as typeof RESERVED_RESOURCE_API_KEYS[number])) {
      continue;
    }

    if (typeof handler !== 'function') {
      continue;
    }

    const { method, path } = parseResourceCustomRouteKey(key);
    routes.push({
      key,
      method,
      path,
      handler: handler as (c: unknown, ctx: unknown) => Promise<unknown> | unknown
    });
  }

  return routes;
}

export function assertNoLegacyResourceRoutes(
  resourceName: string,
  routes: Record<string, unknown> | null | undefined
): void {
  if (!routes || typeof routes !== 'object') {
    return;
  }

  throw new Error(
    `resource.config.routes has been removed for resource "${resourceName}". ` +
    'Move custom resource routes into resource.api using "METHOD /path" keys.'
  );
}

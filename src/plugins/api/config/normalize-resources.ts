import type { Logger } from '../../../concerns/logger.js';

export interface ResourceEntry {
  name: string;
  enabled?: boolean;
  methods?: string[];
  auth?: string[];
  versionPrefix?: string | boolean;
  [key: string]: unknown;
}

export interface NormalizedResourceConfig {
  enabled?: boolean;
  methods?: string[];
  auth?: string[];
  versionPrefix?: string | boolean;
  [key: string]: unknown;
}

export type ResourcesInput =
  | string[]
  | ResourceEntry[]
  | Record<string, boolean | NormalizedResourceConfig | null | undefined>
  | null
  | undefined;

export function normalizeResourcesConfig(resources: ResourcesInput, logger: Logger | null): Record<string, NormalizedResourceConfig> {
  if (!resources) {
    return {};
  }

  const normalized: Record<string, NormalizedResourceConfig> = {};
  const logLevel = logger?.level || 'info';

  const addResourceConfig = (name: string, config: NormalizedResourceConfig = {}): void => {
    if (typeof name !== 'string' || !name.trim()) {
      if (logLevel === 'debug' || logLevel === 'trace') {
        logger?.warn({ name }, 'Ignoring resource config with invalid name');
      }
      return;
    }

    normalized[name] = { ...config };
  };

  if (Array.isArray(resources)) {
    for (const entry of resources) {
      if (typeof entry === 'string') {
        addResourceConfig(entry);
      } else if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
        const { name, ...config } = entry;
        addResourceConfig(name, config);
      } else {
        if (logLevel === 'debug' || logLevel === 'trace') {
          logger?.warn({ entry }, 'Ignoring invalid resource config entry (expected string or object with name)');
        }
      }
    }
    return normalized;
  }

  if (typeof resources === 'object') {
    for (const [name, config] of Object.entries(resources)) {
      if (config === false) {
        addResourceConfig(name, { enabled: false });
      } else if (config === true || config === undefined || config === null) {
        addResourceConfig(name);
      } else if (typeof config === 'object') {
        addResourceConfig(name, config as NormalizedResourceConfig);
      } else {
        if (logLevel === 'debug' || logLevel === 'trace') {
          logger?.warn({ resourceName: name }, '[API Plugin] Coercing resource config to empty object');
        }
        addResourceConfig(name);
      }
    }
    return normalized;
  }

  if (logLevel === 'debug' || logLevel === 'trace') {
    logger?.warn({ type: typeof resources }, 'Invalid resources configuration. Expected object or array, received');
  }

  return {};
}

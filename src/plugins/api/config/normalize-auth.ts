import type { Logger } from '../../../concerns/logger.js';

export interface PathRule {
  path?: string;
  pattern?: string;
  required?: boolean;
  methods?: string[];
  roles?: string | string[];
  scopes?: string | string[];
  allowServiceAccounts?: boolean;
}

export interface DriverEntry {
  driver: string;
  config?: DriverConfig;
}

export interface DriverConfig {
  resource?: string;
  [key: string]: unknown;
}

export interface AuthOptions {
  drivers?: Array<string | DriverEntry> | Record<string, unknown>;
  driver?: string | { driver: string; config?: DriverConfig };
  config?: DriverConfig;
  pathRules?: PathRule[];
  strategy?: string;
  priorities?: Record<string, number>;
  createResource?: boolean;
}

export interface NormalizedAuthConfig {
  drivers: DriverEntry[];
  pathRules: PathRule[];
  strategy: string;
  priorities: Record<string, number>;
  createResource: boolean;
  resource: string | null;
  driver: string | null;
}

function normalizeDriverName(name: string): string {
  const driverName = String(name).trim();
  if (!driverName) {
    return '';
  }

  const lowered = driverName.toLowerCase();
  if (lowered === 'api-key' || lowered === 'api_key' || lowered === 'apikey') {
    return 'api-key';
  }

  if (lowered === 'jwt' || lowered === 'basic' || lowered === 'oauth2' || lowered === 'oidc' || lowered === 'oauth2-server') {
    return lowered;
  }

  if (lowered === 'header-secret' || lowered === 'header_secret' || lowered === 'headersecret') {
    return 'header-secret';
  }

  return lowered;
}

function normalizeDriverConfig(value: unknown): DriverConfig | null {
  if (!value) {
    return {};
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as DriverConfig;
  }

  return null;
}

export function normalizeAuthConfig(authOptions: AuthOptions | null | undefined = {}, logger: Logger | null = null): NormalizedAuthConfig {
  if (!authOptions) {
    return {
      drivers: [],
      pathRules: [],
      strategy: 'any',
      priorities: {},
      resource: null,
      driver: null,
      createResource: true
    };
  }

  if (
    typeof authOptions === 'object' &&
    authOptions !== null &&
    'pathAuth' in authOptions &&
    (authOptions as { pathAuth?: unknown }).pathAuth !== undefined
  ) {
    throw new Error('auth.pathAuth has been removed. Use auth.pathRules instead.');
  }

  const normalized: NormalizedAuthConfig = {
    drivers: [],
    pathRules: Array.isArray(authOptions.pathRules) ? authOptions.pathRules : [],
    strategy: authOptions.strategy || 'any',
    priorities: authOptions.priorities || {},
    createResource: authOptions.createResource !== false,
    resource: null,
    driver: null
  };

  const seen = new Set<string>();

  const addDriver = (name: string | undefined, driverConfig: DriverConfig = {}, normalizeName = true): void => {
    if (!name) {
      return;
    }

    const driverName = normalizeName ? normalizeDriverName(name) : name.trim();
    if (!driverName || seen.has(driverName)) return;
    seen.add(driverName);

    const config = { ...driverConfig };
    if (!config.resource) {
      config.resource = 'users';
    }

    normalized.drivers.push({
      driver: driverName,
      config
    });
  };

  const authDrivers = authOptions.drivers;
  if (Array.isArray(authDrivers)) {
    for (const entry of authDrivers) {
      if (typeof entry === 'string') {
        addDriver(entry, {});
      } else if (entry && typeof entry === 'object' && 'driver' in entry) {
        addDriver((entry as DriverEntry).driver, (entry as DriverEntry).config || {});
      }
    }
  } else if (authDrivers && typeof authDrivers === 'object' && !Array.isArray(authDrivers)) {
    for (const [name, cfg] of Object.entries(authDrivers)) {
      const driverConfig = normalizeDriverConfig(cfg);
      if (!driverConfig) {
        continue;
      }

      addDriver(name, driverConfig, false);
    }
  }

  if (authOptions.driver) {
    if (typeof authOptions.driver === 'string') {
      addDriver(authOptions.driver, authOptions.config || {});
    } else if (typeof authOptions.driver === 'object') {
      addDriver(authOptions.driver.driver, authOptions.driver.config || authOptions.config || {});
    }
  }

  normalized.driver = normalized.drivers.length > 0 ? normalized.drivers[0]!.driver : null;

  if (logger) {
    logger.debug({
      authOptions: normalized
    }, 'Normalized auth config');
  }

  return normalized;
}

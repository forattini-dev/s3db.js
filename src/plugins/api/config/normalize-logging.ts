import type { Context } from 'hono';

const DEFAULT_LOG_FORMAT = ':verb :url => :status (:elapsed ms, :res[content-length])';

export interface LoggingOptions {
  enabled?: boolean;
  format?: string;
  logLevel?: string;
  colorize?: boolean;
  filter?: ((c: Context) => boolean) | null;
  excludePaths?: string | string[];
}

export interface NormalizedLoggingConfig {
  enabled: boolean;
  format: string;
  logLevel: string;
  colorize: boolean;
  filter: ((c: Context) => boolean) | null;
  excludePaths: string[];
}

export function normalizeLoggingConfig(loggingOptions: boolean | LoggingOptions | null | undefined): NormalizedLoggingConfig {
  const normalizeExclude = (value: string | string[] | undefined): string[] => {
    if (Array.isArray(value)) {
      return value.filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return [value.trim()];
    }
    return [];
  };

  const baseConfig = {
    format: DEFAULT_LOG_FORMAT,
    logLevel: 'info',
    colorize: true,
    filter: null,
    excludePaths: [] as string[]
  };

  if (loggingOptions === true) {
    return {
      enabled: true,
      ...baseConfig
    };
  }

  if (loggingOptions === false || !loggingOptions) {
    return {
      enabled: false,
      ...baseConfig
    };
  }

  return {
    enabled: loggingOptions.enabled !== false,
    format: loggingOptions.format || DEFAULT_LOG_FORMAT,
    logLevel: loggingOptions.logLevel || 'info',
    colorize: loggingOptions.colorize !== false,
    filter: typeof loggingOptions.filter === 'function' ? loggingOptions.filter : null,
    excludePaths: normalizeExclude(loggingOptions.excludePaths)
  };
}

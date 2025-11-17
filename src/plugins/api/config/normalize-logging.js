const DEFAULT_LOG_FORMAT = ':verb :url => :status (:elapsed ms, :res[content-length])';

export function normalizeLoggingConfig(loggingOptions) {
  const normalizeExclude = (value) => {
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
    excludePaths: []
  };

  // Support shorthand: logging: true → { enabled: true }
  if (loggingOptions === true) {
    return {
      enabled: true,
      ...baseConfig
    };
  }

  // Support shorthand: logging: false → { enabled: false }
  if (loggingOptions === false || !loggingOptions) {
    return {
      enabled: false,
      ...baseConfig
    };
  }

  // Object configuration
  return {
    enabled: loggingOptions.enabled !== false, // Enabled by default when object is provided
    format: loggingOptions.format || DEFAULT_LOG_FORMAT,
    logLevel: loggingOptions.logLevel || 'info',
    colorize: loggingOptions.colorize !== false,
    filter: typeof loggingOptions.filter === 'function' ? loggingOptions.filter : null,
    excludePaths: normalizeExclude(loggingOptions.excludePaths)
  };
}

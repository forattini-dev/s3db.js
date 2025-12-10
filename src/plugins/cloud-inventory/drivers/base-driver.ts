import { PluginError } from '../../../errors.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LoggerFunction = (level: LogLevel, message: string, meta?: Record<string, unknown>) => void;

export interface CloudResource {
  provider: string;
  accountId?: string;
  subscriptionId?: string;
  organizationId?: string;
  projectId?: string;
  region?: string | null;
  service?: string;
  resourceType: string;
  resourceId: string;
  name?: string | null;
  tags?: Record<string, string | null> | null;
  labels?: Record<string, string> | null;
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  configuration: Record<string, unknown>;
  raw?: unknown;
}

export interface BaseCloudDriverOptions {
  id?: string;
  driver: string;
  credentials?: Record<string, unknown>;
  config?: Record<string, unknown>;
  globals?: Record<string, unknown>;
  logger?: LoggerFunction | null;
}

export interface ListResourcesOptions {
  discovery?: {
    include?: string | string[];
    exclude?: string | string[];
  };
  runtime?: {
    emitProgress?: (info: { service: string; resourceId: string; resourceType: string }) => void;
  };
}

export interface HealthCheckResult {
  ok: boolean;
  details?: unknown;
}

export class BaseCloudDriver {
  id: string;
  driver: string;
  credentials: Record<string, unknown>;
  config: Record<string, unknown>;
  globals: Record<string, unknown>;
  logger: LoggerFunction;

  constructor(options: BaseCloudDriverOptions = { driver: '' }) {
    const {
      id,
      driver,
      credentials = {},
      config = {},
      globals = {},
      logger = null
    } = options;

    if (!driver) {
      throw new PluginError('Cloud driver requires a "driver" identifier', {
        pluginName: 'CloudInventoryPlugin',
        operation: 'cloudDriver:constructor',
        statusCode: 500,
        retriable: false,
        suggestion: 'Specify the driver key (e.g. "aws", "gcp") when instantiating a cloud inventory driver.'
      });
    }

    this.id = id || driver;
    this.driver = driver;
    this.credentials = credentials;
    this.config = config;
    this.globals = globals;
    this.logger = typeof logger === 'function' ? logger : () => {};
  }

  async initialize(): Promise<void> {
    return;
  }

  async *listResources(_options?: ListResourcesOptions): AsyncGenerator<CloudResource> {
    throw new PluginError(`Driver "${this.driver}" does not implement listResources()`, {
      pluginName: 'CloudInventoryPlugin',
      operation: 'cloudDriver:listResources',
      statusCode: 500,
      retriable: false,
      suggestion: 'Implement listResources(options) in the concrete cloud driver to fetch inventory data.'
    });
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return { ok: true };
  }

  async destroy(): Promise<void> {
    return;
  }
}

export default BaseCloudDriver;

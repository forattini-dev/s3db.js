import tryFn from "../concerns/try-fn.js";
import { Plugin } from "./plugin.class.js";
import { PuppeteerPlugin } from "./puppeteer.plugin.js";
import { CookieFarmPlugin } from "./cookie-farm.plugin.js";
import { S3QueuePlugin } from "./s3-queue.plugin.js";
import { TTLPlugin } from "./ttl.plugin.js";
import { PluginError } from "../errors.js";

function sanitizeNamespace(value: string): string {
  return (value || 'persona')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

function defaultJobsResource(namespace: string): string {
  return `${namespace.replace(/[^a-z0-9]+/g, '_')}_persona_jobs`;
}

export interface CookieFarmSuitePluginOptions {
  namespace?: string;
  jobsResource?: string;
  resources?: { jobs?: string; [key: string]: unknown };
  queue?: {
    resource?: string;
    deadLetterResource?: string | null;
    visibilityTimeout?: number;
    pollInterval?: number;
    maxAttempts?: number;
    concurrency?: number;
    autoStart?: boolean;
    onMessage?: Function;
    logLevel?: string;
  };
  puppeteer?: any; // PuppeteerPluginConfig
  cookieFarm?: any; // CookieFarmPluginOptions
  ttl?: any; // TTLPluginConfig
  processor?: Function;
  pluginFactories?: {
    puppeteer?: (options: any) => PuppeteerPlugin;
    cookieFarm?: (options: any) => CookieFarmPlugin;
    queue?: (options: any) => S3QueuePlugin;
    ttl?: (options: any) => TTLPlugin;
  };
}

export interface PersonaJob {
  id: string;
  jobType: string;
  payload?: any;
  priority?: number;
  requestedBy?: string;
  metadata?: any;
  createdAt: string;
}

/**
 * CookieFarmSuitePlugin
 *
 * Bundles CookieFarm + Puppeteer + S3Queue (+ optional TTL) with shared
 * namespace handling for persona farming workloads.
 */
export class CookieFarmSuitePlugin extends Plugin {
  override namespace: string;
  config: Required<Omit<CookieFarmSuitePluginOptions, 'pluginFactories'>>;
  pluginFactories: Required<NonNullable<CookieFarmSuitePluginOptions['pluginFactories']>>;
  dependencies: { name: string; instance: Plugin }[];
  jobsResource: any | null; // Placeholder for Resource instance
  puppeteerPlugin: PuppeteerPlugin | null;
  cookieFarmPlugin: CookieFarmPlugin | null;
  queuePlugin: S3QueuePlugin | null;
  ttlPlugin: TTLPlugin | null;
  processor: Function | null;

  constructor(options: CookieFarmSuitePluginOptions = {}) {
    const namespaceOption = options.namespace || 'persona';
    super({ ...options, namespace: namespaceOption });

    this.namespace = sanitizeNamespace(namespaceOption);

    const jobsResource =
      options.jobsResource ||
      options.resources?.jobs ||
      defaultJobsResource(this.namespace);

    this.config = {
      namespace: this.namespace,
      jobsResource,
      queue: {
        resource: jobsResource,
        deadLetterResource: options.queue?.deadLetterResource || null,
        visibilityTimeout: options.queue?.visibilityTimeout || 30000,
        pollInterval: options.queue?.pollInterval || 1000,
        maxAttempts: options.queue?.maxAttempts || 3,
        concurrency: options.queue?.concurrency || 1,
        autoStart: options.queue?.autoStart === true,
        ...options.queue
      },
      puppeteer: {
        pool: { enabled: false },
        ...options.puppeteer
      },
      cookieFarm: {
        ...options.cookieFarm
      },
      ttl: options.ttl || null,
      processor: typeof options.processor === 'function' ? options.processor : null
    } as Required<Omit<CookieFarmSuitePluginOptions, 'pluginFactories'>>;

    this.pluginFactories = {
      puppeteer: options.pluginFactories?.puppeteer ||
        ((pluginOptions: any) => new PuppeteerPlugin(pluginOptions)),
      cookieFarm: options.pluginFactories?.cookieFarm ||
        ((pluginOptions: any) => new CookieFarmPlugin(pluginOptions)),
      queue: options.pluginFactories?.queue ||
        ((queueOptions: any) => new S3QueuePlugin(queueOptions)),
      ttl: options.pluginFactories?.ttl ||
        ((ttlOptions: any) => new TTLPlugin(ttlOptions))
    };

    this.dependencies = [];
    this.jobsResource = null;
    this.puppeteerPlugin = null;
    this.cookieFarmPlugin = null;
    this.queuePlugin = null;
    this.ttlPlugin = null;
    this.processor = this.config.processor;

    this.queueHandler = this.queueHandler.bind(this);
  }

  _dependencyName(alias: string): string {
    return `${this.namespace}-${alias}`.toLowerCase();
  }

  async _installDependency(alias: string, plugin: Plugin): Promise<Plugin> {
    const name = this._dependencyName(alias);
    const instance = await (this as any).database.usePlugin(plugin, name);
    this.dependencies.push({ name, instance });
    return instance;
  }

  async _ensureJobsResource(): Promise<void> {
    if ((this as any).database.resources?.[this.config.jobsResource]) {
      this.jobsResource = (this as any).database.resources[this.config.jobsResource];
      return;
    }

    const [created, err, resource] = await tryFn(() => (this as any).database.createResource({
      name: this.config.jobsResource,
      attributes: {
        id: 'string|required',
        jobType: 'string|required',
        payload: 'json|optional',
        priority: 'number|default:0',
        requestedBy: 'string|optional',
        metadata: 'json|optional',
        createdAt: 'string|required'
      },
      behavior: 'body-overflow',
      timestamps: true,
      asyncPartitions: true,
      partitions: {
        byJobType: { fields: { jobType: 'string' } },
        byPriority: { fields: { priority: 'number' } },
        byDate: { fields: { createdAt: 'string|maxlength:10' } }
      }
    }));

    if (!created) {
      if (resource) {
        this.jobsResource = resource;
        return;
      }
      throw err;
    }

    this.jobsResource = (this as any).database.resources[this.config.jobsResource];
  }

  override async onInstall(): Promise<void> {
    await this._ensureJobsResource();

    this.puppeteerPlugin = (await this._installDependency('puppeteer',
      this.pluginFactories.puppeteer({
        namespace: this.namespace,
        ...this.config.puppeteer
      })
    )) as unknown as PuppeteerPlugin;

    this.cookieFarmPlugin = (await this._installDependency('cookie-farm',
      this.pluginFactories.cookieFarm({
        namespace: this.namespace,
        ...this.config.cookieFarm
      })
    )) as unknown as CookieFarmPlugin;

    const queueOptions = {
      namespace: this.namespace,
      resource: this.config.queue.resource,
      deadLetterResource: this.config.queue.deadLetterResource,
      visibilityTimeout: this.config.queue.visibilityTimeout,
      pollInterval: this.config.queue.pollInterval,
      maxAttempts: this.config.queue.maxAttempts,
      concurrency: this.config.queue.concurrency,
      autoStart: this.config.queue.autoStart && typeof this.processor === 'function',
      onMessage: this.queueHandler,
      logLevel: this.config.queue.logLevel
    };

    this.queuePlugin = (await this._installDependency('queue', this.pluginFactories.queue(queueOptions))) as unknown as S3QueuePlugin;

    if (this.config.ttl) {
      const ttlConfig = {
        namespace: this.namespace,
        ...this.config.ttl
      };

      ttlConfig.resources = ttlConfig.resources || {};

      if (!ttlConfig.resources[this.queuePlugin.queueResourceName]) {
        ttlConfig.resources[this.queuePlugin.queueResourceName] = {
          ttl: (ttlConfig.queue as any)?.ttl || 7200,
          onExpire: (ttlConfig.queue as any)?.onExpire || 'hard-delete',
          field: (ttlConfig.queue as any)?.field || null
        };
      }

      delete (ttlConfig as any).queue;

      this.ttlPlugin = (await this._installDependency('ttl', this.pluginFactories.ttl(ttlConfig))) as TTLPlugin;
    }

    this.emit('cookieFarmSuite.installed', {
      namespace: this.namespace,
      jobsResource: this.config.jobsResource
    });
  }

  override async onStart(): Promise<void> {
    if (this.config.queue.autoStart && typeof this.processor === 'function') {
      await this.startProcessing();
    }
  }

  override async onStop(): Promise<void> {
    await this.stopProcessing();
  }

  override async onUninstall(options: { purgeData?: boolean } = {}): Promise<void> {
    await this.onStop();

    for (const dep of [...this.dependencies].reverse()) {
      await (this as any).database.uninstallPlugin(dep.name, { purgeData: options.purgeData === true });
    }
    this.dependencies = [];
  }

  /**
   * Register a job processor.
   */
  async setProcessor(handler: Function, { autoStart = true, concurrency }: { autoStart?: boolean; concurrency?: number } = {}): Promise<void> {
    this.processor = handler;

    if (autoStart && typeof handler === 'function') {
      await this.startProcessing({ concurrency });
    }
  }

  /**
   * Enqueue a persona job.
   */
  async enqueueJob(data: PersonaJob, options: any = {}): Promise<any> {
    if (!this.jobsResource?.enqueue) {
      throw new PluginError('[CookieFarmSuitePlugin] Queue helpers not initialized yet', {
        pluginName: 'CookieFarmSuitePlugin',
        operation: 'enqueueJob',
        statusCode: 500,
        retriable: false,
        suggestion: 'Call plugin.initialize() before enqueuing jobs so queue helpers are registered.'
      });
    }
    return await this.jobsResource.enqueue({
      ...data,
      createdAt: new Date().toISOString().slice(0, 10)
    }, options);
  }

  async startProcessing(options: { concurrency?: number } = {}): Promise<void> {
    if (!this.jobsResource?.startProcessing) return;
    const concurrency = options.concurrency || this.config.queue.concurrency;
    await this.jobsResource.startProcessing(this.queueHandler, { concurrency });
  }

  async stopProcessing(): Promise<void> {
    if (this.jobsResource?.stopProcessing) {
      await this.jobsResource.stopProcessing();
    }
  }

  async queueHandler(record: any, context: any): Promise<any> {
    if (typeof this.processor !== 'function') {
      throw new PluginError('[CookieFarmSuitePlugin] No processor registered. Call setProcessor(fn) first.', {
        pluginName: 'CookieFarmSuitePlugin',
        operation: 'queueHandler',
        statusCode: 500,
        retriable: false,
        suggestion: 'Register a processor via plugin.setProcessor(jobHandler) before starting the queue.'
      });
    }

    const helpers = {
      puppeteer: this.puppeteerPlugin,
      cookieFarm: this.cookieFarmPlugin,
      queue: this.queuePlugin,
      enqueue: this.enqueueJob.bind(this),
      resource: this.jobsResource,
      plugin: this
    };

    return await this.processor(record, context, helpers);
  }
}

export default CookieFarmSuitePlugin;
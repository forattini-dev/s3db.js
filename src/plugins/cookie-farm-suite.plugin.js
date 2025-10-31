import tryFn from "../concerns/try-fn.js";
import { Plugin } from "./plugin.class.js";
import { PuppeteerPlugin } from "./puppeteer.plugin.js";
import { CookieFarmPlugin } from "./cookie-farm.plugin.js";
import { S3QueuePlugin } from "./s3-queue.plugin.js";
import { TTLPlugin } from "./ttl.plugin.js";

function sanitizeNamespace(value) {
  return (value || 'persona')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

function defaultJobsResource(namespace) {
  return `${namespace.replace(/[^a-z0-9]+/g, '_')}_persona_jobs`;
}

/**
 * CookieFarmSuitePlugin
 *
 * Bundles CookieFarm + Puppeteer + S3Queue (+ optional TTL) with shared
 * namespace handling for persona farming workloads.
 */
export class CookieFarmSuitePlugin extends Plugin {
  constructor(options = {}) {
    const namespace = options.namespace || 'persona';
    super({ ...options, namespace });

    this.namespace = this.namespace || sanitizeNamespace(namespace);

    const jobsResource =
      options.jobsResource ||
      (options.resources && options.resources.jobs) ||
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

  _dependencyName(alias) {
    return `${this.namespace}-${alias}`.toLowerCase();
  }

  async _installDependency(alias, plugin) {
    const name = this._dependencyName(alias);
    const instance = await this.database.usePlugin(plugin, name);
    this.dependencies.push({ name, instance });
    return instance;
  }

  async _ensureJobsResource() {
    if (this.database.resources?.[this.config.jobsResource]) {
      this.jobsResource = this.database.resources[this.config.jobsResource];
      return;
    }

    const [created, err, resource] = await tryFn(() => this.database.createResource({
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

    this.jobsResource = this.database.resources[this.config.jobsResource];
  }

  async onInstall() {
    await this._ensureJobsResource();

    this.puppeteerPlugin = await this._installDependency(
      'puppeteer',
      new PuppeteerPlugin({
        namespace: this.namespace,
        ...this.config.puppeteer
      })
    );

    this.cookieFarmPlugin = await this._installDependency(
      'cookie-farm',
      new CookieFarmPlugin({
        namespace: this.namespace,
        ...this.config.cookieFarm
      })
    );

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
      verbose: this.config.queue.verbose
    };

    this.queuePlugin = await this._installDependency(
      'queue',
      new S3QueuePlugin(queueOptions)
    );

    if (this.config.ttl) {
      const ttlConfig = {
        namespace: this.namespace,
        ...this.config.ttl
      };

      ttlConfig.resources = ttlConfig.resources || {};

      if (!ttlConfig.resources[this.queuePlugin.queueResourceName]) {
        ttlConfig.resources[this.queuePlugin.queueResourceName] = {
          ttl: ttlConfig.queue?.ttl || 7200,
          onExpire: ttlConfig.queue?.onExpire || 'hard-delete',
          field: ttlConfig.queue?.field || null
        };
      }

      delete ttlConfig.queue;

      this.ttlPlugin = await this._installDependency(
        'ttl',
        new TTLPlugin(ttlConfig)
      );
    }

    this.emit('cookieFarmSuite.installed', {
      namespace: this.namespace,
      jobsResource: this.config.jobsResource
    });
  }

  async onStart() {
    if (this.config.queue.autoStart && typeof this.processor === 'function') {
      await this.startProcessing();
    }
  }

  async onStop() {
    await this.stopProcessing();
  }

  async onUninstall(options = {}) {
    await this.onStop();

    for (const dep of [...this.dependencies].reverse()) {
      await this.database.uninstallPlugin(dep.name, { purgeData: options.purgeData === true });
    }
    this.dependencies = [];
  }

  /**
   * Register a job processor.
   */
  async setProcessor(handler, { autoStart = true, concurrency } = {}) {
    this.processor = handler;

    if (autoStart && typeof handler === 'function') {
      await this.startProcessing({ concurrency });
    }
  }

  /**
   * Enqueue a persona job.
   */
  async enqueueJob(data, options = {}) {
    if (!this.jobsResource?.enqueue) {
      throw new Error('[CookieFarmSuitePlugin] Queue helpers not initialized yet');
    }
    return await this.jobsResource.enqueue({
      createdAt: new Date().toISOString().slice(0, 10),
      ...data
    }, options);
  }

  async startProcessing(options = {}) {
    if (!this.jobsResource?.startProcessing) return;
    const concurrency = options.concurrency || this.config.queue.concurrency;
    await this.jobsResource.startProcessing(this.queueHandler, { concurrency });
  }

  async stopProcessing() {
    if (this.jobsResource?.stopProcessing) {
      await this.jobsResource.stopProcessing();
    }
  }

  async queueHandler(record, context) {
    if (typeof this.processor !== 'function') {
      throw new Error('[CookieFarmSuitePlugin] No processor registered. Call setProcessor(fn) first.');
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

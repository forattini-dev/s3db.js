import tryFn from "../concerns/try-fn.js";
import { Plugin } from "./plugin.class.js";
import { PuppeteerPlugin } from "./puppeteer.plugin.js";
import { S3QueuePlugin } from "./s3-queue.plugin.js";
import { TTLPlugin } from "./ttl.plugin.js";

function sanitizeNamespace(value) {
  return (value || 'spider')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

function defaultTargetsResource(namespace) {
  return `${namespace.replace(/[^a-z0-9]+/g, '_')}_targets`;
}

/**
 * SpiderSuitePlugin
 *
 * Bundles Puppeteer + S3Queue (+ optional TTL) with shared namespace handling
 * for crawling workloads. Creates a targets resource, wires queue helpers,
 * and exposes convenience methods for registering processors.
 */
export class SpiderSuitePlugin extends Plugin {
  constructor(options = {}) {
    const namespace = options.namespace || 'spider';
    super({ ...options, namespace });

    this.namespace = this.namespace || sanitizeNamespace(namespace);

    const targetsResource =
      options.targetsResource ||
      (options.resources && options.resources.targets) ||
      defaultTargetsResource(this.namespace);

    this.config = {
      namespace: this.namespace,
      targetsResource,
      queue: {
        resource: targetsResource,
        deadLetterResource: options.queue?.deadLetterResource || null,
        visibilityTimeout: options.queue?.visibilityTimeout || 30000,
        pollInterval: options.queue?.pollInterval || 1000,
        maxAttempts: options.queue?.maxAttempts || 3,
        concurrency: options.queue?.concurrency || 3,
        autoStart: options.queue?.autoStart === true,
        ...options.queue
      },
      puppeteer: {
        // Disable pool warmup by default to avoid immediate browser launches
        pool: { enabled: false },
        ...options.puppeteer
      },
      ttl: options.ttl || null,
      processor: typeof options.processor === 'function' ? options.processor : null
    };

    this.pluginFactories = {
      puppeteer: options.pluginFactories?.puppeteer ||
        ((pluginOptions) => new PuppeteerPlugin(pluginOptions)),
      queue: options.pluginFactories?.queue ||
        ((queueOptions) => new S3QueuePlugin(queueOptions)),
      ttl: options.pluginFactories?.ttl ||
        ((ttlOptions) => new TTLPlugin(ttlOptions))
    };

    this.dependencies = [];
    this.targetsResource = null;
    this.puppeteerPlugin = null;
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

  async _ensureTargetsResource() {
    if (this.database.resources?.[this.config.targetsResource]) {
      this.targetsResource = this.database.resources[this.config.targetsResource];
      return;
    }

    const [created, err, resource] = await tryFn(() => this.database.createResource({
      name: this.config.targetsResource,
      attributes: {
        id: 'string|required',
        url: 'string|required',
        method: 'string|optional',
        depth: 'number|optional',
        priority: 'number|default:0',
        headers: 'json|optional',
        metadata: 'json|optional',
        createdAt: 'string|required'
      },
      behavior: 'body-overflow',
      timestamps: true,
      asyncPartitions: true,
      partitions: {
        byPriority: { fields: { priority: 'number' } },
        byDate: { fields: { createdAt: 'string|maxlength:10' } }
      }
    }));

    if (!created) {
      if (resource) {
        this.targetsResource = resource;
        return;
      }
      throw err;
    }

    this.targetsResource = this.database.resources[this.config.targetsResource];
  }

  async onInstall() {
    await this._ensureTargetsResource();

    // Install Puppeteer first so other plugins can depend on it
    this.puppeteerPlugin = await this._installDependency('puppeteer',
      this.pluginFactories.puppeteer({
        namespace: this.namespace,
        ...this.config.puppeteer
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

    this.queuePlugin = await this._installDependency('queue', this.pluginFactories.queue(queueOptions));

    if (this.config.ttl) {
      const ttlConfig = {
        namespace: this.namespace,
        ...this.config.ttl
      };

      ttlConfig.resources = ttlConfig.resources || {};

      if (!ttlConfig.resources[this.queuePlugin.queueResourceName]) {
        ttlConfig.resources[this.queuePlugin.queueResourceName] = {
          ttl: ttlConfig.queue?.ttl || 3600,
          onExpire: ttlConfig.queue?.onExpire || 'hard-delete',
          field: ttlConfig.queue?.field || null
        };
      }

      delete ttlConfig.queue;

      this.ttlPlugin = await this._installDependency('ttl', this.pluginFactories.ttl(ttlConfig));
    }

    this.emit('spiderSuite.installed', {
      namespace: this.namespace,
      targetsResource: this.config.targetsResource
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

    // Uninstall dependencies in reverse order
    for (const dep of [...this.dependencies].reverse()) {
      await this.database.uninstallPlugin(dep.name, { purgeData: options.purgeData === true });
    }
    this.dependencies = [];
  }

  /**
   * Register a queue processor.
   */
  async setProcessor(handler, { autoStart = true, concurrency } = {}) {
    this.processor = handler;

    if (autoStart && typeof handler === 'function') {
      await this.startProcessing({ concurrency });
    }
  }

  /**
   * Enqueue a target for crawling.
   */
  async enqueueTarget(data, options = {}) {
    if (!this.targetsResource?.enqueue) {
      throw new Error('[SpiderSuitePlugin] Queue helpers not initialized yet');
    }
    return await this.targetsResource.enqueue({
      createdAt: new Date().toISOString().slice(0, 10),
      ...data
    }, options);
  }

  /**
   * Start processing queued targets.
   */
  async startProcessing(options = {}) {
    if (!this.targetsResource?.startProcessing) return;
    const concurrency = options.concurrency || this.config.queue.concurrency;
    await this.targetsResource.startProcessing(this.queueHandler, { concurrency });
  }

  /**
   * Stop processing queued targets.
   */
  async stopProcessing() {
    if (this.targetsResource?.stopProcessing) {
      await this.targetsResource.stopProcessing();
    }
  }

  async queueHandler(record, context) {
    if (typeof this.processor !== 'function') {
      throw new Error('[SpiderSuitePlugin] No processor registered. Call setProcessor(fn) first.');
    }

    const helpers = {
      puppeteer: this.puppeteerPlugin,
      queue: this.queuePlugin,
      enqueue: this.enqueueTarget.bind(this),
      resource: this.targetsResource,
      plugin: this
    };

    return await this.processor(record, context, helpers);
  }
}

export default SpiderSuitePlugin;

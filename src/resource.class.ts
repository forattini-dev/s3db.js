import { join } from 'path';
import { createHash } from 'crypto';
import jsonStableStringify from 'json-stable-stringify';
import { merge } from 'lodash-es';

import { AsyncEventEmitter } from './concerns/async-event-emitter.js';
import Schema from './schema.class.js';
import { ValidatorManager } from './validator.class.js';
import { ResourceValidator } from './core/resource-validator.class.js';
import { ResourceIdGenerator } from './core/resource-id-generator.class.js';
import { ResourceEvents } from './core/resource-events.class.js';
import { ResourceHooks } from './core/resource-hooks.class.js';
import { ResourceGuards } from './core/resource-guards.class.js';
import { ResourceMiddleware } from './core/resource-middleware.class.js';
import { ResourcePartitions } from './core/resource-partitions.class.js';
import { ResourceQuery } from './core/resource-query.class.js';
import { ResourceContent } from './core/resource-content.class.js';
import { ResourceStreams } from './core/resource-streams.class.js';
import { ResourcePersistence } from './core/resource-persistence.class.js';
import { streamToString } from './stream/index.js';
import tryFn, { tryFnSync } from './concerns/try-fn.js';
import { ResourceReader, ResourceWriter } from './stream/index.js';
import { getBehavior, DEFAULT_BEHAVIOR } from './behaviors/index.js';
import { idGenerator as defaultIdGenerator } from './concerns/id.js';
import { validateS3KeySegment } from './concerns/s3-key.js';
import { ResourceError, PartitionError } from './errors.js';
import { createLogger, type Logger, type LogLevel as LoggerLogLevel } from './concerns/logger.js';
import { validateResourceConfig } from './core/resource-config-validator.js';

import type { Client } from './clients/types.js';
import type { BehaviorType } from './behaviors/types.js';
import type { SchemaRegistry, PluginSchemaRegistry } from './schema.class.js';
import type { LogLevel, StringRecord, EventHandler, Disposable } from './types/common.types.js';
import type {
  HookFunction,
  BoundHookFunction,
  HooksCollection,
  HookEvent
} from './core/resource-hooks.class.js';
import type {
  GuardConfig,
  GuardContext,
  JWTUser
} from './core/resource-guards.class.js';
import type {
  MiddlewareFunction,
  SupportedMethod
} from './core/resource-middleware.class.js';
import type {
  PartitionDefinition,
  PartitionsConfig,
  PageResult as QueryPageResult
} from './core/resource-query.class.js';
import type {
  HooksModule,
  OrphanedPartitions
} from './core/resource-partitions.class.js';
import type {
  UpdateConditionalOptions,
  UpdateConditionalResult as PersistenceUpdateConditionalResult,
  DeleteManyResult as PersistenceDeleteManyResult,
  ResourceData as PersistenceResourceData
} from './core/resource-persistence.class.js';
import type {
  ResourceConfigInput
} from './core/resource-config-validator.js';
import type {
  ValidationResult,
  ValidationOptions,
  AttributesSchema
} from './core/resource-validator.class.js';
import type {
  EventListeners
} from './core/resource-events.class.js';
import type {
  IdGeneratorFunction,
  IdGeneratorConfig,
  IncrementalGenerator,
  SequenceInfo
} from './core/resource-id-generator.class.js';

export interface ResourceConfig {
  name: string;
  client: Client;
  database?: Database;
  version?: string;
  attributes?: AttributesSchema;
  behavior?: BehaviorType;
  passphrase?: string;
  bcryptRounds?: number;
  observers?: Database[];
  cache?: boolean;
  autoEncrypt?: boolean;
  autoDecrypt?: boolean;
  timestamps?: boolean;
  partitions?: PartitionsConfig | string[];
  paranoid?: boolean;
  allNestedObjectsOptional?: boolean;
  hooks?: Partial<HooksCollection>;
  idGenerator?: IdGeneratorFunction | number | string;
  idSize?: number;
  versioningEnabled?: boolean;
  strictValidation?: boolean;
  events?: EventListeners;
  asyncEvents?: boolean;
  asyncPartitions?: boolean;
  strictPartitions?: boolean;
  createdBy?: string;
  guard?: GuardConfig;
  logLevel?: LogLevel;
  map?: StringRecord<string>;
  disableEvents?: boolean;
  disableResourceEvents?: boolean;
  api?: ResourceApiConfig;
  description?: string;
  /** Schema registry for stable attribute indices - loaded from s3db.json */
  schemaRegistry?: import('./schema.class.js').SchemaRegistry;
  /** Plugin schema registries for stable plugin attribute indices */
  pluginSchemaRegistry?: Record<string, import('./schema.class.js').PluginSchemaRegistry | import('./schema.class.js').SchemaRegistry>;
  /** Defer schema/validator compilation until first CRUD operation (default: false) */
  lazySchema?: boolean;
}

export interface ResourceApiConfig {
  enabled?: boolean;
  path?: string;
  operations?: {
    list?: boolean;
    get?: boolean;
    insert?: boolean;
    update?: boolean;
    delete?: boolean;
    query?: boolean;
  };
  middleware?: MiddlewareFunction[];
}

export interface ResourceInternalConfig {
  cache: boolean;
  hooks: Partial<HooksCollection>;
  paranoid: boolean;
  timestamps: boolean;
  partitions: PartitionsConfig;
  autoEncrypt: boolean;
  autoDecrypt: boolean;
  allNestedObjectsOptional: boolean;
  asyncEvents: boolean;
  asyncPartitions: boolean;
  strictPartitions: boolean;
  createdBy: string;
}

export interface ResourceExport {
  name: string;
  attributes: AttributesSchema;
  behavior: BehaviorType;
  timestamps: boolean;
  partitions: PartitionsConfig;
  paranoid: boolean;
  allNestedObjectsOptional: boolean;
  autoDecrypt: boolean;
  cache: boolean;
  asyncEvents?: boolean;
  asyncPartitions?: boolean;
  hooks: Partial<HooksCollection>;
  map?: StringRecord<string>;
}

export interface ResourceData {
  id: string;
  [key: string]: unknown;
}

export interface ContentResult {
  buffer: Buffer | null;
  contentType: string | null;
}

export interface SetContentParams {
  id: string;
  buffer: Buffer | string;
  contentType?: string;
}

export interface PageResult {
  items: ResourceData[];
  total: number;
  offset: number;
  size: number;
  hasMore: boolean;
}

export interface QueryFilter {
  [key: string]: unknown;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  partition?: string | null;
  partitionValues?: StringRecord;
}

export interface ListOptions {
  partition?: string | null;
  partitionValues?: StringRecord;
  limit?: number;
  offset?: number;
}

export interface CountOptions {
  partition?: string | null;
  partitionValues?: StringRecord;
}

export interface UpdateConditionalResult {
  success: boolean;
  data?: ResourceData;
  error?: string;
  currentETag?: string;
}

export interface DeleteManyResult {
  deleted: number;
  failed: number;
  errors?: unknown[];
}

export interface PageOptions {
  offset?: number;
  size?: number;
  partition?: string | null;
  partitionValues?: StringRecord;
  skipCount?: boolean;
}

export interface UpdateConditionalResult {
  success: boolean;
  data?: ResourceData;
  etag?: string;
  error?: string;
}

export interface ComposeFullObjectParams {
  id: string;
  metadata: StringRecord;
  body: string;
  behavior: BehaviorType;
}

export interface GetFromPartitionParams {
  id: string;
  partitionName: string;
  partitionValues?: StringRecord;
}

interface Database {
  id: string;
  logger: Logger;
  getChildLogger(name: string, bindings?: Record<string, unknown>): Logger;
  emit(event: string, data: unknown): void;
  savedMetadata?: SavedMetadata | null;
}

interface SavedMetadata {
  resources?: StringRecord<ResourceMetadata>;
}

interface ResourceMetadata {
  currentVersion?: string;
  versions?: StringRecord<VersionData>;
}

interface VersionData {
  hash?: string;
  attributes?: AttributesSchema;
}

export class Resource extends AsyncEventEmitter implements Disposable {
  public name: string;
  public client: Client;
  public version: string;
  public override logLevel: LoggerLogLevel;
  public override logger: Logger;
  public behavior: BehaviorType;
  private _resourceAsyncEvents: boolean;
  public observers: Database[];
  public passphrase: string;
  public bcryptRounds: number;
  public versioningEnabled: boolean;
  public strictValidation: boolean;
  public asyncEvents: boolean;
  public idGenerator: IdGeneratorFunction | IncrementalGenerator | null;
  public idSize: number;
  public idGeneratorType: IdGeneratorConfig | undefined;
  public config: ResourceInternalConfig;
  public validator: ResourceValidator;
  public schema: Schema;
  public $schema: Readonly<Omit<ResourceConfig, 'database' | 'observers' | 'client'>>;
  public hooks: HooksCollection;
  public attributes: AttributesSchema;
  public guard: GuardConfig | null;
  public eventsDisabled: boolean;
  public database?: Database;
  public map?: StringRecord<string>;
  private _schemaRegistry?: SchemaRegistry;
  private _pluginSchemaRegistry?: Record<string, PluginSchemaRegistry | SchemaRegistry>;

  private _lazySchema: boolean;
  private _schemaCompiled: boolean;
  private _pendingSchemaConfig: {
    attributes: AttributesSchema;
    passphrase: string;
    bcryptRounds: number;
    version: number;
    allNestedObjectsOptional: boolean;
    autoEncrypt: boolean;
    autoDecrypt: boolean;
    strictValidation: boolean;
  } | null;

  private _instanceId: string;
  private _idGenerator: ResourceIdGenerator;
  private _hooksModule: ResourceHooks;
  private _partitions: ResourcePartitions;
  private _eventsModule: ResourceEvents;
  private _guards: ResourceGuards;
  private _middleware: ResourceMiddleware;
  private _query: ResourceQuery;
  private _content: ResourceContent;
  private _streams: ResourceStreams;
  private _persistence: ResourcePersistence;

  constructor(config: ResourceConfig = {} as ResourceConfig) {
    super();
    this._instanceId = defaultIdGenerator(7);

    const validation = validateResourceConfig(config as unknown as ResourceConfigInput);
    if (!validation.isValid) {
      const errorDetails = validation.errors.map((err: string) => `  • ${err}`).join('\n');
      throw new ResourceError(
        `Invalid Resource ${config.name || '[unnamed]'} configuration:\n${errorDetails}`,
        {
          resourceName: config.name,
          validation: validation.errors,
        }
      );
    }

    const {
      name,
      client,
      version = '1',
      attributes = {},
      behavior = DEFAULT_BEHAVIOR,
      passphrase = 'secret',
      bcryptRounds = 10,
      observers = [],
      cache = false,
      autoEncrypt = true,
      autoDecrypt = true,
      timestamps = false,
      partitions = {},
      paranoid = true,
      allNestedObjectsOptional = true,
      hooks = {},
      idGenerator: customIdGenerator,
      idSize = 22,
      versioningEnabled = false,
      strictValidation = true,
      events = {},
      asyncEvents = true,
      asyncPartitions = true,
      strictPartitions = false,
      createdBy = 'user',
      guard,
      schemaRegistry,
      pluginSchemaRegistry,
      lazySchema = false
    } = config;

    this.name = name;
    this.client = client;
    this.version = version;
    this.logLevel = (config.logLevel || (config.client as any)?.logLevel || config.database?.logger.level || 'info') as LoggerLogLevel;

    if (config.database && config.database.getChildLogger) {
      this.logger = config.database.getChildLogger(`Resource:${name}`, { resource: name });
    } else if (config.database && config.database.logger) {
      this.logger = config.database.logger.child({ resource: name });
    } else {
      this.logger = createLogger({ name: `Resource:${name}`, level: this.logLevel as LoggerLogLevel });
    }

    this.behavior = behavior as BehaviorType;
    this.observers = observers as Database[];
    this.passphrase = passphrase ?? 'secret';
    this.bcryptRounds = bcryptRounds;
    this.versioningEnabled = versioningEnabled;
    this.strictValidation = strictValidation;

    this.setAsyncMode(asyncEvents);
    this._resourceAsyncEvents = asyncEvents;
    this.asyncEvents = asyncEvents;

    this._idGenerator = new ResourceIdGenerator(this as any, {
      idGenerator: customIdGenerator as IdGeneratorConfig,
      idSize
    });
    this.idGenerator = this._idGenerator.getGenerator();
    this.idSize = this._idGenerator.idSize;
    this.idGeneratorType = this._idGenerator.getType(customIdGenerator as IdGeneratorConfig, this.idSize);

    Object.defineProperty(this, '_incrementalConfig', {
      get: () => (this._idGenerator as any)._incrementalConfig,
      enumerable: false,
      configurable: false
    });

    const normalizedPartitions = this._normalizePartitionsInput(partitions, attributes);

    this.config = {
      cache,
      hooks,
      paranoid,
      timestamps,
      partitions: normalizedPartitions,
      autoEncrypt,
      autoDecrypt,
      allNestedObjectsOptional,
      asyncEvents: this.asyncEvents,
      asyncPartitions,
      strictPartitions,
      createdBy,
    };

    this._lazySchema = lazySchema;
    this._schemaCompiled = false;
    this._pendingSchemaConfig = null;

    const parsedVersion = parseInt(version.replace(/v/i, ''), 10) || 1;

    this._schemaRegistry = schemaRegistry;
    this._pluginSchemaRegistry = pluginSchemaRegistry;

    if (lazySchema) {
      this._pendingSchemaConfig = {
        attributes,
        passphrase: this.passphrase,
        bcryptRounds: this.bcryptRounds,
        version: parsedVersion,
        allNestedObjectsOptional,
        autoEncrypt,
        autoDecrypt,
        strictValidation
      };
      this.validator = null as unknown as ResourceValidator;
      this.schema = null as unknown as Schema;
      this.logger.debug({ resource: this.name }, `[LAZY_SCHEMA] Deferred schema/validator compilation`);
    } else {
      this.validator = new ResourceValidator({
        attributes,
        strictValidation,
        allNestedObjectsOptional,
        passphrase: this.passphrase,
        bcryptRounds: this.bcryptRounds,
        autoEncrypt,
        autoDecrypt
      });

      this.schema = new Schema({
        name,
        attributes,
        passphrase,
        bcryptRounds,
        version: parsedVersion,
        options: {
          allNestedObjectsOptional,
          autoEncrypt,
          autoDecrypt
        },
        schemaRegistry: this._schemaRegistry,
        pluginSchemaRegistry: this._pluginSchemaRegistry
      });
      this._schemaRegistry = this.schema.getSchemaRegistry() || this._schemaRegistry;
      this._pluginSchemaRegistry = this.schema.getPluginSchemaRegistry() || this._pluginSchemaRegistry;
      this._schemaCompiled = true;
    }

    const { database: _db, observers: _obs, client: _cli, ...cloneableConfig } = config;
    this.$schema = { ...cloneableConfig } as Readonly<Omit<ResourceConfig, 'database' | 'observers' | 'client'>>;

    (this.$schema as any)._createdAt = Date.now();
    (this.$schema as any)._updatedAt = Date.now();

    Object.freeze(this.$schema);

    this._hooksModule = new ResourceHooks(this as any, {});
    this.hooks = this._hooksModule.getHooks();

    this.attributes = attributes || {};

    this._partitions = new ResourcePartitions(this as any, { strictValidation });

    this.map = config.map;

    this.applyConfiguration({ map: this.map });

    if (hooks) {
      for (const [event, hooksArr] of Object.entries(hooks)) {
        if (Array.isArray(hooksArr)) {
          for (const fn of hooksArr) {
            this._hooksModule.addHook(event as HookEvent, fn);
          }
        }
      }
    }

    this._eventsModule = new ResourceEvents(this as any, {
      disableEvents: config.disableEvents,
      disableResourceEvents: config.disableResourceEvents,
      events
    });
    this.eventsDisabled = this._eventsModule.isDisabled();

    this._guards = new ResourceGuards(this as any, { guard });
    this.guard = this._guards.getGuard();

    this._middleware = new ResourceMiddleware(this as any);
    this._middleware.init();

    this._query = new ResourceQuery(this as any);

    this._content = new ResourceContent(this as any);

    this._streams = new ResourceStreams(this as any);

    this._persistence = new ResourcePersistence(this as any);

    this._initIncrementalIdGenerator();
  }

  private _normalizePartitionsInput(
    partitions: PartitionsConfig | string[],
    attributes: AttributesSchema
  ): PartitionsConfig {
    if (!Array.isArray(partitions)) {
      return partitions || {};
    }

    const normalized: PartitionsConfig = {};

    for (const fieldName of partitions) {
      if (typeof fieldName !== 'string') {
        throw new PartitionError('Invalid partition field type', {
          fieldName,
          receivedType: typeof fieldName,
          retriable: false,
          suggestion: 'Use string field names when declaring partitions (e.g. ["status", "region"]).'
        });
      }

      if (!attributes || !attributes[fieldName]) {
        throw new PartitionError(`Partition field '${fieldName}' not found in attributes`, {
          fieldName,
          availableFields: attributes ? Object.keys(attributes) : [],
          retriable: false,
          suggestion: 'Ensure the partition field exists in the resource attributes definition.'
        });
      }

      const partitionName = `by${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;

      const fieldDef = attributes[fieldName]!;
      let fieldType = 'string';

      if (typeof fieldDef === 'string') {
        fieldType = fieldDef.split('|')[0]!.trim();
      } else if (typeof fieldDef === 'object' && fieldDef !== null && (fieldDef as any).type) {
        fieldType = (fieldDef as any).type;
      }

      normalized[partitionName] = {
        fields: {
          [fieldName]: fieldType
        }
      };
    }

    return normalized;
  }

  configureIdGenerator(customIdGenerator: IdGeneratorFunction | number | string | undefined, idSize: number): IdGeneratorFunction | IncrementalGenerator | null {
    const tempGenerator = new ResourceIdGenerator(this as any, { idGenerator: customIdGenerator as IdGeneratorConfig, idSize });
    return tempGenerator.getGenerator();
  }

  private _initIncrementalIdGenerator(): void {
    this._idGenerator.initIncremental();
    this.idGenerator = this._idGenerator.getGenerator();
  }

  private _ensureSchemaCompiled(): void {
    if (this._schemaCompiled) return;
    if (!this._pendingSchemaConfig) {
      throw new ResourceError(
        `Resource '${this.name}' has lazy schema enabled but no pending config`,
        { resourceName: this.name }
      );
    }

    const startTime = Date.now();
    const cfg = this._pendingSchemaConfig;

    this.validator = new ResourceValidator({
      attributes: cfg.attributes,
      strictValidation: cfg.strictValidation,
      allNestedObjectsOptional: cfg.allNestedObjectsOptional,
      passphrase: cfg.passphrase,
      bcryptRounds: cfg.bcryptRounds,
      autoEncrypt: cfg.autoEncrypt,
      autoDecrypt: cfg.autoDecrypt
    });

    this.schema = new Schema({
      name: this.name,
      attributes: cfg.attributes,
      passphrase: cfg.passphrase,
      bcryptRounds: cfg.bcryptRounds,
      version: cfg.version,
      options: {
        allNestedObjectsOptional: cfg.allNestedObjectsOptional,
        autoEncrypt: cfg.autoEncrypt,
        autoDecrypt: cfg.autoDecrypt
      },
      schemaRegistry: this._schemaRegistry,
      pluginSchemaRegistry: this._pluginSchemaRegistry
    });

    this._schemaRegistry = this.schema.getSchemaRegistry() || this._schemaRegistry;
    this._pluginSchemaRegistry = this.schema.getPluginSchemaRegistry() || this._pluginSchemaRegistry;
    this._schemaCompiled = true;
    this._pendingSchemaConfig = null;

    const elapsed = Date.now() - startTime;
    this.logger.debug(
      { resource: this.name, elapsedMs: elapsed },
      `[LAZY_SCHEMA] Compiled on first use (${elapsed}ms)`
    );
  }

  prewarmSchema(): void {
    if (this._schemaCompiled) return;
    this._ensureSchemaCompiled();
    this.logger.debug({ resource: this.name }, `[LAZY_SCHEMA] Pre-warmed schema`);
  }

  isSchemaCompiled(): boolean {
    return this._schemaCompiled;
  }

  hasAsyncIdGenerator(): boolean {
    return this._idGenerator.isAsync();
  }

  getIdGeneratorType(customIdGenerator: IdGeneratorFunction | number | undefined, idSize: number): IdGeneratorConfig | undefined {
    return this._idGenerator.getType(customIdGenerator as IdGeneratorConfig, idSize);
  }

  export(): ResourceExport {
    let exported: ResourceExport;

    if (this._lazySchema && !this._schemaCompiled && this._pendingSchemaConfig) {
      exported = {
        name: this.name,
        attributes: this._pendingSchemaConfig.attributes,
        version: this._pendingSchemaConfig.version
      } as ResourceExport;
    } else {
      this._ensureSchemaCompiled();
      exported = this.schema.export() as unknown as ResourceExport;
    }

    exported.behavior = this.behavior;
    exported.timestamps = this.config.timestamps;
    exported.partitions = this.config.partitions || {};
    exported.paranoid = this.config.paranoid;
    exported.allNestedObjectsOptional = this.config.allNestedObjectsOptional;
    exported.autoDecrypt = this.config.autoDecrypt;
    exported.cache = this.config.cache;
    exported.hooks = this.hooks;
    exported.map = this.map;
    return exported;
  }

  applyConfiguration({ map }: { map?: StringRecord<string> } = {}): void {
    if (!this._lazySchema) {
      this._ensureSchemaCompiled();
    }

    if (this.config.timestamps) {
      if (!this.attributes.createdAt) {
        this.attributes.createdAt = 'string|optional';
      }
      if (!this.attributes.updatedAt) {
        this.attributes.updatedAt = 'string|optional';
      }

      if (!this.config.partitions) {
        this.config.partitions = {};
      }

      if (!this.config.partitions.byCreatedDate) {
        this.config.partitions.byCreatedDate = {
          fields: {
            createdAt: 'date|maxlength:10'
          }
        };
      }
      if (!this.config.partitions.byUpdatedDate) {
        this.config.partitions.byUpdatedDate = {
          fields: {
            updatedAt: 'date|maxlength:10'
          }
        };
      }
    }

    this.setupPartitionHooks();

    if (this.versioningEnabled) {
      if (!this.config.partitions.byVersion) {
        this.config.partitions.byVersion = {
          fields: {
            _v: 'string'
          }
        };
      }
    }

    if (!this._lazySchema) {
      const parsedVersion = parseInt(this.version.replace(/v/i, ''), 10) || 1;

      this.schema = new Schema({
        name: this.name,
        attributes: this.attributes,
        passphrase: this.passphrase,
        bcryptRounds: this.bcryptRounds,
        version: parsedVersion,
        options: {
          autoEncrypt: this.config.autoEncrypt,
          autoDecrypt: this.config.autoDecrypt,
          allNestedObjectsOptional: this.config.allNestedObjectsOptional
        },
        map: map || this.map,
        schemaRegistry: this._schemaRegistry,
        pluginSchemaRegistry: this._pluginSchemaRegistry
      });
      this._schemaRegistry = this.schema.getSchemaRegistry() || this._schemaRegistry;
      this._pluginSchemaRegistry = this.schema.getPluginSchemaRegistry() || this._pluginSchemaRegistry;

      if (this.validator) {
        this.validator.updateSchema(this.attributes);
      }
    }

    this.validatePartitions();
  }

  updateAttributes(newAttributes: AttributesSchema): { oldAttributes: AttributesSchema; newAttributes: AttributesSchema } {
    const oldAttributes = this.attributes;
    this.attributes = newAttributes;
    this.applyConfiguration();
    return { oldAttributes, newAttributes };
  }

  addPluginAttribute(name: string, definition: string | Record<string, unknown>, pluginName: string): void {
    if (!pluginName) {
      throw new ResourceError(
        'Plugin name is required when adding plugin attributes',
        { resource: this.name, attribute: name }
      );
    }

    const existingDef = this.schema.getAttributeDefinition(name);
    if (existingDef && (!(existingDef as any).__plugin__ || (existingDef as any).__plugin__ !== pluginName)) {
      throw new ResourceError(
        `Attribute '${name}' already exists and is not from plugin '${pluginName}'`,
        { resource: this.name, attribute: name, plugin: pluginName }
      );
    }

    let defObject: string | Record<string, unknown> = definition;
    if (typeof definition === 'object' && definition !== null) {
      defObject = { ...definition };
    }

    if (typeof defObject === 'object' && defObject !== null) {
      (defObject as any).__plugin__ = pluginName;
      (defObject as any).__pluginCreated__ = Date.now();
    }

    (this.schema as any).attributes[name] = defObject;
    this.attributes[name] = defObject;

    if (typeof defObject === 'string') {
      if (!(this.schema as any)._pluginAttributeMetadata) {
        (this.schema as any)._pluginAttributeMetadata = {};
      }
      (this.schema as any)._pluginAttributeMetadata[name] = {
        __plugin__: pluginName,
        __pluginCreated__: Date.now()
      };
    }

    this.schema.regeneratePluginMapping();

    if ((this.schema as any).options?.generateAutoHooks) {
      this.schema.generateAutoHooks();
    }

    const processedAttributes = this.schema.preprocessAttributesForValidation((this.schema as any).attributes);
    (this.schema as any).validator = new ValidatorManager({ autoEncrypt: false }).compile(merge(
      { $$async: true, $$strict: false },
      processedAttributes
    ));

    if (this.database) {
      this.database.emit('plugin-attribute-added', {
        resource: this.name,
        attribute: name,
        plugin: pluginName,
        definition: defObject
      });
    }
  }

  removePluginAttribute(name: string, pluginName: string | null = null): boolean {
    const attrDef = this.schema.getAttributeDefinition(name);

    const metadata = (this.schema as any)._pluginAttributeMetadata?.[name];
    const isPluginAttr = (typeof attrDef === 'object' && (attrDef as any)?.__plugin__) || metadata;

    if (!attrDef || !isPluginAttr) {
      return false;
    }

    const actualPlugin = (attrDef as any)?.__plugin__ || metadata?.__plugin__;

    if (pluginName && actualPlugin !== pluginName) {
      throw new ResourceError(
        `Attribute '${name}' belongs to plugin '${actualPlugin}', not '${pluginName}'`,
        { resource: this.name, attribute: name, actualPlugin, requestedPlugin: pluginName }
      );
    }

    delete (this.schema as any).attributes[name];
    delete this.attributes[name];

    if ((this.schema as any)._pluginAttributeMetadata?.[name]) {
      delete (this.schema as any)._pluginAttributeMetadata[name];
    }

    this.schema.regeneratePluginMapping();

    if (this.database) {
      this.database.emit('plugin-attribute-removed', {
        resource: this.name,
        attribute: name,
        plugin: actualPlugin
      });
    }

    return true;
  }

  addHook(event: HookEvent, fn: HookFunction): void {
    this._hooksModule.addHook(event, fn);
  }

  async executeHooks(event: HookEvent, data: unknown): Promise<unknown> {
    return this._hooksModule.executeHooks(event, data);
  }

  _bindHook(fn: HookFunction): BoundHookFunction<unknown> | null {
    return (this._hooksModule as any)._bindHook(fn);
  }

  setupPartitionHooks(): void {
    this._partitions.setupHooks(this._hooksModule as unknown as HooksModule);
  }

  async validate(data: Record<string, unknown>, options: ValidationOptions = {}): Promise<ValidationResult> {
    this._ensureSchemaCompiled();
    return this.validator.validate(data, options);
  }

  validatePartitions(): void {
    this._partitions.validate();
  }

  fieldExistsInAttributes(fieldName: string): boolean {
    return this._partitions.fieldExistsInAttributes(fieldName);
  }

  findOrphanedPartitions(): OrphanedPartitions {
    return this._partitions.findOrphaned();
  }

  removeOrphanedPartitions({ dryRun = false } = {}): OrphanedPartitions {
    return this._partitions.removeOrphaned({ dryRun });
  }

  applyPartitionRule(value: unknown, rule: string): unknown {
    return this._partitions.applyRule(value, rule);
  }

  getResourceKey(id: string): string {
    validateS3KeySegment(id, 'id');
    const key = join('resource=' + this.name, 'data', `id=${id}`);
    return key;
  }

  getPartitionKey({ partitionName, id, data }: { partitionName: string; id: string; data: Record<string, unknown> }): string | null {
    return this._partitions.getKey({ partitionName, id, data });
  }

  getNestedFieldValue(data: Record<string, unknown>, fieldPath: string): unknown {
    return this._partitions.getNestedFieldValue(data, fieldPath);
  }

  calculateContentLength(body: string | Buffer | object | null | undefined): number {
    if (!body) return 0;
    if (Buffer.isBuffer(body)) return body.length;
    if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
    if (typeof body === 'object') return Buffer.byteLength(JSON.stringify(body), 'utf8');
    return Buffer.byteLength(String(body), 'utf8');
  }

  _emitStandardized(event: string, payload: unknown, id: string | null = null): void {
    this._eventsModule.emitStandardized(event, payload, id);
  }

  _ensureEventsWired(): void {
    this._eventsModule.ensureWired();
  }

  override on(eventName: string, listener: EventHandler): this {
    this._eventsModule.on(eventName, listener);
    return this;
  }

  override addListener(eventName: string, listener: EventHandler): this {
    return this.on(eventName, listener);
  }

  override once(eventName: string, listener: EventHandler): this {
    this._eventsModule.once(eventName, listener);
    return this;
  }

  override emit(eventName: string, ...args: unknown[]): boolean {
    return this._eventsModule.emit(eventName, ...args);
  }

  async insert({ id, ...attributes }: { id?: string } & Record<string, unknown>): Promise<ResourceData> {
    this._ensureSchemaCompiled();
    return this._persistence.insert({ id, ...attributes }) as Promise<ResourceData>;
  }

  async get(id: string): Promise<ResourceData> {
    this._ensureSchemaCompiled();
    return this._persistence.get(id) as Promise<ResourceData>;
  }

  async getOrNull(id: string): Promise<ResourceData | null> {
    this._ensureSchemaCompiled();
    return this._persistence.getOrNull(id) as Promise<ResourceData | null>;
  }

  async getOrThrow(id: string): Promise<ResourceData> {
    this._ensureSchemaCompiled();
    return this._persistence.getOrThrow(id) as Promise<ResourceData>;
  }

  async exists(id: string): Promise<boolean> {
    return this._persistence.exists(id);
  }

  async update(id: string, attributes: Record<string, unknown>): Promise<ResourceData> {
    this._ensureSchemaCompiled();
    return this._persistence.update(id, attributes) as Promise<ResourceData>;
  }

  async patch(id: string, fields: Record<string, unknown>, options: { partition?: string; partitionValues?: StringRecord } = {}): Promise<ResourceData> {
    this._ensureSchemaCompiled();
    return this._persistence.patch(id, fields, options) as Promise<ResourceData>;
  }

  async _patchViaCopyObject(id: string, fields: Record<string, unknown>, options: Record<string, unknown> = {}): Promise<ResourceData> {
    this._ensureSchemaCompiled();
    return this._persistence._patchViaCopyObject(id, fields, options) as Promise<ResourceData>;
  }

  async replace(id: string, fullData: Record<string, unknown>, options: { partition?: string; partitionValues?: StringRecord } = {}): Promise<ResourceData> {
    this._ensureSchemaCompiled();
    return this._persistence.replace(id, fullData, options) as Promise<ResourceData>;
  }

  async updateConditional(id: string, attributes: Record<string, unknown>, options: { ifMatch?: string } = {}): Promise<UpdateConditionalResult> {
    this._ensureSchemaCompiled();
    return this._persistence.updateConditional(id, attributes, options as UpdateConditionalOptions) as unknown as Promise<UpdateConditionalResult>;
  }

  async delete(id: string): Promise<unknown> {
    this._ensureSchemaCompiled();
    return this._persistence.delete(id);
  }

  async upsert({ id, ...attributes }: { id: string } & Record<string, unknown>): Promise<ResourceData> {
    this._ensureSchemaCompiled();
    return this._persistence.upsert({ id, ...attributes }) as Promise<ResourceData>;
  }

  async count({ partition = null, partitionValues = {} }: CountOptions = {}): Promise<number> {
    return this._query.count({ partition, partitionValues });
  }

  async insertMany(objects: Record<string, unknown>[]): Promise<ResourceData[]> {
    this._ensureSchemaCompiled();
    return this._persistence.insertMany(objects) as Promise<ResourceData[]>;
  }

  async _executeBatchHelper(operations: unknown[], options: Record<string, unknown> = {}): Promise<unknown> {
    this._ensureSchemaCompiled();
    return this._persistence._executeBatchHelper(operations as any, options);
  }

  async deleteMany(ids: string[]): Promise<DeleteManyResult> {
    this._ensureSchemaCompiled();
    return this._persistence.deleteMany(ids) as unknown as Promise<DeleteManyResult>;
  }

  async deleteAll(): Promise<{ deletedCount: number }> {
    this._ensureSchemaCompiled();
    return this._persistence.deleteAll();
  }

  async deleteAllData(): Promise<{ deletedCount: number }> {
    this._ensureSchemaCompiled();
    return this._persistence.deleteAllData();
  }

  async listIds({ partition = null, partitionValues = {}, limit, offset = 0 }: ListOptions = {}): Promise<string[]> {
    return this._query.listIds({ partition, partitionValues, limit, offset });
  }

  async list({ partition = null, partitionValues = {}, limit, offset = 0 }: ListOptions = {}): Promise<ResourceData[]> {
    this._ensureSchemaCompiled();
    return this._query.list({ partition, partitionValues, limit, offset }) as Promise<ResourceData[]>;
  }

  async listMain({ limit, offset = 0 }: { limit?: number; offset?: number }): Promise<ResourceData[]> {
    this._ensureSchemaCompiled();
    return this._query.listMain({ limit, offset }) as Promise<ResourceData[]>;
  }

  async listPartition({ partition, partitionValues, limit, offset = 0 }: { partition: string; partitionValues: StringRecord; limit?: number; offset?: number }): Promise<ResourceData[]> {
    this._ensureSchemaCompiled();
    return this._query.listPartition({ partition, partitionValues, limit, offset }) as Promise<ResourceData[]>;
  }

  buildPartitionPrefix(partition: string, partitionDef: PartitionDefinition, partitionValues: StringRecord): string {
    return this._partitions.buildPrefix(partition, partitionDef, partitionValues);
  }

  extractIdsFromKeys(keys: string[]): string[] {
    return this._query.extractIdsFromKeys(keys);
  }

  async processListResults(ids: string[], context: string = 'main'): Promise<ResourceData[]> {
    return this._query.processListResults(ids, context) as Promise<ResourceData[]>;
  }

  async processPartitionResults(ids: string[], partition: string, partitionDef: PartitionDefinition, keys: string[]): Promise<ResourceData[]> {
    return this._query.processPartitionResults(ids, partition, partitionDef, keys) as Promise<ResourceData[]>;
  }

  extractPartitionValuesFromKey(id: string, keys: string[], sortedFields: string[]): StringRecord {
    return this._partitions.extractValuesFromKey(id, keys, sortedFields as unknown as [string, string][]) as StringRecord;
  }

  handleResourceError(error: Error, id: string, context: string): ResourceData {
    return this._query.handleResourceError(error, id, context) as ResourceData;
  }

  handleListError(error: Error, { partition, partitionValues }: { partition: string | null; partitionValues: StringRecord }): ResourceData[] {
    return this._query.handleListError(error, { partition, partitionValues }) as ResourceData[];
  }

  async getMany(ids: string[]): Promise<ResourceData[]> {
    this._ensureSchemaCompiled();
    return this._query.getMany(ids) as Promise<ResourceData[]>;
  }

  async getAll(): Promise<ResourceData[]> {
    this._ensureSchemaCompiled();
    return this._query.getAll() as Promise<ResourceData[]>;
  }

  async page({ offset = 0, size = 100, partition = null, partitionValues = {}, skipCount = false }: PageOptions = {}): Promise<PageResult> {
    this._ensureSchemaCompiled();
    const result = await this._query.page({ offset, size, partition, partitionValues, skipCount });
    return result as unknown as PageResult;
  }

  readable(): ResourceReader {
    return this._streams.readable() as unknown as ResourceReader;
  }

  writable(): ResourceWriter {
    return this._streams.writable() as unknown as ResourceWriter;
  }

  async setContent({ id, buffer, contentType = 'application/octet-stream' }: SetContentParams): Promise<ResourceData> {
    return this._content.setContent({ id, buffer, contentType }) as Promise<ResourceData>;
  }

  async content(id: string): Promise<ContentResult> {
    return this._content.content(id);
  }

  async hasContent(id: string): Promise<boolean> {
    return this._content.hasContent(id);
  }

  async deleteContent(id: string): Promise<unknown> {
    return this._content.deleteContent(id);
  }

  getDefinitionHash(): string {
    const definition = {
      attributes: this.attributes,
      behavior: this.behavior
    };

    const stableString = jsonStableStringify(definition);
    return `sha256:${createHash('sha256').update(stableString!).digest('hex')}`;
  }

  extractVersionFromKey(key: string): string | null {
    const parts = key.split('/');
    const versionPart = parts.find(part => part.startsWith('v='));
    return versionPart ? versionPart.replace('v=', '') : null;
  }

  async getSchemaForVersion(version: string): Promise<Schema> {
    this._ensureSchemaCompiled();
    return this.schema;
  }

  async createPartitionReferences(data: ResourceData): Promise<void> {
    return this._partitions.createReferences(data as any);
  }

  async deletePartitionReferences(data: ResourceData): Promise<void> {
    return this._partitions.deleteReferences(data as any);
  }

  async query(filter: QueryFilter = {}, { limit = 100, offset = 0, partition = null, partitionValues = {} }: QueryOptions = {}): Promise<ResourceData[]> {
    this._ensureSchemaCompiled();
    return this._query.query(filter, { limit, offset, partition, partitionValues }) as Promise<ResourceData[]>;
  }

  async handlePartitionReferenceUpdates(oldData: ResourceData, newData: ResourceData): Promise<void> {
    return this._partitions.handleReferenceUpdates(oldData as any, newData as any);
  }

  async handlePartitionReferenceUpdate(partitionName: string, partition: PartitionDefinition, oldData: ResourceData, newData: ResourceData): Promise<void> {
    return this._partitions.handleReferenceUpdate(partitionName, partition, oldData as any, newData as any);
  }

  async updatePartitionReferences(data: ResourceData): Promise<void> {
    return this._partitions.updateReferences(data as any);
  }

  async getFromPartition({ id, partitionName, partitionValues = {} }: GetFromPartitionParams): Promise<ResourceData> {
    return this._partitions.getFromPartition({ id, partitionName, partitionValues }) as Promise<ResourceData>;
  }

  async createHistoricalVersion(id: string, data: ResourceData): Promise<void> {
    this._ensureSchemaCompiled();
    const historicalKey = join(`resource=${this.name}`, `historical`, `id=${id}`);

    const historicalData = {
      ...data,
      _v: data._v || this.version,
      _historicalTimestamp: new Date().toISOString()
    };

    const mappedData = await this.schema.mapper(historicalData) as StringRecord<string>;

    const behaviorImpl = getBehavior(this.behavior);
    const { mappedData: processedMetadata, body } = await behaviorImpl.handleInsert({
      resource: this as any,
      data: historicalData,
      mappedData
    });

    const finalMetadata = {
      ...processedMetadata,
      _v: data._v || this.version,
      _historicalTimestamp: historicalData._historicalTimestamp
    };

    let contentType: string | undefined = undefined;
    if (body && body !== '') {
      const [okParse] = await tryFn(() => Promise.resolve(JSON.parse(body)));
      if (okParse) contentType = 'application/json';
    }

    await this.client.putObject({
      key: historicalKey,
      metadata: finalMetadata,
      body,
      contentType,
    });
  }

  async applyVersionMapping(data: ResourceData, fromVersion: string, toVersion: string): Promise<ResourceData> {
    if (fromVersion === toVersion) {
      return data;
    }

    const mappedData = {
      ...data,
      _v: toVersion,
      _originalVersion: fromVersion,
      _versionMapped: true
    };

    return mappedData;
  }

  async composeFullObjectFromWrite({ id, metadata, body, behavior }: ComposeFullObjectParams): Promise<ResourceData> {
    this._ensureSchemaCompiled();
    const behaviorFlags: StringRecord<string> = {};
    if (metadata && metadata['$truncated'] === 'true') {
      behaviorFlags.$truncated = 'true';
    }
    if (metadata && metadata['$overflow'] === 'true') {
      behaviorFlags.$overflow = 'true';
    }

    let unmappedMetadata: StringRecord = {};
    const [ok, , unmapped] = await tryFn(() => this.schema.unmapper(metadata));
    unmappedMetadata = ok ? (unmapped as unknown as StringRecord) : (metadata as StringRecord);

    const filterInternalFields = (obj: StringRecord): StringRecord => {
      if (!obj || typeof obj !== 'object') return obj;
      const filtered: StringRecord = {};
      const pluginAttrNames = (this.schema as any)._pluginAttributes
        ? Object.values((this.schema as any)._pluginAttributes).flat()
        : [];

      for (const [key, value] of Object.entries(obj)) {
        if (!key.startsWith('_') || key === '_geohash' || key.startsWith('_geohash_zoom') || pluginAttrNames.includes(key)) {
          filtered[key] = value;
        }
      }
      return filtered;
    };

    const fixValue = (v: unknown): unknown => {
      if (typeof v === 'object' && v !== null) {
        return v;
      }
      if (typeof v === 'string') {
        if (v === '[object Object]') return {};
        if ((v.startsWith('{') || v.startsWith('['))) {
          const [ok, , parsed] = tryFnSync(() => JSON.parse(v));
          return ok ? parsed : v;
        }
        return v;
      }
      return v;
    };

    if (behavior === 'body-overflow') {
      const hasOverflow = metadata && metadata['$overflow'] === 'true';
      let bodyData: StringRecord = {};
      if (hasOverflow && body) {
        const [okBody, , parsedBody] = await tryFn(() => Promise.resolve(JSON.parse(body)));
        if (okBody) {
          let pluginMapFromMeta: StringRecord | null = null;
          if (metadata && (metadata as any)._pluginmap) {
            const [okPluginMap, , parsedPluginMap] = await tryFn(() =>
              Promise.resolve(typeof (metadata as any)._pluginmap === 'string' ? JSON.parse((metadata as any)._pluginmap) : (metadata as any)._pluginmap)
            );
            pluginMapFromMeta = okPluginMap ? (parsedPluginMap as unknown as StringRecord) : null;
          }

          const [okUnmap, , unmappedBody] = await tryFn(() =>
            this.schema.unmapper(parsedBody as unknown as Record<string, unknown>, undefined, pluginMapFromMeta as any)
          );
          bodyData = okUnmap ? (unmappedBody as unknown as StringRecord) : {};
        }
      }
      const merged = { ...unmappedMetadata, ...bodyData, id } as ResourceData;
      Object.keys(merged).forEach(k => { (merged as any)[k] = fixValue((merged as any)[k]); });
      const result = filterInternalFields(merged as StringRecord) as ResourceData;
      if (hasOverflow) {
        (result as any).$overflow = 'true';
      }
      return result;
    }

    if (behavior === 'body-only') {
      const [okBody, , parsedBody] = await tryFn(() => Promise.resolve(body ? JSON.parse(body) : {}));
      let mapFromMeta = (this.schema as any).map;
      let pluginMapFromMeta: StringRecord | null = null;

      if (metadata && (metadata as any)._map) {
        const [okMap, , parsedMap] = await tryFn(() => Promise.resolve(typeof (metadata as any)._map === 'string' ? JSON.parse((metadata as any)._map) : (metadata as any)._map));
        mapFromMeta = okMap ? parsedMap : (this.schema as any).map;
      }

      if (metadata && (metadata as any)._pluginmap) {
        const [okPluginMap, , parsedPluginMap] = await tryFn(() => Promise.resolve(typeof (metadata as any)._pluginmap === 'string' ? JSON.parse((metadata as any)._pluginmap) : (metadata as any)._pluginmap));
        pluginMapFromMeta = okPluginMap ? (parsedPluginMap as unknown as StringRecord) : null;
      }

      const [okUnmap, , unmappedBody] = await tryFn(() => this.schema.unmapper(parsedBody as unknown as Record<string, unknown>, mapFromMeta, pluginMapFromMeta as any));
      const result = okUnmap ? { ...unmappedBody, id } as ResourceData : { id } as ResourceData;
      Object.keys(result).forEach(k => { (result as any)[k] = fixValue((result as any)[k]); });
      return result;
    }

    if (behavior === 'user-managed' && body && body.trim() !== '') {
      const [okBody, , parsedBody] = await tryFn(() => Promise.resolve(JSON.parse(body)));
      if (okBody) {
        let pluginMapFromMeta: StringRecord | null = null;
        if (metadata && (metadata as any)._pluginmap) {
          const [okPluginMap, , parsedPluginMap] = await tryFn(() =>
            Promise.resolve(typeof (metadata as any)._pluginmap === 'string' ? JSON.parse((metadata as any)._pluginmap) : (metadata as any)._pluginmap)
          );
          pluginMapFromMeta = okPluginMap ? (parsedPluginMap as unknown as StringRecord) : null;
        }

        const [okUnmap, , unmappedBodyRaw] = await tryFn(async () =>
          this.schema.unmapper(parsedBody as unknown as Record<string, unknown>, undefined, pluginMapFromMeta as any)
        );
        const unmappedBody = unmappedBodyRaw as unknown as Record<string, unknown>;
        const bodyData = okUnmap ? unmappedBody : {};
        const merged = { ...bodyData, ...unmappedMetadata, id } as ResourceData;
        Object.keys(merged).forEach(k => { (merged as any)[k] = fixValue((merged as any)[k]); });
        return filterInternalFields(merged as StringRecord) as ResourceData;
      }
    }

    const result = { ...unmappedMetadata, id } as ResourceData;
    Object.keys(result).forEach(k => { (result as any)[k] = fixValue((result as any)[k]); });
    const filtered = filterInternalFields(result as StringRecord) as ResourceData;
    if (behaviorFlags.$truncated) {
      (filtered as any).$truncated = behaviorFlags.$truncated;
    }
    if (behaviorFlags.$overflow) {
      (filtered as any).$overflow = behaviorFlags.$overflow;
    }
    return filtered;
  }

  _normalizeGuard(guard: GuardConfig): GuardConfig | null {
    const tempGuards = new ResourceGuards(this as any, { guard });
    return tempGuards.getGuard();
  }

  async executeGuard(operation: string, context: GuardContext, resource: ResourceData | null = null): Promise<boolean> {
    return this._guards.execute(operation, context, resource);
  }

  _checkRolesScopes(requiredRolesScopes: string[], user: JWTUser): boolean {
    return (this._guards as any)._checkRolesScopes(requiredRolesScopes, user);
  }

  _initMiddleware(): void {
    if (!this._middleware) {
      this._middleware = new ResourceMiddleware(this as any);
    }
    this._middleware.init();
  }

  useMiddleware(method: SupportedMethod, fn: MiddlewareFunction): void {
    this._middleware.use(method, fn);
  }

  applyDefaults(data: Record<string, unknown>): Record<string, unknown> {
    this._ensureSchemaCompiled();
    return this.validator.applyDefaults(data);
  }

  async getSequenceValue(fieldName: string = 'id'): Promise<number | null> {
    return this._idGenerator.getSequenceValue(fieldName);
  }

  async resetSequence(fieldName: string, value: number): Promise<boolean> {
    return this._idGenerator.resetSequence(fieldName, value);
  }

  async listSequences(): Promise<SequenceInfo[] | null> {
    return this._idGenerator.listSequences();
  }

  async reserveIdBatch(count: number = 100): Promise<{ start: number; end: number; current: number } | null> {
    return this._idGenerator.reserveIdBatch(count);
  }

  getBatchStatus(fieldName: string = 'id'): { start: number; end: number; current: number; remaining: number } | null {
    return this._idGenerator.getBatchStatus(fieldName);
  }

  releaseBatch(fieldName: string = 'id'): void {
    this._idGenerator.releaseBatch(fieldName);
  }

  dispose(): void {
    if (this.schema) {
      this.schema.dispose();
    }

    this.emit('resource:disposed', { resourceName: this.name });

    this.removeAllListeners();
  }
}

export default Resource;

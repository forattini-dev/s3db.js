import { Plugin } from './plugin.class.js';
import { Resource } from '../resource.class.js'; // Assuming Resource is a class
import { requirePluginDependency } from './concerns/plugin-dependencies.js';
import tryFn from '../concerns/try-fn.js';
import { getCronManager } from '../concerns/cron-manager.js';
import { createLogger } from '../concerns/logger.js';

import { RegressionModel } from './ml/regression-model.class.js';
import { ClassificationModel } from './ml/classification-model.class.js';
import { TimeSeriesModel } from './ml/timeseries-model.class.js';
import { NeuralNetworkModel } from './ml/neural-network-model.class.js';

import {
  MLError,
  ModelConfigError,
  ModelNotFoundError,
  TrainingError,
  TensorFlowDependencyError
} from './ml.errors.js'; // Import from TS version

export interface ModelConfig {
  type: 'regression' | 'classification' | 'timeseries' | 'neural-network';
  resource: string;
  features: string[];
  target: string;
  partition?: { name: string; values: Record<string, any> };
  autoTrain?: boolean;
  trainInterval?: number;
  trainAfterInserts?: number;
  saveModel?: boolean;
  saveTrainingData?: boolean;
  modelConfig?: Record<string, any>;
  filter?: (item: any) => boolean;
  map?: (item: any) => any;
  [key: string]: any;
}

export interface MLPluginOptions {
  models?: Record<string, ModelConfig>;
  verbose?: boolean;
  minTrainingSamples?: number;
  saveModel?: boolean;
  saveTrainingData?: boolean;
  enableVersioning?: boolean;
  logger?: any;
  logLevel?: string;
}

export interface ModelStats {
  loss?: number;
  accuracy?: number;
  r2?: number;
  samples?: number;
  isTrained?: boolean;
  // Add other stats as needed
}

export interface ModelInstance {
  isTrained: boolean;
  dispose?: () => void;
  export: () => Promise<any>;
  import: (data: any) => Promise<void>;
  train: (data: any[]) => Promise<any>;
  predict: (input: any) => Promise<any>;
  predictBatch: (inputs: any[]) => Promise<any[]>;
  getStats: () => ModelStats;
}

export class MLPlugin extends Plugin {
  config: Required<MLPluginOptions> & { models: Record<string, ModelConfig> };
  models: Record<string, ModelInstance>;
  _dependenciesValidated: boolean;
  modelVersions: Map<string, { currentVersion: number; latestVersion: number }>;
  modelCache: Map<string, string>;
  training: Map<string, boolean>;
  insertCounters: Map<string, number>;
  _pendingAutoTrainingHandlers: Map<string, (createdName: string) => void>;
  _autoTrainingInitialized: Set<string>;
  override cronManager: any; // CronManager type not explicitly defined
  jobNames: Map<string, string>;
  stats: {
    totalTrainings: number;
    totalPredictions: number;
    totalErrors: number;
    startedAt: string | null;
  };

  constructor(options: MLPluginOptions = {}) {
    super(options as any);

    // 🪵 Logger initialization
    if (options.logger) {
      this.logger = options.logger;
    } else {
      const logLevel = (this as any).logLevel || 'info';
      this.logger = createLogger({ name: 'MLPlugin', level: logLevel });
    }

    const {
      models = {},
      minTrainingSamples = 10,
      saveModel = true,
      saveTrainingData = false,
      enableVersioning = true,
      ...rest
    } = options;

    this.config = {
      models: models as Record<string, ModelConfig>,
      logLevel: (this as any).logLevel,
      minTrainingSamples,
      saveModel,
      saveTrainingData,
      enableVersioning,
      ...rest
    } as Required<MLPluginOptions> & { models: Record<string, ModelConfig> };

    // Model instances
    this.models = {};

    // Dependency validation flag (lazy validation)
    this._dependenciesValidated = false;

    // Model versioning
    this.modelVersions = new Map(); // Track versions per model: { currentVersion, latestVersion }

    // Model cache for resource.predict() 
    this.modelCache = new Map(); // Cache: resourceName_attribute -> modelName

    // Training state
    this.training = new Map(); // Track ongoing training
    this.insertCounters = new Map(); // Track inserts per resource
    this._pendingAutoTrainingHandlers = new Map();
    this._autoTrainingInitialized = new Set();

    // Cron manager and job names for auto-training
    this.cronManager = getCronManager();
    this.jobNames = new Map(); // Map modelName -> cronJobName

    // Stats
    this.stats = {
      totalTrainings: 0,
      totalPredictions: 0,
      totalErrors: 0,
      startedAt: null
    };
  }

  /**
   * Install the plugin
   */
  override async onInstall(): Promise<void> {
    this.logger.debug('Installing ML Plugin...');

    // Validate plugin dependencies (lazy validation)
    if (!this._dependenciesValidated) {
      // Try direct import first (works better with Jest ESM)
      let tfAvailable = false;
      try {
        await import('@tensorflow/tfjs-node');
        tfAvailable = true;
        this.logger.debug('TensorFlow.js loaded successfully');
      } catch (directImportErr) {
        // Fallback to plugin dependency check
        const result = await requirePluginDependency('ml-plugin', {
          throwOnError: false,
          checkVersions: true
        });

        if (!result.valid) {
          throw new TensorFlowDependencyError(
            'TensorFlow.js dependency not found. Install with: pnpm add @tensorflow/tfjs-node\n' +
            result.messages.join('\n')
          );
        }
        tfAvailable = result.valid;
      }

      if (!tfAvailable) {
        throw new TensorFlowDependencyError(
          'TensorFlow.js dependency not found. Install with: pnpm add @tensorflow/tfjs-node'
        );
      }

      this._dependenciesValidated = true;
    }

    // Validate model configurations
    for (const [modelName, modelConfig] of Object.entries(this.config.models)) {
      this._validateModelConfig(modelName, modelConfig);
    }

    // Initialize models
    for (const [modelName, modelConfig] of Object.entries(this.config.models)) {
      await this._initializeModel(modelName, modelConfig);
    }

    // Build model cache (resource -> attribute -> modelName mapping)
    this._buildModelCache();

    // Inject ML methods into Resource prototype
    this._injectResourceMethods();

    // Setup auto-training hooks
    for (const [modelName, modelConfig] of Object.entries(this.config.models)) {
      if (modelConfig.autoTrain) {
        this._setupAutoTraining(modelName, modelConfig);
      }
    }

    this.stats.startedAt = new Date().toISOString();

    this.logger.debug(
      { modelCount: Object.keys(this.models).length },
      `Installed with ${Object.keys(this.models).length} models`
    );

    this.emit('db:plugin:installed', {
      plugin: 'MLPlugin',
      models: Object.keys(this.models)
    });
  }

  /**
   * Start the plugin
   */
  override async onStart(): Promise<void> {
    // Initialize versioning for each model
    if (this.config.enableVersioning) {
      for (const modelName of Object.keys(this.models)) {
        await this._initializeVersioning(modelName);
      }
    }

    // Try to load previously trained models
    for (const modelName of Object.keys(this.models)) {
      await this._loadModel(modelName);
    }

    this.logger.debug('Started');
  }

  /**
   * Stop the plugin
   */
  override async onStop(): Promise<void> {
    // Stop all cron jobs
    for (const [modelName, jobName] of this.jobNames.entries()) {
      this.cronManager.stop(jobName);
    }
    this.jobNames.clear();

    // Dispose all models
    for (const [modelName, model] of Object.entries(this.models)) {
      if (model && model.dispose) {
        model.dispose();
      }
    }

    // Remove pending auto-training handlers
    for (const handler of this._pendingAutoTrainingHandlers.values()) {
      (this as any).database.off('db:resource-created', handler);
    }
    this._pendingAutoTrainingHandlers.clear();
    this._autoTrainingInitialized.clear();

    this.logger.debug('Stopped');
  }

  /**
   * Uninstall the plugin
   */
  override async onUninstall(options: { purgeData?: boolean } = {}): Promise<void> {
    await this.onStop();

    if (options.purgeData) {
      // Delete all saved models and training data from plugin storage
      for (const modelName of Object.keys(this.models)) {
        await this._deleteModel(modelName);
        await this._deleteTrainingData(modelName);
      }

      this.logger.debug('Purged all model data and training data');
    }
  }

  /**
   * Build model cache for fast lookup
   * @private
   */
  _buildModelCache(): void {
    for (const [modelName, modelConfig] of Object.entries(this.config.models)) {
      const cacheKey = `${modelConfig.resource}_${modelConfig.target}`;
      this.modelCache.set(cacheKey, modelName);

      this.logger.debug(
        { modelName, resource: modelConfig.resource, target: modelConfig.target },
        `Cached model "${modelName}" for ${modelConfig.resource}.predict(..., '${modelConfig.target}')`
      );
    }
  }

  /**
   * Inject ML methods into Resource prototype
   * @private
   */
  _injectResourceMethods(): void {
    const plugin = this;

    // Store reference to plugin in database for resource access
    if (!(this as any).database._mlPlugin) {
      (this as any).database._mlPlugin = this;
    }

    // Create namespace "ml" on Resource prototype
    if (!Object.prototype.hasOwnProperty.call(Resource.prototype, 'ml')) {
      Object.defineProperty(Resource.prototype, 'ml', {
        get() {
          const resource = this as Resource;
          const mlPlugin = (resource as any).database?._mlPlugin as MLPlugin;

          if (!mlPlugin) {
            throw new MLError('MLPlugin is not installed on this database instance', {
              pluginName: 'MLPlugin',
              operation: 'Resource.ml accessor',
              statusCode: 400,
              retriable: false,
              suggestion: 'Install MLPlugin via db.usePlugin(new MLPlugin(...)) before calling resource.ml.* methods.'
            });
          }

          return {
            /**
             * Auto-setup and train ML model (zero-config)
             * @param target - Target attribute to predict
             * @param options - Configuration options
             * @returns Training results
             */
            learn: async (target: string, options: any = {}) => {
              return await mlPlugin._resourceLearn(resource.name, target, options);
            },

            /**
             * Make prediction
             * @param input - Input features
             * @param target - Target attribute
             * @returns Prediction result
             */
            predict: async (input: any, target: string) => {
              return await mlPlugin._resourcePredict(resource.name, input, target);
            },

            /**
             * Train model manually
             * @param target - Target attribute
             * @param options - Training options
             * @returns Training results
             */
            train: async (target: string, options: any = {}) => {
              return await mlPlugin._resourceTrainModel(resource.name, target, options);
            },

            /**
             * List all models for this resource
             * @returns List of models
             */
            list: () => {
              return mlPlugin._resourceListModels(resource.name);
            },

            /**
             * List model versions
             * @param target - Target attribute
             * @returns List of versions
             */
            versions: async (target: string) => {
              const modelName = mlPlugin._findModelForResource(resource.name, target);
              if (!modelName) {
                throw new ModelNotFoundError(
                  `No model found for resource "${resource.name}" with target "${target}"`, 
                  { resourceName: resource.name, targetAttribute: target }
                );
              }
              return await mlPlugin.listModelVersions(modelName);
            },

            /**
             * Rollback to previous version
             * @param target - Target attribute
             * @param version - Version to rollback to (optional)
             * @returns Rollback info
             */
            rollback: async (target: string, version: number | null = null) => {
              const modelName = mlPlugin._findModelForResource(resource.name, target);
              if (!modelName) {
                throw new ModelNotFoundError(
                  `No model found for resource "${resource.name}" with target "${target}"`, 
                  { resourceName: resource.name, targetAttribute: target }
                );
              }
              return await mlPlugin.rollbackVersion(modelName, version);
            },

            /**
             * Compare two versions
             * @param target - Target attribute
             * @param v1 - First version
             * @param v2 - Second version
             * @returns Comparison results
             */
            compare: async (target: string, v1: number, v2: number) => {
              const modelName = mlPlugin._findModelForResource(resource.name, target);
              if (!modelName) {
                throw new ModelNotFoundError(
                  `No model found for resource "${resource.name}" with target "${target}"`, 
                  { resourceName: resource.name, targetAttribute: target }
                );
              }
              return await mlPlugin.compareVersions(modelName, v1, v2);
            },

            /**
             * Get model statistics
             * @param target - Target attribute
             * @returns Model stats
             */
            stats: (target: string) => {
              const modelName = mlPlugin._findModelForResource(resource.name, target);
              if (!modelName) {
                throw new ModelNotFoundError(
                  `No model found for resource "${resource.name}" with target "${target}"`, 
                  { resourceName: resource.name, targetAttribute: target }
                );
              }
              return mlPlugin.getModelStats(modelName);
            },

            /**
             * Export model
             * @param target - Target attribute
             * @returns Exported model
             */
            export: async (target: string) => {
              const modelName = mlPlugin._findModelForResource(resource.name, target);
              if (!modelName) {
                throw new ModelNotFoundError(
                  `No model found for resource "${resource.name}" with target "${target}"`, 
                  { resourceName: resource.name, targetAttribute: target }
                );
              }
              return await mlPlugin.exportModel(modelName);
            },

            /**
             * Import model
             * @param target - Target attribute
             * @param data - Model data
             */
            import: async (target: string, data: any) => {
              const modelName = mlPlugin._findModelForResource(resource.name, target);
              if (!modelName) {
                throw new ModelNotFoundError(
                  `No model found for resource "${resource.name}" with target "${target}"`, 
                  { resourceName: resource.name, targetAttribute: target }
                );
              }
              return await mlPlugin.importModel(modelName, data);
            }
          };
        },
        configurable: true
      });
    }
  }

  /**
   * Find model for a resource and target attribute
   * @private
   */
  _findModelForResource(resourceName: string, targetAttribute: string): string | null {
    const cacheKey = `${resourceName}_${targetAttribute}`;

    // Try cache first
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!;
    }

    // Search through all models
    for (const [modelName, modelConfig] of Object.entries(this.config.models)) {
      if (modelConfig.resource === resourceName && modelConfig.target === targetAttribute) {
        // Cache for next time
        this.modelCache.set(cacheKey, modelName);
        return modelName;
      }
    }

    return null;
  }

  /**
   * Auto-setup and train ML model (resource.ml.learn implementation)
   * @param resourceName - Resource name
   * @param target - Target attribute to predict
   * @param options - Configuration options
   * @returns Training results
   * @private
   */
  async _resourceLearn(resourceName: string, target: string, options: any = {}): Promise<any> {
    // Check if model already exists
    let modelName = this._findModelForResource(resourceName, target);

    if (modelName) {
      // Model exists, just retrain
      this.logger.debug({ modelName }, `Model "${modelName}" already exists, retraining...`);
      return await this.train(modelName, options);
    }

    // Create new model dynamically
    modelName = `${resourceName}_${target}_auto`;

    this.logger.debug(
      { modelName, resource: resourceName, target },
      `Auto-creating model "${modelName}" for ${resourceName}.${target}...`
    );

    // Get resource
    const resource = (this as any).database.resources[resourceName];
    if (!resource) {
      throw new ModelConfigError(
        `Resource "${resourceName}" not found`,
        { resourceName, availableResources: Object.keys((this as any).database.resources) }
      );
    }

    // Auto-detect type if not specified
    let modelType = options.type;
    if (!modelType) {
      modelType = await this._autoDetectType(resourceName, target);
      this.logger.debug({ modelType }, `Auto-detected type: ${modelType}`);
    }

    // Auto-select features if not specified
    let features = options.features;
    if (!features || features.length === 0) {
      features = await this._autoSelectFeatures(resourceName, target);
      this.logger.debug({ features }, `Auto-selected features: ${features.join(', ')}`);
    }

    // Get sample count to adjust batchSize automatically
    const [samplesOk, samplesErr, sampleData] = await tryFn(() => resource.list());
    const sampleCount = (samplesOk && sampleData) ? sampleData.length : 0;

    // Get default model config and adjust batchSize based on available data
    let defaultModelConfig = this._getDefaultModelConfig(modelType);

    // Check if user explicitly provided batchSize
    const userProvidedBatchSize = options.modelConfig && options.modelConfig.batchSize !== undefined;

    if (!userProvidedBatchSize && sampleCount > 0 && sampleCount < defaultModelConfig.batchSize) {
      // Adjust batchSize to be at most half of available samples (only if user didn't provide one)
      defaultModelConfig.batchSize = Math.max(4, Math.floor(sampleCount / 2));
      this.logger.debug(
        { batchSize: defaultModelConfig.batchSize, sampleCount },
        `Auto-adjusted batchSize to ${defaultModelConfig.batchSize} based on ${sampleCount} samples`
      );
    }

    // Merge custom modelConfig with defaults
    // If user didn't provide batchSize, keep the auto-adjusted one from defaultModelConfig
    const customModelConfig = options.modelConfig || {};
    const mergedModelConfig = {
      ...defaultModelConfig,
      ...customModelConfig,
      // Preserve auto-adjusted batchSize if user didn't provide one
      ...(!userProvidedBatchSize && { batchSize: defaultModelConfig.batchSize })
    };

    // Create model config
    const modelConfig: ModelConfig = {
      type: modelType,
      resource: resourceName,
      features: features,
      target: target,
      autoTrain: options.autoTrain !== undefined ? options.autoTrain : false,
      saveModel: options.saveModel !== undefined ? options.saveModel : true,
      saveTrainingData: options.saveTrainingData !== undefined ? options.saveTrainingData : false,
      modelConfig: mergedModelConfig,
      ...options
    };

    // Register model
    this.config.models[modelName] = modelConfig;

    // Initialize model
    await this._initializeModel(modelName, modelConfig);

    // Update cache
    this._buildModelCache();

    // Train immediately
    this.logger.debug({ modelName }, `Training model "${modelName}"...`);

    const result = await this.train(modelName, options);

    this.logger.debug({ modelName }, `✅ Model "${modelName}" ready!`);

    return {
      modelName,
      type: modelType,
      features,
      target,
      ...result
    };
  }

  /**
   * Auto-detect model type based on target attribute
   * @param resourceName - Resource name
   * @param target - Target attribute
   * @returns Model type
   * @private
   */
  async _autoDetectType(resourceName: string, target: string): Promise<string> {
    const resource = (this as any).database.resources[resourceName];

    // Get some sample data
    const [ok, err, samples] = await tryFn(() => resource.list({ limit: 100 }));

    if (!ok || !samples || samples.length === 0) {
      // Default to regression if no data
      return 'regression';
    }

    // Analyze target values
    const targetValues = samples.map((s: any) => s[target]).filter((v: any) => v != null);

    if (targetValues.length === 0) {
      return 'regression';
    }

    // Check if numeric
    const isNumeric = targetValues.every((v: any) => typeof v === 'number');

    if (isNumeric) {
      // Check for time series (if data has timestamp)
      const hasTimestamp = samples.every((s: any) => s.timestamp || s.createdAt || s.date);
      if (hasTimestamp) {
        return 'timeseries';
      }
      return 'regression';
    }

    // Check if categorical (strings/booleans)
    const isCategorical = targetValues.every((v: any) => typeof v === 'string' || typeof v === 'boolean');

    if (isCategorical) {
      return 'classification';
    }

    // Default
    return 'regression';
  }

  /**
   * Auto-select best features for prediction
   * @param resourceName - Resource name
   * @param target - Target attribute
   * @returns Selected features
   * @private
   */
  async _autoSelectFeatures(resourceName: string, target: string): Promise<string[]> {
    const resource = (this as any).database.resources[resourceName];

    // Get all numeric attributes from schema
    const schema = resource.schema;
    const attributes = schema?.attributes || {};

    const numericFields: string[] = [];

    for (const [fieldName, fieldDef] of Object.entries(attributes)) {
      // Skip target
      if (fieldName === target) continue;

      // Skip system fields
      if (['id', 'createdAt', 'updatedAt', 'createdBy'].includes(fieldName)) continue;

      // Check if numeric type
      const fieldType = typeof fieldDef === 'string' ? fieldDef.split('|')[0] : (fieldDef as any).type;

      if (fieldType === 'number' || fieldType === 'integer' || fieldType === 'float') {
        numericFields.push(fieldName);
      }
    }

    // If no numeric fields found, try to detect from data
    if (numericFields.length === 0) {
      const [ok, err, samples] = await tryFn(() => resource.list({ limit: 10 }));

      if (ok && samples && samples.length > 0) {
        const firstSample = samples[0];

        for (const [key, value] of Object.entries(firstSample)) {
          if (key === target) continue;
          if (['id', 'createdAt', 'updatedAt', 'createdBy'].includes(key)) continue;

          if (typeof value === 'number') {
            numericFields.push(key);
          }
        }
      }
    }

    if (numericFields.length === 0) {
      throw new ModelConfigError(
        `No numeric features found for target "${target}" in resource "${resourceName}"`, 
        { resourceName, target, availableAttributes: Object.keys(attributes) }
      );
    }

    return numericFields;
  }

  /**
   * Get default model config for type
   * @param type - Model type
   * @returns Default config
   * @private
   */
  _getDefaultModelConfig(type: string): Record<string, any> {
    const defaults: Record<string, any> = {
      regression: {
        epochs: 50,
        batchSize: 32,
        learningRate: 0.01,
        validationSplit: 0.2,
        polynomial: 1
      },
      classification: {
        epochs: 50,
        batchSize: 32,
        learningRate: 0.01,
        validationSplit: 0.2,
        units: 64,
        dropout: 0.2
      },
      timeseries: {
        epochs: 50,
        batchSize: 16,
        learningRate: 0.001,
        validationSplit: 0.2,
        lookback: 10,
        lstmUnits: 50
      },
      'neural-network': {
        epochs: 50,
        batchSize: 32,
        learningRate: 0.01,
        validationSplit: 0.2,
        layers: [
          { units: 64, activation: 'relu', dropout: 0.2 },
          { units: 32, activation: 'relu' }
        ]
      }
    };

    return defaults[type] || defaults.regression;
  }

  /**
   * Resource predict implementation
   * @private
   */
  async _resourcePredict(resourceName: string, input: any, targetAttribute: string): Promise<any> {
    const modelName = this._findModelForResource(resourceName, targetAttribute);

    if (!modelName) {
      throw new ModelNotFoundError(
        `No model found for resource "${resourceName}" with target "${targetAttribute}"`, 
        { resourceName, targetAttribute, availableModels: Object.keys(this.models) }
      );
    }

    this.logger.debug(
      { resourceName, targetAttribute, modelName },
      `Resource prediction: ${resourceName}.predict(..., '${targetAttribute}') -> model "${modelName}"`
    );

    return await this.predict(modelName, input);
  }

  /**
   * Resource trainModel implementation
   * @private
   */
  async _resourceTrainModel(resourceName: string, targetAttribute: string, options: any = {}): Promise<any> {
    const modelName = this._findModelForResource(resourceName, targetAttribute);

    if (!modelName) {
      throw new ModelNotFoundError(
        `No model found for resource "${resourceName}" with target "${targetAttribute}"`, 
        { resourceName, targetAttribute, availableModels: Object.keys(this.models) }
      );
    }

    this.logger.debug(
      { resourceName, targetAttribute, modelName },
      `Resource training: ${resourceName}.trainModel('${targetAttribute}') -> model "${modelName}"`
    );

    return await this.train(modelName, options);
  }

  /**
   * List models for a resource
   * @private
   */
  _resourceListModels(resourceName: string): any[] {
    const models: any[] = [];

    for (const [modelName, modelConfig] of Object.entries(this.config.models)) {
      if (modelConfig.resource === resourceName) {
        models.push({
          name: modelName,
          type: modelConfig.type,
          target: modelConfig.target,
          features: modelConfig.features,
          isTrained: this.models[modelName]?.isTrained || false
        });
      }
    }

    return models;
  }

  /**
   * Validate model configuration
   * @private
   */
  _validateModelConfig(modelName: string, config: ModelConfig): void {
    const validTypes = ['regression', 'classification', 'timeseries', 'neural-network'];

    if (!config.type || !validTypes.includes(config.type)) {
      throw new ModelConfigError(
        `Model "${modelName}" must have a valid type: ${validTypes.join(', ')}`,
        { modelName, type: config.type, validTypes }
      );
    }

    if (!config.resource) {
      throw new ModelConfigError(
        `Model "${modelName}" must specify a resource`,
        { modelName }
      );
    }

    if (!config.features || !Array.isArray(config.features) || config.features.length === 0) {
      throw new ModelConfigError(
        `Model "${modelName}" must specify at least one feature`,
        { modelName, features: config.features }
      );
    }

    if (!config.target) {
      throw new ModelConfigError(
        `Model "${modelName}" must specify a target field`,
        { modelName }
      );
    }
  }

  /**
   * Initialize a model instance
   * @private
   */
  async _initializeModel(modelName: string, config: ModelConfig): Promise<void> {
    const modelOptions = {
      name: modelName,
      resource: config.resource,
      features: config.features,
      target: config.target,
      minSamples: config.minSamples ?? this.config.minTrainingSamples,
      modelConfig: config.modelConfig || {},
      logLevel: this.config.logLevel
    };

    try {
      switch (config.type) {
        case 'regression':
          this.models[modelName] = new RegressionModel(modelOptions) as unknown as ModelInstance;
          break;

        case 'classification':
          this.models[modelName] = new ClassificationModel(modelOptions) as unknown as ModelInstance;
          break;

        case 'timeseries':
          this.models[modelName] = new TimeSeriesModel(modelOptions) as unknown as ModelInstance;
          break;

        case 'neural-network':
          this.models[modelName] = new NeuralNetworkModel(modelOptions) as unknown as ModelInstance;
          break;

        default:
          throw new ModelConfigError(
            `Unknown model type: ${config.type}`,
            { modelName, type: config.type }
          );
      }

      this.logger.debug({ modelName, type: config.type }, `Initialized model "${modelName}" (${config.type})`);
    } catch (error: any) {
      this.logger.error({ modelName, error: error.message }, `Failed to initialize model "${modelName}"`);
      throw error;
    }
  }

  /**
   * Setup auto-training for a model
   * @private
  */
  _setupAutoTraining(modelName: string, config: ModelConfig): void {
    if (!this.insertCounters.has(modelName)) {
      this.insertCounters.set(modelName, 0);
    }

    const resource = (this as any).database.resources[config.resource];

    if (!resource) {
      this.logger.warn(
        { resource: config.resource, modelName },
        `Resource "${config.resource}" not found for model "${modelName}". Auto-training will attach when resource is created.`
      );

      if (!this._pendingAutoTrainingHandlers.has(modelName)) {
        const handler = (createdName: string) => {
          if (createdName !== config.resource) {
            return;
          }

          (this as any).database.off('db:resource-created', handler);
          this._pendingAutoTrainingHandlers.delete(modelName);
          this._setupAutoTraining(modelName, config);
        };

        this._pendingAutoTrainingHandlers.set(modelName, handler);
        (this as any).database.on('db:resource-created', handler);
      }
      return;
    }

    if (this._autoTrainingInitialized.has(modelName)) {
      return;
    }

    // Hook: Track inserts
    if (config.trainAfterInserts && config.trainAfterInserts > 0) {
      this.addMiddleware(resource, 'insert', async (next: any, data: any, options: any) => {
        const result = await next(data, options);

        // Increment counter
        const currentCount = this.insertCounters.get(modelName) || 0;
        this.insertCounters.set(modelName, currentCount + 1);

        // Check if we should train
        if (this.insertCounters.get(modelName)! >= config.trainAfterInserts!) {
          this.logger.debug(
            { modelName, insertCount: config.trainAfterInserts },
            `Auto-training "${modelName}" after ${config.trainAfterInserts} inserts`
          );

          // Reset counter
          this.insertCounters.set(modelName, 0);

          // Train asynchronously (don't block insert)
          this.train(modelName).catch(err => {
            this.logger.error(`[MLPlugin] Auto-training failed for "${modelName}":`, err.message);
          });
        }

        return result;
      });
    }

    // Interval-based training
    if (config.trainInterval && config.trainInterval > 0) {
      const jobName = `ml-training-${modelName}-${Date.now()}`;
      this.cronManager.scheduleInterval(
        config.trainInterval,
        async () => {
          this.logger.debug(
            { modelName, trainInterval: config.trainInterval },
            `Auto-training "${modelName}" (interval: ${config.trainInterval}ms)`
          );

          try {
            await this.train(modelName);
          } catch (error: any) {
            this.logger.error(`[MLPlugin] Auto-training failed for "${modelName}":`, error.message);
          }
        },
        jobName
      );

      this.jobNames.set(modelName, jobName);

      this.logger.debug(
        { modelName, trainInterval: config.trainInterval },
        `Setup interval training for "${modelName}" (every ${config.trainInterval}ms)`
      );
    }

    this._autoTrainingInitialized.add(modelName);
  }

  /**
   * Train a model
   * @param modelName - Model name
   * @param options - Training options
   * @returns Training results
   */
  async train(modelName: string, options: any = {}): Promise<any> {
    const model = this.models[modelName];
    if (!model) {
      throw new ModelNotFoundError(
        `Model "${modelName}" not found`,
        { modelName, availableModels: Object.keys(this.models) }
      );
    }

    // Check if already training
    if (this.training.get(modelName)) {
      this.logger.debug({ modelName }, `Model "${modelName}" is already training, skipping...`);
      return { skipped: true, reason: 'already_training' };
    }

    // Mark as training
    this.training.set(modelName, true);

    try {
      // Get model config
      const modelConfig = this.config.models[modelName]!;
      if (!modelConfig) {
        throw new ModelNotFoundError(
          `Model "${modelName}" not found in configuration`,
          { modelName }
        );
      }

      // Get resource
      const resource = (this as any).database.resources[modelConfig.resource];
      if (!resource) {
        throw new ModelNotFoundError(
          `Resource "${modelConfig.resource}" not found`,
          { modelName, resource: modelConfig.resource }
        );
      }

      // Fetch training data (with optional partition filtering)
      this.logger.debug({ modelName }, `Fetching training data for "${modelName}"...`);

      let data;
      const partition = modelConfig.partition;

      if (partition && partition.name) {
        // Use partition filtering
        this.logger.debug(
          { modelName, partition: partition.name, partitionValues: partition.values },
          `Using partition "${partition.name}" with values: ${JSON.stringify(partition.values)}`
        );

        const [ok, err, partitionData] = await tryFn(() =>
          resource.listPartition({
            partition: partition.name,
            partitionValues: partition.values
          })
        );

        if (!ok) {
          throw new TrainingError(
            `Failed to fetch training data from partition: ${err!.message}`,
            { modelName, resource: modelConfig.resource, partition: partition.name, originalError: err!.message }
          );
        }

        data = partitionData;
      } else {
        // Fetch all data
        const [ok, err, allData] = await tryFn(() => resource.list());

        if (!ok) {
          throw new TrainingError(
            `Failed to fetch training data: ${err!.message}`,
            { modelName, resource: modelConfig.resource, originalError: err!.message }
          );
        }

        data = allData;
      }

      // Apply custom filter function if provided
      if (modelConfig.filter && typeof modelConfig.filter === 'function') {
        this.logger.debug({ modelName }, 'Applying custom filter function...');

        const originalLength = data.length;
        data = data.filter(modelConfig.filter);

        this.logger.debug(
          { modelName, originalLength, filteredLength: data.length },
          `Filter reduced dataset from ${originalLength} to ${data.length} samples`
        );
      }

      // Apply custom map function if provided
      if (modelConfig.map && typeof modelConfig.map === 'function') {
        this.logger.debug({ modelName }, 'Applying custom map function...');

        data = data.map(modelConfig.map);
      }

      if (!data || data.length < this.config.minTrainingSamples) {
        throw new TrainingError(
          `Insufficient training data: ${data?.length || 0} samples (minimum: ${this.config.minTrainingSamples})`,
          { modelName, samples: data?.length || 0, minimum: this.config.minTrainingSamples }
        );
      }

      this.logger.debug(
        { modelName, sampleCount: data.length },
        `Training "${modelName}" with ${data.length} samples...`
      );

      // Save intermediate training data if enabled
      const shouldSaveTrainingData = modelConfig.saveTrainingData !== undefined
        ? modelConfig.saveTrainingData
        : this.config.saveTrainingData;

      if (shouldSaveTrainingData) {
        await this._saveTrainingData(modelName, data);
      }

      // Train model
      const result = await model.train(data);

      // Save model to plugin storage if enabled
      const shouldSaveModel = modelConfig.saveModel !== undefined
        ? modelConfig.saveModel
        : this.config.saveModel;

      if (shouldSaveModel) {
        await this._saveModel(modelName);
      }

      this.stats.totalTrainings++;

      this.logger.debug(
        { modelName, result },
        `Training completed for "${modelName}": ${JSON.stringify(result)}`
      );

      this.emit('plg:ml:model-trained', {
        modelName,
        type: modelConfig.type,
        result
      });

      return result;
    } catch (error: any) {
      this.stats.totalErrors++;

      if (error instanceof MLError) {
        throw error;
      }

      throw new TrainingError(
        `Training failed for "${modelName}": ${error.message}`,
        { modelName, originalError: error.message }
      );
    } finally {
      this.training.set(modelName, false);
    }
  }

  /**
   * Make a prediction
   * @param modelName - Model name
   * @param input - Input data (object for single prediction, array for time series)
   * @returns Prediction result
   */
  async predict(modelName: string, input: any): Promise<any> {
    const model = this.models[modelName];
    if (!model) {
      throw new ModelNotFoundError(
        `Model "${modelName}" not found`,
        { modelName, availableModels: Object.keys(this.models) }
      );
    }

    try {
      const result = await model.predict(input);
      this.stats.totalPredictions++;

      this.emit('plg:ml:prediction', {
        modelName,
        input,
        result
      });

      return result;
    } catch (error) {
      this.stats.totalErrors++;
      throw error;
    }
  }

  /**
   * Make predictions for multiple inputs
   * @param modelName - Model name
   * @param inputs - Array of input objects
   * @returns Array of prediction results
   */
  async predictBatch(modelName: string, inputs: any[]): Promise<any[]> {
    const model = this.models[modelName];
    if (!model) {
      throw new ModelNotFoundError(
        `Model "${modelName}" not found`,
        { modelName, availableModels: Object.keys(this.models) }
      );
    }

    return await model.predictBatch(inputs);
  }

  /**
   * Retrain a model (reset and train from scratch)
   * @param modelName - Model name
   * @param options - Options
   * @returns Training results
   */
  async retrain(modelName: string, options: any = {}): Promise<any> {
    const model = this.models[modelName];
    if (!model) {
      throw new ModelNotFoundError(
        `Model "${modelName}" not found`,
        { modelName, availableModels: Object.keys(this.models) }
      );
    }

    // Dispose current model
    if (model.dispose) {
      model.dispose();
    }

    // Re-initialize
    const modelConfig = this.config.models[modelName]!;
    await this._initializeModel(modelName, modelConfig);

    // Train
    return await this.train(modelName, options);
  }

  /**
   * Get model statistics
   * @param modelName - Model name
   * @returns Model stats
   */
  getModelStats(modelName: string): ModelStats {
    const model = this.models[modelName];
    if (!model) {
      throw new ModelNotFoundError(
        `Model "${modelName}" not found`,
        { modelName, availableModels: Object.keys(this.models) }
      );
    }

    return model.getStats();
  }

  /**
   * Get plugin statistics
   * @returns Plugin stats
   */
  getStats(): any {
    return {
      ...this.stats,
      models: Object.keys(this.models).length,
      trainedModels: Object.values(this.models).filter(m => m.isTrained).length
    };
  }

  /**
   * Export a model
   * @param modelName - Model name
   * @returns Serialized model
   */
  async exportModel(modelName: string): Promise<any> {
    const model = this.models[modelName];
    if (!model) {
      throw new ModelNotFoundError(
        `Model "${modelName}" not found`,
        { modelName, availableModels: Object.keys(this.models) }
      );
    }

    return await model.export();
  }

  /**
   * Import a model
   * @param modelName - Model name
   * @param data - Serialized model data
   */
  async importModel(modelName: string, data: any): Promise<void> {
    const model = this.models[modelName];
    if (!model) {
      throw new ModelNotFoundError(
        `Model "${modelName}" not found`,
        { modelName, availableModels: Object.keys(this.models) }
      );
    }

    await model.import(data);

    // Save to plugin storage
    await this._saveModel(modelName);

    this.logger.debug({ modelName }, `Imported model "${modelName}"`);
  }

  /**
   * Initialize versioning for a model
   * @private
   */
  async _initializeVersioning(modelName: string): Promise<void> {
    try {
      const storage = (this as any).getStorage();
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;
      const [ok, err, versionInfo] = await tryFn(() =>
        storage.get(storage.getPluginKey(resourceName, 'metadata', modelName, 'versions'))
      );

      if (ok && versionInfo) {
        // Load existing version info
        this.modelVersions.set(modelName, {
          currentVersion: versionInfo.currentVersion || 1,
          latestVersion: versionInfo.latestVersion || 1
        });

        this.logger.debug(
          { modelName, version: versionInfo.currentVersion },
          `Loaded version info for "${modelName}": v${versionInfo.currentVersion}`
        );
      } else {
        // Initialize new versioning
        this.modelVersions.set(modelName, {
          currentVersion: 1,
          latestVersion: 0  // No versions yet
        });

        this.logger.debug({ modelName }, `Initialized versioning for "${modelName}"`);
      }
    } catch (error: any) {
      this.logger.error(`[MLPlugin] Failed to initialize versioning for "${modelName}":`, error.message);
      // Fallback to v1
      this.modelVersions.set(modelName, { currentVersion: 1, latestVersion: 0 });
    }
  }

  /**
   * Get next version number for a model
   * @private
   */
  _getNextVersion(modelName: string): number {
    const versionInfo = this.modelVersions.get(modelName) || { latestVersion: 0 };
    return versionInfo.latestVersion + 1;
  }

  /**
   * Update version info in storage
   * @private
   */
  async _updateVersionInfo(modelName: string, version: number): Promise<void> {
    try {
      const storage = (this as any).getStorage();
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;
      const versionInfo = this.modelVersions.get(modelName) || { currentVersion: 1, latestVersion: 0 };

      versionInfo.latestVersion = Math.max(versionInfo.latestVersion, version);
      versionInfo.currentVersion = version; // Set new version as current

      this.modelVersions.set(modelName, versionInfo);

      await storage.set(
        storage.getPluginKey(resourceName, 'metadata', modelName, 'versions'),
        {
          modelName,
          currentVersion: versionInfo.currentVersion,
          latestVersion: versionInfo.latestVersion,
          updatedAt: new Date().toISOString()
        },
        { behavior: 'body-overflow' }
      );

      this.logger.debug(
        { modelName, currentVersion: versionInfo.currentVersion, latestVersion: versionInfo.latestVersion },
        `Updated version info for "${modelName}": current=v${versionInfo.currentVersion}, latest=v${versionInfo.latestVersion}`
      );
    } catch (error: any) {
      this.logger.error(`[MLPlugin] Failed to update version info for "${modelName}":`, error.message);
    }
  }

  /**
   * Save model to plugin storage
   * @private
   */
  async _saveModel(modelName: string): Promise<void> {
    try {
      const storage = (this as any).getStorage();
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;
      const exportedModel = await this.models[modelName]!.export();

      if (!exportedModel) {
        this.logger.debug({ modelName }, `Model "${modelName}" not trained, skipping save`);
        return;
      }

      const modelStats = this.models[modelName]!.getStats();
      const timestamp = new Date().toISOString();
      const enableVersioning = this.config.enableVersioning;

      if (enableVersioning) {
        // Save with version
        const version = this._getNextVersion(modelName);

        // Save versioned model binary to S3 body
        await storage.set(
          storage.getPluginKey(resourceName, 'models', modelName, `v${version}`),
          {
            modelName,
            version,
            type: 'model',
            modelData: exportedModel, // TensorFlow.js model object (will go to body)
            metrics: {
              loss: modelStats.loss,
              accuracy: modelStats.accuracy,
              samples: modelStats.samples
            },
            savedAt: timestamp
          },
          { behavior: 'body-only' } // Large binary data goes to S3 body
        );

        // Update version info
        await this._updateVersionInfo(modelName, version);

        // Save active reference (points to current version)
        await storage.set(
          storage.getPluginKey(resourceName, 'metadata', modelName, 'active'),
          {
            modelName,
            version,
            type: 'reference',
            updatedAt: new Date().toISOString()
          },
          { behavior: 'body-overflow' } // Small metadata
        );

        this.logger.debug(
          { modelName, version, resourceName },
          `Saved model "${modelName}" v${version} to S3 (resource=${resourceName}/plugin=ml/models/${modelName}/v${version})`
        );
      } else {
        // Save without versioning (legacy behavior)
        await storage.set(
          storage.getPluginKey(resourceName, 'models', modelName, 'latest'),
          {
            modelName,
            type: 'model',
            modelData: exportedModel,
            metrics: {
              loss: modelStats.loss,
              accuracy: modelStats.accuracy,
              samples: modelStats.samples
            },
            savedAt: timestamp
          },
          { behavior: 'body-only' }
        );

        this.logger.debug(
          { modelName, resourceName },
          `Saved model "${modelName}" to S3 (resource=${resourceName}/plugin=ml/models/${modelName}/latest)`
        );
      }

      // Legacy compatibility record (flat key: model_{modelName})
      const activeVersion = enableVersioning
        ? (this.modelVersions.get(modelName)?.latestVersion || 1)
        : undefined;

      const compatibilityData = enableVersioning
        ? {
            storageKey: storage.getPluginKey(resourceName, 'models', modelName, `v${activeVersion}`),
            version: activeVersion
          }
        : exportedModel;

      await storage.set(
        `model_${modelName}`,
        {
          modelName,
          type: 'model',
          data: compatibilityData,
          metrics: {
            loss: modelStats.loss,
            accuracy: modelStats.accuracy,
            samples: modelStats.samples
          },
          savedAt: timestamp
        },
        { behavior: enableVersioning ? 'body-overflow' : 'body-only' }
      );
    } catch (error: any) {
      this.logger.error(`[MLPlugin] Failed to save model "${modelName}":`, error.message);
    }
  }

  /**
   * Save intermediate training data to plugin storage (incremental - only new samples)
   * @private
   */
  async _saveTrainingData(modelName: string, rawData: any[]): Promise<void> {
    try {
      const storage = (this as any).getStorage();
      const model = this.models[modelName]!;
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;
      const modelStats = model.getStats();
      const enableVersioning = this.config.enableVersioning;

      // Extract features and target from raw data
      const processedData = rawData.map(item => {
        const features: Record<string, any> = {};
        modelConfig.features.forEach(feature => {
          features[feature] = item[feature];
        });
        return {
          id: item.id || `${Date.now()}_${Math.random()}`, // Use record ID or generate
          features,
          target: item[modelConfig.target]
        };
      });

      if (enableVersioning) {
        const version = this._getNextVersion(modelName);

        // Load existing history to calculate incremental data
        const [ok, err, existing] = await tryFn(() =>
          storage.get(storage.getPluginKey(resourceName, 'training', 'history', modelName))
        );

        let history: any[] = [];
        let previousSampleIds = new Set<string>();

        if (ok && existing && existing.history) {
          history = existing.history;
          // Collect all IDs from previous versions
          history.forEach(entry => {
            if (entry.sampleIds) {
              entry.sampleIds.forEach((id: string) => previousSampleIds.add(id));
            }
          });
        }

        // Detect new samples (not in previous versions)
        const currentSampleIds = new Set(processedData.map(d => d.id));
        const newSamples = processedData.filter(d => !previousSampleIds.has(d.id));
        const newSampleIds = newSamples.map(d => d.id);

        // Save only NEW samples to S3 body (incremental)
        if (newSamples.length > 0) {
          await storage.set(
            storage.getPluginKey(resourceName, 'training', 'data', modelName, `v${version}`),
            {
              modelName,
              version,
              samples: newSamples, // Only new samples
              features: modelConfig.features,
              target: modelConfig.target,
              savedAt: new Date().toISOString()
            },
            { behavior: 'body-only' } // Dataset goes to S3 body
          );
        }

        // Append metadata to history (no full dataset duplication)
        const historyEntry = {
          version,
          totalSamples: processedData.length, // Total cumulative
          newSamples: newSamples.length, // Only new in this version
          sampleIds: Array.from(currentSampleIds), // All IDs for this version
          newSampleIds, // IDs of new samples
          storageKey: newSamples.length > 0 ? `training/data/${modelName}/v${version}` : null,
          metrics: {
            loss: modelStats.loss,
            accuracy: modelStats.accuracy,
            r2: modelStats.r2
          },
          trainedAt: new Date().toISOString()
        };

        history.push(historyEntry);

        // Save updated history (metadata only, no full datasets)
        await storage.set(
          storage.getPluginKey(resourceName, 'training', 'history', modelName),
          {
            modelName,
            type: 'training_history',
            totalTrainings: history.length,
            latestVersion: version,
            history, // Array of metadata entries (not full data)
            updatedAt: new Date().toISOString()
          },
          { behavior: 'body-overflow' } // History metadata
        );

        this.logger.debug(
          { modelName, version, newSamples: newSamples.length, totalSamples: processedData.length, resourceName },
          `Saved training data for "${modelName}" v${version}: ${newSamples.length} new samples (total: ${processedData.length}, storage: resource=${resourceName}/plugin=ml/training/data/${modelName}/v${version})`
        );
      } else {
        // Legacy: Replace training data (non-incremental)
        await storage.set(
          storage.getPluginKey(resourceName, 'training', 'data', modelName, 'latest'),
          {
            modelName,
            type: 'training_data',
            samples: processedData,
            features: modelConfig.features,
            target: modelConfig.target,
            savedAt: new Date().toISOString()
          },
          { behavior: 'body-only' }
        );

        this.logger.debug(
          { modelName, sampleCount: processedData.length, resourceName },
          `Saved training data for "${modelName}" (${processedData.length} samples) to S3 (resource=${resourceName}/plugin=ml/training/data/${modelName}/latest)`
        );
      }
    } catch (error: any) {
      this.logger.error(`[MLPlugin] Failed to save training data for "${modelName}":`, error.message);
    }
  }

  /**
   * Load model from plugin storage
   * @private
   */
  async _loadModel(modelName: string): Promise<void> {
    try {
      const storage = (this as any).getStorage();
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;
      const enableVersioning = this.config.enableVersioning;

      if (enableVersioning) {
        // Load active version reference
        const [okRef, errRef, activeRef] = await tryFn(() =>
          storage.get(storage.getPluginKey(resourceName, 'metadata', modelName, 'active'))
        );

        if (okRef && activeRef && activeRef.version) {
          // Load the active version
          const version = activeRef.version;
          const [ok, err, versionData] = await tryFn(() =>
            storage.get(storage.getPluginKey(resourceName, 'models', modelName, `v${version}`))
          );

          if (ok && versionData && versionData.modelData) {
            await this.models[modelName]!.import(versionData.modelData);

            this.logger.debug(
              { modelName, version, resourceName },
              `Loaded model "${modelName}" v${version} (active) from S3 (resource=${resourceName}/plugin=ml/models/${modelName}/v${version})`
            );
            return;
          }
        }

        // No active reference, try to load latest version
        const versionInfo = this.modelVersions.get(modelName);
        if (versionInfo && versionInfo.latestVersion > 0) {
          const version = versionInfo.latestVersion;
          const [ok, err, versionData] = await tryFn(() =>
            storage.get(storage.getPluginKey(resourceName, 'models', modelName, `v${version}`))
          );

          if (ok && versionData && versionData.modelData) {
            await this.models[modelName]!.import(versionData.modelData);

            this.logger.debug(
              { modelName, version },
              `Loaded model "${modelName}" v${version} (latest) from S3`
            );
            return;
          }
        }

        this.logger.debug({ modelName }, `No saved model versions found for "${modelName}"`);
      } else {
        // Legacy: Load non-versioned model
        const [ok, err, record] = await tryFn(() =>
          storage.get(storage.getPluginKey(resourceName, 'models', modelName, 'latest'))
        );

        if (!ok || !record || !record.modelData) {
          this.logger.debug({ modelName }, `No saved model found for "${modelName}"`);
          return;
        }

        await this.models[modelName]!.import(record.modelData);

        this.logger.debug(
          { modelName, resourceName },
          `Loaded model "${modelName}" from S3 (resource=${resourceName}/plugin=ml/models/${modelName}/latest)`
        );
      }
    } catch (error: any) {
      this.logger.error(`[MLPlugin] Failed to load model "${modelName}":`, error.message);
    }
  }

  /**
   * Load training data from plugin storage (reconstructs specific version from incremental data)
   * @param modelName - Model name
   * @param version - Version number (optional, defaults to latest)
   * @returns Training data or null if not found
   */
  async getTrainingData(modelName: string, version: number | null = null): Promise<any | null> {
    try {
      const storage = (this as any).getStorage();
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;
      const enableVersioning = this.config.enableVersioning;

      if (!enableVersioning) {
        // Legacy: Load non-versioned training data
        const [ok, err, record] = await tryFn(() =>
          storage.get(storage.getPluginKey(resourceName, 'training', 'data', modelName, 'latest'))
        );

        if (!ok || !record) {
          this.logger.debug({ modelName }, `No saved training data found for "${modelName}"`);
          return null;
        }

        const samplesArray = Array.isArray(record.samples) ? record.samples : [];

        return {
          modelName: record.modelName,
          samples: samplesArray.length,
          features: record.features,
          target: record.target,
          data: samplesArray,
          savedAt: record.savedAt
        };
      }

      // Versioned: Reconstruct dataset from incremental versions
      const [okHistory, errHistory, historyData] = await tryFn(() =>
        storage.get(storage.getPluginKey(resourceName, 'training', 'history', modelName))
      );

      if (!okHistory || !historyData || !historyData.history) {
        this.logger.debug({ modelName }, `No training history found for "${modelName}"`);
        return null;
      }

      const historyEntries = Array.isArray(historyData.history)
        ? historyData.history
        : JSON.parse(historyData.history);

      const targetVersion = version || historyData.latestVersion;
      const reconstructedSamples: any[] = [];

      // Load and combine all versions up to target version
      for (const entry of historyEntries) {
        if (entry.version > targetVersion) break;

        if (entry.storageKey && entry.newSamples > 0) {
          const [ok, err, versionData] = await tryFn(() =>
            storage.get(storage.getPluginKey(resourceName, 'training', 'data', modelName, `v${entry.version}`))
          );

          if (ok && versionData && versionData.samples) {
            reconstructedSamples.push(...versionData.samples);
          }
        }
      }

      const targetEntry = historyEntries.find((e: any) => e.version === targetVersion);

      return {
        modelName,
        version: targetVersion,
        samples: reconstructedSamples.length,
        totalSamples: reconstructedSamples.length,
        features: modelConfig.features,
        target: modelConfig.target,
        data: reconstructedSamples,
        metrics: targetEntry?.metrics,
        savedAt: targetEntry?.trainedAt
      };
    } catch (error: any) {
      this.logger.error(`[MLPlugin] Failed to load training data for "${modelName}":`, error.message);
      return null;
    }
  }

  /**
   * Delete model from plugin storage (all versions)
   * @private
   */
  async _deleteModel(modelName: string): Promise<void> {
    try {
      const storage = (this as any).getStorage();
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;
      const enableVersioning = this.config.enableVersioning;

      if (enableVersioning) {
        // Delete all versions
        const versionInfo = this.modelVersions.get(modelName);
        if (versionInfo && versionInfo.latestVersion > 0) {
          for (let v = 1; v <= versionInfo.latestVersion; v++) {
            await storage.delete(storage.getPluginKey(resourceName, 'models', modelName, `v${v}`));
          }
        }

        // Delete metadata
        await storage.delete(storage.getPluginKey(resourceName, 'metadata', modelName, 'active'));
        await storage.delete(storage.getPluginKey(resourceName, 'metadata', modelName, 'versions'));
      } else {
        // Delete non-versioned model
        await storage.delete(storage.getPluginKey(resourceName, 'models', modelName, 'latest'));
      }

      this.logger.debug(
        { modelName, resourceName },
        `Deleted model "${modelName}" from S3 (resource=${resourceName}/plugin=ml/models/${modelName}/)`
      );
    } catch (error: any) {
      // Ignore errors (model might not exist)
      this.logger.debug({ modelName, error: error.message }, `Could not delete model "${modelName}"`);
    }
  }

  /**
   * Delete training data from plugin storage (all versions)
   * @private
   */
  async _deleteTrainingData(modelName: string): Promise<void> {
    try {
      const storage = (this as any).getStorage();
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;
      const enableVersioning = this.config.enableVersioning;

      if (enableVersioning) {
        // Delete all version data
        const [ok, err, historyData] = await tryFn(() =>
          storage.get(storage.getPluginKey(resourceName, 'training', 'history', modelName))
        );

        if (ok && historyData && historyData.history) {
          for (const entry of historyData.history) {
            if (entry.storageKey) {
              await storage.delete(storage.getPluginKey(resourceName, 'training', 'data', modelName, `v${entry.version}`));
            }
          }
        }

        // Delete history
        await storage.delete(storage.getPluginKey(resourceName, 'training', 'history', modelName));
      } else {
        // Delete non-versioned training data
        await storage.delete(storage.getPluginKey(resourceName, 'training', 'data', modelName, 'latest'));
      }

      this.logger.debug(
        { modelName, resourceName },
        `Deleted training data for "${modelName}" from S3 (resource=${resourceName}/plugin=ml/training/)`
      );
    } catch (error: any) {
      // Ignore errors (training data might not exist)
      this.logger.debug({ modelName, error: error.message }, `Could not delete training data "${modelName}"`);
    }
  }

  /**
   * List all versions of a model
   * @param modelName - Model name
   * @returns List of version info
   */
  async listModelVersions(modelName: string): Promise<any[]> {
    if (!this.config.enableVersioning) {
      throw new MLError('Versioning is not enabled', { modelName });
    }

    try {
      const storage = (this as any).getStorage();
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;
      const versionInfo = this.modelVersions.get(modelName) || { latestVersion: 0, currentVersion: 0 };
      const versions: any[] = [];

      // Load each version
      for (let v = 1; v <= versionInfo.latestVersion; v++) {
        const [ok, err, versionData] = await tryFn(() => storage.get(storage.getPluginKey(resourceName, 'models', modelName, `v${v}`)));

        if (ok && versionData) {
          versions.push({
            version: v,
            savedAt: versionData.savedAt,
            isCurrent: v === versionInfo.currentVersion,
            metrics: versionData.metrics
          });
        }
      }

      return versions;
    } catch (error: any) {
      this.logger.error(`[MLPlugin] Failed to list versions for "${modelName}":`, error.message);
      return [];
    }
  }

  /**
   * Load a specific version of a model
   * @param modelName - Model name
   * @param version - Version number
   */
  async loadModelVersion(modelName: string, version: number): Promise<any> {
    if (!this.config.enableVersioning) {
      throw new MLError('Versioning is not enabled', { modelName });
    }

    if (!this.models[modelName]) {
      throw new ModelNotFoundError(`Model "${modelName}" not found`, { modelName });
    }

    try {
      const storage = (this as any).getStorage();
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;
      const [ok, err, versionData] = await tryFn(() => storage.get(storage.getPluginKey(resourceName, 'models', modelName, `v${version}`)));

      if (!ok || !versionData) {
        throw new MLError(`Version ${version} not found for model "${modelName}"`, { modelName, version });
      }

      if (!versionData.modelData) {
        throw new MLError(`Model data not found in version ${version}`, { modelName, version });
      }

      await this.models[modelName].import(versionData.modelData);

      // Update current version in memory (don't save to storage yet)
      const versionInfo = this.modelVersions.get(modelName);
      if (versionInfo) {
        versionInfo.currentVersion = version;
        this.modelVersions.set(modelName, versionInfo);
      }

      this.logger.debug({ modelName, version }, `Loaded model "${modelName}" v${version}`);

      return {
        version,
        metrics: typeof versionData.metrics === 'string'
          ? JSON.parse(versionData.metrics)
          : (versionData.metrics || {}),
        savedAt: versionData.savedAt
      };
    } catch (error: any) {
      this.logger.error(`[MLPlugin] Failed to load version ${version} for "${modelName}":`, error.message);
      throw error;
    }
  }

  /**
   * Set active version for a model (used for predictions)
   * @param modelName - Model name
   * @param version - Version number
   */
  async setActiveVersion(modelName: string, version: number): Promise<any> {
    if (!this.config.enableVersioning) {
      throw new MLError('Versioning is not enabled', { modelName });
    }

    const modelConfig = this.config.models[modelName]!;
    const resourceName = modelConfig.resource;

    // Load the version into the model
    await this.loadModelVersion(modelName, version);

    // Update version info in storage
    await this._updateVersionInfo(modelName, version);

    // Update active reference
    const storage = (this as any).getStorage();
    await storage.set(storage.getPluginKey(resourceName, 'metadata', modelName, 'active'), {
      modelName,
      version,
      type: 'reference',
      updatedAt: new Date().toISOString()
    });

    this.logger.debug({ modelName, version }, `Set model "${modelName}" active version to v${version}`);

    return { modelName, version };
  }

  /**
   * Get training history for a model
   * @param modelName - Model name
   * @returns Training history
   */
  async getTrainingHistory(modelName: string): Promise<any> {
    if (!this.config.enableVersioning) {
      // Fallback to legacy getTrainingData
      return await this.getTrainingData(modelName);
    }

    try {
      const storage = (this as any).getStorage();
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;
      const [ok, err, historyData] = await tryFn(() => storage.get(storage.getPluginKey(resourceName, 'training', 'history', modelName)));

      if (!ok || !historyData) {
        return null;
      }

      const historyEntries = Array.isArray(historyData.history)
        ? historyData.history
        : JSON.parse(historyData.history);

      return {
        modelName: historyData.modelName,
        totalTrainings: historyData.totalTrainings,
        latestVersion: historyData.latestVersion,
        history: historyEntries,
        updatedAt: historyData.updatedAt
      };
    } catch (error: any) {
      this.logger.error(`[MLPlugin] Failed to load training history for "${modelName}":`, error.message);
      return null;
    }
  }

  /**
   * Compare metrics between two versions
   * @param modelName - Model name
   * @param version1 - First version
   * @param version2 - Second version
   * @returns Comparison results
   */
  async compareVersions(modelName: string, version1: number, version2: number): Promise<any> {
    if (!this.config.enableVersioning) {
      throw new MLError('Versioning is not enabled', { modelName });
    }

    try {
      const storage = (this as any).getStorage();
      const modelConfig = this.config.models[modelName]!;
      const resourceName = modelConfig.resource;

      const [ok1, err1, v1Data] = await tryFn(() => storage.get(storage.getPluginKey(resourceName, 'models', modelName, `v${version1}`)));
      const [ok2, err2, v2Data] = await tryFn(() => storage.get(storage.getPluginKey(resourceName, 'models', modelName, `v${version2}`)));

      if (!ok1 || !v1Data) {
        throw new MLError(`Version ${version1} not found`, { modelName, version: version1 });
      }

      if (!ok2 || !v2Data) {
        throw new MLError(`Version ${version2} not found`, { modelName, version: version2 });
      }

      const metrics1 = typeof v1Data.metrics === 'string' ? JSON.parse(v1Data.metrics) : (v1Data.metrics || {});
      const metrics2 = typeof v2Data.metrics === 'string' ? JSON.parse(v2Data.metrics) : (v2Data.metrics || {});

      return {
        modelName,
        version1: {
          version: version1,
          savedAt: v1Data.savedAt,
          metrics: metrics1
        },
        version2: {
          version: version2,
          savedAt: v2Data.savedAt,
          metrics: metrics2
        },
        improvement: {
          loss: metrics1.loss && metrics2.loss ? ((metrics1.loss - metrics2.loss) / metrics1.loss * 100).toFixed(2) + '%' : 'N/A',
          accuracy: metrics1.accuracy && metrics2.accuracy ? ((metrics2.accuracy - metrics1.accuracy) / metrics1.accuracy * 100).toFixed(2) + '%' : 'N/A'
        }
      };
    } catch (error: any) {
      this.logger.error(`[MLPlugin] Failed to compare versions for "${modelName}":`, error.message);
      throw error;
    }
  }

  /**
   * Rollback to a previous version
   * @param modelName - Model name
   * @param version - Version to rollback to (defaults to previous version)
   * @returns Rollback info
   */
  async rollbackVersion(modelName: string, version: number | null = null): Promise<any> {
    if (!this.config.enableVersioning) {
      throw new MLError('Versioning is not enabled', { modelName });
    }

    const versionInfo = this.modelVersions.get(modelName);
    if (!versionInfo) {
      throw new MLError(`No version info found for model "${modelName}"`, { modelName });
    }

    // If no version specified, rollback to previous
    const targetVersion = version !== null ? version : Math.max(1, versionInfo.currentVersion - 1);

    if (targetVersion === versionInfo.currentVersion) {
      throw new MLError('Cannot rollback to the same version', { modelName, version: targetVersion });
    }

    if (targetVersion < 1 || targetVersion > versionInfo.latestVersion) {
      throw new MLError(`Invalid version ${targetVersion}`, { modelName, version: targetVersion, latestVersion: versionInfo.latestVersion });
    }

    // Load and set as active
    const result = await this.setActiveVersion(modelName, targetVersion);

    this.logger.debug(
      { modelName, previousVersion: versionInfo.currentVersion, targetVersion },
      `Rolled back model "${modelName}" from v${versionInfo.currentVersion} to v${targetVersion}`
    );

    return {
      modelName,
      previousVersion: versionInfo.currentVersion,
      currentVersion: targetVersion,
      ...result
    };
  }
}
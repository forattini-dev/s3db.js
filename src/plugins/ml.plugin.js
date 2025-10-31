/**
 * Machine Learning Plugin
 *
 * Train and use ML models directly on s3db.js resources
 * Supports regression, classification, time series, and custom neural networks
 */

import { Plugin } from './plugin.class.js';
import { Resource } from '../resource.class.js';
import { requirePluginDependency } from './concerns/plugin-dependencies.js';
import tryFn from '../concerns/try-fn.js';

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
} from './ml.errors.js';

/**
 * ML Plugin Configuration
 *
 * @typedef {Object} MLPluginOptions
 * @property {Object} models - Model configurations
 * @property {boolean} [verbose=false] - Enable verbose logging
 * @property {number} [minTrainingSamples=10] - Minimum samples required for training
 * @property {boolean} [saveModel=true] - Save trained models to S3
 * @property {boolean} [saveTrainingData=false] - Save intermediate training data to S3
 *
 * @example
 * new MLPlugin({
 *   models: {
 *     productPrices: {
 *       type: 'regression',
 *       resource: 'products',
 *       features: ['cost', 'margin', 'demand'],
 *       target: 'price',
 *       partition: { name: 'byCategory', values: { category: 'electronics' } }, // Optional
 *       autoTrain: true,
 *       trainInterval: 3600000, // 1 hour
 *       trainAfterInserts: 100,
 *       saveModel: true, // Save to S3 after training
 *       saveTrainingData: true, // Save prepared dataset
 *       modelConfig: {
 *         epochs: 50,
 *         batchSize: 32,
 *         learningRate: 0.01
 *       }
 *     }
 *   },
 *   verbose: true,
 *   saveModel: true,
 *   saveTrainingData: false
 * })
 */
export class MLPlugin extends Plugin {
  constructor(options = {}) {
    super(options);

    this.config = {
      models: options.models || {},
      verbose: options.verbose || false,
      minTrainingSamples: options.minTrainingSamples || 10,
      saveModel: options.saveModel !== false, // Default true
      saveTrainingData: options.saveTrainingData || false,
      enableVersioning: options.enableVersioning !== false // Default true
    };

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

    // Interval handles for auto-training
    this.intervals = [];

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
  async onInstall() {
    if (this.config.verbose) {
      console.log('[MLPlugin] Installing ML Plugin...');
    }

    // Validate plugin dependencies (lazy validation)
    if (!this._dependenciesValidated) {
      // Try direct import first (works better with Jest ESM)
      let tfAvailable = false;
      try {
        await import('@tensorflow/tfjs-node');
        tfAvailable = true;
        if (this.config.verbose) {
          console.log('[MLPlugin] TensorFlow.js loaded successfully');
        }
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

    if (this.config.verbose) {
      console.log(`[MLPlugin] Installed with ${Object.keys(this.models).length} models`);
    }

    this.emit('db:plugin:installed', {
      plugin: 'MLPlugin',
      models: Object.keys(this.models)
    });
  }

  /**
   * Start the plugin
   */
  async onStart() {
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

    if (this.config.verbose) {
      console.log('[MLPlugin] Started');
    }
  }

  /**
   * Stop the plugin
   */
  async onStop() {
    // Stop all intervals
    for (const handle of this.intervals) {
      clearInterval(handle);
    }
    this.intervals = [];

    // Dispose all models
    for (const [modelName, model] of Object.entries(this.models)) {
      if (model && model.dispose) {
        model.dispose();
      }
    }

    // Remove pending auto-training handlers
    for (const handler of this._pendingAutoTrainingHandlers.values()) {
      this.database.off('db:resource-created', handler);
    }
    this._pendingAutoTrainingHandlers.clear();
    this._autoTrainingInitialized.clear();

    if (this.config.verbose) {
      console.log('[MLPlugin] Stopped');
    }
  }

  /**
   * Uninstall the plugin
   */
  async onUninstall(options = {}) {
    await this.onStop();

    if (options.purgeData) {
      // Delete all saved models and training data from plugin storage
      for (const modelName of Object.keys(this.models)) {
        await this._deleteModel(modelName);
        await this._deleteTrainingData(modelName);
      }

      if (this.config.verbose) {
        console.log('[MLPlugin] Purged all model data and training data');
      }
    }
  }

  /**
   * Build model cache for fast lookup
   * @private
   */
  _buildModelCache() {
    for (const [modelName, modelConfig] of Object.entries(this.config.models)) {
      const cacheKey = `${modelConfig.resource}_${modelConfig.target}`;
      this.modelCache.set(cacheKey, modelName);

      if (this.config.verbose) {
        console.log(`[MLPlugin] Cached model "${modelName}" for ${modelConfig.resource}.predict(..., '${modelConfig.target}')`);
      }
    }
  }

  /**
   * Inject ML methods into Resource instances
   * @private
   */
  _injectResourceMethods() {
    const plugin = this;

    // Store reference to plugin in database for resource access
    if (!this.database._mlPlugin) {
      this.database._mlPlugin = this;
    }

    // Create namespace "ml" on Resource prototype
    if (!Object.prototype.hasOwnProperty.call(Resource.prototype, 'ml')) {
      Object.defineProperty(Resource.prototype, 'ml', {
        get() {
          const resource = this;
          const mlPlugin = resource.database?._mlPlugin;

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
             * @param {string} target - Target attribute to predict
             * @param {Object} options - Configuration options
             * @returns {Promise<Object>} Training results
             */
            learn: async (target, options = {}) => {
              return await mlPlugin._resourceLearn(resource.name, target, options);
            },

            /**
             * Make prediction
             * @param {Object} input - Input features
             * @param {string} target - Target attribute
             * @returns {Promise<Object>} Prediction result
             */
            predict: async (input, target) => {
              return await mlPlugin._resourcePredict(resource.name, input, target);
            },

            /**
             * Train model manually
             * @param {string} target - Target attribute
             * @param {Object} options - Training options
             * @returns {Promise<Object>} Training results
             */
            train: async (target, options = {}) => {
              return await mlPlugin._resourceTrainModel(resource.name, target, options);
            },

            /**
             * List all models for this resource
             * @returns {Array} List of models
             */
            list: () => {
              return mlPlugin._resourceListModels(resource.name);
            },

            /**
             * List model versions
             * @param {string} target - Target attribute
             * @returns {Promise<Array>} List of versions
             */
            versions: async (target) => {
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
             * @param {string} target - Target attribute
             * @param {number} version - Version to rollback to (optional)
             * @returns {Promise<Object>} Rollback info
             */
            rollback: async (target, version = null) => {
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
             * @param {string} target - Target attribute
             * @param {number} v1 - First version
             * @param {number} v2 - Second version
             * @returns {Promise<Object>} Comparison results
             */
            compare: async (target, v1, v2) => {
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
             * @param {string} target - Target attribute
             * @returns {Object} Model stats
             */
            stats: (target) => {
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
             * @param {string} target - Target attribute
             * @returns {Promise<Object>} Exported model
             */
            export: async (target) => {
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
             * @param {string} target - Target attribute
             * @param {Object} data - Model data
             * @returns {Promise<void>}
             */
            import: async (target, data) => {
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

    // Keep legacy methods for backward compatibility
    // Add predict() method to Resource prototype
    if (!Object.prototype.hasOwnProperty.call(Resource.prototype, 'predict')) {
      Resource.prototype.predict = async function(input, targetAttribute) {
        const mlPlugin = this.database?._mlPlugin;
        if (!mlPlugin) {
          throw new MLError('MLPlugin is not installed on this database instance', {
            pluginName: 'MLPlugin',
            operation: 'Resource.predict',
            statusCode: 400,
            retriable: false,
            suggestion: 'Install MLPlugin via db.usePlugin(new MLPlugin(...)) before calling resource.predict().' 
          });
        }

        return await mlPlugin._resourcePredict(this.name, input, targetAttribute);
      };
    }

    // Add trainModel() method to Resource prototype
    if (!Object.prototype.hasOwnProperty.call(Resource.prototype, 'trainModel')) {
      Resource.prototype.trainModel = async function(targetAttribute, options = {}) {
        const mlPlugin = this.database?._mlPlugin;
        if (!mlPlugin) {
          throw new MLError('MLPlugin is not installed on this database instance', {
            pluginName: 'MLPlugin',
            operation: 'Resource.trainModel',
            statusCode: 400,
            retriable: false,
            suggestion: 'Install MLPlugin via db.usePlugin(new MLPlugin(...)) before calling resource.trainModel().' 
          });
        }

        return await mlPlugin._resourceTrainModel(this.name, targetAttribute, options);
      };
    }

    // Add listModels() method to Resource prototype
    if (!Object.prototype.hasOwnProperty.call(Resource.prototype, 'listModels')) {
      Resource.prototype.listModels = function() {
        const mlPlugin = this.database?._mlPlugin;
        if (!mlPlugin) {
          throw new MLError('MLPlugin is not installed on this database instance', {
            pluginName: 'MLPlugin',
            operation: 'Resource.listModels',
            statusCode: 400,
            retriable: false,
            suggestion: 'Install MLPlugin via db.usePlugin(new MLPlugin(...)) before calling resource.listModels().'
          });
        }

        return mlPlugin._resourceListModels(this.name);
      };
    }

    if (this.config.verbose) {
      console.log('[MLPlugin] Injected ML namespace (resource.ml.*) into Resource prototype');
    }
  }

  /**
   * Find model for a resource and target attribute
   * @private
   */
  _findModelForResource(resourceName, targetAttribute) {
    const cacheKey = `${resourceName}_${targetAttribute}`;

    // Try cache first
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey);
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
   * @param {string} resourceName - Resource name
   * @param {string} target - Target attribute to predict
   * @param {Object} options - Configuration options
   * @returns {Promise<Object>} Training results
   * @private
   */
  async _resourceLearn(resourceName, target, options = {}) {
    // Check if model already exists
    let modelName = this._findModelForResource(resourceName, target);

    if (modelName) {
      // Model exists, just retrain
      if (this.config.verbose) {
        console.log(`[MLPlugin] Model "${modelName}" already exists, retraining...`);
      }
      return await this.train(modelName, options);
    }

    // Create new model dynamically
    modelName = `${resourceName}_${target}_auto`;

    if (this.config.verbose) {
      console.log(`[MLPlugin] Auto-creating model "${modelName}" for ${resourceName}.${target}...`);
    }

    // Get resource
    const resource = this.database.resources[resourceName];
    if (!resource) {
      throw new ModelConfigError(
        `Resource "${resourceName}" not found`,
        { resourceName, availableResources: Object.keys(this.database.resources) }
      );
    }

    // Auto-detect type if not specified
    let modelType = options.type;
    if (!modelType) {
      modelType = await this._autoDetectType(resourceName, target);
      if (this.config.verbose) {
        console.log(`[MLPlugin] Auto-detected type: ${modelType}`);
      }
    }

    // Auto-select features if not specified
    let features = options.features;
    if (!features || features.length === 0) {
      features = await this._autoSelectFeatures(resourceName, target);
      if (this.config.verbose) {
        console.log(`[MLPlugin] Auto-selected features: ${features.join(', ')}`);
      }
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
      if (this.config.verbose) {
        console.log(`[MLPlugin] Auto-adjusted batchSize to ${defaultModelConfig.batchSize} based on ${sampleCount} samples`);
      }
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
    const modelConfig = {
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
    if (this.config.verbose) {
      console.log(`[MLPlugin] Training model "${modelName}"...`);
    }

    const result = await this.train(modelName, options);

    if (this.config.verbose) {
      console.log(`[MLPlugin] ✅ Model "${modelName}" ready!`);
    }

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
   * @param {string} resourceName - Resource name
   * @param {string} target - Target attribute
   * @returns {Promise<string>} Model type
   * @private
   */
  async _autoDetectType(resourceName, target) {
    const resource = this.database.resources[resourceName];

    // Get some sample data
    const [ok, err, samples] = await tryFn(() => resource.list({ limit: 100 }));

    if (!ok || !samples || samples.length === 0) {
      // Default to regression if no data
      return 'regression';
    }

    // Analyze target values
    const targetValues = samples.map(s => s[target]).filter(v => v != null);

    if (targetValues.length === 0) {
      return 'regression';
    }

    // Check if numeric
    const isNumeric = targetValues.every(v => typeof v === 'number');

    if (isNumeric) {
      // Check for time series (if data has timestamp)
      const hasTimestamp = samples.every(s => s.timestamp || s.createdAt || s.date);
      if (hasTimestamp) {
        return 'timeseries';
      }
      return 'regression';
    }

    // Check if categorical (strings/booleans)
    const isCategorical = targetValues.every(v => typeof v === 'string' || typeof v === 'boolean');

    if (isCategorical) {
      return 'classification';
    }

    // Default
    return 'regression';
  }

  /**
   * Auto-select best features for prediction
   * @param {string} resourceName - Resource name
   * @param {string} target - Target attribute
   * @returns {Promise<Array>} Selected features
   * @private
   */
  async _autoSelectFeatures(resourceName, target) {
    const resource = this.database.resources[resourceName];

    // Get all numeric attributes from schema
    const schema = resource.schema;
    const attributes = schema?.attributes || {};

    const numericFields = [];

    for (const [fieldName, fieldDef] of Object.entries(attributes)) {
      // Skip target
      if (fieldName === target) continue;

      // Skip system fields
      if (['id', 'createdAt', 'updatedAt', 'createdBy'].includes(fieldName)) continue;

      // Check if numeric type
      const fieldType = typeof fieldDef === 'string' ? fieldDef.split('|')[0] : fieldDef.type;

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
   * @param {string} type - Model type
   * @returns {Object} Default config
   * @private
   */
  _getDefaultModelConfig(type) {
    const defaults = {
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
  async _resourcePredict(resourceName, input, targetAttribute) {
    const modelName = this._findModelForResource(resourceName, targetAttribute);

    if (!modelName) {
      throw new ModelNotFoundError(
        `No model found for resource "${resourceName}" with target "${targetAttribute}"`,
        { resourceName, targetAttribute, availableModels: Object.keys(this.models) }
      );
    }

    if (this.config.verbose) {
      console.log(`[MLPlugin] Resource prediction: ${resourceName}.predict(..., '${targetAttribute}') -> model "${modelName}"`);
    }

    return await this.predict(modelName, input);
  }

  /**
   * Resource trainModel implementation
   * @private
   */
  async _resourceTrainModel(resourceName, targetAttribute, options = {}) {
    const modelName = this._findModelForResource(resourceName, targetAttribute);

    if (!modelName) {
      throw new ModelNotFoundError(
        `No model found for resource "${resourceName}" with target "${targetAttribute}"`,
        { resourceName, targetAttribute, availableModels: Object.keys(this.models) }
      );
    }

    if (this.config.verbose) {
      console.log(`[MLPlugin] Resource training: ${resourceName}.trainModel('${targetAttribute}') -> model "${modelName}"`);
    }

    return await this.train(modelName, options);
  }

  /**
   * List models for a resource
   * @private
   */
  _resourceListModels(resourceName) {
    const models = [];

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
  _validateModelConfig(modelName, config) {
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
  async _initializeModel(modelName, config) {
    const modelOptions = {
      name: modelName,
      resource: config.resource,
      features: config.features,
      target: config.target,
      minSamples: config.minSamples ?? this.config.minTrainingSamples,
      modelConfig: config.modelConfig || {},
      verbose: this.config.verbose
    };

    try {
      switch (config.type) {
        case 'regression':
          this.models[modelName] = new RegressionModel(modelOptions);
          break;

        case 'classification':
          this.models[modelName] = new ClassificationModel(modelOptions);
          break;

        case 'timeseries':
          this.models[modelName] = new TimeSeriesModel(modelOptions);
          break;

        case 'neural-network':
          this.models[modelName] = new NeuralNetworkModel(modelOptions);
          break;

        default:
          throw new ModelConfigError(
            `Unknown model type: ${config.type}`,
            { modelName, type: config.type }
          );
      }

      if (this.config.verbose) {
        console.log(`[MLPlugin] Initialized model "${modelName}" (${config.type})`);
      }
    } catch (error) {
      console.error(`[MLPlugin] Failed to initialize model "${modelName}":`, error.message);
      throw error;
    }
  }

  /**
   * Setup auto-training for a model
   * @private
  */
  _setupAutoTraining(modelName, config) {
    if (!this.insertCounters.has(modelName)) {
      this.insertCounters.set(modelName, 0);
    }

    const resource = this.database.resources[config.resource];

    if (!resource) {
      if (this.config.verbose) {
        console.warn(`[MLPlugin] Resource "${config.resource}" not found for model "${modelName}". Auto-training will attach when resource is created.`);
      }

      if (!this._pendingAutoTrainingHandlers.has(modelName)) {
        const handler = (createdName) => {
          if (createdName !== config.resource) {
            return;
          }

          this.database.off('db:resource-created', handler);
          this._pendingAutoTrainingHandlers.delete(modelName);
          this._setupAutoTraining(modelName, config);
        };

        this._pendingAutoTrainingHandlers.set(modelName, handler);
        this.database.on('db:resource-created', handler);
      }
      return;
    }

    if (this._autoTrainingInitialized.has(modelName)) {
      return;
    }

    // Hook: Track inserts
    if (config.trainAfterInserts && config.trainAfterInserts > 0) {
      this.addMiddleware(resource, 'insert', async (next, data, options) => {
        const result = await next(data, options);

        // Increment counter
        const currentCount = this.insertCounters.get(modelName) || 0;
        this.insertCounters.set(modelName, currentCount + 1);

        // Check if we should train
        if (this.insertCounters.get(modelName) >= config.trainAfterInserts) {
          if (this.config.verbose) {
            console.log(`[MLPlugin] Auto-training "${modelName}" after ${config.trainAfterInserts} inserts`);
          }

          // Reset counter
          this.insertCounters.set(modelName, 0);

          // Train asynchronously (don't block insert)
          this.train(modelName).catch(err => {
            console.error(`[MLPlugin] Auto-training failed for "${modelName}":`, err.message);
          });
        }

        return result;
      });
    }

    // Interval-based training
    if (config.trainInterval && config.trainInterval > 0) {
      const handle = setInterval(async () => {
        if (this.config.verbose) {
          console.log(`[MLPlugin] Auto-training "${modelName}" (interval: ${config.trainInterval}ms)`);
        }

        try {
          await this.train(modelName);
        } catch (error) {
          console.error(`[MLPlugin] Auto-training failed for "${modelName}":`, error.message);
        }
      }, config.trainInterval);

      this.intervals.push(handle);

      if (this.config.verbose) {
        console.log(`[MLPlugin] Setup interval training for "${modelName}" (every ${config.trainInterval}ms)`);
      }
    }

    this._autoTrainingInitialized.add(modelName);
  }

  /**
   * Train a model
   * @param {string} modelName - Model name
   * @param {Object} options - Training options
   * @returns {Object} Training results
   */
  async train(modelName, options = {}) {
    const model = this.models[modelName];
    if (!model) {
      throw new ModelNotFoundError(
        `Model "${modelName}" not found`,
        { modelName, availableModels: Object.keys(this.models) }
      );
    }

    // Check if already training
    if (this.training.get(modelName)) {
      if (this.config.verbose) {
        console.log(`[MLPlugin] Model "${modelName}" is already training, skipping...`);
      }
      return { skipped: true, reason: 'already_training' };
    }

    // Mark as training
    this.training.set(modelName, true);

    try {
      // Get model config
      const modelConfig = this.config.models[modelName];

      // Get resource
      const resource = this.database.resources[modelConfig.resource];
      if (!resource) {
        throw new ModelNotFoundError(
          `Resource "${modelConfig.resource}" not found`,
          { modelName, resource: modelConfig.resource }
        );
      }

      // Fetch training data (with optional partition filtering)
      if (this.config.verbose) {
        console.log(`[MLPlugin] Fetching training data for "${modelName}"...`);
      }

      let data;
      const partition = modelConfig.partition;

      if (partition && partition.name) {
        // Use partition filtering
        if (this.config.verbose) {
          console.log(`[MLPlugin] Using partition "${partition.name}" with values:`, partition.values);
        }

        const [ok, err, partitionData] = await tryFn(() =>
          resource.listPartition({
            partition: partition.name,
            partitionValues: partition.values
          })
        );

        if (!ok) {
          throw new TrainingError(
            `Failed to fetch training data from partition: ${err.message}`,
            { modelName, resource: modelConfig.resource, partition: partition.name, originalError: err.message }
          );
        }

        data = partitionData;
      } else {
        // Fetch all data
        const [ok, err, allData] = await tryFn(() => resource.list());

        if (!ok) {
          throw new TrainingError(
            `Failed to fetch training data: ${err.message}`,
            { modelName, resource: modelConfig.resource, originalError: err.message }
          );
        }

        data = allData;
      }

      // Apply custom filter function if provided
      if (modelConfig.filter && typeof modelConfig.filter === 'function') {
        if (this.config.verbose) {
          console.log(`[MLPlugin] Applying custom filter function...`);
        }

        const originalLength = data.length;
        data = data.filter(modelConfig.filter);

        if (this.config.verbose) {
          console.log(`[MLPlugin] Filter reduced dataset from ${originalLength} to ${data.length} samples`);
        }
      }

      // Apply custom map function if provided
      if (modelConfig.map && typeof modelConfig.map === 'function') {
        if (this.config.verbose) {
          console.log(`[MLPlugin] Applying custom map function...`);
        }

        data = data.map(modelConfig.map);
      }

      if (!data || data.length < this.config.minTrainingSamples) {
        throw new TrainingError(
          `Insufficient training data: ${data?.length || 0} samples (minimum: ${this.config.minTrainingSamples})`,
          { modelName, samples: data?.length || 0, minimum: this.config.minTrainingSamples }
        );
      }

      if (this.config.verbose) {
        console.log(`[MLPlugin] Training "${modelName}" with ${data.length} samples...`);
      }

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

      if (this.config.verbose) {
        console.log(`[MLPlugin] Training completed for "${modelName}":`, result);
      }

      this.emit('plg:ml:model-trained', {
        modelName,
        type: modelConfig.type,
        result
      });

      return result;
    } catch (error) {
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
   * @param {string} modelName - Model name
   * @param {Object|Array} input - Input data (object for single prediction, array for time series)
   * @returns {Object} Prediction result
   */
  async predict(modelName, input) {
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
   * @param {string} modelName - Model name
   * @param {Array} inputs - Array of input objects
   * @returns {Array} Array of prediction results
   */
  async predictBatch(modelName, inputs) {
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
   * @param {string} modelName - Model name
   * @param {Object} options - Options
   * @returns {Object} Training results
   */
  async retrain(modelName, options = {}) {
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
    const modelConfig = this.config.models[modelName];
    await this._initializeModel(modelName, modelConfig);

    // Train
    return await this.train(modelName, options);
  }

  /**
   * Get model statistics
   * @param {string} modelName - Model name
   * @returns {Object} Model stats
   */
  getModelStats(modelName) {
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
   * @returns {Object} Plugin stats
   */
  getStats() {
    return {
      ...this.stats,
      models: Object.keys(this.models).length,
      trainedModels: Object.values(this.models).filter(m => m.isTrained).length
    };
  }

  /**
   * Export a model
   * @param {string} modelName - Model name
   * @returns {Object} Serialized model
   */
  async exportModel(modelName) {
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
   * @param {string} modelName - Model name
   * @param {Object} data - Serialized model data
   */
  async importModel(modelName, data) {
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

    if (this.config.verbose) {
      console.log(`[MLPlugin] Imported model "${modelName}"`);
    }
  }

  /**
   * Initialize versioning for a model
   * @private
   */
  async _initializeVersioning(modelName) {
    try {
      const storage = this.getStorage();
      const modelConfig = this.config.models[modelName];
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

        if (this.config.verbose) {
          console.log(`[MLPlugin] Loaded version info for "${modelName}": v${versionInfo.currentVersion}`);
        }
      } else {
        // Initialize new versioning
        this.modelVersions.set(modelName, {
          currentVersion: 1,
          latestVersion: 0  // No versions yet
        });

        if (this.config.verbose) {
          console.log(`[MLPlugin] Initialized versioning for "${modelName}"`);
        }
      }
    } catch (error) {
      console.error(`[MLPlugin] Failed to initialize versioning for "${modelName}":`, error.message);
      // Fallback to v1
      this.modelVersions.set(modelName, { currentVersion: 1, latestVersion: 0 });
    }
  }

  /**
   * Get next version number for a model
   * @private
   */
  _getNextVersion(modelName) {
    const versionInfo = this.modelVersions.get(modelName) || { latestVersion: 0 };
    return versionInfo.latestVersion + 1;
  }

  /**
   * Update version info in storage
   * @private
   */
  async _updateVersionInfo(modelName, version) {
    try {
      const storage = this.getStorage();
      const modelConfig = this.config.models[modelName];
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

      if (this.config.verbose) {
        console.log(`[MLPlugin] Updated version info for "${modelName}": current=v${versionInfo.currentVersion}, latest=v${versionInfo.latestVersion}`);
      }
    } catch (error) {
      console.error(`[MLPlugin] Failed to update version info for "${modelName}":`, error.message);
    }
  }

  /**
   * Save model to plugin storage
   * @private
   */
  async _saveModel(modelName) {
    try {
      const storage = this.getStorage();
      const modelConfig = this.config.models[modelName];
      const resourceName = modelConfig.resource;
      const exportedModel = await this.models[modelName].export();

      if (!exportedModel) {
        if (this.config.verbose) {
          console.log(`[MLPlugin] Model "${modelName}" not trained, skipping save`);
        }
        return;
      }

      const modelStats = this.models[modelName].getStats();
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
            updatedAt: timestamp
          },
          { behavior: 'body-overflow' } // Small metadata
        );

        if (this.config.verbose) {
          console.log(`[MLPlugin] Saved model "${modelName}" v${version} to S3 (resource=${resourceName}/plugin=ml/models/${modelName}/v${version})`);
        }
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

        if (this.config.verbose) {
          console.log(`[MLPlugin] Saved model "${modelName}" to S3 (resource=${resourceName}/plugin=ml/models/${modelName}/latest)`);
        }
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
    } catch (error) {
      console.error(`[MLPlugin] Failed to save model "${modelName}":`, error.message);
    }
  }

  /**
   * Save intermediate training data to plugin storage (incremental - only new samples)
   * @private
   */
  async _saveTrainingData(modelName, rawData) {
    try {
      const storage = this.getStorage();
      const model = this.models[modelName];
      const modelConfig = this.config.models[modelName];
      const resourceName = modelConfig.resource;
      const modelStats = model.getStats();
      const enableVersioning = this.config.enableVersioning;

      // Extract features and target from raw data
      const processedData = rawData.map(item => {
        const features = {};
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

        let history = [];
        let previousSampleIds = new Set();

        if (ok && existing && existing.history) {
          history = existing.history;
          // Collect all IDs from previous versions
          history.forEach(entry => {
            if (entry.sampleIds) {
              entry.sampleIds.forEach(id => previousSampleIds.add(id));
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

        if (this.config.verbose) {
          console.log(`[MLPlugin] Saved training data for "${modelName}" v${version}: ${newSamples.length} new samples (total: ${processedData.length}, storage: resource=${resourceName}/plugin=ml/training/data/${modelName}/v${version})`);
        }
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

        if (this.config.verbose) {
          console.log(`[MLPlugin] Saved training data for "${modelName}" (${processedData.length} samples) to S3 (resource=${resourceName}/plugin=ml/training/data/${modelName}/latest)`);
        }
      }
    } catch (error) {
      console.error(`[MLPlugin] Failed to save training data for "${modelName}":`, error.message);
    }
  }

  /**
   * Load model from plugin storage
   * @private
   */
  async _loadModel(modelName) {
    try {
      const storage = this.getStorage();
      const modelConfig = this.config.models[modelName];
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
            await this.models[modelName].import(versionData.modelData);

            if (this.config.verbose) {
              console.log(`[MLPlugin] Loaded model "${modelName}" v${version} (active) from S3 (resource=${resourceName}/plugin=ml/models/${modelName}/v${version})`);
            }
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
            await this.models[modelName].import(versionData.modelData);

            if (this.config.verbose) {
              console.log(`[MLPlugin] Loaded model "${modelName}" v${version} (latest) from S3`);
            }
            return;
          }
        }

        if (this.config.verbose) {
          console.log(`[MLPlugin] No saved model versions found for "${modelName}"`);
        }
      } else {
        // Legacy: Load non-versioned model
        const [ok, err, record] = await tryFn(() =>
          storage.get(storage.getPluginKey(resourceName, 'models', modelName, 'latest'))
        );

        if (!ok || !record || !record.modelData) {
          if (this.config.verbose) {
            console.log(`[MLPlugin] No saved model found for "${modelName}"`);
          }
          return;
        }

        await this.models[modelName].import(record.modelData);

        if (this.config.verbose) {
          console.log(`[MLPlugin] Loaded model "${modelName}" from S3 (resource=${resourceName}/plugin=ml/models/${modelName}/latest)`);
        }
      }
    } catch (error) {
      console.error(`[MLPlugin] Failed to load model "${modelName}":`, error.message);
    }
  }

  /**
   * Load training data from plugin storage (reconstructs specific version from incremental data)
   * @param {string} modelName - Model name
   * @param {number} version - Version number (optional, defaults to latest)
   * @returns {Object|null} Training data or null if not found
   */
  async getTrainingData(modelName, version = null) {
    try {
      const storage = this.getStorage();
      const modelConfig = this.config.models[modelName];
      const resourceName = modelConfig.resource;
      const enableVersioning = this.config.enableVersioning;

      if (!enableVersioning) {
        // Legacy: Load non-versioned training data
        const [ok, err, record] = await tryFn(() =>
          storage.get(storage.getPluginKey(resourceName, 'training', 'data', modelName, 'latest'))
        );

        if (!ok || !record) {
          if (this.config.verbose) {
            console.log(`[MLPlugin] No saved training data found for "${modelName}"`);
          }
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
        if (this.config.verbose) {
          console.log(`[MLPlugin] No training history found for "${modelName}"`);
        }
        return null;
      }

      const historyEntries = Array.isArray(historyData.history)
        ? historyData.history
        : JSON.parse(historyData.history);

      const targetVersion = version || historyData.latestVersion;
      const reconstructedSamples = [];

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

      const targetEntry = historyEntries.find(e => e.version === targetVersion);

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
    } catch (error) {
      console.error(`[MLPlugin] Failed to load training data for "${modelName}":`, error.message);
      return null;
    }
  }

  /**
   * Delete model from plugin storage (all versions)
   * @private
   */
  async _deleteModel(modelName) {
    try {
      const storage = this.getStorage();
      const modelConfig = this.config.models[modelName];
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

      if (this.config.verbose) {
        console.log(`[MLPlugin] Deleted model "${modelName}" from S3 (resource=${resourceName}/plugin=ml/models/${modelName}/)`);
      }
    } catch (error) {
      // Ignore errors (model might not exist)
      if (this.config.verbose) {
        console.log(`[MLPlugin] Could not delete model "${modelName}": ${error.message}`);
      }
    }
  }

  /**
   * Delete training data from plugin storage (all versions)
   * @private
   */
  async _deleteTrainingData(modelName) {
    try {
      const storage = this.getStorage();
      const modelConfig = this.config.models[modelName];
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

      if (this.config.verbose) {
        console.log(`[MLPlugin] Deleted training data for "${modelName}" from S3 (resource=${resourceName}/plugin=ml/training/)`);
      }
    } catch (error) {
      // Ignore errors (training data might not exist)
      if (this.config.verbose) {
        console.log(`[MLPlugin] Could not delete training data "${modelName}": ${error.message}`);
      }
    }
  }

  /**
   * List all versions of a model
   * @param {string} modelName - Model name
   * @returns {Array} List of version info
   */
  async listModelVersions(modelName) {
    if (!this.config.enableVersioning) {
      throw new MLError('Versioning is not enabled', { modelName });
    }

    try {
      const storage = this.getStorage();
      const modelConfig = this.config.models[modelName];
      const resourceName = modelConfig.resource;
      const versionInfo = this.modelVersions.get(modelName) || { latestVersion: 0 };
      const versions = [];

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
    } catch (error) {
      console.error(`[MLPlugin] Failed to list versions for "${modelName}":`, error.message);
      return [];
    }
  }

  /**
   * Load a specific version of a model
   * @param {string} modelName - Model name
   * @param {number} version - Version number
   */
  async loadModelVersion(modelName, version) {
    if (!this.config.enableVersioning) {
      throw new MLError('Versioning is not enabled', { modelName });
    }

    if (!this.models[modelName]) {
      throw new ModelNotFoundError(`Model "${modelName}" not found`, { modelName });
    }

    try {
      const storage = this.getStorage();
      const modelConfig = this.config.models[modelName];
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

      if (this.config.verbose) {
        console.log(`[MLPlugin] Loaded model "${modelName}" v${version}`);
      }

      return {
        version,
        metrics: typeof versionData.metrics === 'string'
          ? JSON.parse(versionData.metrics)
          : (versionData.metrics || {}),
        savedAt: versionData.savedAt
      };
    } catch (error) {
      console.error(`[MLPlugin] Failed to load version ${version} for "${modelName}":`, error.message);
      throw error;
    }
  }

  /**
   * Set active version for a model (used for predictions)
   * @param {string} modelName - Model name
   * @param {number} version - Version number
   */
  async setActiveVersion(modelName, version) {
    if (!this.config.enableVersioning) {
      throw new MLError('Versioning is not enabled', { modelName });
    }

    const modelConfig = this.config.models[modelName];
    const resourceName = modelConfig.resource;

    // Load the version into the model
    await this.loadModelVersion(modelName, version);

    // Update version info in storage
    await this._updateVersionInfo(modelName, version);

    // Update active reference
    const storage = this.getStorage();
    await storage.set(storage.getPluginKey(resourceName, 'metadata', modelName, 'active'), {
      modelName,
      version,
      type: 'reference',
      updatedAt: new Date().toISOString()
    });

    if (this.config.verbose) {
      console.log(`[MLPlugin] Set model "${modelName}" active version to v${version}`);
    }

    return { modelName, version };
  }

  /**
   * Get training history for a model
   * @param {string} modelName - Model name
   * @returns {Array} Training history
   */
  async getTrainingHistory(modelName) {
    if (!this.config.enableVersioning) {
      // Fallback to legacy getTrainingData
      return await this.getTrainingData(modelName);
    }

    try {
      const storage = this.getStorage();
      const modelConfig = this.config.models[modelName];
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
    } catch (error) {
      console.error(`[MLPlugin] Failed to load training history for "${modelName}":`, error.message);
      return null;
    }
  }

  /**
   * Compare metrics between two versions
   * @param {string} modelName - Model name
   * @param {number} version1 - First version
   * @param {number} version2 - Second version
   * @returns {Object} Comparison results
   */
  async compareVersions(modelName, version1, version2) {
    if (!this.config.enableVersioning) {
      throw new MLError('Versioning is not enabled', { modelName });
    }

    try {
      const storage = this.getStorage();
      const modelConfig = this.config.models[modelName];
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
    } catch (error) {
      console.error(`[MLPlugin] Failed to compare versions for "${modelName}":`, error.message);
      throw error;
    }
  }

  /**
   * Rollback to a previous version
   * @param {string} modelName - Model name
   * @param {number} version - Version to rollback to (defaults to previous version)
   * @returns {Object} Rollback info
   */
  async rollbackVersion(modelName, version = null) {
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

    if (this.config.verbose) {
      console.log(`[MLPlugin] Rolled back model "${modelName}" from v${versionInfo.currentVersion} to v${targetVersion}`);
    }

    return {
      modelName,
      previousVersion: versionInfo.currentVersion,
      currentVersion: targetVersion,
      ...result
    };
  }
}

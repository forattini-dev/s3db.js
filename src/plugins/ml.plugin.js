/**
 * Machine Learning Plugin
 *
 * Train and use ML models directly on s3db.js resources
 * Supports regression, classification, time series, and custom neural networks
 */

import { Plugin } from './plugin.class.js';
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
      saveTrainingData: options.saveTrainingData || false
    };

    // Validate TensorFlow.js dependency
    requirePluginDependency('@tensorflow/tfjs-node', 'MLPlugin', {
      installCommand: 'pnpm add @tensorflow/tfjs-node',
      reason: 'Required for machine learning model training and inference'
    });

    // Model instances
    this.models = {};

    // Training state
    this.training = new Map(); // Track ongoing training
    this.insertCounters = new Map(); // Track inserts per resource

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

    // Validate model configurations
    for (const [modelName, modelConfig] of Object.entries(this.config.models)) {
      this._validateModelConfig(modelName, modelConfig);
    }

    // Initialize models
    for (const [modelName, modelConfig] of Object.entries(this.config.models)) {
      await this._initializeModel(modelName, modelConfig);
    }

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

    this.emit('installed', {
      plugin: 'MLPlugin',
      models: Object.keys(this.models)
    });
  }

  /**
   * Start the plugin
   */
  async onStart() {
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
    const resource = this.database.resources[config.resource];

    if (!resource) {
      console.warn(`[MLPlugin] Resource "${config.resource}" not found for model "${modelName}"`);
      return;
    }

    // Initialize insert counter
    this.insertCounters.set(modelName, 0);

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
          resource.listPartition(partition.name, partition.values)
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

      this.emit('modelTrained', {
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

      this.emit('prediction', {
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
   * Save model to plugin storage
   * @private
   */
  async _saveModel(modelName) {
    try {
      const storage = this.getStorage();
      const exportedModel = await this.models[modelName].export();

      if (!exportedModel) {
        if (this.config.verbose) {
          console.log(`[MLPlugin] Model "${modelName}" not trained, skipping save`);
        }
        return;
      }

      // Use patch() for faster metadata-only updates (enforce-limits behavior)
      await storage.patch(`model_${modelName}`, {
        modelName,
        type: 'model',
        data: JSON.stringify(exportedModel),
        savedAt: new Date().toISOString()
      });

      if (this.config.verbose) {
        console.log(`[MLPlugin] Saved model "${modelName}" to plugin storage (S3)`);
      }
    } catch (error) {
      console.error(`[MLPlugin] Failed to save model "${modelName}":`, error.message);
    }
  }

  /**
   * Save intermediate training data to plugin storage
   * @private
   */
  async _saveTrainingData(modelName, rawData) {
    try {
      const storage = this.getStorage();
      const model = this.models[modelName];
      const modelConfig = this.config.models[modelName];

      // Extract features and target from raw data
      const trainingData = {
        samples: rawData.length,
        features: modelConfig.features,
        target: modelConfig.target,
        data: rawData.map(item => {
          const features = {};
          modelConfig.features.forEach(feature => {
            features[feature] = item[feature];
          });
          return {
            features,
            target: item[modelConfig.target]
          };
        }),
        savedAt: new Date().toISOString()
      };

      // Save to plugin storage
      await storage.patch(`training_data_${modelName}`, {
        modelName,
        type: 'training_data',
        samples: trainingData.samples,
        features: JSON.stringify(trainingData.features),
        target: trainingData.target,
        data: JSON.stringify(trainingData.data),
        savedAt: trainingData.savedAt
      });

      if (this.config.verbose) {
        console.log(`[MLPlugin] Saved training data for "${modelName}" (${trainingData.samples} samples) to plugin storage (S3)`);
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
      const [ok, err, record] = await tryFn(() => storage.get(`model_${modelName}`));

      if (!ok || !record) {
        if (this.config.verbose) {
          console.log(`[MLPlugin] No saved model found for "${modelName}"`);
        }
        return;
      }

      const modelData = JSON.parse(record.data);
      await this.models[modelName].import(modelData);

      if (this.config.verbose) {
        console.log(`[MLPlugin] Loaded model "${modelName}" from plugin storage (S3)`);
      }
    } catch (error) {
      console.error(`[MLPlugin] Failed to load model "${modelName}":`, error.message);
    }
  }

  /**
   * Load training data from plugin storage
   * @param {string} modelName - Model name
   * @returns {Object|null} Training data or null if not found
   */
  async getTrainingData(modelName) {
    try {
      const storage = this.getStorage();
      const [ok, err, record] = await tryFn(() => storage.get(`training_data_${modelName}`));

      if (!ok || !record) {
        if (this.config.verbose) {
          console.log(`[MLPlugin] No saved training data found for "${modelName}"`);
        }
        return null;
      }

      return {
        modelName: record.modelName,
        samples: record.samples,
        features: JSON.parse(record.features),
        target: record.target,
        data: JSON.parse(record.data),
        savedAt: record.savedAt
      };
    } catch (error) {
      console.error(`[MLPlugin] Failed to load training data for "${modelName}":`, error.message);
      return null;
    }
  }

  /**
   * Delete model from plugin storage
   * @private
   */
  async _deleteModel(modelName) {
    try {
      const storage = this.getStorage();
      await storage.delete(`model_${modelName}`);

      if (this.config.verbose) {
        console.log(`[MLPlugin] Deleted model "${modelName}" from plugin storage`);
      }
    } catch (error) {
      // Ignore errors (model might not exist)
      if (this.config.verbose) {
        console.log(`[MLPlugin] Could not delete model "${modelName}": ${error.message}`);
      }
    }
  }

  /**
   * Delete training data from plugin storage
   * @private
   */
  async _deleteTrainingData(modelName) {
    try {
      const storage = this.getStorage();
      await storage.delete(`training_data_${modelName}`);

      if (this.config.verbose) {
        console.log(`[MLPlugin] Deleted training data for "${modelName}" from plugin storage`);
      }
    } catch (error) {
      // Ignore errors (training data might not exist)
      if (this.config.verbose) {
        console.log(`[MLPlugin] Could not delete training data "${modelName}": ${error.message}`);
      }
    }
  }
}

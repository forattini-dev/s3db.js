/**
 * Base Model Class
 *
 * Abstract base class for all ML models
 * Provides common functionality for training, prediction, and persistence
 */

import {
  TrainingError,
  PredictionError,
  ModelNotTrainedError,
  DataValidationError,
  InsufficientDataError,
  TensorFlowDependencyError
} from '../ml.errors.js';

export class BaseModel {
  constructor(config = {}) {
    if (this.constructor === BaseModel) {
      throw new Error('BaseModel is an abstract class and cannot be instantiated directly');
    }

    this.config = {
      name: config.name || 'unnamed',
      resource: config.resource,
      features: config.features || [],
      target: config.target,
      modelConfig: {
        epochs: 50,
        batchSize: 32,
        learningRate: 0.01,
        validationSplit: 0.2,
        ...config.modelConfig
      },
      verbose: config.verbose || false
    };

    // Model state
    this.model = null;
    this.isTrained = false;
    this.normalizer = {
      features: {},
      target: {}
    };
    this.stats = {
      trainedAt: null,
      samples: 0,
      loss: null,
      accuracy: null,
      predictions: 0,
      errors: 0
    };

    // TensorFlow will be loaded lazily on first use
    this.tf = null;
    this._tfValidated = false;
  }

  /**
   * Validate and load TensorFlow.js (lazy loading)
   * @private
   */
  async _validateTensorFlow() {
    if (this._tfValidated) {
      return; // Already validated and loaded
    }

    try {
      // Try CommonJS require first (works in most environments)
      this.tf = require('@tensorflow/tfjs-node');
      this._tfValidated = true;
    } catch (requireError) {
      // If require fails (e.g., Jest VM modules), try dynamic import
      try {
        const tfModule = await import('@tensorflow/tfjs-node');
        this.tf = tfModule.default || tfModule;
        this._tfValidated = true;
      } catch (importError) {
        throw new TensorFlowDependencyError(
          'TensorFlow.js is not installed. Run: pnpm add @tensorflow/tfjs-node',
          { originalError: importError.message }
        );
      }
    }
  }

  /**
   * Abstract method: Build the model architecture
   * Must be implemented by subclasses
   * @abstract
   */
  buildModel() {
    throw new Error('buildModel() must be implemented by subclass');
  }

  /**
   * Train the model with provided data
   * @param {Array} data - Training data records
   * @returns {Object} Training results
   */
  async train(data) {
    // Validate TensorFlow on first use (lazy loading)
    if (!this._tfValidated) {
      await this._validateTensorFlow();
    }

    try {
      if (!data || data.length === 0) {
        throw new InsufficientDataError('No training data provided', {
          model: this.config.name
        });
      }

      // Validate minimum samples
      const minSamples = this.config.modelConfig.batchSize || 10;
      if (data.length < minSamples) {
        throw new InsufficientDataError(
          `Insufficient training data: ${data.length} samples (minimum: ${minSamples})`,
          { model: this.config.name, samples: data.length, minimum: minSamples }
        );
      }

      // Prepare data (extract features and target)
      const { xs, ys } = this._prepareData(data);

      // Build model if not already built
      if (!this.model) {
        this.buildModel();
      }

      // Train the model
      const history = await this.model.fit(xs, ys, {
        epochs: this.config.modelConfig.epochs,
        batchSize: this.config.modelConfig.batchSize,
        validationSplit: this.config.modelConfig.validationSplit,
        verbose: this.config.verbose ? 1 : 0,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (this.config.verbose && epoch % 10 === 0) {
              console.log(`[MLPlugin] ${this.config.name} - Epoch ${epoch}: loss=${logs.loss.toFixed(4)}`);
            }
          }
        }
      });

      // Update stats
      this.isTrained = true;
      this.stats.trainedAt = new Date().toISOString();
      this.stats.samples = data.length;
      this.stats.loss = history.history.loss[history.history.loss.length - 1];

      // Get accuracy if available (classification models)
      if (history.history.acc) {
        this.stats.accuracy = history.history.acc[history.history.acc.length - 1];
      }

      // Cleanup tensors
      xs.dispose();
      ys.dispose();

      if (this.config.verbose) {
        console.log(`[MLPlugin] ${this.config.name} - Training completed:`, {
          samples: this.stats.samples,
          loss: this.stats.loss,
          accuracy: this.stats.accuracy
        });
      }

      return {
        loss: this.stats.loss,
        accuracy: this.stats.accuracy,
        epochs: this.config.modelConfig.epochs,
        samples: this.stats.samples
      };
    } catch (error) {
      this.stats.errors++;
      if (error instanceof InsufficientDataError || error instanceof DataValidationError) {
        throw error;
      }
      throw new TrainingError(`Training failed: ${error.message}`, {
        model: this.config.name,
        originalError: error.message
      });
    }
  }

  /**
   * Make a prediction with the trained model
   * @param {Object} input - Input features
   * @returns {Object} Prediction result
   */
  async predict(input) {
    // Validate TensorFlow on first use (lazy loading)
    if (!this._tfValidated) {
      await this._validateTensorFlow();
    }

    if (!this.isTrained) {
      throw new ModelNotTrainedError(`Model "${this.config.name}" is not trained yet`, {
        model: this.config.name
      });
    }

    try {
      // Validate input
      this._validateInput(input);

      // Extract and normalize features
      const features = this._extractFeatures(input);
      const normalizedFeatures = this._normalizeFeatures(features);

      // Convert to tensor
      const inputTensor = this.tf.tensor2d([normalizedFeatures]);

      // Predict
      const predictionTensor = this.model.predict(inputTensor);
      const predictionArray = await predictionTensor.data();

      // Cleanup
      inputTensor.dispose();
      predictionTensor.dispose();

      // Denormalize prediction
      const prediction = this._denormalizePrediction(predictionArray[0]);

      this.stats.predictions++;

      return {
        prediction,
        confidence: this._calculateConfidence(predictionArray[0])
      };
    } catch (error) {
      this.stats.errors++;
      if (error instanceof ModelNotTrainedError || error instanceof DataValidationError) {
        throw error;
      }
      throw new PredictionError(`Prediction failed: ${error.message}`, {
        model: this.config.name,
        input,
        originalError: error.message
      });
    }
  }

  /**
   * Make predictions for multiple inputs
   * @param {Array} inputs - Array of input objects
   * @returns {Array} Array of prediction results
   */
  async predictBatch(inputs) {
    if (!this.isTrained) {
      throw new ModelNotTrainedError(`Model "${this.config.name}" is not trained yet`, {
        model: this.config.name
      });
    }

    const predictions = [];
    for (const input of inputs) {
      predictions.push(await this.predict(input));
    }
    return predictions;
  }

  /**
   * Prepare training data (extract features and target)
   * @private
   * @param {Array} data - Raw training data
   * @returns {Object} Prepared tensors {xs, ys}
   */
  _prepareData(data) {
    const features = [];
    const targets = [];

    for (const record of data) {
      // Validate record has required fields
      const missingFeatures = this.config.features.filter(f => !(f in record));
      if (missingFeatures.length > 0) {
        throw new DataValidationError(
          `Missing features in training data: ${missingFeatures.join(', ')}`,
          { model: this.config.name, missingFeatures, record }
        );
      }

      if (!(this.config.target in record)) {
        throw new DataValidationError(
          `Missing target "${this.config.target}" in training data`,
          { model: this.config.name, target: this.config.target, record }
        );
      }

      // Extract features
      const featureValues = this._extractFeatures(record);
      features.push(featureValues);

      // Extract target
      targets.push(record[this.config.target]);
    }

    // Calculate normalization parameters
    this._calculateNormalizer(features, targets);

    // Normalize data
    const normalizedFeatures = features.map(f => this._normalizeFeatures(f));
    const normalizedTargets = targets.map(t => this._normalizeTarget(t));

    // Convert to tensors
    return {
      xs: this.tf.tensor2d(normalizedFeatures),
      ys: this._prepareTargetTensor(normalizedTargets)
    };
  }

  /**
   * Prepare target tensor (can be overridden by subclasses)
   * @protected
   * @param {Array} targets - Normalized target values
   * @returns {Tensor} Target tensor
   */
  _prepareTargetTensor(targets) {
    return this.tf.tensor2d(targets.map(t => [t]));
  }

  /**
   * Extract feature values from a record
   * @private
   * @param {Object} record - Data record
   * @returns {Array} Feature values
   */
  _extractFeatures(record) {
    return this.config.features.map(feature => {
      const value = record[feature];
      if (typeof value !== 'number') {
        throw new DataValidationError(
          `Feature "${feature}" must be a number, got ${typeof value}`,
          { model: this.config.name, feature, value, type: typeof value }
        );
      }
      return value;
    });
  }

  /**
   * Calculate normalization parameters (min-max scaling)
   * @private
   */
  _calculateNormalizer(features, targets) {
    const numFeatures = features[0].length;

    // Initialize normalizer
    for (let i = 0; i < numFeatures; i++) {
      const featureName = this.config.features[i];
      const values = features.map(f => f[i]);
      this.normalizer.features[featureName] = {
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }

    // Normalize target
    this.normalizer.target = {
      min: Math.min(...targets),
      max: Math.max(...targets)
    };
  }

  /**
   * Normalize features using min-max scaling
   * @private
   */
  _normalizeFeatures(features) {
    return features.map((value, i) => {
      const featureName = this.config.features[i];
      const { min, max } = this.normalizer.features[featureName];
      if (max === min) return 0.5; // Handle constant features
      return (value - min) / (max - min);
    });
  }

  /**
   * Normalize target value
   * @private
   */
  _normalizeTarget(target) {
    const { min, max } = this.normalizer.target;
    if (max === min) return 0.5;
    return (target - min) / (max - min);
  }

  /**
   * Denormalize prediction
   * @private
   */
  _denormalizePrediction(normalizedValue) {
    const { min, max } = this.normalizer.target;
    return normalizedValue * (max - min) + min;
  }

  /**
   * Calculate confidence score (can be overridden)
   * @protected
   */
  _calculateConfidence(value) {
    // Default: simple confidence based on normalized value
    // Closer to 0 or 1 = higher confidence, closer to 0.5 = lower confidence
    const distanceFrom05 = Math.abs(value - 0.5);
    return Math.min(0.5 + distanceFrom05, 1.0);
  }

  /**
   * Validate input data
   * @private
   */
  _validateInput(input) {
    const missingFeatures = this.config.features.filter(f => !(f in input));
    if (missingFeatures.length > 0) {
      throw new DataValidationError(
        `Missing features: ${missingFeatures.join(', ')}`,
        { model: this.config.name, missingFeatures, input }
      );
    }
  }

  /**
   * Export model to JSON (for persistence)
   * @returns {Object} Serialized model
   */
  async export() {
    if (!this.model) {
      return null;
    }

    const modelJSON = await this.model.toJSON();

    return {
      config: this.config,
      normalizer: this.normalizer,
      stats: this.stats,
      isTrained: this.isTrained,
      model: modelJSON
    };
  }

  /**
   * Import model from JSON
   * @param {Object} data - Serialized model data
   */
  async import(data) {
    this.config = data.config;
    this.normalizer = data.normalizer;
    this.stats = data.stats;
    this.isTrained = data.isTrained;

    if (data.model) {
      // Note: Actual model reconstruction depends on the model type
      // This is a placeholder and should be overridden by subclasses
      this.buildModel();
    }
  }

  /**
   * Dispose model and free memory
   */
  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.isTrained = false;
  }

  /**
   * Get model statistics
   */
  getStats() {
    return {
      ...this.stats,
      isTrained: this.isTrained,
      config: this.config
    };
  }
}

export default BaseModel;

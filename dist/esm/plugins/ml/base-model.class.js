/**
 * Base Model Class
 *
 * Abstract base class for all ML models
 * Provides common functionality for training, prediction, and persistence
 */
import { createRequire } from 'module';
import { TrainingError, PredictionError, ModelNotTrainedError, DataValidationError, InsufficientDataError, TensorFlowDependencyError } from '../ml.errors.js';
import { PluginError } from '../../errors.js';
import { createLogger } from '../../concerns/logger.js';
const require = createRequire(import.meta.url);
export class BaseModel {
    config;
    model;
    isTrained;
    normalizer;
    stats;
    tf;
    _tfValidated;
    logger; // Assuming logger is passed in config or created elsewhere
    constructor(config = {}) {
        if (this.constructor === BaseModel) {
            throw new PluginError('BaseModel is an abstract class and cannot be instantiated directly', {
                pluginName: 'MLPlugin',
                operation: 'baseModel:constructor',
                statusCode: 500,
                retriable: false,
                suggestion: 'Extend BaseModel and instantiate the concrete subclass instead.'
            });
        }
        this.config = {
            name: config.name || 'unnamed',
            resource: config.resource || '', // Provide a default empty string for required property
            features: config.features || [],
            target: config.target || '', // Provide a default empty string for required property
            minSamples: Math.max(1, config.minSamples ?? 10),
            modelConfig: {
                epochs: 50,
                batchSize: 32,
                learningRate: 0.01,
                validationSplit: 0.2,
                shuffle: true,
                ...config.modelConfig
            },
            logLevel: config.logLevel || 'info',
            logger: config.logger // Assuming logger might be passed down
        }; // Cast to Required to satisfy type checking
        // Model state
        this.model = null;
        this.isTrained = false;
        this.normalizer = {
            features: {},
            target: { min: 0, max: 0 }
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
        // Initialize logger if not provided in config
        if (!this.config.logger) {
            this.logger = createLogger({ name: `MLModel-${this.config.name}`, level: this.config.logLevel });
        }
        else {
            this.logger = this.config.logger;
        }
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
            // Use CommonJS require with createRequire (works reliably in both Node.js and Jest ESM mode)
            // This avoids TensorFlow.js internal ESM compatibility issues in Jest
            this.tf = require('@tensorflow/tfjs-node');
            this._tfValidated = true;
        }
        catch (error) {
            throw new TensorFlowDependencyError('TensorFlow.js is not installed. Run: pnpm add @tensorflow/tfjs-node', { originalError: error.message });
        }
    }
    /**
     * Train the model with provided data
     * @param data - Training data records
     * @returns Training results
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
            const configuredMin = this.config.minSamples ?? 10;
            const batchSize = this.config.modelConfig.batchSize || configuredMin;
            const minSamples = Math.max(1, Math.min(configuredMin, batchSize));
            if (data.length < minSamples) {
                throw new InsufficientDataError(`Insufficient training data: ${data.length} samples (minimum: ${minSamples})`, { model: this.config.name, samples: data.length, minimum: minSamples });
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
                shuffle: this.config.modelConfig.shuffle,
                verbose: (this.config.logLevel === 'debug' || this.config.logLevel === 'trace') ? 1 : 0,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        if ((this.config.logLevel === 'debug' || this.config.logLevel === 'trace') && epoch % 10 === 0) {
                            this.logger.info(`[MLPlugin] ${this.config.name} - Epoch ${epoch}: loss=${logs.loss.toFixed(4)}`);
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
            if (this.config.logLevel) {
                this.logger.info(`[MLPlugin] ${this.config.name} - Training completed:`, {
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
        }
        catch (error) {
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
     * @param input - Input features
     * @returns Prediction result
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
        }
        catch (error) {
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
     * @param inputs - Array of input objects
     * @returns Array of prediction results
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
     * @param data - Raw training data
     * @returns Prepared tensors {xs, ys}
     */
    _prepareData(data) {
        const features = [];
        const targets = [];
        for (const record of data) {
            // Validate record has required fields
            const missingFeatures = this.config.features.filter(f => !(f in record));
            if (missingFeatures.length > 0) {
                throw new DataValidationError(`Missing features in training data: ${missingFeatures.join(', ')}`, { model: this.config.name, missingFeatures, record });
            }
            if (!(this.config.target in record)) {
                throw new DataValidationError(`Missing target "${this.config.target}" in training data`, { model: this.config.name, target: this.config.target, record });
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
     * @param targets - Normalized target values
     * @returns Target tensor
     */
    _prepareTargetTensor(targets) {
        return this.tf.tensor2d(targets.map(t => [t]));
    }
    /**
     * Extract feature values from a record
     * @private
     * @param record - Data record
     * @returns Feature values
     */
    _extractFeatures(record) {
        return this.config.features.map(feature => {
            const value = record[feature];
            if (typeof value !== 'number') {
                throw new DataValidationError(`Feature "${feature}" must be a number, got ${typeof value}`, { model: this.config.name, feature, value, type: typeof value });
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
            if (max === min)
                return 0.5; // Handle constant features
            return (value - min) / (max - min);
        });
    }
    /**
     * Normalize target value
     * @private
     */
    _normalizeTarget(target) {
        const { min, max } = this.normalizer.target;
        if (max === min)
            return 0.5;
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
            throw new DataValidationError(`Missing features: ${missingFeatures.join(', ')}`, { model: this.config.name, missingFeatures, input });
        }
    }
    /**
     * Export model to JSON (for persistence)
     * @returns Serialized model
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
     * @param data - Serialized model data
     */
    async import(data) {
        if (!this._tfValidated) {
            await this._validateTensorFlow();
        }
        this.config = {
            ...this.config,
            ...data.config,
            modelConfig: {
                ...this.config.modelConfig,
                ...(data.config?.modelConfig || {})
            }
        };
        if (data.config?.minSamples) {
            this.config.minSamples = Math.max(1, data.config.minSamples);
        }
        this.normalizer = data.normalizer || this.normalizer;
        this.stats = data.stats || this.stats;
        this.isTrained = data.isTrained ?? false;
        if (this.model && typeof this.model.dispose === 'function') {
            this.model.dispose();
        }
        if (data.model) {
            this.model = await this.tf.models.modelFromJSON(data.model);
        }
        else {
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
//# sourceMappingURL=base-model.class.js.map
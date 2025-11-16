/**
 * Classification Model
 *
 * Binary and multi-class classification using TensorFlow.js
 * Predicts categorical labels/classes
 */

import { BaseModel } from './base-model.class.js';
import { ModelConfigError, DataValidationError, ModelNotTrainedError } from '../ml.errors.js';

export class ClassificationModel extends BaseModel {
  constructor(config = {}) {
    super(config);

    // Classification-specific config
    this.config.modelConfig = {
      ...this.config.modelConfig,
      units: config.modelConfig?.units || 64, // Hidden layer units
      activation: config.modelConfig?.activation || 'relu',
      dropout: config.modelConfig?.dropout || 0.2 // Dropout rate for regularization
    };

    // Class mapping (label -> index)
    this.classes = [];
    this.classToIndex = {};
    this.indexToClass = {};
  }

  /**
   * Build classification model architecture
   */
  buildModel() {
    const numFeatures = this.config.features.length;
    const numClasses = this.classes.length;

    if (numClasses < 2) {
      throw new ModelConfigError(
        'Classification requires at least 2 classes',
        { model: this.config.name, numClasses }
      );
    }

    // Create sequential model
    this.model = this.tf.sequential();

    // Input + first hidden layer
    this.model.add(this.tf.layers.dense({
      inputShape: [numFeatures],
      units: this.config.modelConfig.units,
      activation: this.config.modelConfig.activation,
      useBias: true
    }));

    // Dropout for regularization
    if (this.config.modelConfig.dropout > 0) {
      this.model.add(this.tf.layers.dropout({
        rate: this.config.modelConfig.dropout
      }));
    }

    // Second hidden layer
    this.model.add(this.tf.layers.dense({
      units: Math.floor(this.config.modelConfig.units / 2),
      activation: this.config.modelConfig.activation
    }));

    // Output layer
    const isBinary = numClasses === 2;
    this.model.add(this.tf.layers.dense({
      units: isBinary ? 1 : numClasses,
      activation: isBinary ? 'sigmoid' : 'softmax'
    }));

    // Compile model
    this.model.compile({
      optimizer: this.tf.train.adam(this.config.modelConfig.learningRate),
      loss: isBinary ? 'binaryCrossentropy' : 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    if (this.config.verbose) {
      this.logger.info(`[MLPlugin] ${this.config.name} - Built classification model (${numClasses} classes, ${isBinary ? 'binary' : 'multi-class'})`);
      this.model.summary();
    }
  }

  /**
   * Prepare training data (override to handle class labels)
   * @private
   */
  _prepareData(data) {
    const features = [];
    const targets = [];

    // Extract unique classes
    const uniqueClasses = [...new Set(data.map(r => r[this.config.target]))];
    this.classes = uniqueClasses.sort();

    // Build class mappings
    this.classes.forEach((cls, idx) => {
      this.classToIndex[cls] = idx;
      this.indexToClass[idx] = cls;
    });

    if (this.config.verbose) {
      this.logger.info(`[MLPlugin] ${this.config.name} - Detected ${this.classes.length} classes:`, this.classes);
    }

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

      // Extract target (class label)
      const targetClass = record[this.config.target];
      if (!(targetClass in this.classToIndex)) {
        throw new DataValidationError(
          `Unknown class "${targetClass}" in training data`,
          { model: this.config.name, targetClass, knownClasses: this.classes }
        );
      }

      targets.push(this.classToIndex[targetClass]);
    }

    // Calculate normalization parameters for features
    this._calculateNormalizer(features, targets);

    // Normalize features only (not targets)
    const normalizedFeatures = features.map(f => this._normalizeFeatures(f));

    // Convert to tensors
    return {
      xs: this.tf.tensor2d(normalizedFeatures),
      ys: this._prepareTargetTensor(targets)
    };
  }

  /**
   * Prepare target tensor for classification (one-hot encoding or binary)
   * @protected
   */
  _prepareTargetTensor(targets) {
    const isBinary = this.classes.length === 2;

    if (isBinary) {
      // Binary classification: [0, 1] labels
      return this.tf.tensor2d(targets.map(t => [t]));
    } else {
      // Multi-class: one-hot encoding
      return this.tf.oneHot(targets, this.classes.length);
    }
  }

  /**
   * Calculate normalization parameters (skip target normalization for classification)
   * @private
   */
  _calculateNormalizer(features, targets) {
    const numFeatures = features[0].length;

    // Initialize normalizer for features only
    for (let i = 0; i < numFeatures; i++) {
      const featureName = this.config.features[i];
      const values = features.map(f => f[i]);
      this.normalizer.features[featureName] = {
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }

    // No normalization for target (class indices)
    this.normalizer.target = { min: 0, max: 1 };
  }

  /**
   * Make a prediction (override to return class label)
   */
  async predict(input) {
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

      const isBinary = this.classes.length === 2;

      let predictedClassIndex;
      let confidence;

      if (isBinary) {
        // Binary classification: threshold at 0.5
        confidence = predictionArray[0];
        predictedClassIndex = confidence >= 0.5 ? 1 : 0;
      } else {
        // Multi-class: argmax
        predictedClassIndex = predictionArray.indexOf(Math.max(...predictionArray));
        confidence = predictionArray[predictedClassIndex];
      }

      const predictedClass = this.indexToClass[predictedClassIndex];

      this.stats.predictions++;

      return {
        prediction: predictedClass,
        confidence,
        probabilities: isBinary ? {
          [this.classes[0]]: 1 - predictionArray[0],
          [this.classes[1]]: predictionArray[0]
        } : Object.fromEntries(
          this.classes.map((cls, idx) => [cls, predictionArray[idx]])
        )
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
   * Calculate confusion matrix
   * @param {Array} data - Test data
   * @returns {Object} Confusion matrix and metrics
   */
  async calculateConfusionMatrix(data) {
    if (!this.isTrained) {
      throw new ModelNotTrainedError(`Model "${this.config.name}" is not trained yet`, {
        model: this.config.name
      });
    }

    const matrix = {};
    const numClasses = this.classes.length;

    // Initialize matrix
    for (const actualClass of this.classes) {
      matrix[actualClass] = {};
      for (const predictedClass of this.classes) {
        matrix[actualClass][predictedClass] = 0;
      }
    }

    // Populate matrix
    for (const record of data) {
      const { prediction } = await this.predict(record);
      const actual = record[this.config.target];
      matrix[actual][prediction]++;
    }

    // Calculate metrics
    let totalCorrect = 0;
    let total = 0;

    for (const cls of this.classes) {
      totalCorrect += matrix[cls][cls];
      total += Object.values(matrix[cls]).reduce((sum, val) => sum + val, 0);
    }

    const accuracy = total > 0 ? totalCorrect / total : 0;

    return {
      matrix,
      accuracy,
      total,
      correct: totalCorrect
    };
  }

  /**
   * Export model with classification-specific data
   */
  async export() {
    const baseExport = await super.export();

    return {
      ...baseExport,
      type: 'classification',
      classes: this.classes,
      classToIndex: this.classToIndex,
      indexToClass: this.indexToClass
    };
  }

  /**
   * Import model (override to restore class mappings)
   */
  async import(data) {
    await super.import(data);
    this.classes = data.classes || [];
    this.classToIndex = data.classToIndex || {};
    this.indexToClass = data.indexToClass || {};
  }
}

export default ClassificationModel;

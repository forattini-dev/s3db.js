/**
 * Neural Network Model
 *
 * Generic customizable neural network using TensorFlow.js
 * Flexible architecture for complex non-linear problems
 */

import { BaseModel } from './base-model.class.js';
import { ModelConfigError } from '../ml.errors.js';

export class NeuralNetworkModel extends BaseModel {
  constructor(config = {}) {
    super(config);

    // Neural network-specific config
    this.config.modelConfig = {
      ...this.config.modelConfig,
      layers: config.modelConfig?.layers || [
        { units: 64, activation: 'relu', dropout: 0.2 },
        { units: 32, activation: 'relu', dropout: 0.1 }
      ], // Array of hidden layer configurations
      outputActivation: config.modelConfig?.outputActivation || 'linear', // Output layer activation
      outputUnits: config.modelConfig?.outputUnits || 1, // Number of output units
      loss: config.modelConfig?.loss || 'meanSquaredError', // Loss function
      metrics: config.modelConfig?.metrics || ['mse', 'mae'] // Metrics to track
    };

    // Validate layers configuration
    this._validateLayersConfig();
  }

  /**
   * Validate layers configuration
   * @private
   */
  _validateLayersConfig() {
    if (!Array.isArray(this.config.modelConfig.layers) || this.config.modelConfig.layers.length === 0) {
      throw new ModelConfigError(
        'Neural network must have at least one hidden layer',
        { model: this.config.name, layers: this.config.modelConfig.layers }
      );
    }

    for (const [index, layer] of this.config.modelConfig.layers.entries()) {
      if (!layer.units || typeof layer.units !== 'number' || layer.units < 1) {
        throw new ModelConfigError(
          `Layer ${index} must have a valid "units" property (positive number)`,
          { model: this.config.name, layer, index }
        );
      }

      if (layer.activation && !this._isValidActivation(layer.activation)) {
        throw new ModelConfigError(
          `Layer ${index} has invalid activation function "${layer.activation}"`,
          { model: this.config.name, layer, index, validActivations: ['relu', 'sigmoid', 'tanh', 'softmax', 'elu', 'selu'] }
        );
      }
    }
  }

  /**
   * Check if activation function is valid
   * @private
   */
  _isValidActivation(activation) {
    const validActivations = ['relu', 'sigmoid', 'tanh', 'softmax', 'elu', 'selu', 'linear'];
    return validActivations.includes(activation);
  }

  /**
   * Build custom neural network architecture
   */
  buildModel() {
    const numFeatures = this.config.features.length;

    // Create sequential model
    this.model = this.tf.sequential();

    // Add hidden layers
    for (const [index, layerConfig] of this.config.modelConfig.layers.entries()) {
      const isFirstLayer = index === 0;

      // Dense layer
      const layerOptions = {
        units: layerConfig.units,
        activation: layerConfig.activation || 'relu',
        useBias: true
      };

      if (isFirstLayer) {
        layerOptions.inputShape = [numFeatures];
      }

      this.model.add(this.tf.layers.dense(layerOptions));

      // Dropout (if specified)
      if (layerConfig.dropout && layerConfig.dropout > 0) {
        this.model.add(this.tf.layers.dropout({
          rate: layerConfig.dropout
        }));
      }

      // Batch normalization (if specified)
      if (layerConfig.batchNormalization) {
        this.model.add(this.tf.layers.batchNormalization());
      }
    }

    // Output layer
    this.model.add(this.tf.layers.dense({
      units: this.config.modelConfig.outputUnits,
      activation: this.config.modelConfig.outputActivation
    }));

    // Compile model
    this.model.compile({
      optimizer: this.tf.train.adam(this.config.modelConfig.learningRate),
      loss: this.config.modelConfig.loss,
      metrics: this.config.modelConfig.metrics
    });

    if (this.config.verbose) {
      console.log(`[MLPlugin] ${this.config.name} - Built custom neural network:`);
      console.log(`  - Hidden layers: ${this.config.modelConfig.layers.length}`);
      console.log(`  - Total parameters:`, this._countParameters());
      this.model.summary();
    }
  }

  /**
   * Count total trainable parameters
   * @private
   */
  _countParameters() {
    if (!this.model) return 0;

    let totalParams = 0;
    for (const layer of this.model.layers) {
      if (layer.countParams) {
        totalParams += layer.countParams();
      }
    }
    return totalParams;
  }

  /**
   * Add layer to model (before building)
   * @param {Object} layerConfig - Layer configuration
   */
  addLayer(layerConfig) {
    if (this.model) {
      throw new ModelConfigError(
        'Cannot add layer after model is built. Use addLayer() before training.',
        { model: this.config.name }
      );
    }

    this.config.modelConfig.layers.push(layerConfig);
  }

  /**
   * Set output configuration
   * @param {Object} outputConfig - Output layer configuration
   */
  setOutput(outputConfig) {
    if (this.model) {
      throw new ModelConfigError(
        'Cannot change output after model is built. Use setOutput() before training.',
        { model: this.config.name }
      );
    }

    if (outputConfig.activation) {
      this.config.modelConfig.outputActivation = outputConfig.activation;
    }
    if (outputConfig.units) {
      this.config.modelConfig.outputUnits = outputConfig.units;
    }
    if (outputConfig.loss) {
      this.config.modelConfig.loss = outputConfig.loss;
    }
    if (outputConfig.metrics) {
      this.config.modelConfig.metrics = outputConfig.metrics;
    }
  }

  /**
   * Get model architecture summary
   */
  getArchitecture() {
    return {
      inputFeatures: this.config.features,
      hiddenLayers: this.config.modelConfig.layers.map((layer, index) => ({
        index,
        units: layer.units,
        activation: layer.activation || 'relu',
        dropout: layer.dropout || 0,
        batchNormalization: layer.batchNormalization || false
      })),
      outputLayer: {
        units: this.config.modelConfig.outputUnits,
        activation: this.config.modelConfig.outputActivation
      },
      totalParameters: this._countParameters(),
      loss: this.config.modelConfig.loss,
      metrics: this.config.modelConfig.metrics
    };
  }

  /**
   * Train with early stopping callback
   * @param {Array} data - Training data
   * @param {Object} earlyStoppingConfig - Early stopping configuration
   * @returns {Object} Training results
   */
  async trainWithEarlyStopping(data, earlyStoppingConfig = {}) {
    const {
      patience = 10,
      minDelta = 0.001,
      monitor = 'val_loss',
      restoreBestWeights = true
    } = earlyStoppingConfig;

    // Prepare data
    const { xs, ys } = this._prepareData(data);

    // Build model if not already built
    if (!this.model) {
      this.buildModel();
    }

    // Early stopping callback
    let bestValue = Infinity;
    let patienceCounter = 0;
    let bestWeights = null;

    const callbacks = {
      onEpochEnd: async (epoch, logs) => {
        const monitorValue = logs[monitor] || logs.loss;

        if (this.config.verbose && epoch % 10 === 0) {
          console.log(`[MLPlugin] ${this.config.name} - Epoch ${epoch}: ${monitor}=${monitorValue.toFixed(4)}`);
        }

        // Check for improvement
        if (monitorValue < bestValue - minDelta) {
          bestValue = monitorValue;
          patienceCounter = 0;

          if (restoreBestWeights) {
            bestWeights = await this.model.getWeights();
          }
        } else {
          patienceCounter++;

          if (patienceCounter >= patience) {
            if (this.config.verbose) {
              console.log(`[MLPlugin] ${this.config.name} - Early stopping at epoch ${epoch}`);
            }
            this.model.stopTraining = true;
          }
        }
      }
    };

    // Train
    const history = await this.model.fit(xs, ys, {
      epochs: this.config.modelConfig.epochs,
      batchSize: this.config.modelConfig.batchSize,
      validationSplit: this.config.modelConfig.validationSplit,
      verbose: this.config.verbose ? 1 : 0,
      callbacks
    });

    // Restore best weights
    if (restoreBestWeights && bestWeights) {
      this.model.setWeights(bestWeights);
    }

    // Update stats
    this.isTrained = true;
    this.stats.trainedAt = new Date().toISOString();
    this.stats.samples = data.length;
    this.stats.loss = history.history.loss[history.history.loss.length - 1];

    // Cleanup
    xs.dispose();
    ys.dispose();

    return {
      loss: this.stats.loss,
      epochs: history.epoch.length,
      samples: this.stats.samples,
      stoppedEarly: history.epoch.length < this.config.modelConfig.epochs
    };
  }

  /**
   * Export model with neural network-specific data
   */
  async export() {
    const baseExport = await super.export();

    return {
      ...baseExport,
      type: 'neural-network',
      architecture: this.getArchitecture()
    };
  }
}

export default NeuralNetworkModel;

import { PluginError } from '../errors.js';

/**
 * Machine Learning Plugin Errors
 *
 * Custom error classes for the ML Plugin with detailed context
 */

/**
 * Base ML Error
 */
export class MLError extends PluginError {
  constructor(message, context = {}) {
    const merged = {
      pluginName: context.pluginName || 'MLPlugin',
      operation: context.operation || 'unknown',
      statusCode: context.statusCode ?? 500,
      retriable: context.retriable ?? false,
      suggestion: context.suggestion ?? 'Review ML plugin configuration and datasets before retrying.',
      ...context
    };
    super(message, merged);
    this.name = 'MLError';
  }
}

/**
 * Model Configuration Error
 * Thrown when model configuration is invalid
 */
export class ModelConfigError extends MLError {
  constructor(message, context = {}) {
    super(message, {
      statusCode: context.statusCode ?? 400,
      retriable: context.retriable ?? false,
      suggestion: context.suggestion ?? 'Validate layer definitions, optimizer, and loss function values.',
      ...context
    });
    this.name = 'ModelConfigError';
  }
}

/**
 * Training Error
 * Thrown when model training fails
 */
export class TrainingError extends MLError {
  constructor(message, context = {}) {
    super(message, {
      retriable: context.retriable ?? true,
      suggestion: context.suggestion ?? 'Inspect training logs, data shapes, and GPU availability, then retry.',
      ...context
    });
    this.name = 'TrainingError';
  }
}

/**
 * Prediction Error
 * Thrown when prediction fails
 */
export class PredictionError extends MLError {
  constructor(message, context = {}) {
    super(message, {
      retriable: context.retriable ?? true,
      suggestion: context.suggestion ?? 'Verify the model is loaded and input tensors match the expected schema.',
      ...context
    });
    this.name = 'PredictionError';
  }
}

/**
 * Model Not Found Error
 * Thrown when trying to use a model that doesn't exist
 */
export class ModelNotFoundError extends MLError {
  constructor(message, context = {}) {
    super(message, {
      statusCode: 404,
      retriable: false,
      suggestion: context.suggestion ?? 'Train the model or load it from storage before invoking inference.',
      ...context
    });
    this.name = 'ModelNotFoundError';
  }
}

/**
 * Model Not Trained Error
 * Thrown when trying to predict with an untrained model
 */
export class ModelNotTrainedError extends MLError {
  constructor(message, context = {}) {
    super(message, {
      statusCode: 409,
      retriable: false,
      suggestion: context.suggestion ?? 'Run train() for this model or load a trained checkpoint.',
      ...context
    });
    this.name = 'ModelNotTrainedError';
  }
}

/**
 * Data Validation Error
 * Thrown when input data is invalid
 */
export class DataValidationError extends MLError {
  constructor(message, context = {}) {
    super(message, {
      statusCode: 422,
      retriable: false,
      suggestion: context.suggestion ?? 'Normalize input data and ensure required features are provided.',
      ...context
    });
    this.name = 'DataValidationError';
  }
}

/**
 * Insufficient Data Error
 * Thrown when there's not enough data to train
 */
export class InsufficientDataError extends MLError {
  constructor(message, context = {}) {
    super(message, {
      statusCode: 400,
      retriable: false,
      suggestion: context.suggestion ?? 'Collect more samples, reduce batch size, or adjust minimumRecords configuration.',
      ...context
    });
    this.name = 'InsufficientDataError';
  }
}

/**
 * TensorFlow Dependency Error
 * Thrown when TensorFlow.js is not installed
 */
export class TensorFlowDependencyError extends MLError {
  constructor(message = 'TensorFlow.js is not installed. Run: pnpm add @tensorflow/tfjs-node', context = {}) {
    super(message, {
      retriable: false,
      suggestion: context.suggestion ?? 'Install @tensorflow/tfjs-node or @tensorflow/tfjs to enable ML features.',
      ...context
    });
    this.name = 'TensorFlowDependencyError';
  }
}

export default {
  MLError,
  ModelConfigError,
  TrainingError,
  PredictionError,
  ModelNotFoundError,
  ModelNotTrainedError,
  DataValidationError,
  InsufficientDataError,
  TensorFlowDependencyError
};

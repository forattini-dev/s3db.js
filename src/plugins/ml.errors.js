/**
 * Machine Learning Plugin Errors
 *
 * Custom error classes for the ML Plugin with detailed context
 */

/**
 * Base ML Error
 */
export class MLError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'MLError';
    this.context = context;

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * Model Configuration Error
 * Thrown when model configuration is invalid
 */
export class ModelConfigError extends MLError {
  constructor(message, context = {}) {
    super(message, context);
    this.name = 'ModelConfigError';
  }
}

/**
 * Training Error
 * Thrown when model training fails
 */
export class TrainingError extends MLError {
  constructor(message, context = {}) {
    super(message, context);
    this.name = 'TrainingError';
  }
}

/**
 * Prediction Error
 * Thrown when prediction fails
 */
export class PredictionError extends MLError {
  constructor(message, context = {}) {
    super(message, context);
    this.name = 'PredictionError';
  }
}

/**
 * Model Not Found Error
 * Thrown when trying to use a model that doesn't exist
 */
export class ModelNotFoundError extends MLError {
  constructor(message, context = {}) {
    super(message, context);
    this.name = 'ModelNotFoundError';
  }
}

/**
 * Model Not Trained Error
 * Thrown when trying to predict with an untrained model
 */
export class ModelNotTrainedError extends MLError {
  constructor(message, context = {}) {
    super(message, context);
    this.name = 'ModelNotTrainedError';
  }
}

/**
 * Data Validation Error
 * Thrown when input data is invalid
 */
export class DataValidationError extends MLError {
  constructor(message, context = {}) {
    super(message, context);
    this.name = 'DataValidationError';
  }
}

/**
 * Insufficient Data Error
 * Thrown when there's not enough data to train
 */
export class InsufficientDataError extends MLError {
  constructor(message, context = {}) {
    super(message, context);
    this.name = 'InsufficientDataError';
  }
}

/**
 * TensorFlow Dependency Error
 * Thrown when TensorFlow.js is not installed
 */
export class TensorFlowDependencyError extends MLError {
  constructor(message = 'TensorFlow.js is not installed. Run: pnpm add @tensorflow/tfjs-node', context = {}) {
    super(message, context);
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

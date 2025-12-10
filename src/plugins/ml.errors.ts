import { PluginError } from '../errors.js';

export interface MLErrorContext {
  pluginName?: string;
  operation?: string;
  statusCode?: number;
  retriable?: boolean;
  suggestion?: string;
  [key: string]: unknown;
}

export class MLError extends PluginError {
  constructor(message: string, context: MLErrorContext = {}) {
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

export class ModelConfigError extends MLError {
  constructor(message: string, context: MLErrorContext = {}) {
    super(message, {
      statusCode: context.statusCode ?? 400,
      retriable: context.retriable ?? false,
      suggestion: context.suggestion ?? 'Validate layer definitions, optimizer, and loss function values.',
      ...context
    });
    this.name = 'ModelConfigError';
  }
}

export class TrainingError extends MLError {
  constructor(message: string, context: MLErrorContext = {}) {
    super(message, {
      retriable: context.retriable ?? true,
      suggestion: context.suggestion ?? 'Inspect training logs, data shapes, and GPU availability, then retry.',
      ...context
    });
    this.name = 'TrainingError';
  }
}

export class PredictionError extends MLError {
  constructor(message: string, context: MLErrorContext = {}) {
    super(message, {
      retriable: context.retriable ?? true,
      suggestion: context.suggestion ?? 'Verify the model is loaded and input tensors match the expected schema.',
      ...context
    });
    this.name = 'PredictionError';
  }
}

export class ModelNotFoundError extends MLError {
  constructor(message: string, context: MLErrorContext = {}) {
    super(message, {
      statusCode: 404,
      retriable: false,
      suggestion: context.suggestion ?? 'Train the model or load it from storage before invoking inference.',
      ...context
    });
    this.name = 'ModelNotFoundError';
  }
}

export class ModelNotTrainedError extends MLError {
  constructor(message: string, context: MLErrorContext = {}) {
    super(message, {
      statusCode: 409,
      retriable: false,
      suggestion: context.suggestion ?? 'Run train() for this model or load a trained checkpoint.',
      ...context
    });
    this.name = 'ModelNotTrainedError';
  }
}

export class DataValidationError extends MLError {
  constructor(message: string, context: MLErrorContext = {}) {
    super(message, {
      statusCode: 422,
      retriable: false,
      suggestion: context.suggestion ?? 'Normalize input data and ensure required features are provided.',
      ...context
    });
    this.name = 'DataValidationError';
  }
}

export class InsufficientDataError extends MLError {
  constructor(message: string, context: MLErrorContext = {}) {
    super(message, {
      statusCode: 400,
      retriable: false,
      suggestion: context.suggestion ?? 'Collect more samples, reduce batch size, or adjust minimumRecords configuration.',
      ...context
    });
    this.name = 'InsufficientDataError';
  }
}

export class TensorFlowDependencyError extends MLError {
  constructor(message: string = 'TensorFlow.js is not installed. Run: pnpm add @tensorflow/tfjs-node', context: MLErrorContext = {}) {
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

import { PluginError } from '../errors.js';
export interface MLErrorContext {
    pluginName?: string;
    operation?: string;
    statusCode?: number;
    retriable?: boolean;
    suggestion?: string;
    [key: string]: unknown;
}
export declare class MLError extends PluginError {
    constructor(message: string, context?: MLErrorContext);
}
export declare class ModelConfigError extends MLError {
    constructor(message: string, context?: MLErrorContext);
}
export declare class TrainingError extends MLError {
    constructor(message: string, context?: MLErrorContext);
}
export declare class PredictionError extends MLError {
    constructor(message: string, context?: MLErrorContext);
}
export declare class ModelNotFoundError extends MLError {
    constructor(message: string, context?: MLErrorContext);
}
export declare class ModelNotTrainedError extends MLError {
    constructor(message: string, context?: MLErrorContext);
}
export declare class DataValidationError extends MLError {
    constructor(message: string, context?: MLErrorContext);
}
export declare class InsufficientDataError extends MLError {
    constructor(message: string, context?: MLErrorContext);
}
export declare class TensorFlowDependencyError extends MLError {
    constructor(message?: string, context?: MLErrorContext);
}
declare const _default: {
    MLError: typeof MLError;
    ModelConfigError: typeof ModelConfigError;
    TrainingError: typeof TrainingError;
    PredictionError: typeof PredictionError;
    ModelNotFoundError: typeof ModelNotFoundError;
    ModelNotTrainedError: typeof ModelNotTrainedError;
    DataValidationError: typeof DataValidationError;
    InsufficientDataError: typeof InsufficientDataError;
    TensorFlowDependencyError: typeof TensorFlowDependencyError;
};
export default _default;
//# sourceMappingURL=ml.errors.d.ts.map
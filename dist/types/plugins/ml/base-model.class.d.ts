/**
 * Base Model Class
 *
 * Abstract base class for all ML models
 * Provides common functionality for training, prediction, and persistence
 */
interface TensorFlowModule {
    tensor1d: (...args: any[]) => any;
    tensor2d: (...args: any[]) => any;
    tensor3d: (...args: any[]) => any;
    models: {
        modelFromJSON: (json: any) => Promise<any>;
    };
    scalar: (...args: any[]) => any;
    layers: {
        dense: (...args: any[]) => any;
        input: (...args: any[]) => any;
        lstm: (...args: any[]) => any;
        dropout: (...args: any[]) => any;
        batchNormalization: (...args: any[]) => any;
    };
    sequential: (...args: any[]) => any;
    train: {
        adam: (...args: any[]) => any;
    };
    losses: {
        meanSquaredError: (...args: any[]) => any;
        categoricalCrossentropy: (...args: any[]) => any;
    };
    metrics: {
        accuracy: (...args: any[]) => any;
    };
    oneHot: (...args: any[]) => any;
    softmax: (...args: any[]) => any;
    argMax: (...args: any[]) => any;
    stack: (...args: any[]) => any;
    concat: (...args: any[]) => any;
    keep: (...args: any[]) => any;
    dispose: (...args: any[]) => any;
    setBackend: (...args: any[]) => any;
    ready: (...args: any[]) => any;
}
export interface BaseModelConfig {
    name?: string;
    resource?: string;
    features?: string[];
    target?: string;
    minSamples?: number;
    modelConfig?: {
        epochs?: number;
        batchSize?: number;
        learningRate?: number;
        validationSplit?: number;
        shuffle?: boolean;
        [key: string]: any;
    };
    logLevel?: string;
    logger?: any;
}
export interface Normalizer {
    features: Record<string, {
        min: number;
        max: number;
    }>;
    target: {
        min: number;
        max: number;
    };
}
export interface BaseModelStats {
    trainedAt: string | null;
    samples: number;
    loss: number | null;
    accuracy: number | null;
    r2?: number | null;
    predictions: number;
    errors: number;
    isTrained?: boolean;
    config?: any;
}
export declare abstract class BaseModel {
    config: Required<BaseModelConfig>;
    model: any;
    isTrained: boolean;
    normalizer: Normalizer;
    stats: BaseModelStats;
    tf: TensorFlowModule | null;
    _tfValidated: boolean;
    logger: any;
    constructor(config?: BaseModelConfig);
    /**
     * Validate and load TensorFlow.js (lazy loading)
     * @private
     */
    _validateTensorFlow(): Promise<void>;
    /**
     * Abstract method: Build the model architecture
     * Must be implemented by subclasses
     * @abstract
     */
    abstract buildModel(): void;
    /**
     * Train the model with provided data
     * @param data - Training data records
     * @returns Training results
     */
    train(data: any[]): Promise<any>;
    /**
     * Make a prediction with the trained model
     * @param input - Input features
     * @returns Prediction result
     */
    predict(input: any): Promise<any>;
    /**
     * Make predictions for multiple inputs
     * @param inputs - Array of input objects
     * @returns Array of prediction results
     */
    predictBatch(inputs: any[]): Promise<any[]>;
    /**
     * Prepare training data (extract features and target)
     * @private
     * @param data - Raw training data
     * @returns Prepared tensors {xs, ys}
     */
    _prepareData(data: any[]): {
        xs: any;
        ys: any;
    };
    /**
     * Prepare target tensor (can be overridden by subclasses)
     * @protected
     * @param targets - Normalized target values
     * @returns Target tensor
     */
    _prepareTargetTensor(targets: number[]): any;
    /**
     * Extract feature values from a record
     * @private
     * @param record - Data record
     * @returns Feature values
     */
    _extractFeatures(record: any): number[];
    /**
     * Calculate normalization parameters (min-max scaling)
     * @private
     */
    _calculateNormalizer(features: number[][], targets: number[]): void;
    /**
     * Normalize features using min-max scaling
     * @private
     */
    _normalizeFeatures(features: number[]): number[];
    /**
     * Normalize target value
     * @private
     */
    _normalizeTarget(target: number): number;
    /**
     * Denormalize prediction
     * @private
     */
    _denormalizePrediction(normalizedValue: number): number;
    /**
     * Calculate confidence score (can be overridden)
     * @protected
     */
    _calculateConfidence(value: number): number;
    /**
     * Validate input data
     * @private
     */
    _validateInput(input: any): void;
    /**
     * Export model to JSON (for persistence)
     * @returns Serialized model
     */
    export(): Promise<any>;
    /**
     * Import model from JSON
     * @param data - Serialized model data
     */
    import(data: any): Promise<void>;
    /**
     * Dispose model and free memory
     */
    dispose(): void;
    /**
     * Get model statistics
     */
    getStats(): BaseModelStats;
}
export default BaseModel;
//# sourceMappingURL=base-model.class.d.ts.map
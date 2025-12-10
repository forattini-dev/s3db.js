/**
 * Classification Model
 *
 * Binary and multi-class classification using TensorFlow.js
 * Predicts categorical labels/classes
 */
import { BaseModel, type BaseModelConfig } from './base-model.class.js';
export interface ClassificationModelConfig extends BaseModelConfig {
    modelConfig?: {
        units?: number;
        activation?: string;
        dropout?: number;
        [key: string]: any;
    };
}
export declare class ClassificationModel extends BaseModel {
    classes: any[];
    classToIndex: Record<string, number>;
    indexToClass: Record<number, string>;
    constructor(config?: ClassificationModelConfig);
    /**
     * Build classification model architecture
     */
    buildModel(): void;
    /**
     * Prepare training data (override to handle class labels)
     * @private
     */
    _prepareData(data: any[]): {
        xs: any;
        ys: any;
    };
    /**
     * Prepare target tensor for classification (one-hot encoding or binary)
     * @protected
     */
    _prepareTargetTensor(targets: number[]): any;
    /**
     * Calculate normalization parameters (skip target normalization for classification)
     * @private
     */
    _calculateNormalizer(features: number[][], targets: number[]): void;
    /**
     * Make a prediction (override to return class label)
     */
    predict(input: any): Promise<any>;
    /**
     * Calculate confusion matrix
     * @param data - Test data
     * @returns Confusion matrix and metrics
     */
    calculateConfusionMatrix(data: any[]): Promise<any>;
    /**
     * Export model with classification-specific data
     */
    export(): Promise<any>;
    /**
     * Import model (override to restore class mappings)
     */
    import(data: any): Promise<void>;
}
export default ClassificationModel;
//# sourceMappingURL=classification-model.class.d.ts.map
/**
 * Regression Model
 *
 * Linear and polynomial regression using TensorFlow.js
 * Predicts continuous numerical values
 */
import { BaseModel, type BaseModelConfig } from './base-model.class.js';
export interface RegressionModelConfig extends BaseModelConfig {
    modelConfig?: {
        polynomial?: number;
        units?: number;
        activation?: string;
        [key: string]: any;
    };
}
export declare class RegressionModel extends BaseModel {
    constructor(config?: RegressionModelConfig);
    /**
     * Build regression model architecture
     */
    buildModel(): void;
    /**
     * Override confidence calculation for regression
     * Uses prediction variance/uncertainty as confidence
     * @protected
     */
    _calculateConfidence(value: number): number;
    /**
     * Get R² score (coefficient of determination)
     * Measures how well the model explains the variance in the data
     * @param data - Test data
     * @returns R² score (0-1, higher is better)
     */
    calculateR2Score(data: any[]): Promise<number>;
    /**
     * Export model with regression-specific data
     */
    export(): Promise<any>;
}
export default RegressionModel;
//# sourceMappingURL=regression-model.class.d.ts.map
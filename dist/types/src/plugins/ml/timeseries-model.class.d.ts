/**
 * Time Series Model
 *
 * LSTM-based time series prediction using TensorFlow.js
 * Predicts future values based on historical sequence data
 */
import { BaseModel, type BaseModelConfig } from './base-model.class.js';
export interface TimeSeriesModelConfig extends BaseModelConfig {
    modelConfig?: {
        lookback?: number;
        lstmUnits?: number;
        denseUnits?: number;
        dropout?: number;
        recurrentDropout?: number;
        shuffle?: boolean;
        [key: string]: any;
    };
}
export declare class TimeSeriesModel extends BaseModel {
    constructor(config?: TimeSeriesModelConfig);
    /**
     * Build LSTM model architecture for time series
     */
    buildModel(): void;
    /**
     * Prepare time series data with sliding window
     * @private
     */
    _prepareData(data: any[]): {
        xs: any;
        ys: any;
    };
    /**
     * Calculate normalization for time series
     * @private
     */
    _calculateTimeSeriesNormalizer(allValues: number[][]): void;
    /**
     * Normalize a sequence step (features + target)
     * @private
     */
    _normalizeSequenceStep(values: number[]): number[];
    /**
     * Predict next value in time series
     * @param sequence - Array of recent records (length = lookback)
     * @returns Prediction result
     */
    predict(sequence: any[]): Promise<any>;
    /**
     * Predict multiple future timesteps
     * @param initialSequence - Initial sequence of records
     * @param steps - Number of steps to predict ahead
     * @returns Array of predictions
     */
    predictMultiStep(initialSequence: any[], steps?: number): Promise<number[]>;
    /**
     * Calculate Mean Absolute Percentage Error (MAPE)
     * @param data - Test data (must be sequential)
     * @returns MAPE (0-100, lower is better)
     */
    calculateMAPE(data: any[]): Promise<number>;
    /**
     * Export model with time series-specific data
     */
    export(): Promise<any>;
}
export default TimeSeriesModel;
//# sourceMappingURL=timeseries-model.class.d.ts.map
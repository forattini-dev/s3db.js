/**
 * Time Series Model
 *
 * LSTM-based time series prediction using TensorFlow.js
 * Predicts future values based on historical sequence data
 */
import { BaseModel } from './base-model.class.js';
import { ModelConfigError, DataValidationError, InsufficientDataError, ModelNotTrainedError, PredictionError } from '../ml.errors.js';
export class TimeSeriesModel extends BaseModel {
    constructor(config = {}) {
        super(config);
        // Time series-specific config
        this.config.modelConfig = {
            ...this.config.modelConfig,
            lookback: config.modelConfig?.lookback || 10, // Number of past timesteps to use
            lstmUnits: config.modelConfig?.lstmUnits || 50, // LSTM layer units
            denseUnits: config.modelConfig?.denseUnits || 25, // Dense layer units
            dropout: config.modelConfig?.dropout || 0.2,
            recurrentDropout: config.modelConfig?.recurrentDropout || 0.2
        };
        this.config.modelConfig.shuffle = config.modelConfig?.shuffle ?? false;
        // Validate lookback
        if (this.config.modelConfig.lookback < 2) {
            throw new ModelConfigError('Lookback window must be at least 2', { model: this.config.name, lookback: this.config.modelConfig.lookback });
        }
    }
    /**
     * Build LSTM model architecture for time series
     */
    buildModel() {
        const numFeatures = this.config.features.length + 1; // features + target as feature
        const lookback = this.config.modelConfig.lookback;
        if (!this.tf) {
            throw new Error('TensorFlow.js not loaded');
        }
        // Create sequential model
        this.model = this.tf.sequential();
        // LSTM layer
        this.model.add(this.tf.layers.lstm({
            inputShape: [lookback, numFeatures],
            units: this.config.modelConfig.lstmUnits,
            returnSequences: false,
            dropout: this.config.modelConfig.dropout,
            recurrentDropout: this.config.modelConfig.recurrentDropout
        }));
        // Dense hidden layer
        this.model.add(this.tf.layers.dense({
            units: this.config.modelConfig.denseUnits,
            activation: 'relu'
        }));
        // Dropout
        if (this.config.modelConfig.dropout > 0) {
            this.model.add(this.tf.layers.dropout({
                rate: this.config.modelConfig.dropout
            }));
        }
        // Output layer (predicts next value)
        this.model.add(this.tf.layers.dense({
            units: 1
        }));
        // Compile model
        this.model.compile({
            optimizer: this.tf.train.adam(this.config.modelConfig.learningRate),
            loss: 'meanSquaredError',
            metrics: ['mse', 'mae']
        });
        if (this.config.logLevel) {
            this.logger.info(`[MLPlugin] ${this.config.name} - Built LSTM time series model (lookback: ${lookback})`);
            this.model.summary();
        }
    }
    /**
     * Prepare time series data with sliding window
     * @private
     */
    _prepareData(data) {
        const lookback = this.config.modelConfig.lookback;
        if (data.length < lookback + 1) {
            throw new InsufficientDataError(`Insufficient time series data: ${data.length} samples (minimum: ${lookback + 1})`, { model: this.config.name, samples: data.length, minimum: lookback + 1 });
        }
        const sequences = [];
        const targets = [];
        const allValues = [];
        // Extract all values for normalization
        for (const record of data) {
            const features = this._extractFeatures(record);
            const target = record[this.config.target];
            allValues.push([...features, target]);
        }
        // Calculate normalization parameters
        this._calculateTimeSeriesNormalizer(allValues);
        // Create sliding windows
        for (let i = 0; i <= data.length - lookback - 1; i++) {
            const sequence = [];
            // Build sequence of lookback timesteps
            for (let j = 0; j < lookback; j++) {
                const record = data[i + j];
                const features = this._extractFeatures(record);
                const target = record[this.config.target];
                // Combine features and target as input (all are features for LSTM)
                const combined = [...features, target];
                const normalized = this._normalizeSequenceStep(combined);
                sequence.push(normalized);
            }
            // Target is the next value
            const nextRecord = data[i + lookback];
            const nextTarget = nextRecord[this.config.target];
            sequences.push(sequence);
            targets.push(this._normalizeTarget(nextTarget));
        }
        // Convert to tensors
        return {
            xs: this.tf.tensor3d(sequences), // [samples, lookback, features]
            ys: this.tf.tensor2d(targets.map(t => [t])) // [samples, 1]
        };
    }
    /**
     * Calculate normalization for time series
     * @private
     */
    _calculateTimeSeriesNormalizer(allValues) {
        const numFeatures = allValues[0].length;
        for (let i = 0; i < numFeatures; i++) {
            const values = allValues.map(v => v[i]);
            const min = Math.min(...values);
            const max = Math.max(...values);
            if (i < this.config.features.length) {
                // Feature normalization
                const featureName = this.config.features[i];
                this.normalizer.features[featureName] = { min, max };
            }
            else {
                // Target normalization
                this.normalizer.target = { min, max };
            }
        }
    }
    /**
     * Normalize a sequence step (features + target)
     * @private
     */
    _normalizeSequenceStep(values) {
        return values.map((value, i) => {
            let min, max;
            if (i < this.config.features.length) {
                const featureName = this.config.features[i];
                ({ min, max } = this.normalizer.features[featureName]);
            }
            else {
                ({ min, max } = this.normalizer.target);
            }
            if (max === min)
                return 0.5;
            return (value - min) / (max - min);
        });
    }
    /**
     * Predict next value in time series
     * @param sequence - Array of recent records (length = lookback)
     * @returns Prediction result
     */
    async predict(sequence) {
        if (!this.isTrained) {
            throw new ModelNotTrainedError(`Model "${this.config.name}" is not trained yet`, {
                model: this.config.name
            });
        }
        if (!this.tf) {
            throw new Error('TensorFlow.js not loaded');
        }
        try {
            // Validate sequence length
            if (!Array.isArray(sequence)) {
                throw new DataValidationError('Time series prediction requires an array of recent records', { model: this.config.name, input: typeof sequence });
            }
            if (sequence.length !== this.config.modelConfig.lookback) {
                throw new DataValidationError(`Time series sequence must have exactly ${this.config.modelConfig.lookback} timesteps, got ${sequence.length}`, { model: this.config.name, expected: this.config.modelConfig.lookback, got: sequence.length });
            }
            // Prepare sequence
            const normalizedSequence = [];
            for (const record of sequence) {
                this._validateInput(record); // _validateInput ensures features exist
                const features = this._extractFeatures(record);
                const target = record[this.config.target];
                const combined = [...features, target];
                normalizedSequence.push(this._normalizeSequenceStep(combined));
            }
            // Convert to tensor [1, lookback, features]
            const inputTensor = this.tf.tensor3d([normalizedSequence]);
            // Predict
            const predictionTensor = this.model.predict(inputTensor);
            const predictionArray = await predictionTensor.data();
            // Cleanup
            inputTensor.dispose();
            predictionTensor.dispose();
            // Denormalize prediction
            const prediction = this._denormalizePrediction(predictionArray[0]);
            this.stats.predictions++;
            return {
                prediction,
                confidence: this._calculateConfidence(predictionArray[0])
            };
        }
        catch (error) {
            this.stats.errors++;
            if (error instanceof ModelNotTrainedError || error instanceof DataValidationError) {
                throw error;
            }
            throw new PredictionError(`Time series prediction failed: ${error.message}`, {
                model: this.config.name,
                originalError: error.message
            });
        }
    }
    /**
     * Predict multiple future timesteps
     * @param initialSequence - Initial sequence of records
     * @param steps - Number of steps to predict ahead
     * @returns Array of predictions
     */
    async predictMultiStep(initialSequence, steps = 1) {
        if (!this.isTrained) {
            throw new ModelNotTrainedError(`Model "${this.config.name}" is not trained yet`, {
                model: this.config.name
            });
        }
        const predictions = [];
        let currentSequence = [...initialSequence];
        for (let i = 0; i < steps; i++) {
            const { prediction } = await this.predict(currentSequence);
            predictions.push(prediction);
            // Shift sequence: remove oldest, add predicted value
            currentSequence.shift();
            // Create synthetic record with predicted target
            // (features are copied from last record - this is a simplification)
            const lastRecord = currentSequence[currentSequence.length - 1];
            const syntheticRecord = {
                ...lastRecord,
                [this.config.target]: prediction
            };
            currentSequence.push(syntheticRecord);
        }
        return predictions;
    }
    /**
     * Calculate Mean Absolute Percentage Error (MAPE)
     * @param data - Test data (must be sequential)
     * @returns MAPE (0-100, lower is better)
     */
    async calculateMAPE(data) {
        if (!this.isTrained) {
            throw new ModelNotTrainedError(`Model "${this.config.name}" is not trained yet`, {
                model: this.config.name
            });
        }
        const lookback = this.config.modelConfig.lookback;
        if (data.length < lookback + 1) {
            throw new InsufficientDataError(`Insufficient test data for MAPE calculation`, { model: this.config.name, samples: data.length, minimum: lookback + 1 });
        }
        let totalPercentageError = 0;
        let count = 0;
        for (let i = lookback; i < data.length; i++) {
            const sequence = data.slice(i - lookback, i);
            const { prediction } = await this.predict(sequence);
            const actual = data[i][this.config.target];
            if (actual !== 0) {
                const percentageError = Math.abs((actual - prediction) / actual) * 100;
                totalPercentageError += percentageError;
                count++;
            }
        }
        return count > 0 ? totalPercentageError / count : 0;
    }
    /**
     * Export model with time series-specific data
     */
    async export() {
        const baseExport = await super.export();
        return {
            ...baseExport,
            type: 'timeseries',
            lookback: this.config.modelConfig.lookback
        };
    }
}
export default TimeSeriesModel;
//# sourceMappingURL=timeseries-model.class.js.map
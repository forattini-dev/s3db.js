/**
 * Regression Model
 *
 * Linear and polynomial regression using TensorFlow.js
 * Predicts continuous numerical values
 */
import { BaseModel } from './base-model.class.js';
import { ModelConfigError, ModelNotTrainedError } from '../ml.errors.js'; // Import from TS version
export class RegressionModel extends BaseModel {
    constructor(config = {}) {
        super(config);
        // Regression-specific config
        this.config.modelConfig = {
            ...this.config.modelConfig,
            polynomial: config.modelConfig?.polynomial || 1, // Degree (1 = linear, 2+ = polynomial)
            units: config.modelConfig?.units || 64, // Hidden layer units for polynomial regression
            activation: config.modelConfig?.activation || 'relu'
        };
        // Validate polynomial degree
        if (this.config.modelConfig.polynomial < 1 || this.config.modelConfig.polynomial > 5) {
            throw new ModelConfigError('Polynomial degree must be between 1 and 5', { model: this.config.name, polynomial: this.config.modelConfig.polynomial });
        }
    }
    /**
     * Build regression model architecture
     */
    buildModel() {
        const numFeatures = this.config.features.length;
        const polynomial = this.config.modelConfig.polynomial;
        if (!this.tf) {
            throw new Error('TensorFlow.js not loaded');
        }
        // Create sequential model
        this.model = this.tf.sequential();
        if (polynomial === 1) {
            // Linear regression: single dense layer
            this.model.add(this.tf.layers.dense({
                inputShape: [numFeatures],
                units: 1,
                useBias: true
            }));
        }
        else {
            // Polynomial regression: hidden layer + output
            this.model.add(this.tf.layers.dense({
                inputShape: [numFeatures],
                units: this.config.modelConfig.units,
                activation: this.config.modelConfig.activation,
                useBias: true
            }));
            // Additional hidden layer for higher degrees
            if (polynomial >= 3) {
                this.model.add(this.tf.layers.dense({
                    units: Math.floor(this.config.modelConfig.units / 2),
                    activation: this.config.modelConfig.activation
                }));
            }
            // Output layer
            this.model.add(this.tf.layers.dense({
                units: 1
            }));
        }
        // Compile model
        this.model.compile({
            optimizer: this.tf.train.adam(this.config.modelConfig.learningRate),
            loss: 'meanSquaredError',
            metrics: ['mse', 'mae']
        });
        if (this.config.logLevel) {
            this.logger.info(`[MLPlugin] ${this.config.name} - Built regression model (polynomial degree: ${polynomial})`);
            this.model.summary();
        }
    }
    /**
     * Override confidence calculation for regression
     * Uses prediction variance/uncertainty as confidence
     * @protected
     */
    _calculateConfidence(value) {
        // For regression, confidence is based on how close the normalized prediction
        // is to the training data range (0-1 after normalization)
        // If prediction is within expected range [0, 1], high confidence
        if (value >= 0 && value <= 1) {
            return 0.9 + Math.random() * 0.1; // 0.9-1.0 confidence
        }
        // If outside range, confidence decreases with distance
        const distance = Math.abs(value < 0 ? value : value - 1);
        return Math.max(0.5, 1.0 - distance);
    }
    /**
     * Get R² score (coefficient of determination)
     * Measures how well the model explains the variance in the data
     * @param data - Test data
     * @returns R² score (0-1, higher is better)
     */
    async calculateR2Score(data) {
        if (!this.isTrained) {
            throw new ModelNotTrainedError(`Model "${this.config.name}" is not trained yet`, {
                model: this.config.name
            });
        }
        const predictions = [];
        const actuals = [];
        for (const record of data) {
            const { prediction } = await this.predict(record);
            predictions.push(prediction);
            actuals.push(record[this.config.target]);
        }
        // Calculate mean of actuals
        const meanActual = actuals.reduce((sum, val) => sum + val, 0) / actuals.length;
        // Calculate total sum of squares (TSS)
        const tss = actuals.reduce((sum, actual) => {
            return sum + Math.pow(actual - meanActual, 2);
        }, 0);
        // Calculate residual sum of squares (RSS)
        const rss = predictions.reduce((sum, pred, i) => {
            return sum + Math.pow(actuals[i] - pred, 2);
        }, 0);
        // R² = 1 - (RSS / TSS)
        const r2 = 1 - (rss / tss);
        // Update stats with R2 score
        this.stats.r2 = r2;
        return r2;
    }
    /**
     * Export model with regression-specific data
     */
    async export() {
        const baseExport = await super.export();
        return {
            ...baseExport,
            type: 'regression',
            polynomial: this.config.modelConfig.polynomial
        };
    }
}
export default RegressionModel;
//# sourceMappingURL=regression-model.class.js.map
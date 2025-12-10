/**
 * Neural Network Model
 *
 * Generic customizable neural network using TensorFlow.js
 * Flexible architecture for complex non-linear problems
 */
import { BaseModel, type BaseModelConfig } from './base-model.class.js';
export interface LayerConfig {
    units: number;
    activation?: string;
    dropout?: number;
    batchNormalization?: boolean;
}
export interface NeuralNetworkModelConfig extends BaseModelConfig {
    modelConfig?: {
        layers?: LayerConfig[];
        outputActivation?: string;
        outputUnits?: number;
        loss?: string;
        metrics?: string[];
        [key: string]: any;
    };
}
export declare class NeuralNetworkModel extends BaseModel {
    constructor(config?: NeuralNetworkModelConfig);
    /**
     * Validate layers configuration
     * @private
     */
    private _validateLayersConfig;
    /**
     * Check if activation function is valid
     * @private
     */
    private _isValidActivation;
    /**
     * Build custom neural network architecture
     */
    buildModel(): void;
    /**
     * Count total trainable parameters
     * @private
     */
    private _countParameters;
    /**
     * Add layer to model (before building)
     * @param layerConfig - Layer configuration
     */
    addLayer(layerConfig: LayerConfig): void;
    /**
     * Set output configuration
     * @param outputConfig - Output layer configuration
     */
    setOutput(outputConfig: {
        activation?: string;
        units?: number;
        loss?: string;
        metrics?: string[];
    }): void;
    /**
     * Get model architecture summary
     */
    getArchitecture(): any;
    /**
     * Train with early stopping callback
     * @param data - Training data
     * @param earlyStoppingConfig - Early stopping configuration
     * @returns Training results
     */
    trainWithEarlyStopping(data: any[], earlyStoppingConfig?: any): Promise<any>;
    /**
     * Export model with neural network-specific data
     */
    export(): Promise<any>;
}
export default NeuralNetworkModel;
//# sourceMappingURL=neural-network-model.class.d.ts.map
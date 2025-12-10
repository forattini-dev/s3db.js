import { Plugin } from './plugin.class.js';
export interface ModelConfig {
    type: 'regression' | 'classification' | 'timeseries' | 'neural-network';
    resource: string;
    features: string[];
    target: string;
    partition?: {
        name: string;
        values: Record<string, any>;
    };
    autoTrain?: boolean;
    trainInterval?: number;
    trainAfterInserts?: number;
    saveModel?: boolean;
    saveTrainingData?: boolean;
    modelConfig?: Record<string, any>;
    filter?: (item: any) => boolean;
    map?: (item: any) => any;
    [key: string]: any;
}
export interface MLPluginOptions {
    models?: Record<string, ModelConfig>;
    verbose?: boolean;
    minTrainingSamples?: number;
    saveModel?: boolean;
    saveTrainingData?: boolean;
    enableVersioning?: boolean;
    logger?: any;
    logLevel?: string;
}
export interface ModelStats {
    loss?: number;
    accuracy?: number;
    r2?: number;
    samples?: number;
    isTrained?: boolean;
}
export interface ModelInstance {
    isTrained: boolean;
    dispose?: () => void;
    export: () => Promise<any>;
    import: (data: any) => Promise<void>;
    train: (data: any[]) => Promise<any>;
    predict: (input: any) => Promise<any>;
    predictBatch: (inputs: any[]) => Promise<any[]>;
    getStats: () => ModelStats;
}
export declare class MLPlugin extends Plugin {
    config: Required<MLPluginOptions> & {
        models: Record<string, ModelConfig>;
    };
    models: Record<string, ModelInstance>;
    _dependenciesValidated: boolean;
    modelVersions: Map<string, {
        currentVersion: number;
        latestVersion: number;
    }>;
    modelCache: Map<string, string>;
    training: Map<string, boolean>;
    insertCounters: Map<string, number>;
    _pendingAutoTrainingHandlers: Map<string, (createdName: string) => void>;
    _autoTrainingInitialized: Set<string>;
    cronManager: any;
    jobNames: Map<string, string>;
    stats: {
        totalTrainings: number;
        totalPredictions: number;
        totalErrors: number;
        startedAt: string | null;
    };
    constructor(options?: MLPluginOptions);
    /**
     * Install the plugin
     */
    onInstall(): Promise<void>;
    /**
     * Start the plugin
     */
    onStart(): Promise<void>;
    /**
     * Stop the plugin
     */
    onStop(): Promise<void>;
    /**
     * Uninstall the plugin
     */
    onUninstall(options?: {
        purgeData?: boolean;
    }): Promise<void>;
    /**
     * Build model cache for fast lookup
     * @private
     */
    _buildModelCache(): void;
    /**
     * Inject ML methods into Resource prototype
     * @private
     */
    _injectResourceMethods(): void;
    /**
     * Find model for a resource and target attribute
     * @private
     */
    _findModelForResource(resourceName: string, targetAttribute: string): string | null;
    /**
     * Auto-setup and train ML model (resource.ml.learn implementation)
     * @param resourceName - Resource name
     * @param target - Target attribute to predict
     * @param options - Configuration options
     * @returns Training results
     * @private
     */
    _resourceLearn(resourceName: string, target: string, options?: any): Promise<any>;
    /**
     * Auto-detect model type based on target attribute
     * @param resourceName - Resource name
     * @param target - Target attribute
     * @returns Model type
     * @private
     */
    _autoDetectType(resourceName: string, target: string): Promise<string>;
    /**
     * Auto-select best features for prediction
     * @param resourceName - Resource name
     * @param target - Target attribute
     * @returns Selected features
     * @private
     */
    _autoSelectFeatures(resourceName: string, target: string): Promise<string[]>;
    /**
     * Get default model config for type
     * @param type - Model type
     * @returns Default config
     * @private
     */
    _getDefaultModelConfig(type: string): Record<string, any>;
    /**
     * Resource predict implementation
     * @private
     */
    _resourcePredict(resourceName: string, input: any, targetAttribute: string): Promise<any>;
    /**
     * Resource trainModel implementation
     * @private
     */
    _resourceTrainModel(resourceName: string, targetAttribute: string, options?: any): Promise<any>;
    /**
     * List models for a resource
     * @private
     */
    _resourceListModels(resourceName: string): any[];
    /**
     * Validate model configuration
     * @private
     */
    _validateModelConfig(modelName: string, config: ModelConfig): void;
    /**
     * Initialize a model instance
     * @private
     */
    _initializeModel(modelName: string, config: ModelConfig): Promise<void>;
    /**
     * Setup auto-training for a model
     * @private
    */
    _setupAutoTraining(modelName: string, config: ModelConfig): void;
    /**
     * Train a model
     * @param modelName - Model name
     * @param options - Training options
     * @returns Training results
     */
    train(modelName: string, options?: any): Promise<any>;
    /**
     * Make a prediction
     * @param modelName - Model name
     * @param input - Input data (object for single prediction, array for time series)
     * @returns Prediction result
     */
    predict(modelName: string, input: any): Promise<any>;
    /**
     * Make predictions for multiple inputs
     * @param modelName - Model name
     * @param inputs - Array of input objects
     * @returns Array of prediction results
     */
    predictBatch(modelName: string, inputs: any[]): Promise<any[]>;
    /**
     * Retrain a model (reset and train from scratch)
     * @param modelName - Model name
     * @param options - Options
     * @returns Training results
     */
    retrain(modelName: string, options?: any): Promise<any>;
    /**
     * Get model statistics
     * @param modelName - Model name
     * @returns Model stats
     */
    getModelStats(modelName: string): ModelStats;
    /**
     * Get plugin statistics
     * @returns Plugin stats
     */
    getStats(): any;
    /**
     * Export a model
     * @param modelName - Model name
     * @returns Serialized model
     */
    exportModel(modelName: string): Promise<any>;
    /**
     * Import a model
     * @param modelName - Model name
     * @param data - Serialized model data
     */
    importModel(modelName: string, data: any): Promise<void>;
    /**
     * Initialize versioning for a model
     * @private
     */
    _initializeVersioning(modelName: string): Promise<void>;
    /**
     * Get next version number for a model
     * @private
     */
    _getNextVersion(modelName: string): number;
    /**
     * Update version info in storage
     * @private
     */
    _updateVersionInfo(modelName: string, version: number): Promise<void>;
    /**
     * Save model to plugin storage
     * @private
     */
    _saveModel(modelName: string): Promise<void>;
    /**
     * Save intermediate training data to plugin storage (incremental - only new samples)
     * @private
     */
    _saveTrainingData(modelName: string, rawData: any[]): Promise<void>;
    /**
     * Load model from plugin storage
     * @private
     */
    _loadModel(modelName: string): Promise<void>;
    /**
     * Load training data from plugin storage (reconstructs specific version from incremental data)
     * @param modelName - Model name
     * @param version - Version number (optional, defaults to latest)
     * @returns Training data or null if not found
     */
    getTrainingData(modelName: string, version?: number | null): Promise<any | null>;
    /**
     * Delete model from plugin storage (all versions)
     * @private
     */
    _deleteModel(modelName: string): Promise<void>;
    /**
     * Delete training data from plugin storage (all versions)
     * @private
     */
    _deleteTrainingData(modelName: string): Promise<void>;
    /**
     * List all versions of a model
     * @param modelName - Model name
     * @returns List of version info
     */
    listModelVersions(modelName: string): Promise<any[]>;
    /**
     * Load a specific version of a model
     * @param modelName - Model name
     * @param version - Version number
     */
    loadModelVersion(modelName: string, version: number): Promise<any>;
    /**
     * Set active version for a model (used for predictions)
     * @param modelName - Model name
     * @param version - Version number
     */
    setActiveVersion(modelName: string, version: number): Promise<any>;
    /**
     * Get training history for a model
     * @param modelName - Model name
     * @returns Training history
     */
    getTrainingHistory(modelName: string): Promise<any>;
    /**
     * Compare metrics between two versions
     * @param modelName - Model name
     * @param version1 - First version
     * @param version2 - Second version
     * @returns Comparison results
     */
    compareVersions(modelName: string, version1: number, version2: number): Promise<any>;
    /**
     * Rollback to a previous version
     * @param modelName - Model name
     * @param version - Version to rollback to (defaults to previous version)
     * @returns Rollback info
     */
    rollbackVersion(modelName: string, version?: number | null): Promise<any>;
}
//# sourceMappingURL=ml.plugin.d.ts.map
import { Plugin } from './plugin.class.js';
import type { Resource } from '../resource.class.js';
import type { Logger } from '../concerns/logger.js';
export type DistanceMetric = 'cosine' | 'euclidean' | 'manhattan';
export type DistanceFunction = (a: number[], b: number[]) => number;
export interface VectorPluginOptions extends Record<string, unknown> {
    dimensions?: number;
    distanceMetric?: DistanceMetric;
    storageThreshold?: number;
    autoFixBehavior?: boolean;
    autoDetectVectorField?: boolean;
    emitEvents?: boolean;
    verboseEvents?: boolean;
    eventThrottle?: number;
    logLevel?: string;
    logLevelEvents?: boolean;
    logger?: Logger;
}
export interface VectorPluginConfig extends VectorPluginOptions {
    dimensions: number;
    distanceMetric: DistanceMetric;
    storageThreshold: number;
    autoFixBehavior: boolean;
    autoDetectVectorField: boolean;
    emitEvents: boolean;
    verboseEvents: boolean;
    eventThrottle: number;
}
export interface VectorSearchOptions {
    vectorField?: string;
    limit?: number;
    distanceMetric?: DistanceMetric;
    threshold?: number | null;
    partition?: string | null;
    partitionValues?: Record<string, unknown> | null;
}
export interface VectorSearchResult {
    record: Record<string, unknown>;
    distance: number;
}
export interface ClusterOptions {
    vectorField?: string;
    k?: number;
    distanceMetric?: DistanceMetric;
    partition?: string | null;
    partitionValues?: Record<string, unknown> | null;
    maxIterations?: number;
    [key: string]: unknown;
}
export interface ClusterResult {
    clusters: Array<Array<Record<string, unknown>>>;
    centroids: number[][];
    inertia: number;
    iterations: number;
    converged: boolean;
}
export interface VectorFieldInfo {
    name: string;
    length: number;
    estimatedBytes: number;
}
export interface AutoPartitionConfig {
    partitionName: string;
    partitionValues: Record<string, boolean>;
}
export interface FindOptimalKOptions {
    minK?: number;
    maxK?: number;
    maxIterations?: number;
    tolerance?: number;
    distanceFn?: DistanceFunction;
}
export declare class VectorPlugin extends Plugin {
    config: VectorPluginConfig;
    distanceFunctions: Record<DistanceMetric, DistanceFunction>;
    private _vectorFieldCache;
    private _throttleState;
    constructor(options?: VectorPluginOptions);
    onInstall(): Promise<void>;
    onStart(): Promise<void>;
    onStop(): Promise<void>;
    onUninstall(): Promise<void>;
    validateVectorStorage(): void;
    setupEmbeddingPartitions(resource: Resource, vectorFields: VectorFieldInfo[]): void;
    isFieldOptional(attributes: Record<string, unknown>, fieldPath: string): boolean;
    capitalize(str: string): string;
    installEmbeddingHooks(resource: Resource, vectorField: string, trackingField: string): void;
    hasVectorValue(data: Record<string, unknown>, fieldPath: string): boolean;
    hasNestedKey(obj: Record<string, unknown>, path: string): boolean;
    getNestedValue(obj: Record<string, unknown>, path: string): unknown;
    setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void;
    getAutoEmbeddingPartition(resource: Resource, vectorField: string): AutoPartitionConfig | null;
    detectVectorField(resource: Resource): string | null;
    private _findEmbeddingField;
    private _emitEvent;
    findVectorFields(attributes: Record<string, unknown>, path?: string): VectorFieldInfo[];
    estimateVectorBytes(dimensions: number): number;
    installResourceMethods(): void;
    createVectorSearchMethod(resource: Resource): (queryVector: number[], options?: VectorSearchOptions) => Promise<VectorSearchResult[]>;
    createClusteringMethod(resource: Resource): (options?: ClusterOptions) => Promise<ClusterResult>;
    createDistanceMethod(): (vector1: number[], vector2: number[], metric?: DistanceMetric) => number;
    static normalize(vector: number[]): number[];
    static dotProduct(vector1: number[], vector2: number[]): number;
    static findOptimalK(vectors: number[][], options?: FindOptimalKOptions): Promise<unknown>;
}
//# sourceMappingURL=vector.plugin.d.ts.map
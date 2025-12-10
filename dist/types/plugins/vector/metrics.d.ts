export type DistanceFunction = (a: number[], b: number[]) => number;
export interface GapStatisticResult {
    gap: number;
    sk: number;
    expectedWk: number;
    actualWk: number;
}
export interface StabilityResult {
    avgInertia: number;
    stdInertia: number;
    cvInertia: number;
    avgSimilarity: number;
    stability: number;
}
export interface StabilityOptions {
    nRuns?: number;
    distanceFn?: DistanceFunction;
    maxIterations?: number;
    tolerance?: number;
}
export declare function silhouetteScore(vectors: number[][], assignments: number[], centroids: number[][], distanceFn?: DistanceFunction): number;
export declare function daviesBouldinIndex(vectors: number[][], assignments: number[], centroids: number[][], distanceFn?: DistanceFunction): number;
export declare function calinskiHarabaszIndex(vectors: number[][], assignments: number[], centroids: number[][], distanceFn?: DistanceFunction): number;
export declare function gapStatistic(vectors: number[][], assignments: number[], centroids: number[][], distanceFn?: DistanceFunction, nReferences?: number): Promise<GapStatisticResult>;
export declare function clusteringStability(vectors: number[][], k: number, options?: StabilityOptions): StabilityResult;
//# sourceMappingURL=metrics.d.ts.map
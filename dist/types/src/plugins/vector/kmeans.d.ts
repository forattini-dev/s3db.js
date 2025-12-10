export type DistanceFunction = (a: number[], b: number[]) => number;
export interface KMeansOptions {
    maxIterations?: number;
    tolerance?: number;
    distanceFn?: DistanceFunction;
    seed?: number | null;
    onIteration?: ((iteration: number, inertia: number, converged: boolean) => void) | null;
}
export interface KMeansResult {
    centroids: number[][];
    assignments: number[];
    iterations: number;
    converged: boolean;
    inertia: number;
}
export interface FindOptimalKOptions {
    minK?: number;
    maxK?: number;
    distanceFn?: DistanceFunction;
    nReferences?: number;
    stabilityRuns?: number;
    maxIterations?: number;
    tolerance?: number;
}
export interface OptimalKResult {
    k: number;
    inertia: number;
    silhouette: number;
    daviesBouldin: number;
    calinskiHarabasz: number;
    gap: number;
    gapSk: number;
    stability: number;
    cvInertia: number;
    iterations: number;
    converged: boolean;
}
export interface OptimalKRecommendations {
    elbow: number;
    silhouette: number;
    daviesBouldin: number;
    calinskiHarabasz: number;
    gap: number;
    stability: number;
}
export interface FindOptimalKResult {
    results: OptimalKResult[];
    recommendations: OptimalKRecommendations;
    consensus: number;
    summary: {
        analysisRange: string;
        totalVectors: number;
        dimensions: number;
        recommendation: number;
        confidence: number;
    };
}
export declare function kmeans(vectors: number[][], k: number, options?: KMeansOptions): KMeansResult;
export declare function findOptimalK(vectors: number[][], options?: FindOptimalKOptions): Promise<FindOptimalKResult>;
//# sourceMappingURL=kmeans.d.ts.map
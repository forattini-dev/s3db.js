import { ValidationError } from '../../errors.js';
import { euclideanDistance } from './distances.js';
export function kmeans(vectors, k, options = {}) {
    const { maxIterations = 100, tolerance = 0.0001, distanceFn = euclideanDistance, seed = null, onIteration = null } = options;
    if (vectors.length === 0) {
        throw new ValidationError('Cannot cluster empty vector array', {
            operation: 'kmeans',
            retriable: false,
            suggestion: 'Provide at least one vector before invoking k-means.'
        });
    }
    if (k < 1) {
        throw new ValidationError(`k must be at least 1, got ${k}`, {
            operation: 'kmeans',
            retriable: false,
            suggestion: 'Use a positive integer for the number of clusters.'
        });
    }
    if (k > vectors.length) {
        throw new ValidationError(`k (${k}) cannot be greater than number of vectors (${vectors.length})`, {
            operation: 'kmeans',
            retriable: false,
            suggestion: 'Reduce k or provide more vectors before clustering.'
        });
    }
    const dimensions = vectors[0].length;
    for (let i = 1; i < vectors.length; i++) {
        if (vectors[i].length !== dimensions) {
            throw new ValidationError('All vectors must have same dimensions.', {
                operation: 'kmeans',
                retriable: false,
                suggestion: 'Pad or trim vectors so every row has identical dimensionality.',
                metadata: {
                    expectedDimensions: dimensions,
                    actualDimensions: vectors[i].length,
                    index: i
                }
            });
        }
    }
    const centroids = initializeCentroidsKMeansPlusPlus(vectors, k, distanceFn, seed);
    let assignments = new Array(vectors.length);
    let iterations = 0;
    let converged = false;
    let previousInertia = Infinity;
    while (!converged && iterations < maxIterations) {
        const newAssignments = vectors.map(vector => {
            let minDist = Infinity;
            let nearestCluster = 0;
            for (let i = 0; i < k; i++) {
                const dist = distanceFn(vector, centroids[i]);
                if (dist < minDist) {
                    minDist = dist;
                    nearestCluster = i;
                }
            }
            return nearestCluster;
        });
        let inertia = 0;
        vectors.forEach((vector, i) => {
            const dist = distanceFn(vector, centroids[newAssignments[i]]);
            inertia += dist * dist;
        });
        const inertiaChange = Math.abs(previousInertia - inertia);
        converged = inertiaChange < tolerance;
        assignments = newAssignments;
        previousInertia = inertia;
        if (onIteration) {
            onIteration(iterations + 1, inertia, converged);
        }
        if (!converged) {
            const clusterSums = Array(k).fill(null).map(() => new Array(dimensions).fill(0));
            const clusterCounts = new Array(k).fill(0);
            vectors.forEach((vector, i) => {
                const cluster = assignments[i];
                clusterCounts[cluster]++;
                vector.forEach((val, j) => {
                    clusterSums[cluster][j] += val;
                });
            });
            for (let i = 0; i < k; i++) {
                if (clusterCounts[i] > 0) {
                    centroids[i] = clusterSums[i].map(sum => sum / clusterCounts[i]);
                }
                else {
                    const randomIdx = Math.floor(Math.random() * vectors.length);
                    centroids[i] = [...vectors[randomIdx]];
                }
            }
        }
        iterations++;
    }
    let inertia = 0;
    vectors.forEach((vector, i) => {
        const dist = distanceFn(vector, centroids[assignments[i]]);
        inertia += dist * dist;
    });
    return {
        centroids,
        assignments,
        iterations,
        converged,
        inertia
    };
}
function initializeCentroidsKMeansPlusPlus(vectors, k, distanceFn, seed) {
    const centroids = [];
    const n = vectors.length;
    const firstIndex = seed !== null ? seed % n : Math.floor(Math.random() * n);
    centroids.push([...vectors[firstIndex]]);
    for (let i = 1; i < k; i++) {
        const distances = vectors.map(vector => {
            return Math.min(...centroids.map(c => distanceFn(vector, c)));
        });
        const squaredDistances = distances.map(d => d * d);
        const totalSquared = squaredDistances.reduce((a, b) => a + b, 0);
        if (totalSquared === 0) {
            const randomIdx = Math.floor(Math.random() * n);
            centroids.push([...(vectors[randomIdx] ?? [])]);
            continue;
        }
        const threshold = Math.random() * totalSquared;
        let cumulativeSum = 0;
        for (let j = 0; j < n; j++) {
            cumulativeSum += squaredDistances[j];
            if (cumulativeSum >= threshold) {
                centroids.push([...vectors[j]]);
                break;
            }
        }
    }
    return centroids;
}
export async function findOptimalK(vectors, options = {}) {
    const { minK = 2, maxK = Math.min(10, Math.floor(Math.sqrt(vectors.length / 2))), distanceFn = euclideanDistance, nReferences = 10, stabilityRuns = 5, ...kmeansOptions } = options;
    const metricsModule = await import('./metrics.js');
    const { silhouetteScore, daviesBouldinIndex, calinskiHarabaszIndex, gapStatistic, clusteringStability } = metricsModule;
    const results = [];
    for (let k = minK; k <= maxK; k++) {
        const kmeansResult = kmeans(vectors, k, { ...kmeansOptions, distanceFn });
        const silhouette = silhouetteScore(vectors, kmeansResult.assignments, kmeansResult.centroids, distanceFn);
        const daviesBouldin = daviesBouldinIndex(vectors, kmeansResult.assignments, kmeansResult.centroids, distanceFn);
        const calinskiHarabasz = calinskiHarabaszIndex(vectors, kmeansResult.assignments, kmeansResult.centroids, distanceFn);
        const gap = await gapStatistic(vectors, kmeansResult.assignments, kmeansResult.centroids, distanceFn, nReferences);
        const stability = clusteringStability(vectors, k, { ...kmeansOptions, distanceFn, nRuns: stabilityRuns });
        results.push({
            k,
            inertia: kmeansResult.inertia,
            silhouette,
            daviesBouldin,
            calinskiHarabasz,
            gap: gap.gap,
            gapSk: gap.sk,
            stability: stability.stability,
            cvInertia: stability.cvInertia,
            iterations: kmeansResult.iterations,
            converged: kmeansResult.converged
        });
    }
    const elbowK = findElbowPoint(results.map(r => r.inertia));
    const recommendations = {
        elbow: minK + elbowK,
        silhouette: results.reduce((best, curr) => curr.silhouette > best.silhouette ? curr : best).k,
        daviesBouldin: results.reduce((best, curr) => curr.daviesBouldin < best.daviesBouldin ? curr : best).k,
        calinskiHarabasz: results.reduce((best, curr) => curr.calinskiHarabasz > best.calinskiHarabasz ? curr : best).k,
        gap: results.reduce((best, curr) => curr.gap > best.gap ? curr : best).k,
        stability: results.reduce((best, curr) => curr.stability > best.stability ? curr : best).k
    };
    const votes = Object.values(recommendations);
    const consensus = votes.reduce((acc, k) => {
        acc[k] = (acc[k] || 0) + 1;
        return acc;
    }, {});
    const consensusK = parseInt(Object.entries(consensus).reduce((a, b) => b[1] > a[1] ? b : a)[0]);
    return {
        results,
        recommendations,
        consensus: consensusK,
        summary: {
            analysisRange: `${minK}-${maxK}`,
            totalVectors: vectors.length,
            dimensions: vectors[0].length,
            recommendation: consensusK,
            confidence: consensus[consensusK] / votes.length
        }
    };
}
function findElbowPoint(inertias) {
    const n = inertias.length;
    if (n < 3)
        return 0;
    let maxCurvature = -Infinity;
    let elbowIndex = 0;
    for (let i = 1; i < n - 1; i++) {
        const curvature = inertias[i - 1] - 2 * inertias[i] + inertias[i + 1];
        if (curvature > maxCurvature) {
            maxCurvature = curvature;
            elbowIndex = i;
        }
    }
    return elbowIndex;
}
//# sourceMappingURL=kmeans.js.map
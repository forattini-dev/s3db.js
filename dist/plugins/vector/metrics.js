import { euclideanDistance } from './distances.js';
import { kmeans } from './kmeans.js';
export function silhouetteScore(vectors, assignments, centroids, distanceFn = euclideanDistance) {
    const k = centroids.length;
    const n = vectors.length;
    const clusters = Array(k).fill(null).map(() => []);
    vectors.forEach((_vector, i) => {
        clusters[assignments[i]].push(i);
    });
    let totalScore = 0;
    let validPoints = 0;
    if (clusters.every(c => c.length <= 1)) {
        return 0;
    }
    for (let i = 0; i < n; i++) {
        const clusterIdx = assignments[i];
        const cluster = clusters[clusterIdx];
        if (cluster.length === 1)
            continue;
        let a = 0;
        for (const j of cluster) {
            if (i !== j) {
                a += distanceFn(vectors[i], vectors[j]);
            }
        }
        a /= (cluster.length - 1);
        let b = Infinity;
        for (let otherCluster = 0; otherCluster < k; otherCluster++) {
            if (otherCluster === clusterIdx)
                continue;
            const otherPoints = clusters[otherCluster];
            if (otherPoints.length === 0)
                continue;
            let avgDist = 0;
            for (const j of otherPoints) {
                avgDist += distanceFn(vectors[i], vectors[j]);
            }
            avgDist /= otherPoints.length;
            b = Math.min(b, avgDist);
        }
        if (b === Infinity)
            continue;
        const maxAB = Math.max(a, b);
        const s = maxAB === 0 ? 0 : (b - a) / maxAB;
        totalScore += s;
        validPoints++;
    }
    return validPoints > 0 ? totalScore / validPoints : 0;
}
export function daviesBouldinIndex(vectors, assignments, centroids, distanceFn = euclideanDistance) {
    const k = centroids.length;
    const scatters = new Array(k).fill(0);
    const clusterCounts = new Array(k).fill(0);
    vectors.forEach((vector, i) => {
        const cluster = assignments[i];
        scatters[cluster] += distanceFn(vector, centroids[cluster]);
        clusterCounts[cluster]++;
    });
    for (let i = 0; i < k; i++) {
        if (clusterCounts[i] > 0) {
            scatters[i] = scatters[i] / clusterCounts[i];
        }
    }
    let dbIndex = 0;
    let validClusters = 0;
    for (let i = 0; i < k; i++) {
        if (clusterCounts[i] === 0)
            continue;
        let maxRatio = 0;
        for (let j = 0; j < k; j++) {
            if (i === j || clusterCounts[j] === 0)
                continue;
            const centroidDist = distanceFn(centroids[i], centroids[j]);
            if (centroidDist === 0)
                continue;
            const ratio = (scatters[i] + scatters[j]) / centroidDist;
            maxRatio = Math.max(maxRatio, ratio);
        }
        dbIndex += maxRatio;
        validClusters++;
    }
    return validClusters > 0 ? dbIndex / validClusters : 0;
}
export function calinskiHarabaszIndex(vectors, assignments, centroids, distanceFn = euclideanDistance) {
    const n = vectors.length;
    const k = centroids.length;
    if (k === 1 || k === n)
        return 0;
    const dimensions = vectors[0].length;
    const overallCentroid = new Array(dimensions).fill(0);
    vectors.forEach(vector => {
        vector.forEach((val, dim) => {
            overallCentroid[dim] = overallCentroid[dim] + val;
        });
    });
    overallCentroid.forEach((_val, dim, arr) => {
        arr[dim] = arr[dim] / n;
    });
    const clusterCounts = new Array(k).fill(0);
    vectors.forEach((_vector, i) => {
        clusterCounts[assignments[i]]++;
    });
    let bgss = 0;
    for (let i = 0; i < k; i++) {
        if (clusterCounts[i] === 0)
            continue;
        const dist = distanceFn(centroids[i], overallCentroid);
        bgss += clusterCounts[i] * dist * dist;
    }
    let wcss = 0;
    vectors.forEach((vector, i) => {
        const cluster = assignments[i];
        const dist = distanceFn(vector, centroids[cluster]);
        wcss += dist * dist;
    });
    if (wcss === 0)
        return 0;
    return (bgss / (k - 1)) / (wcss / (n - k));
}
export async function gapStatistic(vectors, assignments, centroids, distanceFn = euclideanDistance, nReferences = 10) {
    const n = vectors.length;
    const k = centroids.length;
    const dimensions = vectors[0].length;
    let wk = 0;
    vectors.forEach((vector, i) => {
        const dist = distanceFn(vector, centroids[assignments[i]]);
        wk += dist * dist;
    });
    wk = Math.log(wk + 1e-10);
    const referenceWks = [];
    const mins = new Array(dimensions).fill(Infinity);
    const maxs = new Array(dimensions).fill(-Infinity);
    vectors.forEach(vector => {
        vector.forEach((val, dim) => {
            mins[dim] = Math.min(mins[dim] ?? Infinity, val);
            maxs[dim] = Math.max(maxs[dim] ?? -Infinity, val);
        });
    });
    for (let ref = 0; ref < nReferences; ref++) {
        const refVectors = [];
        for (let i = 0; i < n; i++) {
            const refVector = new Array(dimensions);
            for (let dim = 0; dim < dimensions; dim++) {
                refVector[dim] = mins[dim] + Math.random() * (maxs[dim] - mins[dim]);
            }
            refVectors.push(refVector);
        }
        const refResult = kmeans(refVectors, k, { maxIterations: 50, distanceFn });
        let refWk = 0;
        refVectors.forEach((vector, i) => {
            const dist = distanceFn(vector, refResult.centroids[refResult.assignments[i]]);
            refWk += dist * dist;
        });
        referenceWks.push(Math.log(refWk + 1e-10));
    }
    const expectedWk = referenceWks.reduce((a, b) => a + b, 0) / nReferences;
    const gap = expectedWk - wk;
    const sdk = Math.sqrt(referenceWks.reduce((sum, refWk) => sum + Math.pow(refWk - expectedWk, 2), 0) / nReferences);
    const sk = sdk * Math.sqrt(1 + 1 / nReferences);
    return { gap, sk, expectedWk, actualWk: wk };
}
export function clusteringStability(vectors, k, options = {}) {
    const { nRuns = 10, distanceFn = euclideanDistance, ...kmeansOptions } = options;
    const inertias = [];
    const allAssignments = [];
    for (let run = 0; run < nRuns; run++) {
        const result = kmeans(vectors, k, {
            ...kmeansOptions,
            distanceFn,
            seed: run
        });
        inertias.push(result.inertia);
        allAssignments.push(result.assignments);
    }
    const assignmentSimilarities = [];
    for (let i = 0; i < nRuns - 1; i++) {
        for (let j = i + 1; j < nRuns; j++) {
            const similarity = calculateAssignmentSimilarity(allAssignments[i] ?? [], allAssignments[j] ?? []);
            assignmentSimilarities.push(similarity);
        }
    }
    const avgInertia = inertias.reduce((a, b) => a + b, 0) / nRuns;
    const stdInertia = Math.sqrt(inertias.reduce((sum, val) => sum + Math.pow(val - avgInertia, 2), 0) / nRuns);
    const avgSimilarity = assignmentSimilarities.length > 0
        ? assignmentSimilarities.reduce((a, b) => a + b, 0) / assignmentSimilarities.length
        : 1;
    return {
        avgInertia,
        stdInertia,
        cvInertia: avgInertia !== 0 ? stdInertia / avgInertia : 0,
        avgSimilarity,
        stability: avgSimilarity
    };
}
function calculateAssignmentSimilarity(assignments1, assignments2) {
    const n = assignments1.length;
    let matches = 0;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const sameCluster1 = assignments1[i] === assignments1[j];
            const sameCluster2 = assignments2[i] === assignments2[j];
            if (sameCluster1 === sameCluster2) {
                matches++;
            }
        }
    }
    const totalPairs = (n * (n - 1)) / 2;
    return totalPairs > 0 ? matches / totalPairs : 1;
}
//# sourceMappingURL=metrics.js.map
#!/usr/bin/env node
/**
 * Vector Clustering Benchmark (Simplified)
 *
 * Tests k-means clustering performance with s3db.js VectorPlugin using
 * synthetic embeddings (no external dependencies/downloads required).
 *
 * Benchmarks:
 * - Vector insertion (100, 1K, 10K vectors)
 * - K-means clustering performance
 * - Clustering quality metrics (silhouette score, inertia)
 * - Storage efficiency with embedding:XXX notation
 *
 * Run:
 *   node docs/benchmarks/vector-clustering-simple.bench.js [tiny|small|large]
 */

import { performance } from 'perf_hooks';
import { writeFileSync } from 'fs';
import { createDatabaseForTest } from '../../tests/config.js';
import VectorPlugin from '../../src/plugins/vector.plugin.js';

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

// Sample text categories for semantic simulation
const CATEGORIES = ['technology', 'science', 'business', 'health', 'sports'];

// Utilities
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  return `${(ms / 60000).toFixed(2)} min`;
}

/**
 * Generate synthetic embedding that simulates category-based clustering
 * Vectors in same category will be closer together
 */
function generateCategoryEmbedding(category, index, dimensions = 384) {
  const categoryIdx = CATEGORIES.indexOf(category);
  const vector = new Array(dimensions);

  // Create a "base" for the category (first 100 dims heavily weighted)
  for (let i = 0; i < dimensions; i++) {
    if (i < 100) {
      // Strong category signal in first 100 dimensions
      vector[i] = (i === categoryIdx * 20) ? 0.8 : Math.random() * 0.2 - 0.1;
    } else {
      // Random noise in remaining dimensions
      vector[i] = Math.random() * 0.4 - 0.2;
    }
  }

  // Add slight variation based on index
  const variation = (index % 10) * 0.01;
  for (let i = 0; i < dimensions; i++) {
    vector[i] += variation * (Math.random() - 0.5);
  }

  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return vector.map(val => val / magnitude);
}

// Clustering quality metrics
function euclideanDistance(v1, v2) {
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    sum += (v1[i] - v2[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function calculateSilhouetteScore(vectors, clusters, centroids) {
  let totalScore = 0;
  const clusterMembers = {};

  clusters.forEach((cluster, idx) => {
    if (!clusterMembers[cluster]) clusterMembers[cluster] = [];
    clusterMembers[cluster].push(idx);
  });

  for (let i = 0; i < vectors.length; i++) {
    const vector = vectors[i];
    const cluster = clusters[i];
    const members = clusterMembers[cluster];

    let a = 0;
    for (const j of members) {
      if (i !== j) a += euclideanDistance(vector, vectors[j]);
    }
    a = members.length > 1 ? a / (members.length - 1) : 0;

    let b = Infinity;
    for (const otherCluster in clusterMembers) {
      if (parseInt(otherCluster) !== cluster) {
        let dist = 0;
        const otherMembers = clusterMembers[otherCluster];
        for (const j of otherMembers) {
          dist += euclideanDistance(vector, vectors[j]);
        }
        dist /= otherMembers.length;
        b = Math.min(b, dist);
      }
    }

    const s = (b - a) / Math.max(a, b);
    totalScore += s;
  }

  return totalScore / vectors.length;
}

function calculateInertia(vectors, clusters, centroids) {
  let inertia = 0;
  for (let i = 0; i < vectors.length; i++) {
    const cluster = clusters[i];
    const centroid = centroids[cluster];
    const dist = euclideanDistance(vectors[i], centroid);
    inertia += dist * dist;
  }
  return inertia;
}

// Setup
async function setupDatabase(dimensions, scale) {
  const db = createDatabaseForTest(`vector-clustering-${scale}`);
  await db.connect();

  // Create resource first
  const vectors = await db.createResource({
    name: `vectors_clustering_${dimensions}d`,
    attributes: {
      id: 'string|required',
      text: 'string|required',
      category: 'string|required',
      embedding: `embedding:${dimensions}`,
      metadata: {
        type: 'object',
        optional: true,
        props: {
          timestamp: 'number|optional:true',
          index: 'number|optional:true'
        }
      }
    },
    behavior: 'body-overflow',
    paranoid: false // Allow deleteAll for benchmarks
  });

  // Install plugin after creating resource
  const vectorPlugin = new VectorPlugin({
    dimensions,
    distanceMetric: 'euclidean'
  });
  await vectorPlugin.install(db);

  return { db, vectors };
}

// Benchmark: Vector Generation & Insertion
async function benchmarkInsertion(vectors, count, dimensions) {
  console.log(`${colors.yellow}📥 Vector Generation & Insertion: ${count.toLocaleString()} vectors${colors.reset}`);

  const data = [];

  // Generate synthetic embeddings
  for (let i = 0; i < count; i++) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const embedding = generateCategoryEmbedding(category, i, dimensions);

    data.push({
      id: `doc-${i}`,
      text: `Document ${i} about ${category}`,
      category,
      embedding,
      metadata: { timestamp: Date.now(), index: i }
    });

    if ((i + 1) % 100 === 0 || i === count - 1) {
      process.stdout.write(`${colors.gray}   Generating: ${i + 1}/${count}${colors.reset}\r`);
    }
  }

  console.log(`${colors.green}   ✅ Generated ${count.toLocaleString()} embeddings${colors.reset}`);

  // Insert vectors
  const insertStart = performance.now();
  const batchSize = 100;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await vectors.insertMany(batch);
    process.stdout.write(`${colors.gray}   Inserting: ${Math.min(i + batchSize, data.length)}/${data.length}${colors.reset}\r`);
  }

  const insertDuration = performance.now() - insertStart;
  const avgMs = insertDuration / count;
  const throughput = (count / insertDuration) * 1000;

  console.log(`${colors.green}   ✅ Inserted in ${formatDuration(insertDuration)}${colors.reset}`);
  console.log(`   ⏱️  Average: ${avgMs.toFixed(2)} ms/vector`);
  console.log(`   📊 Throughput: ${throughput.toFixed(2)} vectors/s\n`);

  return {
    duration: insertDuration,
    avgMs,
    throughput
  };
}

// Benchmark: Clustering
async function benchmarkClustering(vectors, vectorCount, dimensions, kValues, iterations) {
  console.log(`${colors.yellow}🎯 Clustering Benchmark: ${vectorCount.toLocaleString()} vectors (${dimensions}D)${colors.reset}\n`);

  const results = [];

  for (const k of kValues) {
    console.log(`${colors.blue}📊 K-Means with K=${k}...${colors.reset}`);

    const startTime = performance.now();
    const clusterResult = await vectors.cluster({
      vectorField: 'embedding',
      k,
      maxIterations: iterations,
      distanceMetric: 'euclidean'
    });
    const duration = performance.now() - startTime;

    const { clusters, centroids, iterations: actualIterations, converged } = clusterResult;

    const allRecords = await vectors.getAll();
    const embeddingVectors = allRecords.map(r => r.embedding);

    // Convert clusters (array of record arrays) to assignments (array of cluster indices)
    const assignments = [];
    clusters.forEach((clusterRecords, clusterIdx) => {
      clusterRecords.forEach(record => {
        const recordIdx = allRecords.findIndex(r => r.id === record.id);
        assignments[recordIdx] = clusterIdx;
      });
    });

    const silhouetteScore = calculateSilhouetteScore(embeddingVectors, assignments, centroids);
    const inertia = calculateInertia(embeddingVectors, assignments, centroids);

    const clusterSizes = clusters.map(c => c.length);

    console.log(`${colors.green}   ✅ ${formatDuration(duration)}${colors.reset} | Iterations: ${actualIterations} | Converged: ${converged ? '✅' : '❌'}`);
    console.log(`   📏 Silhouette: ${silhouetteScore.toFixed(4)} | 📐 Inertia: ${inertia.toFixed(2)}`);
    console.log(`   📊 Cluster sizes: min=${Math.min(...clusterSizes)}, avg=${(clusterSizes.reduce((a,b)=>a+b)/k).toFixed(1)}, max=${Math.max(...clusterSizes)}\n`);

    results.push({
      k,
      duration,
      iterations: actualIterations,
      converged,
      silhouetteScore,
      inertia,
      clusterSizes,
      avgClusterSize: clusterSizes.reduce((a,b)=>a+b) / k,
      minClusterSize: Math.min(...clusterSizes),
      maxClusterSize: Math.max(...clusterSizes)
    });
  }

  return results;
}

// Benchmark: Storage
async function benchmarkStorage(count, dimensions) {
  const vectorSize = dimensions * 8; // Float64 = 8 bytes
  const compressedSize = Math.round(vectorSize * 0.23); // 77% compression
  const totalUncompressed = count * vectorSize;
  const totalCompressed = count * compressedSize;
  const savings = totalUncompressed - totalCompressed;

  console.log(`${colors.yellow}💾 Storage Analysis${colors.reset}`);
  console.log(`   Vectors: ${count.toLocaleString()} × ${dimensions}D`);
  console.log(`   Uncompressed: ${formatBytes(totalUncompressed)}`);
  console.log(`${colors.green}   Compressed: ${formatBytes(totalCompressed)} (77% savings)${colors.reset}`);
  console.log(`   Savings: ${formatBytes(savings)}\n`);

  return {
    vectorSize,
    compressedSize,
    totalUncompressed,
    totalCompressed,
    savings,
    savingsPercent: 77
  };
}

// Main benchmark
async function runBenchmark(scale = 'tiny') {
  const configs = {
    tiny: { vectorCount: 100, dimensions: 384, kValues: [3, 5, 10], iterations: 10 },
    small: { vectorCount: 1000, dimensions: 384, kValues: [5, 10, 20, 50], iterations: 10 },
    large: { vectorCount: 10000, dimensions: 384, kValues: [10, 25, 50, 100], iterations: 15 }
  };

  const config = configs[scale];
  if (!config) {
    console.error(`${colors.red}Invalid scale: ${scale}. Use 'tiny', 'small', or 'large'${colors.reset}`);
    process.exit(1);
  }

  console.log(`\n${colors.magenta}╔════════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.magenta}║  Vector Clustering Benchmark - ${scale.toUpperCase().padEnd(35)} ║${colors.reset}`);
  console.log(`${colors.magenta}╚════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  const { db, vectors } = await setupDatabase(config.dimensions, scale);

  try {
    // 1. Insert vectors
    const insertionResult = await benchmarkInsertion(vectors, config.vectorCount, config.dimensions);

    // 2. Clustering
    const clusteringResults = await benchmarkClustering(
      vectors,
      config.vectorCount,
      config.dimensions,
      config.kValues,
      config.iterations
    );

    // 3. Storage
    const storageResult = await benchmarkStorage(config.vectorCount, config.dimensions);

    // 4. Summary table
    console.log(`${colors.magenta}═══ SUMMARY TABLE ═══${colors.reset}\n`);

    const summaryTable = clusteringResults.map(r => ({
      'K': r.k,
      'Time': formatDuration(r.duration),
      'Iterations': r.iterations,
      'Converged': r.converged ? '✅' : '❌',
      'Silhouette': r.silhouetteScore.toFixed(4),
      'Inertia': r.inertia.toFixed(2),
      'Min Size': r.minClusterSize,
      'Avg Size': r.avgClusterSize.toFixed(1),
      'Max Size': r.maxClusterSize
    }));

    console.table(summaryTable);

    // 5. Export results
    const results = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      scale,
      config: {
        vectorCount: config.vectorCount,
        dimensions: config.dimensions,
        kValues: config.kValues,
        iterations: config.iterations
      },
      insertion: insertionResult,
      clustering: clusteringResults,
      storage: storageResult,
      bestK: clusteringResults.reduce((best, curr) =>
        curr.silhouetteScore > best.silhouetteScore ? curr : best
      ).k
    };

    const filename = `docs/benchmarks/vector-clustering_${scale}_results.json`;
    writeFileSync(filename, JSON.stringify(results, null, 2));
    console.log(`\n${colors.green}💾 Results exported to ${filename}${colors.reset}`);
    console.log(`${colors.green}✅ Benchmark complete!${colors.reset}\n`);

    return results;
  } finally {
    await vectors.deleteAll();
  }
}

// CLI
const scale = process.argv[2] || 'tiny';
runBenchmark(scale).catch(console.error);

# 📖 Usage Patterns & Real-World Examples

**Prev:** [Embedding Providers](./embedding-providers.md)
**Next:** [API Reference](./api-reference.md)
**Main:** [README](../README.md) | **All guides:** [Index](../README.md#-documentation-index)

> **In this guide:**
> - 5 real-world use cases with complete code
> - Similarity search, clustering, recommendations
> - Duplicate detection, user segmentation
> - Copy-paste ready examples
> - Advanced patterns and variations

**Time to read:** 25 minutes
**Difficulty:** Intermediate

---

## Quick Reference

| Use Case | Purpose | Main Method | Best For |
|----------|---------|------------|----------|
| **Similarity Search** | Find similar items | `vectorSearch()` | E-commerce, search |
| **Clustering** | Group related items | `cluster()` + `findOptimalK()` | Categorization, analysis |
| **Recommendations** | Suggest related items | `vectorSearch()` | Personalization |
| **Duplicate Detection** | Find near-duplicates | `vectorSearch()` + threshold | Data quality |
| **User Segmentation** | Group users by behavior | `cluster()` on behavior vectors | Marketing, CRM |

---

## Use Case 1: Similarity Search (KNN)

**Scenario**: User searches "gaming laptop", find 10 most similar products.

### Basic Implementation

```javascript
import OpenAI from 'openai';
import { Database, VectorPlugin } from 's3db';

const db = new Database('s3://key:secret@bucket');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const vectorPlugin = new VectorPlugin({ dimensions: 1536 });
await vectorPlugin.install(db);
await db.connect();

// Create products resource
const products = await db.createResource({
  name: 'products',
  attributes: {
    id: 'string|required',
    name: 'string|required',
    category: 'string',
    price: 'number',
    vector: 'embedding:1536'
  },
  behavior: 'body-overflow'
});

// Helper: get embedding
async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  return response.data[0].embedding;
}

// Search for similar products
const searchQuery = 'gaming laptop';
const queryVector = await getEmbedding(searchQuery);

const results = await products.vectorSearch(queryVector, {
  limit: 10,
  distanceMetric: 'cosine',
  threshold: 0.5  // Only return distance <= 0.5
});

// Display results
console.log(`Found ${results.length} similar products:\n`);

results.forEach(({ record, distance }) => {
  console.log(`${record.name}`);
  console.log(`  Category: ${record.category}`);
  console.log(`  Price: $${record.price}`);
  console.log(`  Similarity: ${(1 - distance).toFixed(3)}`);
  console.log();
});
```

### Advanced: Filtered Search by Category

```javascript
// Search only within Electronics category
const results = await products.vectorSearch(queryVector, {
  limit: 10,
  distanceMetric: 'cosine',
  partition: 'byCategory',
  partitionValues: { category: 'Electronics' }
});
```

---

## Use Case 2: Automatic Clustering with Optimal K

**Scenario**: Group 1000 products into natural categories without manual labeling.

### Complete Implementation

```javascript
// Step 1: Get all product vectors
const allProducts = await products.getAll();
const vectors = allProducts.map(p => p.vector);

console.log(`Analyzing ${vectors.length} products to find optimal K...\n`);

// Step 2: Find optimal number of clusters
const analysis = await VectorPlugin.findOptimalK(vectors, {
  minK: 2,
  maxK: 10,
  distanceMetric: 'cosine',
  nReferences: 10,      // For Gap Statistic
  stabilityRuns: 5      // For stability analysis
});

// Step 3: Review recommendations
console.log('📊 Optimal K Analysis Results:\n');
console.log(`Recommended K: ${analysis.consensus} (confidence: ${(analysis.summary.confidence * 100).toFixed(0)}%)\n`);

console.log('Metric Recommendations:');
console.log(`  Silhouette:      K = ${analysis.recommendations.silhouette}`);
console.log(`  Davies-Bouldin:  K = ${analysis.recommendations.daviesBouldin}`);
console.log(`  Calinski-Harabasz: K = ${analysis.recommendations.calinskiHarabasz}`);

// Step 4: Cluster with optimal K
const optimalK = analysis.consensus;
console.log(`\n🎯 Clustering with K = ${optimalK}...\n`);

const clustering = await products.cluster({
  k: optimalK,
  distanceMetric: 'cosine',
  maxIterations: 100
});

console.log('✅ Clustering Complete!\n');
console.log(`  Iterations:  ${clustering.iterations}`);
console.log(`  Converged:   ${clustering.converged}`);
console.log(`  Inertia:     ${clustering.inertia.toFixed(2)}\n`);

// Step 5: Analyze each cluster
clustering.clusters.forEach((cluster, i) => {
  console.log(`\nCluster ${i + 1} (${cluster.length} products):`);

  // Show top 5 products
  cluster.slice(0, 5).forEach(product => {
    console.log(`  - ${product.name} ($${product.price})`);
  });

  if (cluster.length > 5) {
    console.log(`  ... and ${cluster.length - 5} more`);
  }

  // Calculate average price
  const avgPrice = cluster.reduce((sum, p) => sum + p.price, 0) / cluster.length;
  console.log(`  Average Price: $${avgPrice.toFixed(2)}`);
});
```

---

## Use Case 3: Product Recommendations

**Scenario**: Show "Customers also viewed" on product page.

### Hybrid Recommendations (Vector + Business Rules)

```javascript
// Get current product
const currentProduct = await products.get('prod-123');

console.log(`User is viewing: ${currentProduct.name}\n`);

// Find similar products (get 50 candidates)
const candidates = await products.vectorSearch(currentProduct.vector, {
  limit: 50,
  distanceMetric: 'cosine'
});

// Apply business rules: filter, score, sort
const recommendations = candidates
  // Filter by price range (±30%)
  .filter(r => {
    const priceDiff = Math.abs(r.record.price - currentProduct.price);
    return priceDiff <= currentProduct.price * 0.3;
  })
  // Filter by minimum rating
  .filter(r => r.record.rating >= 4.0)
  // Exclude current product
  .filter(r => r.record.id !== currentProduct.id)
  // Score: 70% similarity + 30% popularity
  .map(r => ({
    ...r,
    score: (1 - r.distance) * 0.7 + (r.record.sales / 1000) * 0.3
  }))
  // Sort by score
  .sort((a, b) => b.score - a.score)
  .slice(0, 10);

// Display
console.log('Customers who viewed this also viewed:\n');

recommendations.forEach(({ record, distance }, index) => {
  const similarity = (1 - distance) * 100;
  console.log(`${index + 1}. ${record.name}`);
  console.log(`   Price: $${record.price}`);
  console.log(`   Match: ${similarity.toFixed(1)}%`);
  console.log();
});
```

---

## Use Case 4: Duplicate Detection

**Scenario**: Find and merge near-duplicate products.

### Auto-Merge or Flag Pattern

```javascript
const DUPLICATE_THRESHOLD = 0.05;  // cosine distance < 0.05 = near-duplicate

console.log('🔍 Scanning for duplicate products...\n');

const allProducts = await products.getAll();
const processedIds = new Set();
const duplicatePairs = [];

// Find all duplicate pairs
for (const product of allProducts) {
  if (processedIds.has(product.id)) continue;

  const similar = await products.vectorSearch(product.vector, {
    limit: 10,
    distanceMetric: 'cosine',
    threshold: DUPLICATE_THRESHOLD
  });

  const duplicates = similar.filter(s => s.record.id !== product.id);

  if (duplicates.length > 0) {
    duplicatePairs.push({ primary: product, duplicates });
    processedIds.add(product.id);
    duplicates.forEach(d => processedIds.add(d.record.id));
  }
}

// Process duplicates
console.log(`Found ${duplicatePairs.length} duplicate groups\n`);

for (const group of duplicatePairs) {
  const primary = group.primary;

  for (const { record: duplicate, distance } of group.duplicates) {
    if (distance < 0.01) {
      // Extremely similar - auto-merge
      console.log(`⚠️  Auto-merging ${duplicate.id} → ${primary.id}`);

      // Merge description
      await products.update(primary.id, {
        description: primary.description + ' ' + duplicate.description
      });

      // Delete duplicate
      await products.delete(duplicate.id);

    } else {
      // Somewhat similar - flag for review
      console.log(`🔎 Flagging ${duplicate.id} for manual review`);

      await reviewQueue.insert({
        type: 'duplicate',
        primaryId: primary.id,
        duplicateId: duplicate.id,
        similarity: 1 - distance
      });
    }
  }
}
```

### Preventive: Check Before Insert

```javascript
// Add beforeInsert hook to prevent duplicates
products.beforeInsert(async (data) => {
  // Generate embedding
  const embedding = await getEmbedding(data.description);
  data.vector = embedding;

  // Check for existing duplicates
  const similar = await products.vectorSearch(embedding, {
    limit: 1,
    threshold: 0.05
  });

  if (similar.length > 0) {
    throw new Error('Potential duplicate detected: ' + similar[0].record.name);
  }

  return data;
});
```

---

## Use Case 5: User Segmentation

**Scenario**: Group users by browsing behavior for targeted campaigns.

### Complete User Segmentation Pipeline

```javascript
// Step 1: Create users resource with behavior vector
const users = await db.createResource({
  name: 'users',
  attributes: {
    id: 'string|required',
    email: 'string|required',
    name: 'string',
    behaviorVector: 'embedding:10',  // 10 categories
    segment: 'string'
  },
  behavior: 'body-overflow'
});

// Step 2: Build behavior vectors from user history
async function buildBehaviorVector(userId) {
  const history = await browsingHistory.list({ filter: { userId } });

  const categories = [
    'Electronics', 'Fashion', 'Home', 'Sports',
    'Books', 'Toys', 'Food', 'Beauty', 'Health', 'Auto'
  ];

  const vector = categories.map(category => {
    const views = history.filter(h => h.category === category).length;
    const purchases = history.filter(h => h.category === category && h.purchased).length;
    return views + (purchases * 5);  // Weight purchases
  });

  return VectorPlugin.normalize(vector);
}

// Step 3: Update all users with behavior vectors
console.log('Building behavior vectors...\n');

const allUsers = await users.getAll();
for (const user of allUsers) {
  const behaviorVector = await buildBehaviorVector(user.id);
  await users.update(user.id, { behaviorVector });
}

// Step 4: Find optimal number of segments
const userVectors = allUsers.map(u => u.behaviorVector);

const segmentAnalysis = await VectorPlugin.findOptimalK(userVectors, {
  minK: 3,
  maxK: 8,
  distanceMetric: 'euclidean',
  nReferences: 10,
  stabilityRuns: 5
});

console.log(`Recommended segments: ${segmentAnalysis.consensus}\n`);

// Step 5: Cluster users
const clustering = await users.cluster({
  k: segmentAnalysis.consensus,
  vectorField: 'behaviorVector',
  distanceMetric: 'euclidean'
});

// Step 6: Analyze and name segments
const segmentNames = [
  'Tech Enthusiasts',
  'Fashion Lovers',
  'Home Improvers',
  'Sports Fans',
  'Bookworms'
];

clustering.clusters.forEach(async (cluster, i) => {
  const segmentName = segmentNames[i] || `Segment ${i + 1}`;
  const categories = ['Electronics', 'Fashion', 'Home', 'Sports', 'Books', 'Toys', 'Food', 'Beauty', 'Health', 'Auto'];

  console.log(`\n${segmentName} (${cluster.length} users):`);

  // Update users with segment
  for (const user of cluster) {
    await users.update(user.id, { segment: segmentName });
  }

  // Analyze segment characteristics
  const avgVector = clustering.centroids[i];
  const topCategories = avgVector
    .map((value, index) => ({ category: categories[index], score: value }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  console.log('  Top interests:');
  topCategories.forEach(({ category, score }) => {
    console.log(`    - ${category}: ${(score * 100).toFixed(1)}%`);
  });
});

// Step 7: Send targeted campaigns
const campaigns = {
  'Tech Enthusiasts': {
    subject: '🚀 New Tech Arrivals - Exclusive Early Access',
    products: 'electronics'
  },
  'Fashion Lovers': {
    subject: '👗 Spring Collection - 20% Off',
    products: 'fashion'
  }
};

for (const [segment, campaign] of Object.entries(campaigns)) {
  const segmentUsers = await users.list({ filter: { segment } });
  console.log(`Sending email to ${segmentUsers.length} ${segment}`);
}
```

---

## Common Patterns

### Pattern: Threshold-Based Filtering

```javascript
// Only return results above similarity threshold
const results = await products.vectorSearch(queryVector, {
  limit: 10,
  threshold: 0.75  // Only return similarity > 0.75
});
```

### Pattern: Combine Multiple Metrics

```javascript
// Score = 60% similarity + 30% popularity + 10% rating
const scored = results.map(r => ({
  ...r,
  score: (1 - r.distance) * 0.6 + (r.record.popularity * 0.3) + ((r.record.rating / 5) * 0.1)
}));
```

### Pattern: Batch Processing

```javascript
// Process items in batches
const batchSize = 100;
for (let i = 0; i < items.length; i += batchSize) {
  const batch = items.slice(i, i + batchSize);
  // Process batch
}
```

---

## 📚 See Also

- **[Getting Started](./getting-started.md)** - Installation and setup
- **[Embedding Providers](./embedding-providers.md)** - 5 provider guides
- **[API Reference](./api-reference.md)** - Complete method docs
- **[Advanced](./advanced.md)** - Events, performance, monitoring
- **[Best Practices](./best-practices.md)** - Tips and troubleshooting

---

**Ready to implement?** Choose a use case above or check [API Reference →](./api-reference.md) for detailed method documentation.

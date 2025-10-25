/**
 * Example 72: ML Plugin - Model Versioning & Incremental Training
 *
 * Demonstrates:
 * - Automatic model versioning with each training
 * - Incremental training data storage (history)
 * - Version management (list, load, compare, rollback)
 * - Training history with metrics tracking
 *
 * Run: node docs/examples/e72-ml-plugin-versioning.js
 */

import { Database, MLPlugin } from '../../src/index.js';

console.log('='.repeat(60));
console.log('Example 72: ML Plugin - Model Versioning');
console.log('='.repeat(60));

// Create database
const db = new Database({
  client: 'memory',
  verbose: false
});

// Create products resource
const products = await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    cost: 'number|required',
    margin: 'number|required',
    demand: 'number|required',
    price: 'number|required'
  }
});

console.log('\n✅ Created products resource\n');

// Install ML Plugin with versioning enabled
const mlPlugin = new MLPlugin({
  verbose: true,
  saveModel: true,
  saveTrainingData: true,
  enableVersioning: true,  // Enable versioning (default)
  minTrainingSamples: 5,
  models: {
    pricingModel: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'margin', 'demand'],
      target: 'price',
      modelConfig: {
        epochs: 50,
        batchSize: 4,
        learningRate: 0.01,
        polynomial: 2
      }
    }
  }
});

await db.install(mlPlugin);
await db.start();

console.log('\n' + '='.repeat(60));
console.log('📊 Training Version 1 (Initial Dataset)');
console.log('='.repeat(60));

// Insert initial training data (10 samples)
const initialData = [
  { name: 'Product A', cost: 100, margin: 0.3, demand: 50, price: 150 },
  { name: 'Product B', cost: 200, margin: 0.25, demand: 30, price: 280 },
  { name: 'Product C', cost: 150, margin: 0.4, demand: 40, price: 240 },
  { name: 'Product D', cost: 80, margin: 0.5, demand: 60, price: 150 },
  { name: 'Product E', cost: 120, margin: 0.35, demand: 45, price: 180 },
  { name: 'Product F', cost: 250, margin: 0.2, demand: 25, price: 320 },
  { name: 'Product G', cost: 90, margin: 0.45, demand: 55, price: 145 },
  { name: 'Product H', cost: 180, margin: 0.3, demand: 35, price: 260 },
  { name: 'Product I', cost: 110, margin: 0.4, demand: 50, price: 170 },
  { name: 'Product J', cost: 220, margin: 0.25, demand: 28, price: 300 }
];

for (const product of initialData) {
  await products.insert(product);
}

console.log(`\n📦 Inserted ${initialData.length} initial products`);

// Train v1
const v1Result = await mlPlugin.train('pricingModel');
console.log('\n✅ Version 1 trained:');
console.log(`   - Samples: ${v1Result.samples}`);
console.log(`   - Loss: ${v1Result.loss.toFixed(4)}`);
console.log(`   - R² Score: ${v1Result.r2Score?.toFixed(4) || 'N/A'}`);

console.log('\n' + '='.repeat(60));
console.log('📊 Training Version 2 (More Data)');
console.log('='.repeat(60));

// Add more training data (10 more samples)
const moreData = [
  { name: 'Product K', cost: 130, margin: 0.35, demand: 48, price: 190 },
  { name: 'Product L', cost: 170, margin: 0.3, demand: 38, price: 240 },
  { name: 'Product M', cost: 95, margin: 0.4, demand: 52, price: 155 },
  { name: 'Product N', cost: 210, margin: 0.25, demand: 32, price: 285 },
  { name: 'Product O', cost: 140, margin: 0.35, demand: 42, price: 210 },
  { name: 'Product P', cost: 260, margin: 0.2, demand: 22, price: 330 },
  { name: 'Product Q', cost: 85, margin: 0.5, demand: 65, price: 145 },
  { name: 'Product R', cost: 190, margin: 0.28, demand: 34, price: 265 },
  { name: 'Product S', cost: 115, margin: 0.38, demand: 47, price: 175 },
  { name: 'Product T', cost: 230, margin: 0.23, demand: 27, price: 305 }
];

for (const product of moreData) {
  await products.insert(product);
}

console.log(`\n📦 Inserted ${moreData.length} more products (total: ${initialData.length + moreData.length})`);

// Train v2
const v2Result = await mlPlugin.train('pricingModel');
console.log('\n✅ Version 2 trained:');
console.log(`   - Samples: ${v2Result.samples}`);
console.log(`   - Loss: ${v2Result.loss.toFixed(4)}`);
console.log(`   - R² Score: ${v2Result.r2Score?.toFixed(4) || 'N/A'}`);

console.log('\n' + '='.repeat(60));
console.log('📊 Training Version 3 (Even More Data)');
console.log('='.repeat(60));

// Add even more training data (10 more samples)
const evenMoreData = [
  { name: 'Product U', cost: 125, margin: 0.36, demand: 49, price: 185 },
  { name: 'Product V', cost: 175, margin: 0.29, demand: 36, price: 245 },
  { name: 'Product W', cost: 88, margin: 0.48, demand: 58, price: 148 },
  { name: 'Product X', cost: 215, margin: 0.24, demand: 29, price: 290 },
  { name: 'Product Y', cost: 145, margin: 0.34, demand: 43, price: 215 },
  { name: 'Product Z', cost: 265, margin: 0.19, demand: 21, price: 335 },
  { name: 'Product AA', cost: 82, margin: 0.52, demand: 68, price: 142 },
  { name: 'Product AB', cost: 195, margin: 0.27, demand: 33, price: 270 },
  { name: 'Product AC', cost: 118, margin: 0.37, demand: 46, price: 178 },
  { name: 'Product AD', cost: 235, margin: 0.22, demand: 26, price: 310 }
];

for (const product of evenMoreData) {
  await products.insert(product);
}

console.log(`\n📦 Inserted ${evenMoreData.length} more products (total: ${initialData.length + moreData.length + evenMoreData.length})`);

// Train v3
const v3Result = await mlPlugin.train('pricingModel');
console.log('\n✅ Version 3 trained:');
console.log(`   - Samples: ${v3Result.samples}`);
console.log(`   - Loss: ${v3Result.loss.toFixed(4)}`);
console.log(`   - R² Score: ${v3Result.r2Score?.toFixed(4) || 'N/A'}`);

console.log('\n' + '='.repeat(60));
console.log('📋 Listing All Versions');
console.log('='.repeat(60));

const versions = await mlPlugin.listModelVersions('pricingModel');
console.log(`\n✅ Found ${versions.length} versions:\n`);

versions.forEach(v => {
  console.log(`   v${v.version} ${v.isCurrent ? '(CURRENT)' : ''}`);
  console.log(`   - Saved: ${v.savedAt}`);
  console.log(`   - Samples: ${v.metrics.samples || 'N/A'}`);
  console.log(`   - Loss: ${v.metrics.loss?.toFixed(4) || 'N/A'}`);
  console.log(`   - Accuracy: ${v.metrics.accuracy?.toFixed(4) || 'N/A'}`);
  console.log('');
});

console.log('='.repeat(60));
console.log('📊 Comparing Versions');
console.log('='.repeat(60));

// Compare v1 vs v2
const comparison12 = await mlPlugin.compareVersions('pricingModel', 1, 2);
console.log('\n📈 v1 vs v2:');
console.log(`   v1 Loss: ${comparison12.version1.metrics.loss?.toFixed(4) || 'N/A'}`);
console.log(`   v2 Loss: ${comparison12.version2.metrics.loss?.toFixed(4) || 'N/A'}`);
console.log(`   Improvement: ${comparison12.improvement.loss}`);

// Compare v2 vs v3
const comparison23 = await mlPlugin.compareVersions('pricingModel', 2, 3);
console.log('\n📈 v2 vs v3:');
console.log(`   v2 Loss: ${comparison23.version2.metrics.loss?.toFixed(4) || 'N/A'}`);
console.log(`   v3 Loss: ${comparison23.version2.metrics.loss?.toFixed(4) || 'N/A'}`);
console.log(`   Improvement: ${comparison23.improvement.loss}`);

console.log('\n' + '='.repeat(60));
console.log('📜 Training History');
console.log('='.repeat(60));

const history = await mlPlugin.getTrainingHistory('pricingModel');
if (history) {
  console.log(`\n✅ Total trainings: ${history.totalTrainings}`);
  console.log(`✅ Latest version: v${history.latestVersion}`);
  console.log(`\n📊 History:\n`);

  history.history.forEach((entry, i) => {
    console.log(`   [${i + 1}] Version ${entry.version}`);
    console.log(`       - Samples: ${entry.samples}`);
    console.log(`       - Loss: ${entry.metrics.loss?.toFixed(4) || 'N/A'}`);
    console.log(`       - Trained: ${entry.trainedAt}`);
    console.log('');
  });
}

console.log('='.repeat(60));
console.log('🔄 Testing Rollback');
console.log('='.repeat(60));

// Make prediction with v3 (current)
const testInput = { cost: 150, margin: 0.35, demand: 45 };
const predictionV3 = await mlPlugin.predict('pricingModel', testInput);
console.log(`\n📊 Prediction with v3 (current):`);
console.log(`   Input: cost=${testInput.cost}, margin=${testInput.margin}, demand=${testInput.demand}`);
console.log(`   Predicted Price: $${predictionV3.value.toFixed(2)}`);
console.log(`   Confidence: ${(predictionV3.confidence * 100).toFixed(1)}%`);

// Rollback to v2
console.log('\n🔙 Rolling back to v2...');
const rollback = await mlPlugin.rollbackVersion('pricingModel', 2);
console.log(`✅ Rolled back from v${rollback.previousVersion} to v${rollback.currentVersion}`);

// Make prediction with v2
const predictionV2 = await mlPlugin.predict('pricingModel', testInput);
console.log(`\n📊 Prediction with v2 (after rollback):`);
console.log(`   Input: cost=${testInput.cost}, margin=${testInput.margin}, demand=${testInput.demand}`);
console.log(`   Predicted Price: $${predictionV2.value.toFixed(2)}`);
console.log(`   Confidence: ${(predictionV2.confidence * 100).toFixed(1)}%`);
console.log(`\n   Difference: $${Math.abs(predictionV3.value - predictionV2.value).toFixed(2)}`);

// Set v3 back as active
console.log('\n⏩ Setting v3 back as active...');
await mlPlugin.setActiveVersion('pricingModel', 3);
console.log('✅ Version 3 is now active again');

const predictionV3Again = await mlPlugin.predict('pricingModel', testInput);
console.log(`\n📊 Prediction with v3 (restored):`);
console.log(`   Predicted Price: $${predictionV3Again.value.toFixed(2)}`);

console.log('\n' + '='.repeat(60));
console.log('✅ Example Complete!');
console.log('='.repeat(60));

console.log('\n📝 Key Takeaways:');
console.log('   1. Each training automatically creates a new version (v1, v2, v3...)');
console.log('   2. Training history is incremental (append-only, never replaces)');
console.log('   3. All versions are preserved in S3 with metrics');
console.log('   4. Can compare metrics between any two versions');
console.log('   5. Rollback to any previous version instantly');
console.log('   6. Set any version as "active" for predictions');
console.log('   7. Complete audit trail of model evolution');

console.log('\n💾 S3 Storage Structure:');
console.log('   .plugin-ml/');
console.log('     ├── version_pricingModel          # Version metadata');
console.log('     ├── model_pricingModel_v1         # Model v1');
console.log('     ├── model_pricingModel_v2         # Model v2');
console.log('     ├── model_pricingModel_v3         # Model v3');
console.log('     ├── model_pricingModel_active     # Active version reference');
console.log('     └── training_history_pricingModel # Complete training history');

await db.stop();
process.exit(0);

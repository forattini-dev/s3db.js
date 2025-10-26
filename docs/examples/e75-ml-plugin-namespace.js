/**
 * Example 75: ML Plugin - New Namespace API (resource.ml.*)
 *
 * Demonstrates the new intuitive API using resource.ml namespace:
 * - resource.ml.learn('attribute') - Zero-config ML setup
 * - resource.ml.predict(input, 'attribute') - Make predictions
 * - resource.ml.train('attribute') - Manual training
 * - resource.ml.list() - List all models
 * - resource.ml.versions/rollback/stats - Version management
 *
 * Requirements:
 * - Install TensorFlow.js: pnpm add @tensorflow/tfjs-node
 *
 * Run: node docs/examples/e75-ml-plugin-namespace.js
 */

import { Database, MLPlugin } from '../../src/index.js';

console.log('='.repeat(60));
console.log('Example 75: ML Plugin - New Namespace API (resource.ml.*)');
console.log('='.repeat(60));

// Create in-memory database
const db = new Database({
  client: 'memory',
  verbose: false
});

// Install ML Plugin (empty config - models created dynamically!)
const mlPlugin = new MLPlugin({
  verbose: true,
  minTrainingSamples: 5
});

await db.usePlugin(mlPlugin);

// Create products resource
const products = await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    cost: 'number|required',
    margin: 'number|required',
    demand: 'number|required',
    price: 'number|required'
  },
  timestamps: true
});

console.log('\n✅ Products resource created\n');

// ============================================
// 📦 INSERT TRAINING DATA
// ============================================
console.log('=' .repeat(60));
console.log('📦 Inserting Training Data');
console.log('='.repeat(60));

// Formula: price ≈ cost * (1 + margin) + (demand * 0.01)
const trainingData = [];
for (let i = 0; i < 30; i++) {
  const cost = Math.random() * 100 + 50; // $50-$150
  const margin = Math.random() * 0.5 + 0.2; // 20%-70%
  const demand = Math.random() * 1000 + 100; // 100-1100 units

  const basePrice = cost * (1 + margin);
  const demandFactor = demand * 0.01;
  const noise = (Math.random() - 0.5) * 5;
  const price = basePrice + demandFactor + noise;

  trainingData.push({
    name: `Product ${i + 1}`,
    cost,
    margin,
    demand,
    price
  });
}

for (const data of trainingData) {
  await products.insert(data);
}

console.log(`\n✅ Inserted ${trainingData.length} training samples\n`);

// ============================================
// ✨ ZERO-CONFIG MAGIC: resource.ml.learn()
// ============================================
console.log('='.repeat(60));
console.log('✨ Zero-Config ML Setup: products.ml.learn("price")');
console.log('='.repeat(60));

console.log('\n🎯 Calling: await products.ml.learn("price")\n');

const learnResult = await products.ml.learn('price');

console.log('\n✅ Model ready!');
console.log(`   Model name: ${learnResult.modelName}`);
console.log(`   Type: ${learnResult.type}`);
console.log(`   Features: ${learnResult.features.join(', ')}`);
console.log(`   Loss: ${learnResult.loss.toFixed(4)}`);
console.log(`   Samples: ${learnResult.samples}`);

// ============================================
// 🔮 PREDICTIONS: resource.ml.predict()
// ============================================
console.log('\n' + '='.repeat(60));
console.log('🔮 Making Predictions: products.ml.predict(...)');
console.log('='.repeat(60));

const testCases = [
  { name: 'Budget Product', cost: 60, margin: 0.25, demand: 500 },
  { name: 'Premium Product', cost: 140, margin: 0.50, demand: 300 }
];

for (const testCase of testCases) {
  const result = await products.ml.predict(testCase, 'price');

  const expectedPrice = testCase.cost * (1 + testCase.margin) + (testCase.demand * 0.01);
  const error = Math.abs(result.prediction - expectedPrice);

  console.log(`\n${testCase.name}:`);
  console.log(`   Input: cost=$${testCase.cost}, margin=${(testCase.margin * 100).toFixed(0)}%, demand=${testCase.demand}`);
  console.log(`   Expected: $${expectedPrice.toFixed(2)}`);
  console.log(`   Predicted: $${result.prediction.toFixed(2)}`);
  console.log(`   Error: $${error.toFixed(2)}`);
  console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
}

// ============================================
// 📋 LIST MODELS: resource.ml.list()
// ============================================
console.log('\n' + '='.repeat(60));
console.log('📋 List All Models: products.ml.list()');
console.log('='.repeat(60));

const models = products.ml.list();

console.log(`\n✅ Found ${models.length} model(s):\n`);

models.forEach(model => {
  console.log(`   📊 ${model.name}`);
  console.log(`      Type: ${model.type}`);
  console.log(`      Target: ${model.target}`);
  console.log(`      Features: ${model.features.join(', ')}`);
  console.log(`      Trained: ${model.isTrained ? '✅ Yes' : '❌ No'}`);
  console.log('');
});

// ============================================
// 📈 MODEL STATS: resource.ml.stats()
// ============================================
console.log('='.repeat(60));
console.log('📈 Model Statistics: products.ml.stats("price")');
console.log('='.repeat(60));

const stats = products.ml.stats('price');

console.log(`\n   Trained at: ${stats.trainedAt}`);
console.log(`   Training samples: ${stats.samples}`);
console.log(`   Training loss: ${stats.loss.toFixed(4)}`);
console.log(`   Total predictions: ${stats.predictions}`);
console.log(`   Errors: ${stats.errors}`);

// ============================================
// 🔄 RETRAIN: resource.ml.train()
// ============================================
console.log('\n' + '='.repeat(60));
console.log('🔄 Manual Retrain: products.ml.train("price")');
console.log('='.repeat(60));

// Add more data
console.log('\n📦 Adding 10 more training samples...');

for (let i = 0; i < 10; i++) {
  const cost = Math.random() * 100 + 50;
  const margin = Math.random() * 0.5 + 0.2;
  const demand = Math.random() * 1000 + 100;

  const price = cost * (1 + margin) + demand * 0.01 + (Math.random() - 0.5) * 5;

  await products.insert({
    name: `Product ${30 + i + 1}`,
    cost,
    margin,
    demand,
    price
  });
}

console.log('✅ Data added\n');
console.log('🎓 Retraining model...\n');

const retrainResult = await products.ml.train('price');

console.log('✅ Retrain complete!');
console.log(`   Loss: ${retrainResult.loss.toFixed(4)}`);
console.log(`   Samples: ${retrainResult.samples}`);

// ============================================
// 📊 VERSION MANAGEMENT
// ============================================
console.log('\n' + '='.repeat(60));
console.log('📊 Version Management');
console.log('='.repeat(60));

console.log('\n🔍 Listing versions: products.ml.versions("price")\n');

const versions = await products.ml.versions('price');

console.log(`✅ Found ${versions.length} version(s):\n`);

versions.forEach(v => {
  console.log(`   Version ${v.version} ${v.isCurrent ? '(current)' : ''}`);
  console.log(`      Saved at: ${v.savedAt}`);
  if (v.metrics) {
    console.log(`      Loss: ${v.metrics.loss?.toFixed(4) || 'N/A'}`);
    console.log(`      Samples: ${v.metrics.samples || 'N/A'}`);
  }
  console.log('');
});

// ============================================
// 🎯 API COMPARISON
// ============================================
console.log('='.repeat(60));
console.log('🎯 API Comparison: Old vs New');
console.log('='.repeat(60));

console.log('\n❌ OLD API (verbose):');
console.log('   const mlPlugin = new MLPlugin({');
console.log('     models: {');
console.log('       priceModel: {');
console.log('         type: "regression",');
console.log('         resource: "products",');
console.log('         features: ["cost", "margin", "demand"],');
console.log('         target: "price",');
console.log('         modelConfig: { ... }');
console.log('       }');
console.log('     }');
console.log('   });');
console.log('   await mlPlugin.train("priceModel");');
console.log('   await mlPlugin.predict("priceModel", { cost: 100 });');

console.log('\n✅ NEW API (clean):');
console.log('   await products.ml.learn("price");  // 🎯 AUTO-DETECT TUDO!');
console.log('   await products.ml.predict({ cost: 100 }, "price");');

console.log('\n📊 Comparison:');
console.log('   Lines of code: 15+ → 2 (87% reduction!)');
console.log('   Configuration: Manual → Auto-detect ✨');
console.log('   API style: Plugin-centric → Resource-centric');
console.log('   Learning curve: High → Zero 🚀');

// ============================================
// 📚 KEY TAKEAWAYS
// ============================================
console.log('\n' + '='.repeat(60));
console.log('📚 Key Takeaways');
console.log('='.repeat(60));

console.log('\n✨ New API Benefits:');
console.log('   1. Zero-config: Just call products.ml.learn("price")');
console.log('   2. Auto-detect: Type and features selected automatically');
console.log('   3. Resource-centric: More intuitive (products.ml vs mlPlugin)');
console.log('   4. Namespace clean: No collision with other Resource methods');
console.log('   5. Backward compatible: Old API still works!');

console.log('\n🎯 Complete API:');
console.log('   ├─ products.ml.learn(target, options?)     → Auto-setup + train');
console.log('   ├─ products.ml.predict(input, target)      → Make prediction');
console.log('   ├─ products.ml.train(target, options?)     → Manual training');
console.log('   ├─ products.ml.list()                      → List models');
console.log('   ├─ products.ml.versions(target)            → List versions');
console.log('   ├─ products.ml.rollback(target, version?)  → Rollback version');
console.log('   ├─ products.ml.compare(target, v1, v2)     → Compare versions');
console.log('   ├─ products.ml.stats(target)               → Model stats');
console.log('   ├─ products.ml.export(target)              → Export model');
console.log('   └─ products.ml.import(target, data)        → Import model');

console.log('\n🚀 One-Liner ML:');
console.log('   await products.ml.learn("price");');
console.log('   const result = await products.ml.predict({ cost: 100, margin: 0.3, demand: 500 }, "price");');
console.log('   console.log(`Price: $${result.prediction.toFixed(2)}`);');

console.log('\n✅ Example completed!');
console.log('='.repeat(60));

// Cleanup
await db.stop();

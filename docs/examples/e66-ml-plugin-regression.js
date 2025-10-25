/**
 * Example 66: ML Plugin - Regression Model
 *
 * Demonstrates using the ML Plugin to train a regression model
 * that predicts product prices based on cost, margin, and demand.
 *
 * Requirements:
 * - Install TensorFlow.js: pnpm add @tensorflow/tfjs-node
 *
 * Run: node docs/examples/e66-ml-plugin-regression.js
 */

import { Database, MLPlugin } from '../../src/index.js';

console.log('='.repeat(60));
console.log('Example 66: ML Plugin - Regression Model');
console.log('='.repeat(60));

// Create in-memory database
const db = new Database({
  client: 'memory',
  verbose: false
});

// Install ML Plugin
const mlPlugin = new MLPlugin({
  models: {
    productPrices: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'margin', 'demand'],
      target: 'price',
      autoTrain: false, // Manual training for this example
      modelConfig: {
        epochs: 30,
        batchSize: 16,
        learningRate: 0.01,
        polynomial: 1 // Linear regression
      }
    }
  },
  verbose: true
});

await db.install(mlPlugin);
await db.start();

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

console.log('\n📦 Products resource created');

// Generate synthetic training data
// Formula: price ≈ cost * (1 + margin) + (demand * 0.01)
console.log('\n🔢 Generating synthetic training data...');

const trainingData = [];
for (let i = 0; i < 200; i++) {
  const cost = Math.random() * 100 + 50; // $50-$150
  const margin = Math.random() * 0.5 + 0.2; // 20%-70%
  const demand = Math.random() * 1000 + 100; // 100-1100 units

  // True formula with some noise
  const basePrice = cost * (1 + margin);
  const demandFactor = demand * 0.01;
  const noise = (Math.random() - 0.5) * 5; // ±$2.5 noise
  const price = basePrice + demandFactor + noise;

  trainingData.push({
    name: `Product ${i + 1}`,
    cost,
    margin,
    demand,
    price
  });
}

// Insert training data
for (const data of trainingData) {
  await products.insert(data);
}

console.log(`✅ Inserted ${trainingData.length} training samples`);

// Train the model
console.log('\n🎓 Training regression model...');
console.log('-'.repeat(60));

const trainingResult = await mlPlugin.train('productPrices');

console.log('\n✅ Training completed:');
console.log(`   Loss: ${trainingResult.loss.toFixed(4)}`);
console.log(`   Epochs: ${trainingResult.epochs}`);
console.log(`   Samples: ${trainingResult.samples}`);

// Test predictions
console.log('\n🔮 Testing predictions...');
console.log('-'.repeat(60));

const testCases = [
  { name: 'Budget Product', cost: 60, margin: 0.25, demand: 500 },
  { name: 'Mid-range Product', cost: 100, margin: 0.35, demand: 800 },
  { name: 'Premium Product', cost: 140, margin: 0.50, demand: 300 }
];

for (const testCase of testCases) {
  const { prediction, confidence } = await mlPlugin.predict('productPrices', testCase);

  // Calculate expected price using true formula
  const expectedPrice = testCase.cost * (1 + testCase.margin) + (testCase.demand * 0.01);
  const error = Math.abs(prediction - expectedPrice);
  const errorPercent = (error / expectedPrice) * 100;

  console.log(`\n${testCase.name}:`);
  console.log(`   Cost: $${testCase.cost.toFixed(2)}`);
  console.log(`   Margin: ${(testCase.margin * 100).toFixed(0)}%`);
  console.log(`   Demand: ${testCase.demand} units`);
  console.log(`   Expected: $${expectedPrice.toFixed(2)}`);
  console.log(`   Predicted: $${prediction.toFixed(2)}`);
  console.log(`   Error: $${error.toFixed(2)} (${errorPercent.toFixed(2)}%)`);
  console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
}

// Batch predictions
console.log('\n📊 Batch predictions...');
console.log('-'.repeat(60));

const batchInputs = [
  { cost: 75, margin: 0.30, demand: 600 },
  { cost: 120, margin: 0.40, demand: 450 },
  { cost: 90, margin: 0.28, demand: 750 }
];

const batchPredictions = await mlPlugin.predictBatch('productPrices', batchInputs);

console.log(`\nPredicted prices for ${batchPredictions.length} products:`);
for (let i = 0; i < batchPredictions.length; i++) {
  const input = batchInputs[i];
  const { prediction } = batchPredictions[i];
  console.log(`   ${i + 1}. Cost=$${input.cost}, Margin=${(input.margin * 100).toFixed(0)}%, Demand=${input.demand} → Price=$${prediction.toFixed(2)}`);
}

// Model statistics
console.log('\n📈 Model Statistics:');
console.log('-'.repeat(60));

const modelStats = mlPlugin.getModelStats('productPrices');
console.log(`   Trained at: ${modelStats.trainedAt}`);
console.log(`   Training samples: ${modelStats.samples}`);
console.log(`   Training loss: ${modelStats.loss.toFixed(4)}`);
console.log(`   Total predictions: ${modelStats.predictions}`);
console.log(`   Errors: ${modelStats.errors}`);

// Plugin statistics
const pluginStats = mlPlugin.getStats();
console.log('\n🔌 Plugin Statistics:');
console.log(`   Total models: ${pluginStats.models}`);
console.log(`   Trained models: ${pluginStats.trainedModels}`);
console.log(`   Total trainings: ${pluginStats.totalTrainings}`);
console.log(`   Total predictions: ${pluginStats.totalPredictions}`);

// Calculate R² score (goodness of fit)
console.log('\n📉 Model Evaluation (R² Score):');
console.log('-'.repeat(60));

const model = mlPlugin.models.productPrices;
const testData = trainingData.slice(0, 50); // Use first 50 samples as test set
const r2Score = await model.calculateR2Score(testData);

console.log(`   R² Score: ${r2Score.toFixed(4)}`);
console.log(`   Interpretation: ${r2Score > 0.9 ? 'Excellent' : r2Score > 0.7 ? 'Good' : r2Score > 0.5 ? 'Moderate' : 'Poor'} fit`);

// Export model
console.log('\n💾 Exporting model...');
const exportedModel = await mlPlugin.exportModel('productPrices');
console.log(`   Model type: ${exportedModel.type}`);
console.log(`   Features: ${exportedModel.config.features.join(', ')}`);
console.log(`   Target: ${exportedModel.config.target}`);

console.log('\n✅ Example completed!');
console.log('='.repeat(60));

// Cleanup
await db.stop();

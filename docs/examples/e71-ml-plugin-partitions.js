/**
 * Example 71: ML Plugin - Partition Filtering & Model Persistence
 *
 * Demonstrates:
 * - Training models on specific partitions of data
 * - Saving models to S3 with saveModel flag
 * - Saving intermediate training data to S3
 * - Loading saved training data from S3
 *
 * Run: node docs/examples/e71-ml-plugin-partitions.js
 */

import { Database, MLPlugin } from '../../src/index.js';

console.log('='.repeat(60));
console.log('Example 71: ML Plugin - Partition Filtering & Persistence');
console.log('='.repeat(60));

// Create database
const db = new Database({
  client: 'memory',
  verbose: false
});

// Create products resource with partition by category
const products = await db.createResource({
  name: 'products',
  attributes: {
    name: 'string|required',
    category: 'string|required', // Will be used for partitioning
    cost: 'number|required',
    margin: 'number|required',
    demand: 'number|required',
    price: 'number|required'
  },
  partitions: {
    byCategory: {
      fields: {
        category: 'string'
      }
    }
  }
});

console.log('\n✅ Created products resource with partition by category\n');

// Insert sample data for different categories
const electronicsData = [
  { name: 'Laptop', category: 'electronics', cost: 500, margin: 0.3, demand: 100, price: 750 },
  { name: 'Phone', category: 'electronics', cost: 300, margin: 0.4, demand: 150, price: 500 },
  { name: 'Tablet', category: 'electronics', cost: 250, margin: 0.35, demand: 120, price: 400 },
  { name: 'Monitor', category: 'electronics', cost: 200, margin: 0.3, demand: 80, price: 300 },
  { name: 'Keyboard', category: 'electronics', cost: 30, margin: 0.5, demand: 200, price: 60 },
  { name: 'Mouse', category: 'electronics', cost: 20, margin: 0.5, demand: 250, price: 40 },
  { name: 'Headphones', category: 'electronics', cost: 50, margin: 0.4, demand: 180, price: 90 },
  { name: 'Webcam', category: 'electronics', cost: 40, margin: 0.35, demand: 100, price: 65 },
  { name: 'Speaker', category: 'electronics', cost: 60, margin: 0.4, demand: 120, price: 100 },
  { name: 'Router', category: 'electronics', cost: 70, margin: 0.3, demand: 90, price: 100 }
];

const furnitureData = [
  { name: 'Chair', category: 'furniture', cost: 80, margin: 0.5, demand: 50, price: 150 },
  { name: 'Desk', category: 'furniture', cost: 150, margin: 0.4, demand: 40, price: 250 },
  { name: 'Sofa', category: 'furniture', cost: 400, margin: 0.35, demand: 20, price: 650 },
  { name: 'Table', category: 'furniture', cost: 120, margin: 0.45, demand: 35, price: 220 },
  { name: 'Bookshelf', category: 'furniture', cost: 90, margin: 0.4, demand: 45, price: 150 },
  { name: 'Cabinet', category: 'furniture', cost: 110, margin: 0.35, demand: 30, price: 170 },
  { name: 'Bed', category: 'furniture', cost: 300, margin: 0.4, demand: 25, price: 500 },
  { name: 'Wardrobe', category: 'furniture', cost: 250, margin: 0.35, demand: 28, price: 400 },
  { name: 'Lamp', category: 'furniture', cost: 30, margin: 0.5, demand: 60, price: 60 },
  { name: 'Mirror', category: 'furniture', cost: 40, margin: 0.45, demand: 50, price: 75 }
];

const clothingData = [
  { name: 'T-Shirt', category: 'clothing', cost: 10, margin: 0.6, demand: 300, price: 25 },
  { name: 'Jeans', category: 'clothing', cost: 25, margin: 0.5, demand: 200, price: 50 },
  { name: 'Jacket', category: 'clothing', cost: 40, margin: 0.5, demand: 150, price: 80 },
  { name: 'Shoes', category: 'clothing', cost: 30, margin: 0.55, demand: 180, price: 70 },
  { name: 'Dress', category: 'clothing', cost: 35, margin: 0.5, demand: 160, price: 70 },
  { name: 'Sweater', category: 'clothing', cost: 28, margin: 0.5, demand: 170, price: 56 },
  { name: 'Shorts', category: 'clothing', cost: 15, margin: 0.55, demand: 220, price: 35 },
  { name: 'Socks', category: 'clothing', cost: 3, margin: 0.7, demand: 400, price: 10 },
  { name: 'Hat', category: 'clothing', cost: 8, margin: 0.6, demand: 250, price: 20 },
  { name: 'Scarf', category: 'clothing', cost: 12, margin: 0.55, demand: 200, price: 27 }
];

console.log('📦 Inserting products...');
for (const product of [...electronicsData, ...furnitureData, ...clothingData]) {
  await products.insert(product);
}

console.log(`✅ Inserted ${electronicsData.length} electronics products`);
console.log(`✅ Inserted ${furnitureData.length} furniture products`);
console.log(`✅ Inserted ${clothingData.length} clothing products`);

// Install ML Plugin with partition-specific models
const mlPlugin = new MLPlugin({
  verbose: true,
  saveModel: true, // Save models to S3 (default)
  saveTrainingData: true, // Save intermediate training data
  minTrainingSamples: 5,
  models: {
    // Model 1: Electronics pricing (partition filtering)
    electronicsPricing: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'margin', 'demand'],
      target: 'price',
      partition: {
        name: 'byCategory',
        values: { category: 'electronics' }
      },
      saveModel: true, // Override global setting (redundant here)
      saveTrainingData: true,
      modelConfig: {
        epochs: 100,
        batchSize: 4,
        learningRate: 0.01,
        polynomial: 2
      }
    },

    // Model 2: Furniture pricing (partition filtering)
    furniturePricing: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'margin', 'demand'],
      target: 'price',
      partition: {
        name: 'byCategory',
        values: { category: 'furniture' }
      },
      saveModel: true,
      saveTrainingData: true,
      modelConfig: {
        epochs: 100,
        batchSize: 4,
        learningRate: 0.01,
        polynomial: 1 // Linear for furniture
      }
    },

    // Model 3: Clothing pricing (partition filtering)
    clothingPricing: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'margin', 'demand'],
      target: 'price',
      partition: {
        name: 'byCategory',
        values: { category: 'clothing' }
      },
      saveModel: true,
      saveTrainingData: true,
      modelConfig: {
        epochs: 100,
        batchSize: 4,
        learningRate: 0.01,
        polynomial: 1 // Linear for clothing
      }
    },

    // Model 4: All products (no partition)
    allProductsPricing: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'margin', 'demand'],
      target: 'price',
      // No partition - trains on all data
      saveModel: true,
      saveTrainingData: false, // Don't save training data for this one
      modelConfig: {
        epochs: 100,
        batchSize: 8,
        learningRate: 0.01,
        polynomial: 2
      }
    }
  }
});

await db.install(mlPlugin);
await db.start();

console.log('\n' + '='.repeat(60));
console.log('🤖 Training Models...');
console.log('='.repeat(60));

// Train electronics model (only electronics data)
console.log('\n[1/4] Training Electronics Model (partition: electronics)...');
const electronicsResult = await mlPlugin.train('electronicsPricing');
console.log('✅ Electronics Model trained:');
console.log(`   - R² Score: ${electronicsResult.r2Score.toFixed(4)}`);
console.log(`   - Samples: ${electronicsResult.samples}`);
console.log(`   - Model saved to S3: ${mlPlugin.config.saveModel ? 'Yes' : 'No'}`);
console.log(`   - Training data saved to S3: Yes`);

// Train furniture model (only furniture data)
console.log('\n[2/4] Training Furniture Model (partition: furniture)...');
const furnitureResult = await mlPlugin.train('furniturePricing');
console.log('✅ Furniture Model trained:');
console.log(`   - R² Score: ${furnitureResult.r2Score.toFixed(4)}`);
console.log(`   - Samples: ${furnitureResult.samples}`);
console.log(`   - Model saved to S3: Yes`);
console.log(`   - Training data saved to S3: Yes`);

// Train clothing model (only clothing data)
console.log('\n[3/4] Training Clothing Model (partition: clothing)...');
const clothingResult = await mlPlugin.train('clothingPricing');
console.log('✅ Clothing Model trained:');
console.log(`   - R² Score: ${clothingResult.r2Score.toFixed(4)}`);
console.log(`   - Samples: ${clothingResult.samples}`);
console.log(`   - Model saved to S3: Yes`);
console.log(`   - Training data saved to S3: Yes`);

// Train all products model (no partition)
console.log('\n[4/4] Training All Products Model (no partition)...');
const allProductsResult = await mlPlugin.train('allProductsPricing');
console.log('✅ All Products Model trained:');
console.log(`   - R² Score: ${allProductsResult.r2Score.toFixed(4)}`);
console.log(`   - Samples: ${allProductsResult.samples}`);
console.log(`   - Model saved to S3: Yes`);
console.log(`   - Training data saved to S3: No (disabled for this model)`);

console.log('\n' + '='.repeat(60));
console.log('🔮 Making Predictions...');
console.log('='.repeat(60));

// Predict electronics price
const electronicsInput = { cost: 350, margin: 0.35, demand: 130 };
const electronicsPrediction = await mlPlugin.predict('electronicsPricing', electronicsInput);
console.log('\n📱 Electronics Prediction:');
console.log(`   Input: cost=${electronicsInput.cost}, margin=${electronicsInput.margin}, demand=${electronicsInput.demand}`);
console.log(`   Predicted Price: $${electronicsPrediction.value.toFixed(2)}`);

// Predict furniture price
const furnitureInput = { cost: 200, margin: 0.4, demand: 35 };
const furniturePrediction = await mlPlugin.predict('furniturePricing', furnitureInput);
console.log('\n🪑 Furniture Prediction:');
console.log(`   Input: cost=${furnitureInput.cost}, margin=${furnitureInput.margin}, demand=${furnitureInput.demand}`);
console.log(`   Predicted Price: $${furniturePrediction.value.toFixed(2)}`);

// Predict clothing price
const clothingInput = { cost: 20, margin: 0.55, demand: 250 };
const clothingPrediction = await mlPlugin.predict('clothingPricing', clothingInput);
console.log('\n👕 Clothing Prediction:');
console.log(`   Input: cost=${clothingInput.cost}, margin=${clothingInput.margin}, demand=${clothingInput.demand}`);
console.log(`   Predicted Price: $${clothingPrediction.value.toFixed(2)}`);

console.log('\n' + '='.repeat(60));
console.log('💾 Loading Saved Training Data from S3...');
console.log('='.repeat(60));

// Load saved training data for electronics
const electronicsTrainingData = await mlPlugin.getTrainingData('electronicsPricing');
if (electronicsTrainingData) {
  console.log('\n📊 Electronics Training Data (from S3):');
  console.log(`   - Samples: ${electronicsTrainingData.samples}`);
  console.log(`   - Features: ${electronicsTrainingData.features.join(', ')}`);
  console.log(`   - Target: ${electronicsTrainingData.target}`);
  console.log(`   - Saved At: ${electronicsTrainingData.savedAt}`);
  console.log(`   - First 3 samples:`);
  electronicsTrainingData.data.slice(0, 3).forEach((sample, i) => {
    console.log(`     [${i + 1}] Features: ${JSON.stringify(sample.features)}, Target: ${sample.target}`);
  });
}

// Load saved training data for furniture
const furnitureTrainingData = await mlPlugin.getTrainingData('furniturePricing');
if (furnitureTrainingData) {
  console.log('\n📊 Furniture Training Data (from S3):');
  console.log(`   - Samples: ${furnitureTrainingData.samples}`);
  console.log(`   - Features: ${furnitureTrainingData.features.join(', ')}`);
  console.log(`   - Target: ${furnitureTrainingData.target}`);
  console.log(`   - Saved At: ${furnitureTrainingData.savedAt}`);
}

// Try to load training data for allProductsPricing (should be null)
const allProductsTrainingData = await mlPlugin.getTrainingData('allProductsPricing');
console.log('\n📊 All Products Training Data:');
console.log(`   - Available: ${allProductsTrainingData ? 'Yes' : 'No (saveTrainingData was disabled)'}`);

console.log('\n' + '='.repeat(60));
console.log('📈 Plugin Statistics');
console.log('='.repeat(60));

const pluginStats = mlPlugin.getStats();
console.log(`\n✅ Plugin Stats:`);
console.log(`   - Total Models: ${pluginStats.models}`);
console.log(`   - Trained Models: ${pluginStats.trainedModels}`);
console.log(`   - Total Trainings: ${pluginStats.totalTrainings}`);
console.log(`   - Total Predictions: ${pluginStats.totalPredictions}`);
console.log(`   - Total Errors: ${pluginStats.totalErrors}`);

console.log('\n' + '='.repeat(60));
console.log('✅ Example Complete!');
console.log('='.repeat(60));

console.log('\n📝 Key Takeaways:');
console.log('   1. Use partition filtering to train models on specific data subsets');
console.log('   2. Models are automatically saved to S3 with saveModel: true');
console.log('   3. Training data can be saved for debugging/auditing with saveTrainingData: true');
console.log('   4. Each model can override global saveModel/saveTrainingData settings');
console.log('   5. Use getTrainingData() to load previously saved training datasets');
console.log('   6. Plugin storage uses S3 for persistence (via PluginStorage)');

await db.stop();
process.exit(0);

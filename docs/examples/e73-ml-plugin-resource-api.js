/**
 * Example 73: ML Plugin - Resource-Level API
 *
 * Demonstrates the fluent API for ML predictions directly on resources:
 * - resource.predict(input, 'attribute') - Make predictions
 * - resource.trainModel('attribute') - Train models
 * - resource.listModels() - List available models
 *
 * Much more intuitive than mlPlugin.predict('modelName', input)!
 *
 * Run: node docs/examples/e73-ml-plugin-resource-api.js
 */

import { Database, MLPlugin } from '../../src/index.js';

console.log('='.repeat(60));
console.log('Example 73: ML Plugin - Resource-Level API');
console.log('='.repeat(60));

// Create database
const db = new Database({
  client: 'memory',
  verbose: false
});

// Create apartments resource
const apartments = await db.createResource({
  name: 'apartments',
  attributes: {
    address: 'string|required',
    bedrooms: 'number|required',
    bathrooms: 'number|required',
    sqft: 'number|required',
    age: 'number|required',
    floor: 'number|required',
    hasParking: 'boolean|required',
    hasElevator: 'boolean|required',
    rent: 'number|required', // Target for rent prediction
    salePrice: 'number|required' // Target for sale price prediction
  }
});

console.log('\n✅ Created apartments resource\n');

// Install ML Plugin with multiple models for the same resource
const mlPlugin = new MLPlugin({
  verbose: true,
  saveModel: true,
  enableVersioning: true,
  minTrainingSamples: 5,
  models: {
    // Model 1: Predict monthly rent
    rentPredictor: {
      type: 'regression',
      resource: 'apartments',
      features: ['bedrooms', 'bathrooms', 'sqft', 'age', 'floor'],
      target: 'rent',
      modelConfig: {
        epochs: 50,
        batchSize: 4,
        learningRate: 0.01,
        polynomial: 2
      }
    },
    // Model 2: Predict sale price
    salePricePredictor: {
      type: 'regression',
      resource: 'apartments',
      features: ['bedrooms', 'bathrooms', 'sqft', 'age', 'floor', 'hasParking', 'hasElevator'],
      target: 'salePrice',
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

console.log('='.repeat(60));
console.log('📦 Inserting Training Data');
console.log('='.repeat(60));

// Insert training data
const trainingData = [
  { address: '123 Main St', bedrooms: 2, bathrooms: 1, sqft: 800, age: 5, floor: 2, hasParking: true, hasElevator: false, rent: 1800, salePrice: 350000 },
  { address: '456 Oak Ave', bedrooms: 3, bathrooms: 2, sqft: 1200, age: 3, floor: 4, hasParking: true, hasElevator: true, rent: 2500, salePrice: 480000 },
  { address: '789 Pine Rd', bedrooms: 1, bathrooms: 1, sqft: 600, age: 10, floor: 1, hasParking: false, hasElevator: false, rent: 1200, salePrice: 220000 },
  { address: '321 Elm St', bedrooms: 2, bathrooms: 2, sqft: 900, age: 2, floor: 3, hasParking: true, hasElevator: true, rent: 2100, salePrice: 420000 },
  { address: '654 Maple Dr', bedrooms: 4, bathrooms: 3, sqft: 1800, age: 1, floor: 5, hasParking: true, hasElevator: true, rent: 3500, salePrice: 680000 },
  { address: '987 Cedar Ln', bedrooms: 3, bathrooms: 2, sqft: 1300, age: 7, floor: 2, hasParking: true, hasElevator: false, rent: 2300, salePrice: 450000 },
  { address: '147 Birch Ct', bedrooms: 2, bathrooms: 1, sqft: 850, age: 8, floor: 1, hasParking: false, hasElevator: false, rent: 1700, salePrice: 320000 },
  { address: '258 Willow Way', bedrooms: 3, bathrooms: 2.5, sqft: 1400, age: 4, floor: 6, hasParking: true, hasElevator: true, rent: 2700, salePrice: 520000 },
  { address: '369 Ash Blvd', bedrooms: 1, bathrooms: 1, sqft: 550, age: 12, floor: 1, hasParking: false, hasElevator: false, rent: 1100, salePrice: 200000 },
  { address: '741 Spruce Pl', bedrooms: 4, bathrooms: 3, sqft: 2000, age: 0, floor: 8, hasParking: true, hasElevator: true, rent: 4000, salePrice: 750000 }
];

for (const apt of trainingData) {
  await apartments.insert(apt);
}

console.log(`\n✅ Inserted ${trainingData.length} apartments`);

console.log('\n' + '='.repeat(60));
console.log('📋 Listing Available Models for Apartments');
console.log('='.repeat(60));

// Use resource.listModels() - fluent API!
const models = apartments.listModels();
console.log(`\n✅ Found ${models.length} models:\n`);

models.forEach(model => {
  console.log(`   📊 ${model.name}`);
  console.log(`      Type: ${model.type}`);
  console.log(`      Target: ${model.target}`);
  console.log(`      Features: ${model.features.join(', ')}`);
  console.log(`      Trained: ${model.isTrained ? '✅ Yes' : '❌ Not yet'}`);
  console.log('');
});

console.log('='.repeat(60));
console.log('🤖 Training Models via Resource API');
console.log('='.repeat(60));

// Use resource.trainModel() - fluent API!
console.log('\n[1/2] Training rent predictor...');
const rentTraining = await apartments.trainModel('rent');
console.log(`✅ Rent model trained:`);
console.log(`   - Loss: ${rentTraining.loss.toFixed(4)}`);
console.log(`   - R² Score: ${rentTraining.r2Score?.toFixed(4) || 'N/A'}`);
console.log(`   - Samples: ${rentTraining.samples}`);

console.log('\n[2/2] Training sale price predictor...');
const saleTraining = await apartments.trainModel('salePrice');
console.log(`✅ Sale price model trained:`);
console.log(`   - Loss: ${saleTraining.loss.toFixed(4)}`);
console.log(`   - R² Score: ${saleTraining.r2Score?.toFixed(4) || 'N/A'}`);
console.log(`   - Samples: ${saleTraining.samples}`);

console.log('\n' + '='.repeat(60));
console.log('🔮 Making Predictions via Resource API');
console.log('='.repeat(60));

// Test apartment specs
const testApartment = {
  bedrooms: 3,
  bathrooms: 2,
  sqft: 1250,
  age: 5,
  floor: 3,
  hasParking: true,
  hasElevator: true
};

console.log('\n📊 Test Apartment:');
console.log(`   - Bedrooms: ${testApartment.bedrooms}`);
console.log(`   - Bathrooms: ${testApartment.bathrooms}`);
console.log(`   - Square Feet: ${testApartment.sqft}`);
console.log(`   - Age: ${testApartment.age} years`);
console.log(`   - Floor: ${testApartment.floor}`);
console.log(`   - Parking: ${testApartment.hasParking ? 'Yes' : 'No'}`);
console.log(`   - Elevator: ${testApartment.hasElevator ? 'Yes' : 'No'}`);

// Use resource.predict() - fluent API!
// Much cleaner than: mlPlugin.predict('rentPredictor', testApartment)
const rentPrediction = await apartments.predict(testApartment, 'rent');
console.log(`\n💰 Predicted Monthly Rent: $${rentPrediction.value.toFixed(2)}`);
console.log(`   Confidence: ${(rentPrediction.confidence * 100).toFixed(1)}%`);

// Predict sale price
const salePrediction = await apartments.predict(testApartment, 'salePrice');
console.log(`\n🏠 Predicted Sale Price: $${salePrediction.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`   Confidence: ${(salePrediction.confidence * 100).toFixed(1)}%`);

console.log('\n' + '='.repeat(60));
console.log('🎯 Batch Predictions');
console.log('='.repeat(60));

const testApartments = [
  { bedrooms: 2, bathrooms: 1, sqft: 850, age: 6, floor: 2 },
  { bedrooms: 4, bathrooms: 3, sqft: 1900, age: 1, floor: 7 },
  { bedrooms: 1, bathrooms: 1, sqft: 600, age: 10, floor: 1 }
];

console.log('\n📊 Predicting rent for 3 apartments:\n');

for (let i = 0; i < testApartments.length; i++) {
  const apt = testApartments[i];
  const prediction = await apartments.predict(apt, 'rent');

  console.log(`   [${i + 1}] ${apt.bedrooms}BR/${apt.bathrooms}BA, ${apt.sqft}sqft`);
  console.log(`       Predicted Rent: $${prediction.value.toFixed(2)}/month`);
}

console.log('\n' + '='.repeat(60));
console.log('🔄 Retraining with More Data');
console.log('='.repeat(60));

// Add more training data
const moreData = [
  { address: '852 Oak Park', bedrooms: 2, bathrooms: 2, sqft: 950, age: 3, floor: 4, hasParking: true, hasElevator: true, rent: 2200, salePrice: 440000 },
  { address: '963 Pine Grove', bedrooms: 3, bathrooms: 2, sqft: 1350, age: 6, floor: 2, hasParking: true, hasElevator: false, rent: 2400, salePrice: 470000 },
  { address: '159 Elm View', bedrooms: 1, bathrooms: 1, sqft: 580, age: 9, floor: 1, hasParking: false, hasElevator: false, rent: 1150, salePrice: 210000 },
  { address: '753 Maple Heights', bedrooms: 4, bathrooms: 3, sqft: 1850, age: 2, floor: 6, hasParking: true, hasElevator: true, rent: 3600, salePrice: 690000 },
  { address: '426 Cedar Ridge', bedrooms: 2, bathrooms: 1.5, sqft: 900, age: 4, floor: 3, hasParking: true, hasElevator: false, rent: 1950, salePrice: 380000 }
];

for (const apt of moreData) {
  await apartments.insert(apt);
}

console.log(`\n📦 Added ${moreData.length} more apartments (total: ${trainingData.length + moreData.length})`);

// Retrain - this creates v2 of the models
console.log('\n🔄 Retraining models...');
const rentRetraining = await apartments.trainModel('rent');
console.log(`✅ Rent model v2 trained:`);
console.log(`   - Loss: ${rentRetraining.loss.toFixed(4)}`);
console.log(`   - R² Score: ${rentRetraining.r2Score?.toFixed(4) || 'N/A'}`);
console.log(`   - Samples: ${rentRetraining.samples}`);

// Compare predictions
const newRentPrediction = await apartments.predict(testApartment, 'rent');
console.log(`\n📈 Prediction Comparison:`);
console.log(`   v1 Rent: $${rentPrediction.value.toFixed(2)}`);
console.log(`   v2 Rent: $${newRentPrediction.value.toFixed(2)}`);
console.log(`   Difference: $${Math.abs(newRentPrediction.value - rentPrediction.value).toFixed(2)}`);

console.log('\n' + '='.repeat(60));
console.log('✅ Example Complete!');
console.log('='.repeat(60));

console.log('\n📝 Key Takeaways:');
console.log('   1. resource.predict(input, "attribute") - Fluent prediction API');
console.log('   2. resource.trainModel("attribute") - Train directly from resource');
console.log('   3. resource.listModels() - See all models for this resource');
console.log('   4. Models auto-discovered by resource + target attribute');
console.log('   5. Model cache for fast lookups (no config needed)');
console.log('   6. Much cleaner than mlPlugin.predict("modelName", input)');
console.log('   7. Works seamlessly with model versioning');

console.log('\n🎯 Old API vs New API:');
console.log('   ❌ Old: await mlPlugin.predict("rentPredictor", { bedrooms: 3, ... })');
console.log('   ✅ New: await apartments.predict({ bedrooms: 3, ... }, "rent")');
console.log('');
console.log('   ❌ Old: await mlPlugin.train("rentPredictor")');
console.log('   ✅ New: await apartments.trainModel("rent")');

await db.stop();
process.exit(0);

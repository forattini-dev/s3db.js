/**
 * Example 74: ML Plugin - Custom Data Transformations
 *
 * Demonstrates using filter() and map() functions to preprocess training data:
 * - filter() - Remove invalid or outlier records
 * - map() - Transform features before training
 * - Combine with partition filtering for fine-grained control
 *
 * Run: node docs/examples/e74-ml-plugin-data-transforms.js
 */

import { Database, MLPlugin } from '../../src/index.js';

console.log('='.repeat(60));
console.log('Example 74: ML Plugin - Data Transformations');
console.log('='.repeat(60));

// Create database
const db = new Database({
  client: 'memory',
  verbose: false
});

// Create real estate resource
const properties = await db.createResource({
  name: 'properties',
  attributes: {
    address: 'string|required',
    bedrooms: 'number|required',
    bathrooms: 'number|required',
    sqft: 'number|required',
    age: 'number|required',
    condition: 'string|required', // excellent, good, fair, poor
    hasGarage: 'boolean|required',
    hasPool: 'boolean|required',
    price: 'number|required',
    soldDate: 'string'
  }
});

console.log('\n✅ Created properties resource\n');

// Install ML Plugin with filter and map functions
const mlPlugin = new MLPlugin({
  verbose: true,
  saveModel: true,
  minTrainingSamples: 5,
  models: {
    // Model 1: Basic pricing - no transformations
    basicPricing: {
      type: 'regression',
      resource: 'properties',
      features: ['bedrooms', 'bathrooms', 'sqft', 'age'],
      target: 'price',
      modelConfig: {
        epochs: 50,
        batchSize: 4,
        learningRate: 0.01,
        polynomial: 2
      }
    },

    // Model 2: Filtered pricing - exclude outliers and invalid data
    filteredPricing: {
      type: 'regression',
      resource: 'properties',
      features: ['bedrooms', 'bathrooms', 'sqft', 'age'],
      target: 'price',
      filter: (record) => {
        // Remove outliers and invalid data
        if (record.price <= 0 || record.price > 10000000) return false; // Price outliers
        if (record.sqft < 300 || record.sqft > 10000) return false; // Sqft outliers
        if (record.bedrooms < 1 || record.bedrooms > 10) return false; // Bedroom outliers
        if (record.age < 0 || record.age > 200) return false; // Invalid age
        return true;
      },
      modelConfig: {
        epochs: 50,
        batchSize: 4,
        learningRate: 0.01,
        polynomial: 2
      }
    },

    // Model 3: Transformed pricing - feature engineering
    transformedPricing: {
      type: 'regression',
      resource: 'properties',
      features: ['bedrooms', 'bathrooms', 'sqftNormalized', 'ageScore', 'conditionScore', 'amenitiesScore'],
      target: 'pricePerSqft',
      filter: (record) => {
        // Only well-documented properties
        return record.price > 0 && record.sqft > 300 && record.soldDate;
      },
      map: (record) => {
        // Feature engineering
        return {
          ...record,
          // Normalize square footage (log scale)
          sqftNormalized: Math.log(record.sqft),

          // Age score (inverse - newer is better)
          ageScore: Math.max(0, 50 - record.age) / 50,

          // Condition score (categorical to numeric)
          conditionScore: {
            excellent: 1.0,
            good: 0.7,
            fair: 0.4,
            poor: 0.1
          }[record.condition] || 0.5,

          // Amenities score
          amenitiesScore: (record.hasGarage ? 0.5 : 0) + (record.hasPool ? 0.5 : 0),

          // Price per square foot (target)
          pricePerSqft: record.price / record.sqft
        };
      },
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

// Insert training data with some outliers and invalid records
const trainingData = [
  // Valid records
  { address: '123 Main St', bedrooms: 3, bathrooms: 2, sqft: 1800, age: 5, condition: 'excellent', hasGarage: true, hasPool: false, price: 450000, soldDate: '2024-01-15' },
  { address: '456 Oak Ave', bedrooms: 4, bathrooms: 3, sqft: 2500, age: 3, condition: 'excellent', hasGarage: true, hasPool: true, price: 680000, soldDate: '2024-02-20' },
  { address: '789 Pine Rd', bedrooms: 2, bathrooms: 1, sqft: 1200, age: 15, condition: 'good', hasGarage: false, hasPool: false, price: 320000, soldDate: '2024-01-10' },
  { address: '321 Elm St', bedrooms: 3, bathrooms: 2.5, sqft: 2000, age: 8, condition: 'good', hasGarage: true, hasPool: false, price: 480000, soldDate: '2024-03-05' },
  { address: '654 Maple Dr', bedrooms: 5, bathrooms: 4, sqft: 3500, age: 2, condition: 'excellent', hasGarage: true, hasPool: true, price: 920000, soldDate: '2024-02-28' },
  { address: '987 Cedar Ln', bedrooms: 3, bathrooms: 2, sqft: 1600, age: 12, condition: 'fair', hasGarage: true, hasPool: false, price: 380000, soldDate: '2024-01-25' },
  { address: '147 Birch Ct', bedrooms: 2, bathrooms: 1.5, sqft: 1400, age: 20, condition: 'fair', hasGarage: false, hasPool: false, price: 290000, soldDate: '2024-03-10' },
  { address: '258 Willow Way', bedrooms: 4, bathrooms: 3, sqft: 2800, age: 4, condition: 'excellent', hasGarage: true, hasPool: true, price: 750000, soldDate: '2024-02-15' },
  { address: '369 Ash Blvd', bedrooms: 2, bathrooms: 2, sqft: 1500, age: 10, condition: 'good', hasGarage: true, hasPool: false, price: 410000, soldDate: '2024-01-30' },
  { address: '741 Spruce Pl', bedrooms: 6, bathrooms: 5, sqft: 4500, age: 1, condition: 'excellent', hasGarage: true, hasPool: true, price: 1200000, soldDate: '2024-03-01' },

  // Outliers and invalid records (will be filtered out)
  { address: '111 Error St', bedrooms: 3, bathrooms: 2, sqft: 1800, age: 5, condition: 'good', hasGarage: true, hasPool: false, price: -50000, soldDate: '2024-01-01' }, // Invalid price
  { address: '222 Outlier Ave', bedrooms: 15, bathrooms: 2, sqft: 1800, age: 5, condition: 'good', hasGarage: true, hasPool: false, price: 450000, soldDate: '2024-01-01' }, // Too many bedrooms
  { address: '333 Tiny Ln', bedrooms: 1, bathrooms: 1, sqft: 100, age: 5, condition: 'poor', hasGarage: false, hasPool: false, price: 50000, soldDate: '2024-01-01' }, // Too small
  { address: '444 Ancient Rd', bedrooms: 3, bathrooms: 2, sqft: 1800, age: 250, condition: 'poor', hasGarage: false, hasPool: false, price: 100000, soldDate: '2024-01-01' }, // Invalid age
  { address: '555 Mansion Dr', bedrooms: 3, bathrooms: 2, sqft: 1800, age: 5, condition: 'good', hasGarage: true, hasPool: false, price: 25000000, soldDate: '2024-01-01' } // Price outlier
];

for (const property of trainingData) {
  await properties.insert(property);
}

console.log(`\n✅ Inserted ${trainingData.length} properties (includes ${trainingData.length - 10} outliers)\n`);

console.log('='.repeat(60));
console.log('🤖 Training Models');
console.log('='.repeat(60));

// Train basic model (no filtering)
console.log('\n[1/3] Training basic model (no transformations)...');
const basicResult = await mlPlugin.train('basicPricing');
console.log(`✅ Basic model trained:`);
console.log(`   - Samples: ${basicResult.samples}`);
console.log(`   - Loss: ${basicResult.loss.toFixed(4)}`);
console.log(`   - R² Score: ${basicResult.r2Score?.toFixed(4) || 'N/A'}`);

// Train filtered model
console.log('\n[2/3] Training filtered model (outliers removed)...');
const filteredResult = await mlPlugin.train('filteredPricing');
console.log(`✅ Filtered model trained:`);
console.log(`   - Samples: ${filteredResult.samples} (${basicResult.samples - filteredResult.samples} outliers removed)`);
console.log(`   - Loss: ${filteredResult.loss.toFixed(4)}`);
console.log(`   - R² Score: ${filteredResult.r2Score?.toFixed(4) || 'N/A'}`);

// Train transformed model
console.log('\n[3/3] Training transformed model (feature engineering)...');
const transformedResult = await mlPlugin.train('transformedPricing');
console.log(`✅ Transformed model trained:`);
console.log(`   - Samples: ${transformedResult.samples}`);
console.log(`   - Loss: ${transformedResult.loss.toFixed(4)}`);
console.log(`   - R² Score: ${transformedResult.r2Score?.toFixed(4) || 'N/A'}`);

console.log('\n' + '='.repeat(60));
console.log('🔮 Comparing Predictions');
console.log('='.repeat(60));

// Test property
const testProperty = {
  bedrooms: 3,
  bathrooms: 2,
  sqft: 1900,
  age: 6,
  condition: 'good',
  hasGarage: true,
  hasPool: false
};

console.log('\n📊 Test Property:');
console.log(`   - Bedrooms: ${testProperty.bedrooms}`);
console.log(`   - Bathrooms: ${testProperty.bathrooms}`);
console.log(`   - Square Feet: ${testProperty.sqft}`);
console.log(`   - Age: ${testProperty.age} years`);
console.log(`   - Condition: ${testProperty.condition}`);
console.log(`   - Garage: ${testProperty.hasGarage ? 'Yes' : 'No'}`);
console.log(`   - Pool: ${testProperty.hasPool ? 'Yes' : 'No'}`);

// Basic prediction
const basicPred = await mlPlugin.predict('basicPricing', testProperty);
console.log(`\n💰 Basic Model (no filtering):`);
console.log(`   Price: $${basicPred.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`   Confidence: ${(basicPred.confidence * 100).toFixed(1)}%`);

// Filtered prediction
const filteredPred = await mlPlugin.predict('filteredPricing', testProperty);
console.log(`\n💎 Filtered Model (outliers removed):`);
console.log(`   Price: $${filteredPred.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`   Confidence: ${(filteredPred.confidence * 100).toFixed(1)}%`);
console.log(`   Difference: $${Math.abs(filteredPred.value - basicPred.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

// Transformed prediction (need to transform input too)
const transformedInput = {
  bedrooms: testProperty.bedrooms,
  bathrooms: testProperty.bathrooms,
  sqftNormalized: Math.log(testProperty.sqft),
  ageScore: Math.max(0, 50 - testProperty.age) / 50,
  conditionScore: { excellent: 1.0, good: 0.7, fair: 0.4, poor: 0.1 }[testProperty.condition] || 0.5,
  amenitiesScore: (testProperty.hasGarage ? 0.5 : 0) + (testProperty.hasPool ? 0.5 : 0)
};

const transformedPred = await mlPlugin.predict('transformedPricing', transformedInput);
const estimatedPrice = transformedPred.value * testProperty.sqft;

console.log(`\n🎯 Transformed Model (feature engineering):`);
console.log(`   Price/sqft: $${transformedPred.value.toFixed(2)}`);
console.log(`   Total Price: $${estimatedPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
console.log(`   Confidence: ${(transformedPred.confidence * 100).toFixed(1)}%`);

console.log('\n' + '='.repeat(60));
console.log('📊 Model Comparison Summary');
console.log('='.repeat(60));

console.log(`\n   Model              | Samples | Loss     | R² Score | Predicted Price`);
console.log(`   ${''.padEnd(18, '-')}|${''.padEnd(9, '-')}|${''.padEnd(10, '-')}|${''.padEnd(10, '-')}|${''.padEnd(20, '-')}`);
console.log(`   ${'Basic'.padEnd(18)} | ${basicResult.samples.toString().padEnd(7)} | ${basicResult.loss.toFixed(4).padEnd(8)} | ${(basicResult.r2Score || 0).toFixed(4).padEnd(8)} | $${basicPred.value.toFixed(2).padStart(15)}`);
console.log(`   ${'Filtered'.padEnd(18)} | ${filteredResult.samples.toString().padEnd(7)} | ${filteredResult.loss.toFixed(4).padEnd(8)} | ${(filteredResult.r2Score || 0).toFixed(4).padEnd(8)} | $${filteredPred.value.toFixed(2).padStart(15)}`);
console.log(`   ${'Transformed'.padEnd(18)} | ${transformedResult.samples.toString().padEnd(7)} | ${transformedResult.loss.toFixed(4).padEnd(8)} | ${(transformedResult.r2Score || 0).toFixed(4).padEnd(8)} | $${estimatedPrice.toFixed(2).padStart(15)}`);

console.log('\n' + '='.repeat(60));
console.log('✅ Example Complete!');
console.log('='.repeat(60));

console.log('\n📝 Key Takeaways:');
console.log('   1. filter() removes invalid/outlier records before training');
console.log('   2. map() transforms features for better predictions');
console.log('   3. Filtering improves model quality by removing bad data');
console.log('   4. Feature engineering can significantly boost accuracy');
console.log('   5. Combine filter + map for fine-grained data preprocessing');
console.log('   6. Data quality matters more than data quantity');

console.log('\n🔄 Processing Pipeline:');
console.log('   1. Fetch data (all or partition)');
console.log('   2. Apply filter() → Remove invalid/outliers');
console.log('   3. Apply map() → Transform features');
console.log('   4. Validate minimum samples');
console.log('   5. Train model');

console.log('\n💡 Best Practices:');
console.log('   - Use filter() to remove outliers and invalid data');
console.log('   - Use map() for feature engineering (normalization, scaling, etc.)');
console.log('   - Apply same transformations to prediction inputs');
console.log('   - Document transformation logic for reproducibility');
console.log('   - Test with/without transformations to measure impact');

await db.stop();
process.exit(0);

/**
 * Example 68: ML Plugin - Time Series Model
 *
 * Demonstrates using the ML Plugin to train a time series model (LSTM)
 * that predicts future sales based on historical data.
 *
 * Requirements:
 * - Install TensorFlow.js: pnpm add @tensorflow/tfjs-node
 *
 * Run: node docs/examples/e68-ml-plugin-timeseries.js
 */

import { Database, MLPlugin } from '../../src/index.js';

console.log('='.repeat(60));
console.log('Example 68: ML Plugin - Time Series Model (LSTM)');
console.log('='.repeat(60));

// Create in-memory database
const db = new Database({
  client: 'memory',
  verbose: false
});

// Install ML Plugin
const mlPlugin = new MLPlugin({
  models: {
    salesForecast: {
      type: 'timeseries',
      resource: 'sales',
      features: ['temperature', 'dayOfWeek'], // Additional features
      target: 'revenue', // What we want to predict
      autoTrain: false,
      modelConfig: {
        epochs: 50,
        batchSize: 16,
        learningRate: 0.001,
        lookback: 7, // Use last 7 days to predict next day
        lstmUnits: 50,
        denseUnits: 25,
        dropout: 0.2
      }
    }
  },
  verbose: true
});

await db.install(mlPlugin);
await db.start();

// Create sales resource
const sales = await db.createResource({
  name: 'sales',
  attributes: {
    date: 'string|required',
    revenue: 'number|required',
    temperature: 'number|required', // Temperature in °C
    dayOfWeek: 'number|required' // 0=Sun, 1=Mon, ..., 6=Sat
  },
  timestamps: true
});

console.log('\n📊 Sales resource created');

// Generate synthetic time series data
console.log('\n🔢 Generating synthetic time series data...');

const startDate = new Date('2024-01-01');
const trainingData = [];

for (let day = 0; day < 100; day++) {
  const currentDate = new Date(startDate);
  currentDate.setDate(startDate.getDate() + day);

  const dayOfWeek = currentDate.getDay();
  const temperature = 15 + Math.sin(day / 30) * 10 + (Math.random() - 0.5) * 3; // Seasonal pattern

  // Revenue formula with patterns:
  // - Base revenue
  // - Weekly pattern (higher on weekends)
  // - Temperature effect (higher when warmer)
  // - Trend (slight growth over time)
  // - Random noise

  const baseRevenue = 1000;
  const weekendBonus = (dayOfWeek === 0 || dayOfWeek === 6) ? 200 : 0;
  const temperatureEffect = temperature * 5;
  const trend = day * 2; // Growing over time
  const noise = (Math.random() - 0.5) * 100;

  const revenue = baseRevenue + weekendBonus + temperatureEffect + trend + noise;

  trainingData.push({
    date: currentDate.toISOString().split('T')[0],
    revenue,
    temperature,
    dayOfWeek
  });
}

// Insert training data
for (const data of trainingData) {
  await sales.insert(data);
}

console.log(`✅ Inserted ${trainingData.length} daily sales records`);

// Train the model
console.log('\n🎓 Training LSTM time series model...');
console.log('-'.repeat(60));

const trainingResult = await mlPlugin.train('salesForecast');

console.log('\n✅ Training completed:');
console.log(`   Loss: ${trainingResult.loss.toFixed(4)}`);
console.log(`   Epochs: ${trainingResult.epochs}`);
console.log(`   Samples: ${trainingResult.samples}`);

// Test single-step prediction
console.log('\n🔮 Single-step prediction (next day):');
console.log('-'.repeat(60));

// Use last 7 days to predict day 8
const lookback = 7;
const testSequence = trainingData.slice(-lookback);

const { prediction, confidence } = await mlPlugin.predict('salesForecast', testSequence);

// Calculate expected value (using true formula)
const lastDay = trainingData.length - 1;
const nextDayOfWeek = (trainingData[lastDay].dayOfWeek + 1) % 7;
const nextTemperature = 15 + Math.sin((lastDay + 1) / 30) * 10;
const expectedRevenue = 1000 + ((nextDayOfWeek === 0 || nextDayOfWeek === 6) ? 200 : 0) + nextTemperature * 5 + (lastDay + 1) * 2;

console.log(`\nLast 7 days revenue: ${testSequence.map(d => '$' + d.revenue.toFixed(0)).join(', ')}`);
console.log(`Next day prediction: $${prediction.toFixed(2)}`);
console.log(`Expected (true formula): $${expectedRevenue.toFixed(2)}`);
console.log(`Error: $${Math.abs(prediction - expectedRevenue).toFixed(2)} (${((Math.abs(prediction - expectedRevenue) / expectedRevenue) * 100).toFixed(2)}%)`);
console.log(`Confidence: ${(confidence * 100).toFixed(1)}%`);

// Multi-step prediction
console.log('\n📈 Multi-step prediction (next 7 days):');
console.log('-'.repeat(60));

const model = mlPlugin.models.salesForecast;
const multiStepPredictions = await model.predictMultiStep(testSequence, 7);

console.log('\nPredicted revenue for next 7 days:');
for (let i = 0; i < multiStepPredictions.length; i++) {
  const dayIndex = lastDay + i + 1;
  const predictedDate = new Date(startDate);
  predictedDate.setDate(startDate.getDate() + dayIndex);

  console.log(`   Day ${i + 1} (${predictedDate.toISOString().split('T')[0]}): $${multiStepPredictions[i].toFixed(2)}`);
}

// Calculate MAPE (Mean Absolute Percentage Error)
console.log('\n📉 Model Evaluation (MAPE):');
console.log('-'.repeat(60));

const testData = trainingData.slice(0, 80); // Use first 80 samples as test
const mape = await model.calculateMAPE(testData);

console.log(`   MAPE: ${mape.toFixed(2)}%`);
console.log(`   Interpretation: ${mape < 10 ? 'Excellent' : mape < 20 ? 'Good' : mape < 30 ? 'Reasonable' : 'Poor'} forecast accuracy`);

// Analyze patterns
console.log('\n📊 Revenue Patterns Analysis:');
console.log('-'.repeat(60));

const weekdayRevenue = [];
const weekendRevenue = [];

for (const record of trainingData.slice(-30)) { // Last 30 days
  if (record.dayOfWeek === 0 || record.dayOfWeek === 6) {
    weekendRevenue.push(record.revenue);
  } else {
    weekdayRevenue.push(record.revenue);
  }
}

const avgWeekday = weekdayRevenue.reduce((sum, r) => sum + r, 0) / weekdayRevenue.length;
const avgWeekend = weekendRevenue.reduce((sum, r) => sum + r, 0) / weekendRevenue.length;

console.log(`   Average weekday revenue: $${avgWeekday.toFixed(2)}`);
console.log(`   Average weekend revenue: $${avgWeekend.toFixed(2)}`);
console.log(`   Weekend uplift: ${((avgWeekend / avgWeekday - 1) * 100).toFixed(1)}%`);

// Model statistics
console.log('\n📈 Model Statistics:');
console.log('-'.repeat(60));

const modelStats = mlPlugin.getModelStats('salesForecast');
console.log(`   Trained at: ${modelStats.trainedAt}`);
console.log(`   Training samples: ${modelStats.samples}`);
console.log(`   Training loss: ${modelStats.loss.toFixed(4)}`);
console.log(`   Total predictions: ${modelStats.predictions}`);
console.log(`   Errors: ${modelStats.errors}`);
console.log(`   Lookback window: ${model.config.modelConfig.lookback} days`);

// Plugin statistics
const pluginStats = mlPlugin.getStats();
console.log('\n🔌 Plugin Statistics:');
console.log(`   Total models: ${pluginStats.models}`);
console.log(`   Trained models: ${pluginStats.trainedModels}`);
console.log(`   Total trainings: ${pluginStats.totalTrainings}`);
console.log(`   Total predictions: ${pluginStats.totalPredictions}`);

// Export model
console.log('\n💾 Exporting model...');
const exportedModel = await mlPlugin.exportModel('salesForecast');
console.log(`   Model type: ${exportedModel.type}`);
console.log(`   Lookback: ${exportedModel.lookback} days`);
console.log(`   Features: ${exportedModel.config.features.join(', ')}`);
console.log(`   Target: ${exportedModel.config.target}`);

console.log('\n✅ Example completed!');
console.log('='.repeat(60));

// Cleanup
await db.stop();

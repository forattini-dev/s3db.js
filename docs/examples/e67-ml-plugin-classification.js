/**
 * Example 67: ML Plugin - Classification Model
 *
 * Demonstrates using the ML Plugin to train a classification model
 * that detects spam emails based on message characteristics.
 *
 * Requirements:
 * - Install TensorFlow.js: pnpm add @tensorflow/tfjs-node
 *
 * Run: node docs/examples/e67-ml-plugin-classification.js
 */

import { Database, MLPlugin } from '../../src/index.js';

console.log('='.repeat(60));
console.log('Example 67: ML Plugin - Classification Model');
console.log('='.repeat(60));

// Create in-memory database
const db = new Database({
  client: 'memory',
  verbose: false
});

// Install ML Plugin
const mlPlugin = new MLPlugin({
  models: {
    spamDetector: {
      type: 'classification',
      resource: 'emails',
      features: ['wordCount', 'linkCount', 'capsRatio', 'exclamationCount'],
      target: 'isSpam',
      autoTrain: false,
      modelConfig: {
        epochs: 40,
        batchSize: 32,
        learningRate: 0.01,
        dropout: 0.3
      }
    }
  },
  verbose: true
});

await db.install(mlPlugin);
await db.start();

// Create emails resource
const emails = await db.createResource({
  name: 'emails',
  attributes: {
    subject: 'string|required',
    wordCount: 'number|required',
    linkCount: 'number|required',
    capsRatio: 'number|required', // Ratio of capital letters (0-1)
    exclamationCount: 'number|required',
    isSpam: 'string|required' // 'spam' or 'ham' (not spam)
  },
  timestamps: true
});

console.log('\n📧 Emails resource created');

// Generate synthetic training data
console.log('\n🔢 Generating synthetic training data...');

const generateEmail = (isSpam) => {
  if (isSpam) {
    // Spam characteristics
    return {
      subject: 'AMAZING OFFER!!!',
      wordCount: Math.floor(Math.random() * 50) + 100, // 100-150 words
      linkCount: Math.floor(Math.random() * 8) + 3, // 3-10 links
      capsRatio: Math.random() * 0.4 + 0.3, // 30%-70% caps
      exclamationCount: Math.floor(Math.random() * 8) + 2, // 2-10 exclamations
      isSpam: 'spam'
    };
  } else {
    // Ham (legitimate) characteristics
    return {
      subject: 'Meeting tomorrow',
      wordCount: Math.floor(Math.random() * 100) + 20, // 20-120 words
      linkCount: Math.floor(Math.random() * 2), // 0-2 links
      capsRatio: Math.random() * 0.15, // 0%-15% caps
      exclamationCount: Math.floor(Math.random() * 2), // 0-1 exclamations
      isSpam: 'ham'
    };
  }
};

// Generate balanced dataset
const trainingData = [];
for (let i = 0; i < 150; i++) {
  trainingData.push(generateEmail(true)); // Spam
  trainingData.push(generateEmail(false)); // Ham
}

// Shuffle
for (let i = trainingData.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [trainingData[i], trainingData[j]] = [trainingData[j], trainingData[i]];
}

// Insert training data
for (const data of trainingData) {
  await emails.insert(data);
}

console.log(`✅ Inserted ${trainingData.length} training samples (${trainingData.filter(e => e.isSpam === 'spam').length} spam, ${trainingData.filter(e => e.isSpam === 'ham').length} ham)`);

// Train the model
console.log('\n🎓 Training classification model...');
console.log('-'.repeat(60));

const trainingResult = await mlPlugin.train('spamDetector');

console.log('\n✅ Training completed:');
console.log(`   Loss: ${trainingResult.loss.toFixed(4)}`);
console.log(`   Accuracy: ${(trainingResult.accuracy * 100).toFixed(2)}%`);
console.log(`   Epochs: ${trainingResult.epochs}`);
console.log(`   Samples: ${trainingResult.samples}`);

// Test predictions
console.log('\n🔮 Testing predictions...');
console.log('-'.repeat(60));

const testCases = [
  {
    name: 'Obvious Spam',
    wordCount: 120,
    linkCount: 8,
    capsRatio: 0.5,
    exclamationCount: 7,
    expectedClass: 'spam'
  },
  {
    name: 'Legitimate Email',
    wordCount: 45,
    linkCount: 1,
    capsRatio: 0.05,
    exclamationCount: 0,
    expectedClass: 'ham'
  },
  {
    name: 'Borderline Case',
    wordCount: 80,
    linkCount: 3,
    capsRatio: 0.25,
    exclamationCount: 2,
    expectedClass: 'spam'
  },
  {
    name: 'Professional Email',
    wordCount: 60,
    linkCount: 2,
    capsRatio: 0.08,
    exclamationCount: 1,
    expectedClass: 'ham'
  }
];

for (const testCase of testCases) {
  const { prediction, confidence, probabilities } = await mlPlugin.predict('spamDetector', testCase);

  const isCorrect = prediction === testCase.expectedClass;

  console.log(`\n${testCase.name}:`);
  console.log(`   Words: ${testCase.wordCount}, Links: ${testCase.linkCount}, Caps: ${(testCase.capsRatio * 100).toFixed(0)}%, Exclamations: ${testCase.exclamationCount}`);
  console.log(`   Expected: ${testCase.expectedClass}`);
  console.log(`   Predicted: ${prediction} ${isCorrect ? '✓' : '✗'}`);
  console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
  console.log(`   Probabilities:`);
  console.log(`      Spam: ${(probabilities.spam * 100).toFixed(1)}%`);
  console.log(`      Ham: ${(probabilities.ham * 100).toFixed(1)}%`);
}

// Confusion matrix
console.log('\n📊 Confusion Matrix:');
console.log('-'.repeat(60));

const model = mlPlugin.models.spamDetector;
const testData = trainingData.slice(0, 100); // Use first 100 samples as test set
const confusionMatrix = await model.calculateConfusionMatrix(testData);

console.log('\nActual → Predicted:');
console.log(`         Spam    Ham`);
console.log(`   Spam    ${confusionMatrix.matrix.spam.spam}      ${confusionMatrix.matrix.spam.ham}`);
console.log(`   Ham     ${confusionMatrix.matrix.ham.spam}      ${confusionMatrix.matrix.ham.ham}`);
console.log(`\n   Accuracy: ${(confusionMatrix.accuracy * 100).toFixed(2)}%`);
console.log(`   Correct: ${confusionMatrix.correct}/${confusionMatrix.total}`);

// Batch predictions
console.log('\n📬 Batch predictions...');
console.log('-'.repeat(60));

const batchInputs = [
  { wordCount: 110, linkCount: 6, capsRatio: 0.45, exclamationCount: 5 },
  { wordCount: 35, linkCount: 0, capsRatio: 0.03, exclamationCount: 0 },
  { wordCount: 90, linkCount: 4, capsRatio: 0.35, exclamationCount: 4 },
  { wordCount: 50, linkCount: 1, capsRatio: 0.10, exclamationCount: 1 }
];

const batchPredictions = await mlPlugin.predictBatch('spamDetector', batchInputs);

console.log(`\nClassified ${batchPredictions.length} emails:`);
for (let i = 0; i < batchPredictions.length; i++) {
  const input = batchInputs[i];
  const { prediction, confidence } = batchPredictions[i];
  console.log(`   ${i + 1}. ${prediction.toUpperCase()} (${(confidence * 100).toFixed(1)}% confidence) - Words:${input.wordCount}, Links:${input.linkCount}`);
}

// Model statistics
console.log('\n📈 Model Statistics:');
console.log('-'.repeat(60));

const modelStats = mlPlugin.getModelStats('spamDetector');
console.log(`   Trained at: ${modelStats.trainedAt}`);
console.log(`   Training samples: ${modelStats.samples}`);
console.log(`   Training loss: ${modelStats.loss.toFixed(4)}`);
console.log(`   Training accuracy: ${(modelStats.accuracy * 100).toFixed(2)}%`);
console.log(`   Total predictions: ${modelStats.predictions}`);
console.log(`   Errors: ${modelStats.errors}`);

// Plugin statistics
const pluginStats = mlPlugin.getStats();
console.log('\n🔌 Plugin Statistics:');
console.log(`   Total models: ${pluginStats.models}`);
console.log(`   Trained models: ${pluginStats.trainedModels}`);
console.log(`   Total trainings: ${pluginStats.totalTrainings}`);
console.log(`   Total predictions: ${pluginStats.totalPredictions}`);

// Export model
console.log('\n💾 Exporting model...');
const exportedModel = await mlPlugin.exportModel('spamDetector');
console.log(`   Model type: ${exportedModel.type}`);
console.log(`   Classes: ${exportedModel.classes.join(', ')}`);
console.log(`   Features: ${exportedModel.config.features.join(', ')}`);
console.log(`   Target: ${exportedModel.config.target}`);

console.log('\n✅ Example completed!');
console.log('='.repeat(60));

// Cleanup
await db.stop();

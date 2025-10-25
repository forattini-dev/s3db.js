# MLPlugin Documentation

> **Machine Learning Plugin for s3db.js**
> Train and deploy ML models directly on your s3db.js resources using TensorFlow.js

[![Version](https://img.shields.io/badge/version-13.0.0-blue.svg)](https://github.com/forattini-dev/s3db.js)
[![License](https://img.shields.io/badge/license-UNLICENSED-red.svg)](https://github.com/forattini-dev/s3db.js)

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [Model Types](#model-types)
  - [Regression](#regression)
  - [Classification](#classification)
  - [Time Series (LSTM)](#time-series-lstm)
  - [Neural Network](#neural-network)
- [Configuration](#configuration)
- [Training](#training)
- [Prediction](#prediction)
- [Evaluation](#evaluation)
- [Persistence](#persistence)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Performance](#performance)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Overview

The **MLPlugin** transforms s3db.js into a complete machine learning platform, allowing you to:

- ✅ Train ML models directly on your data stored in S3
- ✅ Use 4 different model types (regression, classification, time series, neural networks)
- ✅ Automatically train models on schedule or after data updates
- ✅ Persist trained models in S3 with automatic loading
- ✅ **NEW:** Train on specific data partitions for specialized models
- ✅ **NEW:** Save intermediate training data for debugging/auditing
- ✅ **NEW:** Custom data transformations with `filter()` and `map()` functions
- ✅ Make predictions with confidence scores
- ✅ Evaluate model performance with industry-standard metrics

### Key Features

| Feature | Description |
|---------|-------------|
| **4 Model Types** | Regression, Classification, Time Series (LSTM), Custom Neural Networks |
| **Auto-Training** | Train on interval or after N inserts |
| **Persistence** | Models saved to S3 automatically |
| **Partition Filtering** | **NEW v13.0.0:** Train models on specific data subsets |
| **Training Data Storage** | **NEW v13.0.0:** Save intermediate training data to S3 |
| **Data Transformations** | **NEW v13.0.0:** Custom `filter()` and `map()` functions for preprocessing |
| **Evaluation** | R², Confusion Matrix, MAPE, and more |
| **TensorFlow.js** | Production-ready ML powered by Google |
| **Zero Config** | Works out of the box with sensible defaults |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         MLPlugin                            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Regression  │  │Classification│  │ Time Series  │     │
│  │    Model     │  │    Model     │  │  (LSTM)      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Neural Network Model (Custom)              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Base Model                         │  │
│  │  (Normalization, Training, Persistence, Validation) │  │
│  └──────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    TensorFlow.js Core                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
                   ┌─────────────────┐
                   │  PluginStorage  │
                   │    (S3/MinIO)   │
                   └─────────────────┘
```

---

## Installation

### Step 1: Install Dependencies

The MLPlugin requires TensorFlow.js as a peer dependency:

```bash
cd s3db.js
pnpm add @tensorflow/tfjs-node
```

**Note:** TensorFlow.js is ~200MB and includes native bindings. First install may take a few minutes.

### Step 2: Import the Plugin

```javascript
import { Database, MLPlugin } from 's3db.js';
```

That's it! The plugin is ready to use.

---

## Quick Start

Here's a complete example that trains a price prediction model:

```javascript
import { Database, MLPlugin } from 's3db.js';

// 1. Create database
const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/mybucket'
});

// 2. Create resource
const products = await db.createResource({
  name: 'products',
  attributes: {
    cost: 'number|required',
    demand: 'number|required',
    price: 'number|required'
  }
});

// 3. Insert training data
await products.insert({ cost: 100, demand: 500, price: 150 });
await products.insert({ cost: 200, demand: 300, price: 280 });
// ... insert more data

// 4. Install ML Plugin
const mlPlugin = new MLPlugin({
  models: {
    pricePredictor: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'demand'],
      target: 'price',
      autoTrain: true,
      trainInterval: 3600000 // 1 hour
    }
  }
});

await db.install(mlPlugin);
await db.start();

// 5. Train model
await mlPlugin.train('pricePredictor');

// 6. Make predictions
const { prediction, confidence } = await mlPlugin.predict('pricePredictor', {
  cost: 150,
  demand: 400
});

console.log(`Predicted price: $${prediction.toFixed(2)}`);
console.log(`Confidence: ${(confidence * 100).toFixed(1)}%`);
```

**Output:**
```
Predicted price: $215.50
Confidence: 92.3%
```

---

## Core Concepts

### Features and Target

- **Features** (`features`): Input variables used to make predictions
- **Target** (`target`): Output variable you want to predict

Example:
```javascript
{
  features: ['age', 'income', 'credit_score'],  // Inputs
  target: 'loan_approved'                        // Output
}
```

### Model Types

| Type | Use Case | Input → Output | Example |
|------|----------|----------------|---------|
| **Regression** | Predict continuous values | Numbers → Number | Predict house price from features |
| **Classification** | Predict categories | Numbers → Category | Classify email as spam/ham |
| **Time Series** | Predict future values | Sequence → Number | Forecast next week's sales |
| **Neural Network** | Complex patterns | Numbers → Number(s) | Custom problems |

### Training vs Prediction

**Training** (`.train()`):
- Learns patterns from your data
- Updates model weights
- Takes time (seconds to minutes)
- Done periodically

**Prediction** (`.predict()`):
- Uses trained model
- Very fast (milliseconds)
- Done many times per second
- Read-only operation

### Normalization

All models automatically normalize data using **min-max scaling**:

```
normalized_value = (value - min) / (max - min)
```

This ensures all features are in range [0, 1] for optimal training.

---

## Model Types

### Regression

Predicts continuous numerical values.

#### Use Cases
- Price prediction
- Revenue forecasting
- Demand estimation
- Risk scoring
- Temperature prediction

#### Configuration

```javascript
{
  modelName: {
    type: 'regression',
    resource: 'products',
    features: ['cost', 'margin', 'demand'],
    target: 'price',
    modelConfig: {
      epochs: 50,           // Training iterations
      batchSize: 32,        // Samples per batch
      learningRate: 0.01,   // Learning speed
      polynomial: 1,        // 1=linear, 2-5=polynomial
      units: 64,            // Hidden layer size (polynomial only)
      activation: 'relu'    // Activation function
    }
  }
}
```

#### Linear vs Polynomial

**Linear Regression** (`polynomial: 1`):
- Simple linear relationships
- Fast training
- Good for basic problems

**Polynomial Regression** (`polynomial: 2-5`):
- Non-linear relationships
- More complex patterns
- Requires more data

#### Evaluation

```javascript
const model = mlPlugin.models.pricePredictor;
const r2 = await model.calculateR2Score(testData);

console.log(`R² Score: ${r2.toFixed(4)}`);
// R² Score: 0.9234

// Interpretation:
// 0.9-1.0: Excellent
// 0.7-0.9: Good
// 0.5-0.7: Moderate
// <0.5: Poor
```

#### Example

See: [docs/examples/e66-ml-plugin-regression.js](../examples/e66-ml-plugin-regression.js)

---

### Classification

Predicts categorical labels (classes).

#### Use Cases
- Spam detection
- Sentiment analysis
- Customer segmentation
- Fraud detection
- Quality control

#### Configuration

```javascript
{
  modelName: {
    type: 'classification',
    resource: 'emails',
    features: ['wordCount', 'linkCount', 'capsRatio'],
    target: 'isSpam', // 'spam' or 'ham'
    modelConfig: {
      epochs: 40,
      batchSize: 32,
      learningRate: 0.01,
      units: 64,          // Hidden layer size
      activation: 'relu', // Hidden layer activation
      dropout: 0.2        // Dropout rate for regularization
    }
  }
}
```

#### Binary vs Multi-Class

**Binary Classification** (2 classes):
- Uses sigmoid activation
- Output: probability for positive class
- Examples: spam/ham, yes/no, pass/fail

**Multi-Class Classification** (3+ classes):
- Uses softmax activation
- Output: probability for each class
- Examples: product categories, sentiment (positive/neutral/negative)

#### Prediction Output

```javascript
const result = await mlPlugin.predict('spamDetector', {
  wordCount: 120,
  linkCount: 8,
  capsRatio: 0.45
});

console.log(result);
// {
//   prediction: 'spam',
//   confidence: 0.94,
//   probabilities: {
//     spam: 0.94,
//     ham: 0.06
//   }
// }
```

#### Evaluation

```javascript
const model = mlPlugin.models.spamDetector;
const cm = await model.calculateConfusionMatrix(testData);

console.log(cm);
// {
//   matrix: {
//     spam: { spam: 45, ham: 3 },
//     ham: { spam: 2, ham: 50 }
//   },
//   accuracy: 0.95,
//   total: 100,
//   correct: 95
// }
```

**Confusion Matrix Interpretation:**
```
                 Predicted
              Spam    Ham
Actual Spam    45      3     ← 45 correct, 3 false negatives
       Ham      2     50     ← 50 correct, 2 false positives
```

#### Example

See: [docs/examples/e67-ml-plugin-classification.js](../examples/e67-ml-plugin-classification.js)

---

### Time Series (LSTM)

Predicts future values based on historical sequences using LSTM (Long Short-Term Memory) networks.

#### Use Cases
- Sales forecasting
- Stock price prediction
- Demand planning
- Weather forecasting
- Resource usage prediction

#### Configuration

```javascript
{
  modelName: {
    type: 'timeseries',
    resource: 'sales',
    features: ['temperature', 'dayOfWeek'], // Additional features
    target: 'revenue',                       // What to predict
    modelConfig: {
      epochs: 50,
      batchSize: 16,
      learningRate: 0.001,
      lookback: 7,              // Use last 7 timesteps
      lstmUnits: 50,            // LSTM layer size
      denseUnits: 25,           // Dense layer size
      dropout: 0.2,             // Dropout rate
      recurrentDropout: 0.2     // Recurrent dropout
    }
  }
}
```

#### Lookback Window

The `lookback` parameter defines how many past timesteps to use:

```
lookback = 7

[Day 1] [Day 2] [Day 3] [Day 4] [Day 5] [Day 6] [Day 7] → Predict [Day 8]
   ↓       ↓       ↓       ↓       ↓       ↓       ↓
  Input sequence (7 days)                              Output
```

**Choosing Lookback:**
- Daily data: 7-30 days
- Hourly data: 24-168 hours
- Minute data: 60-1440 minutes

#### Single-Step Prediction

```javascript
// Get last 7 days
const sequence = await sales.list({ limit: 7 });

// Predict next day
const { prediction } = await mlPlugin.predict('salesForecast', sequence);

console.log(`Tomorrow's revenue: $${prediction.toFixed(2)}`);
```

#### Multi-Step Prediction

```javascript
const model = mlPlugin.models.salesForecast;

// Predict next 7 days
const predictions = await model.predictMultiStep(sequence, 7);

predictions.forEach((pred, i) => {
  console.log(`Day ${i + 1}: $${pred.toFixed(2)}`);
});
// Day 1: $1234.56
// Day 2: $1298.32
// Day 3: $1156.78
// ...
```

#### Evaluation

```javascript
const model = mlPlugin.models.salesForecast;
const mape = await model.calculateMAPE(testData);

console.log(`MAPE: ${mape.toFixed(2)}%`);
// MAPE: 8.34%

// Interpretation:
// <10%: Excellent
// 10-20%: Good
// 20-50%: Reasonable
// >50%: Poor
```

**MAPE** (Mean Absolute Percentage Error): Average prediction error as percentage.

#### Important Notes

- Data must be **sequential** (sorted by time)
- Need at least `lookback + 1` samples to train
- More data = better predictions
- Consider seasonality and trends

#### Example

See: [docs/examples/e68-ml-plugin-timeseries.js](../examples/e68-ml-plugin-timeseries.js)

---

### Neural Network

Fully customizable neural network for complex problems.

#### Use Cases
- Custom non-linear problems
- Problems requiring specific architectures
- Transfer learning
- Experimental models

#### Configuration

```javascript
{
  modelName: {
    type: 'neural-network',
    resource: 'data',
    features: ['x1', 'x2', 'x3'],
    target: 'y',
    modelConfig: {
      epochs: 50,
      batchSize: 32,
      learningRate: 0.01,

      // Define custom layers
      layers: [
        {
          units: 128,
          activation: 'relu',
          dropout: 0.3,
          batchNormalization: true
        },
        {
          units: 64,
          activation: 'relu',
          dropout: 0.2
        },
        {
          units: 32,
          activation: 'relu'
        }
      ],

      // Output layer config
      outputActivation: 'linear',  // or 'sigmoid', 'softmax'
      outputUnits: 1,
      loss: 'meanSquaredError',    // or 'categoricalCrossentropy'
      metrics: ['mse', 'mae']
    }
  }
}
```

#### Layer Configuration

| Parameter | Description | Values |
|-----------|-------------|--------|
| `units` | Number of neurons | 1-1024+ |
| `activation` | Activation function | `relu`, `sigmoid`, `tanh`, `elu`, `selu` |
| `dropout` | Dropout rate | 0.0-0.5 (0 = no dropout) |
| `batchNormalization` | Normalize layer outputs | `true`/`false` |

#### Activation Functions

- **ReLU** (`relu`): Default, works well for most cases
- **Sigmoid** (`sigmoid`): Output between 0-1, use for binary output
- **Tanh** (`tanh`): Output between -1 to 1
- **Softmax** (`softmax`): Multi-class classification output

#### Early Stopping

```javascript
const result = await mlPlugin.models.myModel.trainWithEarlyStopping(data, {
  patience: 10,           // Stop after 10 epochs without improvement
  minDelta: 0.001,        // Minimum improvement threshold
  monitor: 'val_loss',    // What to monitor
  restoreBestWeights: true // Restore weights from best epoch
});

console.log(result);
// {
//   loss: 0.0234,
//   epochs: 27,           // Stopped at epoch 27
//   samples: 1000,
//   stoppedEarly: true
// }
```

#### Get Architecture

```javascript
const arch = mlPlugin.models.myModel.getArchitecture();

console.log(arch);
// {
//   inputFeatures: ['x1', 'x2', 'x3'],
//   hiddenLayers: [
//     { index: 0, units: 128, activation: 'relu', dropout: 0.3, batchNormalization: true },
//     { index: 1, units: 64, activation: 'relu', dropout: 0.2, batchNormalization: false },
//     { index: 2, units: 32, activation: 'relu', dropout: 0, batchNormalization: false }
//   ],
//   outputLayer: { units: 1, activation: 'linear' },
//   totalParameters: 12545,
//   loss: 'meanSquaredError',
//   metrics: ['mse', 'mae']
// }
```

---

## Configuration

### Plugin Options

```javascript
new MLPlugin({
  // Model definitions
  models: {
    modelName: { /* model config */ }
  },

  // Global settings
  verbose: false,              // Enable logging
  minTrainingSamples: 10,      // Minimum samples required

  // Persistence settings (NEW in v13.0.0)
  saveModel: true,             // Save trained models to S3 (default: true)
  saveTrainingData: false      // Save intermediate training data to S3 (default: false)
})
```

### Model Configuration

All models share these common options:

```javascript
{
  modelName: {
    // Required
    type: 'regression',         // Model type
    resource: 'products',       // Resource name
    features: ['x', 'y'],       // Input features
    target: 'z',                // Output target

    // Partition filtering (NEW in v13.0.0)
    partition: {
      name: 'byCategory',       // Partition name
      values: { category: 'A' } // Partition values to filter
    },

    // Data transformations (NEW in v13.0.0)
    filter: (record) => {       // Filter function to remove invalid/outlier records
      return record.value > 0 && record.value < 1000;
    },
    map: (record) => {          // Map function to transform features
      return {
        ...record,
        logValue: Math.log(record.value),
        normalized: record.value / 100
      };
    },

    // Auto-training
    autoTrain: false,           // Enable auto-training
    trainInterval: 3600000,     // Train every hour (ms)
    trainAfterInserts: 100,     // Train after N inserts

    // Persistence (NEW in v13.0.0)
    saveModel: true,            // Override global saveModel setting
    saveTrainingData: true,     // Override global saveTrainingData setting

    // Training configuration
    modelConfig: {
      epochs: 50,               // Training iterations
      batchSize: 32,            // Samples per batch
      learningRate: 0.01,       // Learning rate
      validationSplit: 0.2      // 20% for validation
    }
  }
}
```

### Training Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `epochs` | 50 | Number of complete passes through data |
| `batchSize` | 32 | Number of samples per gradient update |
| `learningRate` | 0.01 | Step size for weight updates |
| `validationSplit` | 0.2 | Fraction of data for validation (0-1) |

**Tuning Tips:**
- **More epochs** = Better learning, but slower and risk overfitting
- **Larger batch size** = Faster training, but less precise
- **Higher learning rate** = Faster convergence, but may overshoot
- **More validation** = Better generalization check, less training data

---

## Training

### Manual Training

```javascript
// Train a specific model
const result = await mlPlugin.train('modelName');

console.log(result);
// {
//   loss: 0.0234,
//   accuracy: 0.95,      // Only for classification
//   epochs: 50,
//   samples: 1000
// }
```

### Auto-Training

#### Interval-Based

Train automatically every X milliseconds:

```javascript
{
  modelName: {
    autoTrain: true,
    trainInterval: 3600000  // 1 hour
  }
}
```

**Common Intervals:**
```javascript
60000       // 1 minute
300000      // 5 minutes
1800000     // 30 minutes
3600000     // 1 hour
86400000    // 24 hours
```

#### Insert-Based

Train automatically after N new records:

```javascript
{
  modelName: {
    autoTrain: true,
    trainAfterInserts: 100  // After 100 new records
  }
}
```

**How it works:**
```
Insert #1   → counter = 1
Insert #2   → counter = 2
...
Insert #100 → counter = 100 → TRAIN! → counter = 0
Insert #101 → counter = 1
```

#### Combined

Use both strategies together:

```javascript
{
  modelName: {
    autoTrain: true,
    trainInterval: 3600000,     // Every hour
    trainAfterInserts: 100      // OR after 100 inserts
  }
}
```

The model will train when **either** condition is met.

### Retraining

Reset model and train from scratch:

```javascript
// Retrain (starts fresh)
await mlPlugin.retrain('modelName', {
  resetWeights: true  // Clear previous learning
});
```

**When to retrain:**
- Data distribution changes significantly
- Model performance degrades
- New features added
- Business requirements change

### Training Status

```javascript
// Check if model is currently training
const isTraining = mlPlugin.training.get('modelName');

if (isTraining) {
  console.log('Model is currently training...');
}
```

---

## Prediction

### Single Prediction

```javascript
const result = await mlPlugin.predict('modelName', {
  feature1: 100,
  feature2: 50
});

console.log(result);
// {
//   prediction: 156.78,
//   confidence: 0.92
// }
```

### Batch Prediction

Predict for multiple inputs efficiently:

```javascript
const inputs = [
  { feature1: 100, feature2: 50 },
  { feature1: 200, feature2: 75 },
  { feature1: 150, feature2: 60 }
];

const results = await mlPlugin.predictBatch('modelName', inputs);

results.forEach((result, i) => {
  console.log(`Input ${i + 1}: ${result.prediction.toFixed(2)}`);
});
// Input 1: 156.78
// Input 2: 298.45
// Input 3: 187.23
```

### Confidence Score

The `confidence` value (0-1) indicates prediction reliability:

```javascript
const { prediction, confidence } = await mlPlugin.predict('modelName', input);

if (confidence > 0.9) {
  console.log('High confidence prediction');
} else if (confidence > 0.7) {
  console.log('Moderate confidence prediction');
} else {
  console.log('Low confidence - use with caution');
}
```

**Confidence Interpretation:**
- **0.9-1.0**: Very reliable
- **0.7-0.9**: Reliable
- **0.5-0.7**: Uncertain
- **<0.5**: Unreliable

### Error Handling

```javascript
try {
  const result = await mlPlugin.predict('modelName', input);
} catch (error) {
  if (error.name === 'ModelNotTrainedError') {
    console.log('Model needs training first');
    await mlPlugin.train('modelName');
  } else if (error.name === 'DataValidationError') {
    console.log('Invalid input data:', error.context);
  } else {
    console.log('Prediction failed:', error.message);
  }
}
```

---

## Evaluation

### Model Statistics

```javascript
const stats = mlPlugin.getModelStats('modelName');

console.log(stats);
// {
//   trainedAt: '2024-01-15T10:30:00.000Z',
//   samples: 1000,
//   loss: 0.0234,
//   accuracy: 0.95,           // Classification only
//   predictions: 15234,
//   errors: 3,
//   isTrained: true,
//   config: { /* model config */ }
// }
```

### Plugin Statistics

```javascript
const stats = mlPlugin.getStats();

console.log(stats);
// {
//   models: 3,
//   trainedModels: 2,
//   totalTrainings: 15,
//   totalPredictions: 45678,
//   totalErrors: 5,
//   startedAt: '2024-01-15T09:00:00.000Z'
// }
```

### Model-Specific Metrics

#### R² Score (Regression)

```javascript
const model = mlPlugin.models.regressionModel;
const r2 = await model.calculateR2Score(testData);

console.log(`R² = ${r2.toFixed(4)}`);
// R² = 0.9234
```

#### Confusion Matrix (Classification)

```javascript
const model = mlPlugin.models.classificationModel;
const cm = await model.calculateConfusionMatrix(testData);

console.log(cm);
// {
//   matrix: { ... },
//   accuracy: 0.95,
//   total: 100,
//   correct: 95
// }
```

#### MAPE (Time Series)

```javascript
const model = mlPlugin.models.timeSeriesModel;
const mape = await model.calculateMAPE(testData);

console.log(`MAPE = ${mape.toFixed(2)}%`);
// MAPE = 8.34%
```

---

## Persistence

### Automatic Model Persistence (NEW in v13.0.0)

Models are **automatically saved** to S3 after training when `saveModel: true`:

```javascript
const mlPlugin = new MLPlugin({
  saveModel: true,  // Default: true
  models: {
    pricePredictor: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'margin'],
      target: 'price'
    }
  }
});

await mlPlugin.train('pricePredictor');
// ✅ Model automatically saved to S3 via PluginStorage
```

**Storage Location:**
```
s3://bucket/databases/myapp/.plugin-ml/model_pricePredictor
```

**Disable saving:**
```javascript
// Globally
new MLPlugin({ saveModel: false })

// Per-model override
{
  pricePredictor: {
    saveModel: false  // This model won't be saved
  }
}
```

### Training Data Persistence (NEW in v13.0.0)

Save intermediate training data (prepared dataset) to S3 for debugging/auditing:

```javascript
const mlPlugin = new MLPlugin({
  saveTrainingData: true,  // Default: false
  models: {
    pricePredictor: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'margin'],
      target: 'price',
      saveTrainingData: true  // Override global setting
    }
  }
});

await mlPlugin.train('pricePredictor');
// ✅ Model saved to S3
// ✅ Training data saved to S3
```

**Storage Location:**
```
s3://bucket/databases/myapp/.plugin-ml/training_data_pricePredictor
```

**What's saved:**
- Number of samples
- Feature names
- Target name
- Raw training data (features + target per sample)
- Timestamp

**Load saved training data:**
```javascript
const trainingData = await mlPlugin.getTrainingData('pricePredictor');

console.log(trainingData);
// {
//   modelName: 'pricePredictor',
//   samples: 1000,
//   features: ['cost', 'margin'],
//   target: 'price',
//   data: [
//     { features: { cost: 100, margin: 0.3 }, target: 150 },
//     { features: { cost: 200, margin: 0.4 }, target: 320 },
//     ...
//   ],
//   savedAt: '2025-01-15T10:30:00.000Z'
// }
```

**Use Cases:**
- 🐛 Debug training data issues
- 📊 Audit what data was used for training
- 🔄 Reproduce training results
- 📈 Analyze data distributions

### Automatic Loading

Models are **automatically loaded** on startup:

```javascript
await db.start();
// All trained models loaded from S3
```

### Manual Export

```javascript
const modelData = await mlPlugin.exportModel('modelName');

// Save to file
fs.writeFileSync('model.json', JSON.stringify(modelData));
```

**Exported Data:**
```json
{
  "type": "regression",
  "config": { ... },
  "normalizer": { ... },
  "stats": { ... },
  "isTrained": true,
  "model": { ... }
}
```

### Manual Import

```javascript
const modelData = JSON.parse(fs.readFileSync('model.json'));

await mlPlugin.importModel('modelName', modelData);
```

### Model Portability

Models can be:
- ✅ Exported to JSON
- ✅ Transferred between databases
- ✅ Backed up externally
- ✅ Version controlled
- ✅ Shared between environments

### Partition Filtering (NEW in v13.0.0)

Train models on specific subsets of your data using partitions:

```javascript
// Create resource with partitions
const products = await db.createResource({
  name: 'products',
  attributes: {
    category: 'string|required',
    cost: 'number|required',
    margin: 'number|required',
    price: 'number|required'
  },
  partitions: {
    byCategory: {
      fields: { category: 'string' }
    }
  }
});

// Train separate models for each category
const mlPlugin = new MLPlugin({
  models: {
    electronicsPricing: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'margin'],
      target: 'price',
      partition: {
        name: 'byCategory',
        values: { category: 'electronics' }
      }
    },
    furniturePricing: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'margin'],
      target: 'price',
      partition: {
        name: 'byCategory',
        values: { category: 'furniture' }
      }
    }
  }
});

// Each model trains on its partition only
await mlPlugin.train('electronicsPricing');  // Only electronics data
await mlPlugin.train('furniturePricing');    // Only furniture data
```

**Benefits:**
- 🎯 Train specialized models for different data segments
- 🚀 Faster training with smaller datasets
- 📊 Better accuracy for domain-specific patterns
- 🔄 Independent model updates per category

**Performance:**
- Uses `listPartition()` for O(1) lookups vs O(n) scans
- No need to filter data manually
- Automatic partition-based data fetching

---

## API Reference

### MLPlugin Class

#### Constructor

```javascript
new MLPlugin(options)
```

**Options:**
```javascript
{
  models: {
    modelName: { /* model config */ }
  },
  verbose: false,
  minTrainingSamples: 10,
  saveModel: true,           // NEW in v13.0.0: Save trained models to S3
  saveTrainingData: false    // NEW in v13.0.0: Save training data to S3
}
```

#### Methods

##### `train(modelName, options?)`

Train a specific model.

```javascript
await mlPlugin.train('modelName');
```

**Returns:**
```javascript
{
  loss: number,
  accuracy?: number,
  epochs: number,
  samples: number
}
```

##### `predict(modelName, input)`

Make a single prediction.

```javascript
const result = await mlPlugin.predict('modelName', { x: 1, y: 2 });
```

**Returns:**
```javascript
{
  prediction: any,
  confidence: number,
  probabilities?: object  // Classification only
}
```

##### `predictBatch(modelName, inputs)`

Make multiple predictions.

```javascript
const results = await mlPlugin.predictBatch('modelName', [input1, input2]);
```

**Returns:** `Array<PredictionResult>`

##### `retrain(modelName, options?)`

Retrain model from scratch.

```javascript
await mlPlugin.retrain('modelName', { resetWeights: true });
```

##### `getModelStats(modelName)`

Get model statistics.

```javascript
const stats = mlPlugin.getModelStats('modelName');
```

##### `getStats()`

Get plugin statistics.

```javascript
const stats = mlPlugin.getStats();
```

##### `exportModel(modelName)`

Export model to JSON.

```javascript
const data = await mlPlugin.exportModel('modelName');
```

##### `importModel(modelName, data)`

Import model from JSON.

```javascript
await mlPlugin.importModel('modelName', data);
```

##### `getTrainingData(modelName)` (NEW in v13.0.0)

Load saved training data from S3.

```javascript
const trainingData = await mlPlugin.getTrainingData('modelName');
```

**Returns:**
```javascript
{
  modelName: string,
  samples: number,
  features: string[],
  target: string,
  data: Array<{
    features: object,
    target: any
  }>,
  savedAt: string
} | null  // null if no training data was saved
```

### Model Classes

All models inherit from `BaseModel` and provide:

#### Common Methods

- `train(data)` - Train the model
- `predict(input)` - Make prediction
- `predictBatch(inputs)` - Batch prediction
- `export()` - Export to JSON
- `import(data)` - Import from JSON
- `dispose()` - Free memory
- `getStats()` - Get statistics

#### Model-Specific Methods

**RegressionModel:**
- `calculateR2Score(testData)` - Calculate R² score

**ClassificationModel:**
- `calculateConfusionMatrix(testData)` - Calculate confusion matrix

**TimeSeriesModel:**
- `predictMultiStep(sequence, steps)` - Multi-step forecast
- `calculateMAPE(testData)` - Calculate MAPE

**NeuralNetworkModel:**
- `trainWithEarlyStopping(data, config)` - Train with early stopping
- `getArchitecture()` - Get architecture details
- `addLayer(config)` - Add layer before building
- `setOutput(config)` - Configure output layer

### Error Classes

- `MLError` - Base error
- `ModelConfigError` - Invalid configuration
- `TrainingError` - Training failed
- `PredictionError` - Prediction failed
- `ModelNotFoundError` - Model doesn't exist
- `ModelNotTrainedError` - Model not trained yet
- `DataValidationError` - Invalid input data
- `InsufficientDataError` - Not enough training data
- `TensorFlowDependencyError` - TensorFlow.js not installed

---

## Examples

### Example 1: Product Price Prediction

**File:** [docs/examples/e66-ml-plugin-regression.js](../examples/e66-ml-plugin-regression.js)

Predicts product prices based on cost, margin, and demand using linear regression.

**Run:**
```bash
node docs/examples/e66-ml-plugin-regression.js
```

**Output:**
```
Training completed:
   Loss: 0.0123
   Epochs: 30
   Samples: 200

Budget Product:
   Cost: $60.00
   Margin: 25%
   Demand: 500 units
   Expected: $80.00
   Predicted: $79.45
   Error: $0.55 (0.69%)
   Confidence: 94.2%
```

### Example 2: Spam Email Detection

**File:** [docs/examples/e67-ml-plugin-classification.js](../examples/e67-ml-plugin-classification.js)

Classifies emails as spam or legitimate based on message characteristics.

**Run:**
```bash
node docs/examples/e67-ml-plugin-classification.js
```

**Output:**
```
Training completed:
   Loss: 0.1234
   Accuracy: 94.50%
   Epochs: 40
   Samples: 300

Obvious Spam:
   Words: 120, Links: 8, Caps: 50%, Exclamations: 7
   Expected: spam
   Predicted: spam ✓
   Confidence: 96.8%
   Probabilities:
      Spam: 96.8%
      Ham: 3.2%
```

### Example 3: Sales Forecasting

**File:** [docs/examples/e68-ml-plugin-timeseries.js](../examples/e68-ml-plugin-timeseries.js)

Predicts future sales using LSTM based on historical data and additional features.

**Run:**
```bash
node docs/examples/e68-ml-plugin-timeseries.js
```

**Output:**
```
Training completed:
   Loss: 0.0456
   Epochs: 50
   Samples: 100

Predicted revenue for next 7 days:
   Day 1 (2024-04-08): $1234.56
   Day 2 (2024-04-09): $1298.32
   Day 3 (2024-04-10): $1156.78
   ...

MAPE: 8.34%
Interpretation: Excellent forecast accuracy
```

### Example 4: Partition Filtering & Model Persistence (NEW in v13.0.0)

**File:** [docs/examples/e71-ml-plugin-partitions.js](../examples/e71-ml-plugin-partitions.js)

Demonstrates training category-specific models using partition filtering, automatic model persistence to S3, and saving training data for debugging.

**Run:**
```bash
node docs/examples/e71-ml-plugin-partitions.js
```

**Output:**
```
[1/4] Training Electronics Model (partition: electronics)...
✅ Electronics Model trained:
   - R² Score: 0.9523
   - Samples: 10
   - Model saved to S3: Yes
   - Training data saved to S3: Yes

[2/4] Training Furniture Model (partition: furniture)...
✅ Furniture Model trained:
   - R² Score: 0.9401
   - Samples: 10

📊 Electronics Training Data (from S3):
   - Samples: 10
   - Features: cost, margin, demand
   - Target: price
   - Saved At: 2025-01-15T10:30:00.000Z
   - First 3 samples:
     [1] Features: {"cost":500,"margin":0.3,"demand":100}, Target: 750
     [2] Features: {"cost":300,"margin":0.4,"demand":150}, Target: 500
     [3] Features: {"cost":250,"margin":0.35,"demand":120}, Target: 400

📝 Key Takeaways:
   1. Use partition filtering to train models on specific data subsets
   2. Models are automatically saved to S3 with saveModel: true
   3. Training data can be saved for debugging/auditing with saveTrainingData: true
   4. Each model can override global saveModel/saveTrainingData settings
   5. Use getTrainingData() to load previously saved training datasets
```

### Example 5: Data Transformations with filter() and map() (NEW in v13.0.0)

**File:** [docs/examples/e74-ml-plugin-data-transforms.js](../examples/e74-ml-plugin-data-transforms.js)

Demonstrates using custom `filter()` and `map()` functions to preprocess training data:
- Remove outliers and invalid records with `filter()`
- Transform features with `map()` for better predictions
- Compare model quality with and without transformations

**Run:**
```bash
node docs/examples/e74-ml-plugin-data-transforms.js
```

**Output:**
```
[1/3] Training basic model (no transformations)...
✅ Basic model trained:
   - Samples: 15
   - Loss: 0.3245
   - R² Score: 0.7823

[2/3] Training filtered model (outliers removed)...
✅ Filtered model trained:
   - Samples: 10 (5 outliers removed)
   - Loss: 0.1234
   - R² Score: 0.9245

[3/3] Training transformed model (feature engineering)...
✅ Transformed model trained:
   - Samples: 10
   - Loss: 0.0567
   - R² Score: 0.9678

📊 Model Comparison Summary:
   Model              | Samples | Loss     | R² Score | Predicted Price
   -------------------|---------|----------|----------|--------------------
   Basic              | 15      | 0.3245   | 0.7823   |     $452,345.67
   Filtered           | 10      | 0.1234   | 0.9245   |     $468,234.12
   Transformed        | 10      | 0.0567   | 0.9678   |     $471,892.45

📝 Key Takeaways:
   1. filter() removes invalid/outlier records before training
   2. map() transforms features for better predictions
   3. Filtering improves model quality by removing bad data
   4. Feature engineering can significantly boost accuracy
   5. Combine filter + map for fine-grained data preprocessing
   6. Data quality matters more than data quantity

🔄 Processing Pipeline:
   1. Fetch data (all or partition)
   2. Apply filter() → Remove invalid/outliers
   3. Apply map() → Transform features
   4. Validate minimum samples
   5. Train model

💡 Best Practices:
   - Use filter() to remove outliers and invalid data
   - Use map() for feature engineering (normalization, scaling, etc.)
   - Apply same transformations to prediction inputs
   - Document transformation logic for reproducibility
   - Test with/without transformations to measure impact
```

---

## Performance

### Training Performance

Training time depends on:

| Factor | Impact |
|--------|--------|
| Dataset size | Linear (2x data ≈ 2x time) |
| Epochs | Linear (2x epochs = 2x time) |
| Model complexity | Significant (more layers = slower) |
| Batch size | Inverse (larger batch = fewer updates = faster) |

**Typical Training Times:**

| Samples | Model Type | Epochs | Time |
|---------|------------|--------|------|
| 100 | Linear Regression | 30 | ~5 sec |
| 1,000 | Classification | 40 | ~30 sec |
| 10,000 | Neural Network | 50 | ~5 min |
| 1,000 | LSTM (lookback=7) | 50 | ~3 min |

### Prediction Performance

Predictions are very fast:

```javascript
// Single prediction: ~1-10ms
await mlPlugin.predict('model', input);

// Batch prediction (100 inputs): ~50-200ms
await mlPlugin.predictBatch('model', inputs);
```

### Optimization Tips

#### 1. Batch Size

Larger batches = faster training (but more memory):

```javascript
modelConfig: {
  batchSize: 64  // Try 16, 32, 64, 128
}
```

#### 2. Reduce Epochs

Stop earlier if validation loss plateaus:

```javascript
modelConfig: {
  epochs: 30,  // Instead of 50
  validationSplit: 0.2
}
```

Monitor validation loss. If it stops improving, reduce epochs.

#### 3. Use patch() for Plugin Storage

The plugin uses `patch()` internally for 40-60% faster model saves:

```javascript
// Already optimized - no action needed
```

#### 4. Polynomial Degree

Lower polynomial = faster training:

```javascript
modelConfig: {
  polynomial: 1  // Linear (fastest)
  // polynomial: 2  // Quadratic (slower)
}
```

#### 5. Model Size

Fewer neurons = faster:

```javascript
modelConfig: {
  units: 32,  // Instead of 128
  layers: [
    { units: 64 },   // Instead of 128
    { units: 32 }    // Instead of 64
  ]
}
```

### Memory Usage

TensorFlow.js uses GPU acceleration when available:

```javascript
// Check TensorFlow backend
const tf = require('@tensorflow/tfjs-node');
console.log('Backend:', tf.getBackend());
// Backend: tensorflow (CPU/GPU)
```

**Memory Tips:**
- Training uses ~100-500MB RAM
- Models use ~1-50MB RAM (when loaded)
- Call `model.dispose()` to free memory
- Use batch prediction for efficiency

---

## Troubleshooting

### TensorFlow.js Not Installed

**Error:**
```
TensorFlowDependencyError: TensorFlow.js is not installed
```

**Solution:**
```bash
pnpm add @tensorflow/tfjs-node
```

### Insufficient Training Data

**Error:**
```
InsufficientDataError: Insufficient training data: 5 samples (minimum: 10)
```

**Solution:**
- Insert more data into your resource
- Lower `minTrainingSamples` in plugin config
- Use smaller `batchSize` in model config

### Model Not Trained

**Error:**
```
ModelNotTrainedError: Model "myModel" is not trained yet
```

**Solution:**
```javascript
await mlPlugin.train('myModel');
```

### Missing Features

**Error:**
```
DataValidationError: Missing features: feature2, feature3
```

**Solution:**
Ensure input has all required features:

```javascript
// Bad
await mlPlugin.predict('model', { feature1: 100 });

// Good
await mlPlugin.predict('model', {
  feature1: 100,
  feature2: 50,
  feature3: 25
});
```

### Training Loss Not Decreasing

**Symptoms:**
- Loss stays high
- Accuracy doesn't improve
- Model performs poorly

**Solutions:**

1. **Lower learning rate:**
```javascript
modelConfig: {
  learningRate: 0.001  // Instead of 0.01
}
```

2. **More epochs:**
```javascript
modelConfig: {
  epochs: 100  // Instead of 50
}
```

3. **Normalize data manually:**
```javascript
// Check if data is in similar ranges
// Features should be roughly same scale
```

4. **Check data quality:**
```javascript
// Ensure target correlates with features
// Remove outliers
// Check for missing values
```

### Overfitting

**Symptoms:**
- Training accuracy high, but predictions poor
- Works on training data, fails on new data

**Solutions:**

1. **Add dropout:**
```javascript
modelConfig: {
  dropout: 0.3  // Increase from 0.2
}
```

2. **Reduce model complexity:**
```javascript
modelConfig: {
  units: 32,  // Reduce from 64
  layers: [
    { units: 32 }  // Fewer layers
  ]
}
```

3. **More training data:**
```javascript
// Insert more diverse examples
```

4. **Early stopping:**
```javascript
await model.trainWithEarlyStopping(data, {
  patience: 10
});
```

### Underfitting

**Symptoms:**
- Poor performance on both training and new data
- Loss remains high

**Solutions:**

1. **Increase model complexity:**
```javascript
modelConfig: {
  units: 128,  // Increase from 64
  layers: [
    { units: 128 },
    { units: 64 },
    { units: 32 }  // More layers
  ]
}
```

2. **Train longer:**
```javascript
modelConfig: {
  epochs: 100  // Increase from 50
}
```

3. **Add more features:**
```javascript
{
  features: ['x1', 'x2', 'x3', 'x4']  // More input features
}
```

### Time Series Not Working

**Common Issues:**

1. **Data not sequential:**
```javascript
// Sort by timestamp before training
const data = await resource.list();
data.sort((a, b) => a.timestamp - b.timestamp);
```

2. **Lookback too large:**
```javascript
// Reduce lookback if you have limited data
modelConfig: {
  lookback: 5  // Instead of 10
}
```

3. **Not enough data:**
```javascript
// Need at least lookback + 1 samples
// For lookback=7, need minimum 8 samples
```

---

## FAQ

### General

**Q: Do I need a GPU?**
A: No. TensorFlow.js works on CPU. GPU speeds up training but isn't required.

**Q: Can I use this in production?**
A: Yes! MLPlugin uses TensorFlow.js which is production-ready and used by Google.

**Q: How accurate are the models?**
A: Depends on your data quality and model choice. Follow best practices for good results.

**Q: Can I train on one server and predict on another?**
A: Yes! Export/import models or use S3 persistence to sync between environments.

### Training

**Q: How much data do I need?**
A: Minimum 10 samples, but more is better:
- **100-1,000**: Basic models
- **1,000-10,000**: Good models
- **10,000+**: Excellent models

**Q: How long does training take?**
A: Ranges from seconds (simple models) to minutes (complex models). See [Performance](#performance).

**Q: Should I use auto-training?**
A: Yes for production. Use manual training for development/testing.

**Q: Can I stop training early?**
A: Yes, use `trainWithEarlyStopping()` for neural networks.

### Model Selection

**Q: Which model type should I use?**
A: Follow this guide:
- Predict numbers → **Regression**
- Predict categories → **Classification**
- Predict future from sequence → **Time Series**
- Complex custom problem → **Neural Network**

**Q: Can I use multiple features?**
A: Yes! All models support multiple features.

**Q: Can I have multiple targets?**
A: Currently one target per model. Train multiple models for multiple targets.

### Persistence

**Q: Where are models saved?**
A: In S3 via PluginStorage at `.plugin-ml/model_{modelName}`.

**Q: Are models automatically loaded?**
A: Yes, on `db.start()`.

**Q: Can I backup models?**
A: Yes, use `exportModel()` to save to JSON file.

**Q: Do models work across s3db.js versions?**
A: Yes, as long as TensorFlow.js version is compatible.

### Performance

**Q: How can I speed up training?**
A: Increase batch size, reduce epochs, use simpler models. See [Optimization Tips](#optimization-tips).

**Q: How fast are predictions?**
A: Very fast: 1-10ms per prediction.

**Q: Can I train multiple models simultaneously?**
A: Yes, each model trains independently.

### Integration

**Q: Can I use this with the API Plugin?**
A: Yes! Create custom routes that call `mlPlugin.predict()`.

**Q: Can I use this with other plugins?**
A: Yes! MLPlugin works with all s3db.js plugins.

**Q: Can I access TensorFlow.js directly?**
A: Yes:
```javascript
const model = mlPlugin.models.myModel;
const tf = model.tf; // TensorFlow.js instance
```

### Errors

**Q: "TensorFlow.js is not installed" - what do I do?**
A: Run `pnpm add @tensorflow/tfjs-node`

**Q: "Model not trained" - what happened?**
A: Call `await mlPlugin.train('modelName')` first.

**Q: Training fails with "out of memory" - help?**
A: Reduce batch size or model complexity.

---

## See Also

- [MLPlugin Examples](../examples/)
- [TensorFlow.js Documentation](https://www.tensorflow.org/js)
- [s3db.js Documentation](../../README.md)
- [Plugin Development Guide](../../PLUGINS.md)

---

## Support

- **Issues**: [GitHub Issues](https://github.com/forattini-dev/s3db.js/issues)
- **Discussions**: [GitHub Discussions](https://github.com/forattini-dev/s3db.js/discussions)
- **Email**: support@s3db.js

---

## License

UNLICENSED - © 2024 @stone/martech

---

**Made with ❤️ by the s3db.js team**

# ⚙️ ML Plugin Configuration Guide

**Prev:** [← Getting Started](./getting-started.md)
**Next:** [Usage Patterns →](./usage-patterns.md)
**Main:** [← ML Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-guides)

> **In this guide:**
> - Default configuration object
> - Zero-config vs Classic API differences
> - All 4 model types with detailed options
> - Training configuration (auto-train, schedules)
> - Data transformations (filter, map)
> - Evaluation metrics
> - Performance tuning
> - Environment-specific configuration

**Time to read:** 20 minutes
**Difficulty:** Intermediate

---

## Default Configuration

### Zero-Config (Recommended)

```javascript
// ZERO CONFIGURATION! 🎯
const mlPlugin = new MLPlugin();
await db.usePlugin(mlPlugin);

// That's it! Auto-detects everything
await resource.ml.learn('targetField');
```

### Classic Configuration

```javascript
new MLPlugin({
  // Models to train
  models: {
    modelName: {
      // Required
      type: 'regression',              // 'regression', 'classification', 'time-series', 'neural-network'
      resource: 'resourceName',        // S3DB resource name
      target: 'fieldName',             // Field to predict

      // Optional - defaults: all numeric fields except target
      features: ['field1', 'field2'],

      // Training options
      autoTrain: false,                // Auto-train on schedule
      trainInterval: 3600000,          // Every 1 hour (ms)
      trainOnInsert: false,            // Retrain after N new inserts
      trainOnInsertCount: 100,         // After 100 new records

      // Model-specific options
      modelConfig: {
        learningRate: 0.01,
        epochs: 100,
        batchSize: 32,
        layers: [64, 32],              // Neural network architecture
        activation: 'relu'
      },

      // Data preprocessing
      preprocessing: {
        filter: (record) => record.price > 0,  // Only positive prices
        map: (record) => ({
          ...record,
          cost: record.cost * 1.1      // 10% markup
        })
      },

      // Evaluation
      evaluationMetrics: ['r2', 'mape', 'mae'],

      // Persistence
      persistModel: true,              // Save to S3
      modelPath: 's3://bucket/models/pricePredictor'
    }
  },

  // Global options
  storage: {
    savePath: 'models/',              // Where to store models
    saveTrainingData: false,           // Keep intermediate training data
    versioning: true                   // Version saved models
  },

  // Performance
  logLevel: 'silent',
  logLevel: 'info'
})
```

---

## Configuration Patterns

### Pattern 1: Zero-Config (Development)

**Best for:** Quick prototyping, learning, demos

```javascript
const mlPlugin = new MLPlugin();
await db.usePlugin(mlPlugin);

// Auto-detects everything!
await products.ml.learn('price');

const { prediction } = await products.ml.predict(
  { cost: 150, demand: 400 },
  'price'
);
```

**Advantages:**
- ✅ Minimal code
- ✅ Works out of the box
- ✅ Sensible defaults
- ✅ Perfect for prototypes

**Limitations:**
- Single model per resource
- No custom hyperparameters
- No auto-training schedules

---

### Pattern 2: Single Model (Classic)

**Best for:** Production single-prediction models

```javascript
const mlPlugin = new MLPlugin({
  models: {
    pricePredictor: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'demand'],
      target: 'price',
      autoTrain: true,
      trainInterval: 3600000,          // Every 1 hour

      modelConfig: {
        learningRate: 0.01,
        epochs: 100,
        batchSize: 32
      },

      evaluationMetrics: ['r2', 'mape']
    }
  }
});

await db.usePlugin(mlPlugin);
```

---

### Pattern 3: Multi-Model (Advanced)

**Best for:** Multiple predictions on same data

```javascript
const mlPlugin = new MLPlugin({
  models: {
    pricePredictor: {
      type: 'regression',
      resource: 'products',
      target: 'price',
      features: ['cost', 'demand']
    },

    profitMarginPredictor: {
      type: 'regression',
      resource: 'products',
      target: 'margin',
      features: ['cost', 'price']
    },

    categoryPredictor: {
      type: 'classification',
      resource: 'products',
      target: 'category',
      features: ['cost', 'demand', 'price']
    }
  }
});

await db.usePlugin(mlPlugin);

// Train all models
await mlPlugin.train('pricePredictor');
await mlPlugin.train('profitMarginPredictor');
await mlPlugin.train('categoryPredictor');

// Make predictions
const price = await mlPlugin.predict('pricePredictor', { cost: 150, demand: 400 });
const margin = await mlPlugin.predict('profitMarginPredictor', { cost: 150, price: 215 });
const category = await mlPlugin.predict('categoryPredictor', { cost: 150, demand: 400, price: 215 });
```

---

### Pattern 4: Data Transformation (Feature Engineering)

**Best for:** Complex preprocessing

```javascript
const mlPlugin = new MLPlugin({
  models: {
    pricePredictor: {
      type: 'regression',
      resource: 'products',
      target: 'price',

      preprocessing: {
        // Filter out invalid data
        filter: (record) => {
          return record.cost > 0 &&
                 record.demand > 0 &&
                 record.price > 0 &&
                 !isNaN(record.cost);
        },

        // Create new features
        map: (record) => ({
          ...record,
          // Derived features
          costPerDemand: record.cost / (record.demand || 1),
          demandCategory: record.demand > 400 ? 'high' : 'low',
          costBracket: Math.floor(record.cost / 50) * 50
        })
      },

      features: [
        'cost',
        'demand',
        'costPerDemand',      // Derived feature
        'demandCategory',     // Derived feature
        'costBracket'         // Derived feature
      ]
    }
  }
});
```

---

### Pattern 5: Auto-Training (Production)

**Best for:** Models that need regular updates

```javascript
const mlPlugin = new MLPlugin({
  models: {
    pricePredictor: {
      type: 'regression',
      resource: 'products',
      target: 'price',

      // Option 1: Train on interval
      autoTrain: true,
      trainInterval: 3600000,          // Every 1 hour

      // Option 2: Train after N new inserts
      trainOnInsert: true,
      trainOnInsertCount: 100,         // After 100 new records

      evaluationMetrics: ['r2', 'mape']
    }
  },

  storage: {
    savePath: 'ml-models/',
    saveTrainingData: true,            // Keep training data for audits
    versioning: true                   // Version each trained model
  }
});

await db.usePlugin(mlPlugin);

// Models retrain automatically every 1 hour
// OR after 100 new products are inserted
```

---

## Model Types Configuration

### Type 1: Regression (Predict Numbers)

**Use for:** Price, revenue, temperature, stock price

```javascript
{
  type: 'regression',
  resource: 'products',
  target: 'price',
  features: ['cost', 'demand'],

  modelConfig: {
    learningRate: 0.01,
    epochs: 100,
    batchSize: 32,
    layers: [64, 32, 16],              // Dense layers
    activation: 'relu',
    outputActivation: 'linear'         // Linear for regression
  },

  evaluationMetrics: [
    'r2',      // R-squared (0-1, higher is better)
    'mape',    // Mean Absolute Percentage Error
    'mae',     // Mean Absolute Error
    'rmse'     // Root Mean Squared Error
  ]
}
```

**Hyperparameters:**
| Parameter | Default | Range | Tips |
|-----------|---------|-------|------|
| learningRate | 0.01 | 0.001-0.1 | Lower = slower but more stable |
| epochs | 100 | 50-500 | More epochs = better fit but slower |
| batchSize | 32 | 8-128 | Smaller = more updates, noisier |
| layers | [64, 32] | [16-512] | More layers = complex patterns |

---

### Type 2: Classification (Predict Categories)

**Use for:** Spam/not spam, product category, sentiment

```javascript
{
  type: 'classification',
  resource: 'emails',
  target: 'is_spam',                   // 'spam' or 'legitimate'
  features: ['subject_length', 'sender_domain', 'body_length'],

  modelConfig: {
    learningRate: 0.01,
    epochs: 100,
    batchSize: 32,
    layers: [64, 32],
    activation: 'relu',
    outputActivation: 'sigmoid'        // Sigmoid for binary classification
  },

  evaluationMetrics: [
    'accuracy',
    'precision',
    'recall',
    'f1'
  ]
}
```

**Hyperparameters:**
Same as regression, but `outputActivation: 'sigmoid'` for binary, `'softmax'` for multi-class

---

### Type 3: Time Series (Predict Sequences)

**Use for:** Stock prices, weather, trends over time

```javascript
{
  type: 'time-series',
  resource: 'stocks',
  target: 'close',
  features: ['open', 'high', 'low', 'volume'],

  modelConfig: {
    learningRate: 0.01,
    epochs: 100,
    batchSize: 32,
    sequenceLength: 20,                // Look back 20 days
    lstmUnits: 64,                     // LSTM layer size
    denseUnits: 32,
    activation: 'relu'
  },

  evaluationMetrics: [
    'mape',
    'mae',
    'rmse'
  ]
}
```

**Key Parameters:**
- `sequenceLength` - How many past days to consider (10-50 typical)
- `lstmUnits` - Size of LSTM layer (32-256 typical)
- `denseUnits` - Dense layer after LSTM (16-128 typical)

---

### Type 4: Neural Network (Custom Architecture)

**Use for:** Complex patterns, image recognition, custom networks

```javascript
{
  type: 'neural-network',
  resource: 'customData',
  target: 'prediction',
  features: ['feature1', 'feature2', 'feature3'],

  modelConfig: {
    learningRate: 0.001,
    epochs: 200,
    batchSize: 16,

    // Custom architecture
    layers: [
      { type: 'dense', units: 128, activation: 'relu' },
      { type: 'dropout', rate: 0.2 },
      { type: 'dense', units: 64, activation: 'relu' },
      { type: 'dropout', rate: 0.2 },
      { type: 'dense', units: 32, activation: 'relu' },
      { type: 'dense', units: 1, activation: 'linear' }
    ]
  }
}
```

---

## Data Transformations

### Filter Outliers

```javascript
preprocessing: {
  filter: (record) => {
    // Remove outliers
    return record.price > 0 &&
           record.price < 10000 &&
           record.demand > 0 &&
           record.demand < 100000;
  }
}
```

### Feature Engineering

```javascript
preprocessing: {
  map: (record) => ({
    ...record,

    // Normalize values
    normalizedPrice: record.price / 1000,
    normalizedDemand: record.demand / 100000,

    // Create ratios
    pricePerDemand: record.price / record.demand,

    // Categorical encoding
    priceCategory: record.price > 500 ? 'premium' : 'standard',
    demandLevel: record.demand > 50000 ? 'high' : 'low',

    // Logarithmic scaling
    logPrice: Math.log(record.price),
    logDemand: Math.log(record.demand)
  })
}
```

### Combine Filter & Map

```javascript
preprocessing: {
  filter: (record) => record.price > 0 && record.demand > 0,

  map: (record) => ({
    ...record,
    // Apply transformations after filtering
    pricePerUnit: record.price / record.demand,
    margin: (record.price - record.cost) / record.price
  })
}
```

---

## Training Configuration

### Manual Training

```javascript
// Train once
await mlPlugin.train('pricePredictor');
```

### Auto-Training on Interval

```javascript
{
  autoTrain: true,
  trainInterval: 3600000,  // Every 1 hour

  evaluationMetrics: ['r2', 'mape']
}
```

### Auto-Training on Data Changes

```javascript
{
  trainOnInsert: true,
  trainOnInsertCount: 100,  // After 100 new records inserted

  evaluationMetrics: ['r2', 'mape']
}
```

### Periodic + Data-Triggered

```javascript
{
  autoTrain: true,
  trainInterval: 3600000,        // Every 1 hour

  trainOnInsert: true,
  trainOnInsertCount: 50,        // OR after 50 new records

  evaluationMetrics: ['r2', 'mape']
}
```

---

## Evaluation Metrics

### Regression Metrics

| Metric | Range | Interpretation |
|--------|-------|-----------------|
| **R²** | 0-1 | How well model explains variance (higher = better) |
| **MAPE** | % | Percentage error (lower = better) |
| **MAE** | Same units as target | Average absolute error (lower = better) |
| **RMSE** | Same units as target | Root mean squared error (lower = better) |

```javascript
evaluationMetrics: ['r2', 'mape', 'mae', 'rmse']
```

### Classification Metrics

| Metric | Range | Interpretation |
|--------|-------|-----------------|
| **Accuracy** | 0-1 | % correct predictions |
| **Precision** | 0-1 | Of predicted positives, how many correct |
| **Recall** | 0-1 | Of actual positives, how many found |
| **F1** | 0-1 | Harmonic mean of precision/recall |

```javascript
evaluationMetrics: ['accuracy', 'precision', 'recall', 'f1']
```

---

## Performance Tuning

### Increase Training Speed

```javascript
modelConfig: {
  epochs: 50,              // Fewer epochs
  batchSize: 128,          // Larger batches
  layers: [32, 16],        // Fewer/smaller layers
  learningRate: 0.1        // Higher learning rate (faster but less stable)
}
```

### Improve Model Accuracy

```javascript
modelConfig: {
  epochs: 200,             // More training
  batchSize: 16,           // Smaller batches (more updates)
  layers: [128, 64, 32],   // More/larger layers
  learningRate: 0.001      // Lower learning rate (slower but more stable)
}
```

### Reduce Memory Usage

```javascript
modelConfig: {
  batchSize: 16,           // Smaller batch size
  layers: [32, 16],        // Smaller layers
  epochs: 50               // Fewer epochs
}
```

---

## Environment-Specific Configuration

Load configuration from environment:

```javascript
const config = {
  models: {
    pricePredictor: {
      type: process.env.MODEL_TYPE || 'regression',
      resource: 'products',
      target: 'price',

      autoTrain: process.env.NODE_ENV === 'production',
      trainInterval: parseInt(process.env.TRAIN_INTERVAL || '3600000'),

      modelConfig: {
        epochs: parseInt(process.env.EPOCHS || '100'),
        batchSize: parseInt(process.env.BATCH_SIZE || '32'),
        learningRate: parseFloat(process.env.LEARNING_RATE || '0.01')
      },

      evaluationMetrics: (process.env.METRICS || 'r2,mape').split(',')
    }
  },

  logLevel: process.env.ML_VERBOSE === 'true' ? 'debug' : 'info'
};

const mlPlugin = new MLPlugin(config);
```

**Environment Variables:**
```bash
# Development
export NODE_ENV=development
export MODEL_TYPE=regression
export EPOCHS=50
export LEARNING_RATE=0.1

# Production
export NODE_ENV=production
export MODEL_TYPE=regression
export EPOCHS=200
export LEARNING_RATE=0.001
export TRAIN_INTERVAL=3600000
```

---

## Common Configuration Mistakes

### ❌ Mistake 1: Too Few Training Samples

```javascript
// ❌ WRONG - Only 5 examples
await products.insert({ cost: 100, demand: 500, price: 150 });
await products.insert({ cost: 150, demand: 400, price: 215 });
// ...only 5 total

await mlPlugin.train('pricePredictor');  // Poor model!
```

**Fix:**
```javascript
// ✅ CORRECT - At least 50-100 examples
for (let i = 0; i < 100; i++) {
  await products.insert({
    cost: Math.random() * 200 + 50,
    demand: Math.random() * 500 + 100,
    price: Math.random() * 300 + 100
  });
}

await mlPlugin.train('pricePredictor');
```

---

### ❌ Mistake 2: Using String for Numeric Prediction

```javascript
// ❌ WRONG - Target is string
{
  type: 'regression',
  target: 'price',  // But data has 'price': '150' (string!)
}
```

**Fix:**
```javascript
// ✅ CORRECT - Ensure numeric data
attributes: {
  price: 'number|required'  // Define as number
}
```

---

### ❌ Mistake 3: Too Many Features

```javascript
// ❌ WRONG - 100 features for 50 training samples
features: [
  'feature1', 'feature2', ..., 'feature100'
],

// Only 50 training samples = overfitting!
```

**Fix:**
```javascript
// ✅ CORRECT - Use feature selection
// Rule: At least 10 samples per feature
// 50 samples = max 5 features

features: [
  'cost',      // Most important
  'demand',    // Most important
  'margin'     // Most important
]
```

---

## Next Steps

1. **See usage patterns** → [Usage Patterns](./usage-patterns.md)
2. **Learn best practices** → [Best Practices](./best-practices.md)

---

**Prev:** [← Getting Started](./getting-started.md)
**Next:** [Usage Patterns →](./usage-patterns.md)
**Main:** [← ML Plugin](../README.md)

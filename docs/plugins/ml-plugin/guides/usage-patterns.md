# 🎯 ML Plugin Usage Patterns

**Prev:** [← Configuration](./configuration.md)
**Next:** [Best Practices →](./best-practices.md)
**Main:** [← ML Plugin](../README.md) | **All guides:** [Index](../README.md#-documentation-guides)

> **In this guide:**
> - 5 progressive patterns (Beginner → Advanced)
> - Complete working code for each pattern
> - API reference for all methods
> - Event handling & monitoring
> - Copy-paste recipes

**Time to read:** 25 minutes
**Difficulty:** Intermediate

---

## Pattern Overview

| Pattern | Use Case | Complexity | Code Lines |
|---------|----------|-----------|-----------|
| Basic Regression | Predict numeric values | Beginner | 30 |
| Classification | Predict categories | Intermediate | 40 |
| Time Series | Predict sequences/trends | Intermediate | 50 |
| Multi-Model | Multiple predictions | Advanced | 80 |
| Auto-Training | Scheduled model updates | Advanced | 60 |

---

## Pattern 1: Basic Regression (House Price Prediction)

**Use case:** Predict numeric values based on features

```javascript
import { Database } from 's3db.js';
import { MLPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/ml-demo'
});

// Create resource
const houses = await db.createResource({
  name: 'houses',
  attributes: {
    squareFeet: 'number|required',
    bedrooms: 'number|required',
    bathrooms: 'number|required',
    yearsOld: 'number|required',
    price: 'number|required'
  }
});

// Insert training data (historical house sales)
const trainingData = [
  { squareFeet: 2000, bedrooms: 3, bathrooms: 2, yearsOld: 10, price: 450000 },
  { squareFeet: 1500, bedrooms: 2, bathrooms: 1, yearsOld: 5, price: 350000 },
  { squareFeet: 3000, bedrooms: 4, bathrooms: 3, yearsOld: 15, price: 650000 },
  { squareFeet: 1800, bedrooms: 3, bathrooms: 2, yearsOld: 8, price: 420000 },
  { squareFeet: 2500, bedrooms: 4, bathrooms: 2, yearsOld: 20, price: 550000 },
  // ... insert 50-100 more examples for better predictions
];

for (const data of trainingData) {
  await houses.insert(data);
}

// Install ML Plugin
const mlPlugin = new MLPlugin();
await db.usePlugin(mlPlugin);

// Train model (zero-config!)
await houses.ml.learn('price');
console.log('✅ Model trained on house prices');

// Predict price for new house
const newHouse = {
  squareFeet: 2200,
  bedrooms: 3,
  bathrooms: 2,
  yearsOld: 7
};

const { prediction, confidence } = await houses.ml.predict(newHouse, 'price');

console.log(`Estimated price: $${prediction.toFixed(2)}`);
console.log(`Confidence: ${(confidence * 100).toFixed(1)}%`);
```

**Output:**
```
Estimated price: $485,000.00
Confidence: 89.5%
```

---

## Pattern 2: Classification (Email Spam Detection)

**Use case:** Classify data into categories

```javascript
import { Database } from 's3db.js';
import { MLPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/ml-spam'
});

// Create email resource
const emails = await db.createResource({
  name: 'emails',
  attributes: {
    subjectLength: 'number',
    bodyLength: 'number',
    hasLinks: 'number',                // 0 or 1
    hasAttachments: 'number',          // 0 or 1
    senderDomainAge: 'number',         // Days old
    isSpam: 'string'                   // 'spam' or 'legitimate'
  }
});

// Training data
const trainingData = [
  { subjectLength: 15, bodyLength: 200, hasLinks: 0, hasAttachments: 0, senderDomainAge: 1000, isSpam: 'legitimate' },
  { subjectLength: 50, bodyLength: 100, hasLinks: 5, hasAttachments: 0, senderDomainAge: 1, isSpam: 'spam' },
  { subjectLength: 20, bodyLength: 500, hasLinks: 2, hasAttachments: 1, senderDomainAge: 500, isSpam: 'legitimate' },
  { subjectLength: 45, bodyLength: 80, hasLinks: 10, hasAttachments: 0, senderDomainAge: 5, isSpam: 'spam' },
  // ... insert 50-100 more examples
];

for (const data of trainingData) {
  await emails.insert(data);
}

// Install ML Plugin
const mlPlugin = new MLPlugin();
await db.usePlugin(mlPlugin);

// Train classifier
await emails.ml.learn('isSpam');
console.log('✅ Spam classifier trained');

// Classify new email
const newEmail = {
  subjectLength: 40,
  bodyLength: 120,
  hasLinks: 8,
  hasAttachments: 0,
  senderDomainAge: 2
};

const { prediction, confidence } = await emails.ml.predict(newEmail, 'isSpam');

if (prediction === 'spam') {
  console.log(`⚠️  SPAM DETECTED (${(confidence * 100).toFixed(1)}% confidence)`);
} else {
  console.log(`✅ Legitimate email (${(confidence * 100).toFixed(1)}% confidence)`);
}
```

**Output:**
```
⚠️  SPAM DETECTED (94.2% confidence)
```

---

## Pattern 3: Time Series (Stock Price Prediction)

**Use case:** Predict sequences and trends

```javascript
import { Database } from 's3db.js';
import { MLPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/ml-stocks'
});

// Create stock price resource
const stocks = await db.createResource({
  name: 'stocks',
  attributes: {
    date: 'string',
    open: 'number',
    high: 'number',
    low: 'number',
    close: 'number|required',
    volume: 'number'
  }
});

// Insert historical stock prices (30+ days of data)
const stockData = [
  { date: '2024-01-01', open: 100, high: 105, low: 98, close: 102, volume: 1000000 },
  { date: '2024-01-02', open: 102, high: 107, low: 100, close: 105, volume: 1100000 },
  { date: '2024-01-03', open: 105, high: 108, low: 103, close: 106, volume: 950000 },
  { date: '2024-01-04', open: 106, high: 110, low: 105, close: 109, volume: 1200000 },
  // ... insert 30+ days of historical data
];

for (const data of stockData) {
  await stocks.insert(data);
}

// Install ML Plugin
const mlPlugin = new MLPlugin({
  models: {
    stockPredictor: {
      type: 'time-series',
      resource: 'stocks',
      target: 'close',
      features: ['open', 'high', 'low', 'volume'],
      modelConfig: {
        sequenceLength: 20,             // Look back 20 days
        lstmUnits: 64,
        epochs: 100
      }
    }
  }
});

await db.usePlugin(mlPlugin);

// Train model
await mlPlugin.train('stockPredictor');
console.log('✅ Stock price model trained');

// Predict next day's close price
const today = {
  open: 109,
  high: 112,
  low: 108,
  close: 111,
  volume: 1300000
};

const { prediction, confidence } = await mlPlugin.predict(
  'stockPredictor',
  today
);

console.log(`Predicted next close: $${prediction.toFixed(2)}`);
console.log(`Confidence: ${(confidence * 100).toFixed(1)}%`);
```

**Output:**
```
Predicted next close: $113.45
Confidence: 87.3%
```

---

## Pattern 4: Multi-Model (Multiple Predictions)

**Use case:** Make multiple predictions on same data

```javascript
import { Database } from 's3db.js';
import { MLPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/ml-products'
});

// Create products resource
const products = await db.createResource({
  name: 'products',
  attributes: {
    cost: 'number',
    demand: 'number',
    competitorPrice: 'number',
    price: 'number',
    profitMargin: 'number',
    category: 'string'
  }
});

// Insert training data
for (let i = 0; i < 100; i++) {
  const cost = Math.random() * 200 + 50;
  const demand = Math.random() * 500 + 100;
  const price = cost * (1 + Math.random() * 0.5 + 0.2);
  const margin = (price - cost) / price;

  await products.insert({
    cost,
    demand,
    competitorPrice: price * (1 + Math.random() * 0.2 - 0.1),
    price,
    profitMargin: margin > 0.4 ? 'high' : 'low',
    category: demand > 300 ? 'popular' : 'niche'
  });
}

// Install ML Plugin with multiple models
const mlPlugin = new MLPlugin({
  models: {
    // Model 1: Predict optimal price
    pricePredictor: {
      type: 'regression',
      resource: 'products',
      target: 'price',
      features: ['cost', 'demand', 'competitorPrice']
    },

    // Model 2: Predict profit margin category
    marginPredictor: {
      type: 'classification',
      resource: 'products',
      target: 'profitMargin',
      features: ['cost', 'demand']
    },

    // Model 3: Predict product category
    categoryPredictor: {
      type: 'classification',
      resource: 'products',
      target: 'category',
      features: ['demand', 'cost', 'competitorPrice']
    }
  }
});

await db.usePlugin(mlPlugin);

// Train all models
await mlPlugin.train('pricePredictor');
await mlPlugin.train('marginPredictor');
await mlPlugin.train('categoryPredictor');
console.log('✅ All models trained');

// Make multiple predictions
const newProduct = {
  cost: 150,
  demand: 400,
  competitorPrice: 210
};

const priceResult = await mlPlugin.predict('pricePredictor', newProduct);
const marginResult = await mlPlugin.predict('marginPredictor', { cost: 150, demand: 400 });
const categoryResult = await mlPlugin.predict('categoryPredictor', newProduct);

console.log(`
📊 Product Analysis:
  Recommended Price: $${priceResult.prediction.toFixed(2)}
  Expected Margin: ${marginResult.prediction} (${(marginResult.confidence * 100).toFixed(1)}% confident)
  Category: ${categoryResult.prediction} (${(categoryResult.confidence * 100).toFixed(1)}% confident)
`);
```

**Output:**
```
📊 Product Analysis:
  Recommended Price: $215.50
  Expected Margin: high (92.3% confident)
  Category: popular (88.7% confident)
```

---

## Pattern 5: Auto-Training (Scheduled Updates)

**Use case:** Models that retrain automatically

```javascript
import { Database } from 's3db.js';
import { MLPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/ml-auto'
});

// Create resource
const sales = await db.createResource({
  name: 'sales',
  attributes: {
    month: 'number',
    seasonality: 'number',
    marketingSpend: 'number',
    revenue: 'number|required'
  }
});

// Seed with initial data
for (let month = 1; month <= 50; month++) {
  await sales.insert({
    month,
    seasonality: Math.sin(month * 2 * Math.PI / 12),
    marketingSpend: Math.random() * 10000 + 5000,
    revenue: Math.random() * 50000 + 30000
  });
}

// Install ML Plugin with auto-training
const mlPlugin = new MLPlugin({
  models: {
    revenuePredictor: {
      type: 'regression',
      resource: 'sales',
      target: 'revenue',
      features: ['month', 'seasonality', 'marketingSpend'],

      // Auto-train every 1 hour
      autoTrain: true,
      trainInterval: 3600000,

      // OR auto-train after 10 new sales
      trainOnInsert: true,
      trainOnInsertCount: 10,

      evaluationMetrics: ['r2', 'mape']
    }
  },

  storage: {
    savePath: 'ml-models/',
    saveTrainingData: true,
    versioning: true
  }
});

await db.usePlugin(mlPlugin);

// Initial training
await mlPlugin.train('revenuePredictor');
console.log('✅ Revenue predictor trained');

// Simulate new sales data
console.log('📊 Monitoring for new data...');
let insertCount = 0;

setInterval(async () => {
  // Insert new sale
  await sales.insert({
    month: 51 + insertCount,
    seasonality: Math.sin((51 + insertCount) * 2 * Math.PI / 12),
    marketingSpend: Math.random() * 10000 + 5000,
    revenue: Math.random() * 50000 + 30000
  });

  insertCount++;

  // Model automatically retrains every 10 inserts
  if (insertCount % 10 === 0) {
    console.log(`✅ Auto-trained after ${insertCount} new sales`);
  }
}, 5000);

// Query model versions
setTimeout(async () => {
  const versions = await mlPlugin.getModelVersions('revenuePredictor');
  console.log(`\n📈 Model Versions: ${versions.length}`);
  versions.forEach(v => {
    console.log(`  v${v.version}: R² = ${v.metrics.r2.toFixed(3)}`);
  });
}, 60000);
```

---

## API Reference

### Methods

| Method | Use | Example |
|--------|-----|---------|
| `resource.ml.learn(target)` | Train zero-config model | `await products.ml.learn('price')` |
| `resource.ml.predict(data, target)` | Zero-config prediction | `await products.ml.predict({...}, 'price')` |
| `mlPlugin.train(modelName)` | Train classic model | `await mlPlugin.train('pricePredictor')` |
| `mlPlugin.predict(modelName, data)` | Classic prediction | `await mlPlugin.predict('pricePredictor', {...})` |
| `mlPlugin.evaluate(modelName)` | Get model metrics | `await mlPlugin.evaluate('pricePredictor')` |
| `mlPlugin.getModelVersions(modelName)` | Version history | `await mlPlugin.getModelVersions('pricePredictor')` |
| `mlPlugin.deleteModel(modelName)` | Remove model | `await mlPlugin.deleteModel('pricePredictor')` |

### Events

| Event | Triggered When |
|-------|-----------------|
| `model.training.started` | Training begins |
| `model.training.completed` | Training finishes |
| `model.training.failed` | Training error occurs |
| `model.prediction.made` | Prediction generated |

### Prediction Response

```javascript
const { prediction, confidence, metrics } = await resource.ml.predict(data, target);

// prediction: The predicted value
// confidence: 0-1 confidence score
// metrics: { r2, mape, mae, rmse } for regression
//        or { accuracy, precision, recall } for classification
```

---

## Copy-Paste Recipes

### Recipe 1: Quick Prototype

```javascript
import { Database } from 's3db.js';
import { MLPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://...' });
const resource = await db.createResource({ name: 'data', attributes: {...} });

// Insert data
for (let i = 0; i < 100; i++) {
  await resource.insert({...});
}

// Train & predict
const mlPlugin = new MLPlugin();
await db.usePlugin(mlPlugin);
await resource.ml.learn('target');

const { prediction } = await resource.ml.predict({ feature1: 10, feature2: 20 }, 'target');
console.log('Prediction:', prediction);
```

### Recipe 2: Production Setup with Monitoring

```javascript
const mlPlugin = new MLPlugin({
  models: {
    myModel: {
      type: 'regression',
      resource: 'data',
      target: 'output',
      autoTrain: true,
      trainInterval: 3600000,
      evaluationMetrics: ['r2', 'mape']
    }
  }
});

await db.usePlugin(mlPlugin);

// Monitor training
mlPlugin.on('model.training.completed', async ({ modelName, metrics }) => {
  console.log(`✅ ${modelName} trained: R² = ${metrics.r2.toFixed(3)}`);
});

mlPlugin.on('model.training.failed', ({ modelName, error }) => {
  console.error(`❌ ${modelName} training failed: ${error.message}`);
});
```

### Recipe 3: Batch Predictions

```javascript
const newProducts = [
  { cost: 150, demand: 400 },
  { cost: 200, demand: 300 },
  { cost: 100, demand: 500 }
];

for (const product of newProducts) {
  const { prediction, confidence } = await mlPlugin.predict('pricePredictor', product);
  console.log(`Price: $${prediction.toFixed(2)} (${(confidence * 100).toFixed(1)}% confident)`);
}
```

### Recipe 4: Model Comparison

```javascript
const versions = await mlPlugin.getModelVersions('pricePredictor');

console.log('Model versions:');
versions.forEach(v => {
  console.log(`v${v.version}:`);
  console.log(`  R²: ${v.metrics.r2.toFixed(3)}`);
  console.log(`  MAPE: ${v.metrics.mape.toFixed(2)}%`);
  console.log(`  Trained: ${new Date(v.trainedAt).toLocaleString()}`);
});

// Use best version
const bestVersion = versions.reduce((best, current) =>
  current.metrics.r2 > best.metrics.r2 ? current : best
);

console.log(`\n✅ Best version: v${bestVersion.version}`);
```

---

## Next Steps

1. **Learn best practices** → [Best Practices](./best-practices.md)
2. **Production setup** → Check deployment patterns in Best Practices

---

**Prev:** [← Configuration](./configuration.md)
**Next:** [Best Practices →](./best-practices.md)
**Main:** [← ML Plugin](../README.md)

# 🚀 Getting Started with ML Plugin

**Prev:** [← ML Plugin](/plugins/ml/README.md)
**Next:** [Configuration →](/plugins/ml/guides/configuration.md)
**Main:** [← ML Plugin](/plugins/ml/README.md) | **All guides:** [Index](/plugins/ml/README.md#-documentation-guides)

> **In this guide:**
> - What is ML Plugin
> - Installation & dependencies
> - Zero-config API (recommended)
> - Classic API (still supported)
> - Your first ML model
> - Understanding model types

**Time to read:** 10 minutes
**Difficulty:** Beginner

---

## What is ML Plugin?

ML Plugin transforms s3db.js into a complete **machine learning platform** for training and deploying models directly on your S3 data.

### Key Benefits

- ✅ **Train ML models directly on S3 data** - No ETL pipeline needed
- ✅ **Zero configuration** - Works out of the box with sensible defaults
- ✅ **4 model types** - Regression, Classification, Time Series, Neural Networks
- ✅ **Auto-persistence** - Models saved to S3 with versioning
- ✅ **Automatic retraining** - Schedule-based or trigger-based updates
- ✅ **Production-ready** - Powered by TensorFlow.js from Google
- ✅ **Instant predictions** - 1-10ms latency with confidence scores

### When to Use ML Plugin

- ✅ You have data in S3DB and want quick ML predictions
- ✅ You need fast MVP (5 minutes vs 2+ hours)
- ✅ You want minimal infrastructure costs
- ✅ You need automatic retraining on fresh data
- ✅ Your models are small-to-medium (regression, classification, basic neural nets)

### Why Not Traditional ML Workflows?

Traditional ML requires:
- ❌ Complex ETL pipelines to export data
- ❌ Separate ML platforms (SageMaker, Vertex AI)
- ❌ Manual model versioning and deployment
- ❌ Dedicated ML infrastructure ($100-1000/month)
- ❌ 2-4 hours of setup time

**ML Plugin:** 5 minutes, zero infrastructure, zero maintenance.

---

## 📦 Installation & Dependencies

### Install s3db.js Core

```bash
pnpm install s3db.js
```

### Install TensorFlow.js

ML Plugin requires TensorFlow.js for machine learning:

```bash
pnpm install @tensorflow/tfjs-node
```

**Why TensorFlow.js?**
- Production-ready ML library from Google
- Native CPU/GPU bindings for Node.js
- 50-100x faster than pure JavaScript
- Automatic model optimization

**Installation Note:** First install may take 3-5 minutes as it downloads platform-specific native bindings (~200MB).

### Alternative Backends

Choose the version that matches your platform:

```bash
# Node.js with GPU acceleration (CUDA 11.2+ required)
pnpm install @tensorflow/tfjs-node-gpu

# Browser or pure JavaScript (slower, no native bindings)
pnpm install @tensorflow/tfjs

# React Native
pnpm install @tensorflow/tfjs-react-native
```

**Production Recommendation:** Use `@tensorflow/tfjs-node` for CPU inference (fastest startup, no GPU driver issues).

---

## ⚡ Zero-Config API (Recommended)

**NEW:** ML Plugin now works with **zero configuration!** 🎯

### 5-Minute Tutorial

#### Step 1: Create Database

```javascript
import { Database } from 's3db.js';

const db = new Database({
  connectionString: 's3://key:secret@bucket/ml-demo'
});

await db.connect();
```

#### Step 2: Create Resource with Data

```javascript
// Create products resource
const products = await db.createResource({
  name: 'products',
  attributes: {
    cost: 'number|required',        // Input: production cost
    demand: 'number|required',      // Input: customer demand
    price: 'number|required'        // Output: predicted price
  }
});

// Insert training data
await products.insert({ cost: 100, demand: 500, price: 150 });
await products.insert({ cost: 120, demand: 480, price: 175 });
await products.insert({ cost: 150, demand: 400, price: 215 });
await products.insert({ cost: 200, demand: 300, price: 280 });
await products.insert({ cost: 180, demand: 350, price: 260 });
// ... insert more data for better predictions
```

#### Step 3: Install ML Plugin (No Config!)

```javascript
import { MLPlugin } from 's3db.js';

const mlPlugin = new MLPlugin();  // ← THAT'S IT!
await db.usePlugin(mlPlugin);
```

#### Step 4: Train Model (One Line!)

```javascript
// Auto-detects everything:
// - Type: regression (because price is numeric)
// - Features: cost, demand (all inputs except target)
// - Target: price (what we want to predict)
await products.ml.learn('price');

console.log('✅ Model trained!');
```

#### Step 5: Make Predictions

```javascript
// Predict price for new product
const { prediction, confidence } = await products.ml.predict(
  { cost: 150, demand: 400 },
  'price'
);

console.log(`Predicted price: $${prediction.toFixed(2)}`);
console.log(`Confidence: ${(confidence * 100).toFixed(1)}%`);
```

**Output:**
```
Predicted price: $215.50
Confidence: 92.3%
```

**That's it!** 🚀 Full ML pipeline in 5 minutes with **87% less code**.

---

## 📚 Classic API (Still Supported)

The classic API gives you more control with explicit configuration:

```javascript
import { Database } from 's3db.js';
import { MLPlugin } from 's3db.js';

const db = new Database({
  connectionString: 's3://key:secret@bucket/ml-classic'
});

// Create resource
const products = await db.createResource({
  name: 'products',
  attributes: {
    cost: 'number',
    demand: 'number',
    price: 'number'
  }
});

// Insert training data
await products.insert({ cost: 100, demand: 500, price: 150 });
// ... more data

// Install ML Plugin with explicit config
const mlPlugin = new MLPlugin({
  models: {
    pricePredictor: {
      type: 'regression',           // Model type
      resource: 'products',         // Where the data is
      features: ['cost', 'demand'], // Input columns
      target: 'price',              // Output column
      autoTrain: true,              // Auto-train on schedule
      trainInterval: 3600000        // Every 1 hour
    }
  }
});

await db.usePlugin(mlPlugin);

// Train model
await mlPlugin.train('pricePredictor');

// Make predictions
const { prediction, confidence } = await mlPlugin.predict('pricePredictor', {
  cost: 150,
  demand: 400
});

console.log(`Predicted price: $${prediction.toFixed(2)}`);
console.log(`Confidence: ${(confidence * 100).toFixed(1)}%`);
```

**Use Classic API when you need:**
- Multiple models on same resource
- Custom model names
- Auto-training schedules
- More explicit control

---

## 📊 Model Types at a Glance

| Type | Use Case | Example | Output |
|------|----------|---------|--------|
| **Regression** | Predict numeric values | Price, sales, temperature | Single number |
| **Classification** | Predict categories | Spam/not spam, animal type | Category + probability |
| **Time Series (LSTM)** | Predict sequences | Stock price trends, weather | Number with trend |
| **Neural Network** | Complex patterns | Image recognition, custom | Depends on architecture |

### Quick Decision Guide

- **Predicting a number?** → Use **Regression**
  - Example: `await products.ml.learn('price')`

- **Predicting a category?** → Use **Classification**
  - Example: `await emails.ml.learn('category')`

- **Predicting over time?** → Use **Time Series**
  - Example: `await stocks.ml.learn('price_next_day')`

- **Complex patterns?** → Use **Neural Network**
  - Example: Image classification, custom architectures

---

## 🎯 Common Use Cases

### Use Case 1: Price Prediction (Regression)

```javascript
const products = await db.createResource({
  name: 'products',
  attributes: { cost: 'number', demand: 'number', price: 'number' }
});

// Insert historical data
await products.insert({ cost: 100, demand: 500, price: 150 });
// ... more data

// Zero-config training
await products.ml.learn('price');

// Predict new price
const { prediction } = await products.ml.predict({ cost: 150, demand: 400 }, 'price');
console.log(`Predicted: $${prediction.toFixed(2)}`);
```

### Use Case 2: Spam Detection (Classification)

```javascript
const emails = await db.createResource({
  name: 'emails',
  attributes: {
    subject: 'string',
    sender: 'string',
    body: 'string',
    is_spam: 'string'  // 'spam' or 'legitimate'
  }
});

// Insert training examples
await emails.insert({ subject: 'Free Money!', sender: 'unknown', body: '...', is_spam: 'spam' });
// ... more examples

// Train classifier
await emails.ml.learn('is_spam');

// Classify new email
const { prediction, confidence } = await emails.ml.predict(
  { subject: 'Your account', sender: 'support@bank.com', body: '...' },
  'is_spam'
);

console.log(`Is spam? ${prediction} (${(confidence * 100).toFixed(1)}% confidence)`);
```

### Use Case 3: Stock Price Prediction (Time Series)

```javascript
const stocks = await db.createResource({
  name: 'stocks',
  attributes: {
    date: 'string',
    open: 'number',
    high: 'number',
    low: 'number',
    close: 'number',
    volume: 'number'
  }
});

// Insert historical prices (days of data)
await stocks.insert({ date: '2024-01-01', open: 100, high: 105, low: 98, close: 102, volume: 1000000 });
// ... many more days

// Train time series model
await stocks.ml.learn('close');

// Predict next day
const { prediction } = await stocks.ml.predict(
  { open: 102, high: 107, low: 101, close: 105, volume: 1100000 },
  'close'
);

console.log(`Predicted next close: $${prediction.toFixed(2)}`);
```

---

## 🔍 How Zero-Config Works

ML Plugin automatically detects:

1. **Model Type:**
   - Numeric target? → Regression
   - String target? → Classification
   - Temporal data? → Time Series (LSTM)

2. **Features:**
   - All columns except target → Features

3. **Hyperparameters:**
   - Layers, learning rate, batch size → Auto-optimized

4. **Training Data:**
   - All records in resource → Training data

**No configuration needed!** 🎯

---

## Common Mistakes

### ❌ Mistake 1: Not Installing TensorFlow.js

```javascript
// ❌ WRONG - Will fail with "module not found"
const mlPlugin = new MLPlugin();
```

**Fix:**
```bash
# ✅ First install TensorFlow.js
pnpm install @tensorflow/tfjs-node
```

---

### ❌ Mistake 2: Insufficient Training Data

```javascript
// ❌ WRONG - Only 2 examples = poor model
await products.insert({ cost: 100, demand: 500, price: 150 });
await products.insert({ cost: 200, demand: 300, price: 280 });

await products.ml.learn('price');
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

await products.ml.learn('price');
```

---

### ❌ Mistake 3: Missing Target Field in Prediction

```javascript
// ❌ WRONG - Which field to predict?
const { prediction } = await products.ml.predict({ cost: 150, demand: 400 });
```

**Fix:**
```javascript
// ✅ CORRECT - Specify target field
const { prediction } = await products.ml.predict(
  { cost: 150, demand: 400 },
  'price'  // ← Target field
);
```

---

## Next Steps

1. **Learn configuration options** → [Configuration Guide](/plugins/ml/guides/configuration.md)
2. **See real-world patterns** → [Usage Patterns](/plugins/ml/guides/usage-patterns.md)
3. **Production setup** → [Best Practices](/plugins/ml/guides/best-practices.md)

---

**Prev:** [← ML Plugin](/plugins/ml/README.md)
**Next:** [Configuration →](/plugins/ml/guides/configuration.md)
**Main:** [← ML Plugin](/plugins/ml/README.md)

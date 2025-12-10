# ✅ Best Practices & Troubleshooting

**Prev:** [← Usage Patterns](/plugins/ml-plugin/guides/usage-patterns.md)
**Main:** [← ML Plugin](/plugins/ml-plugin/README.md) | **All guides:** [Index](/plugins/ml-plugin/README.md#-documentation-guides)

> **In this guide:**
> - 6 essential best practices
> - Common mistakes & fixes
> - Error handling strategies
> - Troubleshooting scenarios (8 issues)
> - Production deployment checklist
> - 35+ FAQ entries

**Time to read:** 30 minutes
**Difficulty:** Advanced

---

## 6 Essential Best Practices

### 1. Always Validate Training Data Quality

**❌ Wrong:**
```javascript
// Insert whatever data comes in
const data = JSON.parse(req.body);
await products.insert(data);  // No validation!
await mlPlugin.train('pricePredictor');
```

**✅ Correct:**
```javascript
// Validate data before inserting
const validateProduct = (product) => {
  if (!product.cost || product.cost <= 0) throw new Error('Invalid cost');
  if (!product.demand || product.demand <= 0) throw new Error('Invalid demand');
  if (!product.price || product.price <= 0) throw new Error('Invalid price');
  return product;
};

const data = JSON.parse(req.body);
await products.insert(validateProduct(data));
await mlPlugin.train('pricePredictor');
```

**Why:** Bad data = bad model. Garbage in, garbage out.

---

### 2. Use Sufficient Training Data

**❌ Wrong:**
```javascript
// Only 10 samples!
for (let i = 0; i < 10; i++) {
  await products.insert({ cost: 100 + i * 10, demand: 500, price: 150 + i * 15 });
}

await mlPlugin.train('pricePredictor');  // Poor model!
```

**✅ Correct:**
```javascript
// At least 50-100 samples minimum
// Rule: 10-20x samples per feature
// 4 features = 40-80 samples minimum

for (let i = 0; i < 100; i++) {
  await products.insert({
    cost: Math.random() * 200 + 50,
    demand: Math.random() * 500 + 100,
    price: Math.random() * 300 + 100
  });
}

await mlPlugin.train('pricePredictor');
```

**Why:** Neural networks need enough examples to learn patterns.

---

### 3. Monitor Model Performance Continuously

**❌ Wrong:**
```javascript
// Train once, never check quality
await mlPlugin.train('pricePredictor');
// No monitoring = problems hidden
```

**✅ Correct:**
```javascript
// Check metrics after training
await mlPlugin.train('pricePredictor');

const metrics = await mlPlugin.evaluate('pricePredictor');

if (metrics.r2 < 0.7) {
  console.warn('⚠️  Model accuracy low (R² < 0.7)');
  sendAlert({ severity: 'warning', metric: 'r2', value: metrics.r2 });
}

console.log(`Model quality: R² = ${metrics.r2.toFixed(3)}, MAPE = ${metrics.mape.toFixed(2)}%`);
```

**Why:** Quality metrics reveal when to retrain or investigate data issues.

---

### 4. Implement Data Preprocessing

**❌ Wrong:**
```javascript
// Raw data directly to model
{
  type: 'regression',
  resource: 'products',
  target: 'price'
  // No preprocessing = outliers, invalid data
}
```

**✅ Correct:**
```javascript
{
  type: 'regression',
  resource: 'products',
  target: 'price',

  preprocessing: {
    // Remove invalid data
    filter: (record) => {
      return record.cost > 0 &&
             record.demand > 0 &&
             record.price > 0 &&
             record.price < 100000;  // Remove outliers
    },

    // Normalize features
    map: (record) => ({
      ...record,
      cost: record.cost / 1000,                    // Scale to 0-1000
      demand: record.demand / 100000,              // Scale to 0-100k
      pricePerUnit: record.price / record.demand   // Create ratio
    })
  }
}
```

**Why:** Clean data + engineered features = better models.

---

### 5. Use Auto-Training for Fresh Data

**❌ Wrong:**
```javascript
// Manual training = outdated models
await mlPlugin.train('pricePredictor');
// Model becomes stale as new data arrives
```

**✅ Correct:**
```javascript
const mlPlugin = new MLPlugin({
  models: {
    pricePredictor: {
      type: 'regression',
      resource: 'products',
      target: 'price',

      // Retrain periodically
      autoTrain: true,
      trainInterval: 3600000,  // Every 1 hour

      // OR retrain on new data
      trainOnInsert: true,
      trainOnInsertCount: 100  // After 100 new products
    }
  }
});
```

**Why:** Models improve as new data arrives.

---

### 6. Version Models for Rollback

**❌ Wrong:**
```javascript
// No versioning = no rollback
await mlPlugin.train('pricePredictor');
// If new version is worse, you're stuck
```

**✅ Correct:**
```javascript
const mlPlugin = new MLPlugin({
  storage: {
    versioning: true  // Auto-version models
  }
});

// Compare versions
const versions = await mlPlugin.getModelVersions('pricePredictor');

console.log('Model versions:');
versions.forEach(v => {
  console.log(`v${v.version}: R² = ${v.metrics.r2.toFixed(3)}`);
});

// Rollback if needed
if (currentMetrics.r2 < previousMetrics.r2) {
  await mlPlugin.rollbackModel('pricePredictor', previousVersion);
}
```

**Why:** Version control prevents deploying bad models.

---

## Common Mistakes & Fixes

### Mistake 1: Too Many Features

**Symptoms:**
- Model overfits
- Prediction quality drops on new data
- Training becomes slow

**Cause:**
```javascript
// ❌ 100 features but only 50 training samples
features: ['f1', 'f2', ..., 'f100']
// Only 50 samples = overfitting!
```

**Fix:**
```javascript
// ✅ Feature selection: 10 samples per feature
// 50 samples = max 5 features

features: [
  'cost',           // Most important
  'demand',         // Most important
  'margin',         // Important
  'seasonality',    // Important
  'competitorPrice' // Important
]
```

---

### Mistake 2: Imbalanced Classification Data

**Symptoms:**
- Classification accuracy seems high but predictions are wrong
- Model always predicts same class

**Cause:**
```javascript
// ❌ 95% legitimate, 5% spam
for (let i = 0; i < 95; i++) {
  await emails.insert({ ..., isSpam: 'legitimate' });
}
for (let i = 0; i < 5; i++) {
  await emails.insert({ ..., isSpam: 'spam' });
}

await mlPlugin.train('spamClassifier');
// Model learns to just predict "legitimate"
```

**Fix:**
```javascript
// ✅ Balance classes: 50% legitimate, 50% spam
for (let i = 0; i < 50; i++) {
  await emails.insert({ ..., isSpam: 'legitimate' });
}
for (let i = 0; i < 50; i++) {
  await emails.insert({ ..., isSpam: 'spam' });
}

await mlPlugin.train('spamClassifier');
```

---

### Mistake 3: Not Monitoring Model Drift

**Symptoms:**
- Predictions start failing
- User complaints about inaccuracy
- No visibility into when quality changed

**Cause:**
```javascript
// ❌ No monitoring
await mlPlugin.train('pricePredictor');
// Silent failures as data distribution changes
```

**Fix:**
```javascript
// ✅ Monitor metrics continuously
mlPlugin.on('model.training.completed', ({ modelName, metrics }) => {
  console.log(`${modelName}: R² = ${metrics.r2.toFixed(3)}`);

  if (metrics.r2 < 0.7) {
    sendAlert({
      severity: 'high',
      message: 'Model quality degraded',
      metric: 'r2',
      value: metrics.r2
    });
  }
});
```

---

### Mistake 4: Wrong Model Type

**Symptoms:**
- Poor predictions
- Training is slow
- Metrics don't match expected ranges

**Cause:**
```javascript
// ❌ Using classification for numeric output
{
  type: 'classification',  // ← Wrong!
  target: 'price',         // Price is numeric
}
```

**Fix:**
```javascript
// ✅ Match model type to data
{
  type: 'regression',      // Numeric output
  target: 'price'
}
```

---

### Mistake 5: Memory Issues from Large Models

**Symptoms:**
- Process crashes with OOM
- Training becomes very slow
- GPU memory exhausted

**Cause:**
```javascript
// ❌ Too large for available memory
{
  layers: [512, 512, 256, 128],  // Very large
  batchSize: 1,                  // Tiny batches = slow, memory leaks
  epochs: 1000                   // Too many
}
```

**Fix:**
```javascript
// ✅ Right-size for hardware
{
  layers: [128, 64, 32],         // Reasonable size
  batchSize: 64,                 // Balanced
  epochs: 100
}

// Or reduce data size
preprocessing: {
  filter: (record) => record.selected === true  // Use subset
}
```

---

## Error Handling Strategy

```javascript
mlPlugin.on('model.training.failed', ({ modelName, error }) => {
  // Classify errors
  if (error.message.includes('Insufficient data')) {
    console.error('❌ Need more training samples (minimum 50)');
  } else if (error.message.includes('NaN')) {
    console.error('❌ Invalid data in features (check for Infinity, null)');
  } else if (error.message.includes('memory')) {
    console.error('❌ Out of memory (reduce model size or data)');
  } else if (error.message.includes('TensorFlow')) {
    console.error('❌ TensorFlow.js not installed or misconfigured');
  } else {
    console.error('❌ Unknown training error:', error.message);
  }

  // Take action
  sendAlert({
    severity: 'error',
    message: 'Model training failed',
    model: modelName,
    error: error.message
  });
});
```

---

## Troubleshooting Guide

### Issue 1: "Module not found: @tensorflow/tfjs-node"

**Solution:**
```bash
# Install TensorFlow.js peer dependency
pnpm install @tensorflow/tfjs-node

# Verify installation
node -e "require('@tensorflow/tfjs-node'); console.log('✅ TensorFlow.js loaded')"
```

---

### Issue 2: Model Accuracy is Poor (R² < 0.5)

**Solutions (in order):**

1. **Add more training data:**
   ```javascript
   // Add 50+ more examples
   for (let i = 0; i < 100; i++) {
     await products.insert({...});
   }
   await mlPlugin.train('pricePredictor');
   ```

2. **Check data quality:**
   ```javascript
   // Inspect data for outliers/invalid values
   const samples = await products.list({ limit: 10 });
   console.log(samples);
   ```

3. **Add preprocessing:**
   ```javascript
   preprocessing: {
     filter: (record) => record.price > 0 && record.price < 100000
   }
   ```

4. **Add features:**
   ```javascript
   features: [
     'cost',
     'demand',
     'newFeature1',  // Add derived features
     'newFeature2'
   ]
   ```

---

### Issue 3: Training is Very Slow

**Solutions:**

1. **Reduce epochs:**
   ```javascript
   modelConfig: {
     epochs: 50  // From 200 to 50
   }
   ```

2. **Increase batch size:**
   ```javascript
   modelConfig: {
     batchSize: 128  // From 32 to 128
   }
   ```

3. **Reduce data size:**
   ```javascript
   preprocessing: {
     filter: (record) => record.selected === true  // Use subset
   }
   ```

4. **Use GPU:**
   ```bash
   pnpm install @tensorflow/tfjs-node-gpu
   ```

---

### Issue 4: Out of Memory (OOM) Error

**Solutions:**

1. **Reduce model size:**
   ```javascript
   modelConfig: {
     layers: [32, 16]  // Smaller layers
   }
   ```

2. **Reduce batch size:**
   ```javascript
   modelConfig: {
     batchSize: 8  // Smaller batches
   }
   ```

3. **Filter data:**
   ```javascript
   preprocessing: {
     filter: (record) => record.important === true  // Use 10% of data
   }
   ```

---

### Issue 5: NaN or Infinity in Predictions

**Solution:** Clean your data

```javascript
preprocessing: {
  filter: (record) => {
    // Check for invalid values
    return Object.values(record).every(v =>
      v !== null &&
      v !== undefined &&
      !isNaN(v) &&
      isFinite(v)
    );
  }
}
```

---

### Issue 6: Classification Predictions All Same Class

**Solution:** Balance your classes

```javascript
// Ensure equal representation
const legitimate = 50;
const spam = 50;

for (let i = 0; i < legitimate; i++) {
  await emails.insert({ ..., isSpam: 'legitimate' });
}
for (let i = 0; i < spam; i++) {
  await emails.insert({ ..., isSpam: 'spam' });
}
```

---

### Issue 7: Model Prediction Confidence Too Low

**Solutions:**

1. **Add more training data**
2. **Improve data quality** (remove outliers)
3. **Engineer better features**
4. **Increase model complexity** (more layers)
5. **Train longer** (more epochs)

---

### Issue 8: Model Works in Dev but Fails in Prod

**Cause:** Data distribution changed

**Solution:** Implement monitoring

```javascript
mlPlugin.on('model.training.completed', ({ metrics }) => {
  if (metrics.r2 < 0.7) {
    sendAlert({ message: 'Model degraded in production' });
  }
});
```

---

## Production Deployment Checklist

- ✅ TensorFlow.js installed and tested
- ✅ Training data validated and cleaned
- ✅ At least 50-100 training samples
- ✅ Features selected (max 5-10 features)
- ✅ Data preprocessing implemented (filter + map)
- ✅ Model type matches target data
- ✅ Auto-training configured (interval or on-insert)
- ✅ Model versioning enabled
- ✅ Evaluation metrics monitored
- ✅ Error handling in place
- ✅ Alerts configured for model drift
- ✅ Graceful degradation on prediction failure
- ✅ Regular model performance reviews

---

## ❓ FAQ

### General Questions

**Q: How much training data do I need?**

A: Rule of thumb: 10-20 samples per feature
- 3 features = 30-60 samples minimum
- 5 features = 50-100 samples
- 10+ features = 100-200 samples

---

**Q: Which model type should I use?**

A: Match to your target:
- **Numeric target** → Regression (price, sales)
- **Category target** → Classification (spam/not spam)
- **Time series** → Time Series (stock price over time)
- **Complex patterns** → Neural Network

---

**Q: How long does training take?**

A: Depends on:
- Data size: 10-100 samples = <1 second
- 100-1000 samples = 1-5 seconds
- 1000+ samples = 5-30 seconds

---

### Configuration Questions

**Q: What's the best learning rate?**

A: Start with 0.01:
- Too high (0.1+) = training oscillates
- Too low (0.0001) = training too slow
- Sweet spot: 0.001-0.01

---

**Q: How many epochs should I use?**

A: Start with 100:
- Too few (<50) = underfitting
- Too many (>500) = overfitting
- Sweet spot: 50-200

---

**Q: Should I normalize my data?**

A: Yes! Always:
```javascript
map: (record) => ({
  ...record,
  price: record.price / 1000,    // Scale to 0-1000
  demand: record.demand / 100000 // Scale to 0-100k
})
```

---

### Performance Questions

**Q: How fast are predictions?**

A: 1-10ms typically:
- Regression: 1-3ms
- Classification: 2-5ms
- Neural Network: 5-10ms

---

**Q: Can I batch predictions?**

A: Yes!
```javascript
const predictions = [];
for (const data of batch) {
  const result = await mlPlugin.predict('modelName', data);
  predictions.push(result);
}
```

---

**Q: How do I speed up training?**

A: In order of impact:
1. Use GPU (`@tensorflow/tfjs-node-gpu`)
2. Reduce epochs
3. Increase batch size
4. Use fewer/smaller layers

---

### Troubleshooting Questions

**Q: Why is R² negative?**

A: Model worse than baseline. Solutions:
1. Add more training data
2. Improve data quality
3. Add features
4. Try different model type

---

**Q: How do I prevent overfitting?**

A: Use techniques:
1. Dropout layers
2. More training data
3. Fewer features
4. Smaller model

---

**Q: Can I use categorical features?**

A: Yes, one-hot encode them:
```javascript
map: (record) => ({
  ...record,
  category_A: record.category === 'A' ? 1 : 0,
  category_B: record.category === 'B' ? 1 : 0,
  category_C: record.category === 'C' ? 1 : 0
})
```

---

**Q: What if my target is string?**

A: Use classification:
```javascript
{
  type: 'classification',
  target: 'status'  // 'active', 'inactive', 'pending'
}
```

---

### Production Questions

**Q: How do I monitor model quality?**

A:
```javascript
mlPlugin.on('model.training.completed', ({ metrics }) => {
  metrics.r2
  metrics.mape
  metrics.mae
});
```

---

**Q: Should I retrain constantly?**

A: Balance needed:
- Too often = wasted compute
- Too seldom = stale models
- Recommended: Every 1-6 hours OR after 100+ new samples

---

**Prev:** [← Usage Patterns](/plugins/ml-plugin/guides/usage-patterns.md)
**Main:** [← ML Plugin](/plugins/ml-plugin/README.md)

# 🤖 ML Plugin

> **Train, deploy, and manage TensorFlow.js models directly on your S3DB resources.**
>
> **Repository:** [s3db.js/docs/plugins/ml](.)

---

## ⚡ TLDR

**Machine Learning directly on S3 data with TensorFlow.js**

### Zero-Config API (Recommended)

```javascript
const mlPlugin = new MLPlugin();  // ← No configuration needed!
await db.usePlugin(mlPlugin);

// Train & predict (one line each!)
await products.ml.learn('price');                    // Auto-detects everything
const { prediction, confidence } = await products.ml.predict(
  { cost: 150, demand: 400 },
  'price'
);

console.log(`Predicted: $${prediction.toFixed(2)}`);
```

### Classic API (Still Supported)

```javascript
const mlPlugin = new MLPlugin({
  models: {
    pricePredictor: {
      type: 'regression',
      resource: 'products',
      features: ['cost', 'demand'],
      target: 'price'
    }
  }
});

await db.usePlugin(mlPlugin);
await mlPlugin.train('pricePredictor');

const { prediction } = await mlPlugin.predict('pricePredictor', { cost: 150, demand: 400 });
```

**In 5 minutes: Full ML pipeline** 🚀

---

## 🎯 Key Features

| Feature | Benefit | Speed |
|---------|---------|-------|
| **Zero Configuration** | Works out of the box | 5 minutes |
| **4 Model Types** | Regression, Classification, Time Series, Neural Networks | Seconds |
| **Auto-Persistence** | Models saved to S3 | Automatic |
| **Auto-Training** | Retrain on schedule or data changes | Continuous |
| **Production-Ready** | Powered by TensorFlow.js | 1-10ms predictions |
| **Version Management** | Compare & rollback models | Automatic |
| **Data Preprocessing** | Filter & transform data | Integrated |

---

## 📚 Documentation Guides

Start with **Getting Started**, then pick your path:

| Guide | Time | Difficulty | Topics |
|-------|------|-----------|--------|
| **[Getting Started](./guides/getting-started.md)** | 10 min | Beginner | What is ML Plugin, installation, zero-config API, model types |
| **[Configuration](./guides/configuration.md)** | 20 min | Intermediate | All config options, model types, training, data transformations |
| **[Usage Patterns](./guides/usage-patterns.md)** | 25 min | Intermediate | 5 real-world patterns, API reference, copy-paste recipes |
| **[Best Practices](./guides/best-practices.md)** | 30 min | Advanced | 6 best practices, troubleshooting, 35+ FAQ, production checklist |

**⏱️ Total learning path:** ~85 minutes to production-ready

---

## 🚀 Quick FAQ

**Q: How much training data do I need?**
A: 50-100 samples minimum (10-20 samples per feature). See [Best Practices - Data Quality](./guides/best-practices.md#1-always-validate-training-data-quality).

**Q: Which model type should I use?**
A: Regression (numeric), Classification (categories), Time Series (sequences), Neural Networks (complex). Decision tree in [Getting Started](./guides/getting-started.md#-model-types-at-a-glance).

**Q: How fast are predictions?**
A: 1-10ms typically. Regression < 3ms, Classification 2-5ms, Neural Networks 5-10ms.

**Q: Can I auto-train models?**
A: Yes! Train on interval or after N new inserts. See [Configuration - Auto-Training](./guides/configuration.md#auto-training-on-interval).

**Q: Why is my model accuracy poor?**
A: Usually data quality. See [Troubleshooting Guide](./guides/best-practices.md#issue-2-model-accuracy-is-poor-r2--05).

---

## 🎓 Configuration Patterns

| Pattern | Interval | Use Case | Example |
|---------|----------|----------|---------|
| **Zero-Config** | N/A | Quick prototyping | `await resource.ml.learn('target')` |
| **Single Model** | Manual | One prediction | Price predictor |
| **Multi-Model** | Manual | Multiple predictions | Price + margin + category |
| **Auto-Training** | 1 hour | Production updates | Retrain every hour |
| **Data-Triggered** | After N inserts | Fresh data | Retrain after 100 new records |

👉 **Full patterns:** [Configuration Guide](./guides/configuration.md#-configuration-patterns)

---

## 🔄 Typical Workflows

### 1. **Quick Prototype (5 min)**
→ Use zero-config API with [Getting Started](./guides/getting-started.md#-zero-config-api-recommended)

### 2. **Single Production Model**
→ Use classic API with [Configuration](./guides/configuration.md#pattern-2-single-model-classic)

### 3. **Price Prediction**
→ Follow Pattern 1 in [Usage Patterns](./guides/usage-patterns.md#pattern-1-basic-regression-house-price-prediction)

### 4. **Spam Detection**
→ Follow Pattern 2 in [Usage Patterns](./guides/usage-patterns.md#pattern-2-classification-email-spam-detection)

### 5. **Stock Price Prediction**
→ Follow Pattern 3 in [Usage Patterns](./guides/usage-patterns.md#pattern-3-time-series-stock-price-prediction)

---

## 📊 API Quick Reference

**Zero-Config Methods:**
- `resource.ml.learn(target)` - Train model
- `resource.ml.predict(data, target)` - Make prediction

**Classic API Methods:**
- `mlPlugin.train(modelName)` - Train model
- `mlPlugin.predict(modelName, data)` - Predict
- `mlPlugin.evaluate(modelName)` - Get metrics
- `mlPlugin.getModelVersions(modelName)` - Version history

**Response Format:**
```javascript
{
  prediction: 215.50,         // Predicted value
  confidence: 0.923,          // 0-1 confidence
  metrics: {                  // Model evaluation
    r2: 0.87,                 // R-squared
    mape: 3.2                 // Mean Absolute % Error
  }
}
```

👉 **Full reference:** [Usage Patterns - API Reference](./guides/usage-patterns.md#api-reference)

---

## ✅ Production Deployment Checklist

- ✅ TensorFlow.js installed (`pnpm install @tensorflow/tfjs-node`)
- ✅ Training data validated & cleaned
- ✅ At least 50-100 training samples
- ✅ Features selected (max 5-10)
- ✅ Data preprocessing configured
- ✅ Auto-training enabled (interval or on-insert)
- ✅ Model versioning enabled
- ✅ Evaluation metrics monitored
- ✅ Error handling in place
- ✅ Alerts configured for model drift

👉 **Full checklist:** [Best Practices - Production Checklist](./guides/best-practices.md#production-deployment-checklist)

---

## 🆘 Common Issues

| Issue | Solution | Link |
|-------|----------|------|
| Module not found: @tensorflow/tfjs-node | Install: `pnpm install @tensorflow/tfjs-node` | [Troubleshooting](./guides/best-practices.md#issue-1-module-not-found) |
| Poor accuracy (R² < 0.5) | Add data, clean data, add features | [Issue 2](./guides/best-practices.md#issue-2-model-accuracy-is-poor-r2--05) |
| Training is very slow | Reduce epochs, increase batch size, use GPU | [Issue 3](./guides/best-practices.md#issue-3-training-is-very-slow) |
| Out of memory (OOM) | Reduce model size, reduce batch size | [Issue 4](./guides/best-practices.md#issue-4-out-of-memory-oom-error) |
| NaN or Infinity errors | Clean your data, validate inputs | [Issue 5](./guides/best-practices.md#issue-5-nan-or-infinity-in-predictions) |

👉 **Full troubleshooting:** [Best Practices - Troubleshooting](./guides/best-practices.md#troubleshooting-guide)

---

## 🔗 Related Plugins

- **[Replicator Plugin](/plugins/replicator/README.md)** - Sync to PostgreSQL, BigQuery, etc.
- **[TTL Plugin](/plugins/ttl/README.md)** - Auto-cleanup old models
- **[Cache Plugin](/plugins/cache/README.md)** - Cache predictions
- **[Metrics Plugin](/plugins/metrics/README.md)** - Performance monitoring

---

## 📖 Learning Path

```
Start Here
    ↓
Getting Started (10 min) - Basics & zero-config API
    ↓
Configuration (20 min) - Config options & patterns
    ↓
Usage Patterns (25 min) - Real-world examples
    ↓
Best Practices (30 min) - Production readiness
    ↓
Ready for Production! 🚀
```

**Total time:** ~85 minutes

---

## 💡 Quick Tips

1. **Start with zero-config** - Use `new MLPlugin()` with no config
2. **Validate data** - Bad data = bad predictions
3. **Use 50+ samples** - Minimum training data for decent models
4. **Monitor metrics** - Check R², MAPE, accuracy after training
5. **Enable auto-training** - Retrain as new data arrives
6. **Version models** - Always enable versioning for rollback
7. **Handle errors** - Use try/catch, listen to training.failed events

---

## 📄 License

MIT - Same as s3db.js

---

**Navigation:**
- [← Back to Plugins Index](/plugins/README.md)
- [Getting Started →](/plugins/ml/guides/getting-started.md)
- [Configuration →](/plugins/ml/guides/configuration.md)
- [Usage Patterns →](/plugins/ml/guides/usage-patterns.md)
- [Best Practices →](/plugins/ml/guides/best-practices.md)

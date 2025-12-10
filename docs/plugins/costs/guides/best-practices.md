# Best Practices & FAQ

> **In this guide:** Production recommendations, troubleshooting, and frequently asked questions.

**Navigation:** [← Back to Costs Plugin](/plugins/costs/README.md) | [Configuration](/plugins/costs/guides/configuration.md)

---

## Best Practices

### 1. Regular Cost Monitoring

```javascript
// Set up periodic cost reporting
setInterval(() => {
  const costs = s3db.client.costs;
  if (costs.total > 0) {
    console.log(`Current session cost: $${costs.total.toFixed(6)}`);
    console.log(`Total requests: ${costs.requests.total}`);
  }
}, 60000); // Every minute
```

### 2. Optimize Based on Cost Data

```javascript
// Analyze which operations are most expensive
const costs = s3db.client.costs;
const operationCosts = Object.entries(costs.requests.counts)
  .filter(([op]) => op !== 'total' && costs.requests.counts[op] > 0)
  .map(([op, count]) => ({
    operation: op,
    count,
    totalCost: count * costs.requests.prices[op],
    costPerRequest: costs.requests.prices[op]
  }))
  .sort((a, b) => b.totalCost - a.totalCost);

console.log('Most expensive operations:');
operationCosts.forEach(op => {
  console.log(`${op.operation}: ${op.count} requests = $${op.totalCost.toFixed(6)}`);
});
```

### 3. Set Up Cost Budgets

```javascript
class CostBudget {
  constructor(s3db, dailyBudget = 0.10) { // $0.10 per day
    this.s3db = s3db;
    this.dailyBudget = dailyBudget;
    this.startTime = Date.now();
  }

  checkBudget() {
    const costs = this.s3db.client.costs;
    const timeElapsed = Date.now() - this.startTime;
    const dailyProjection = costs.total * (24 * 60 * 60 * 1000) / timeElapsed;

    const budgetUsed = dailyProjection / this.dailyBudget;

    if (budgetUsed > 1.0) {
      console.error(`Daily budget exceeded! Projected: $${dailyProjection.toFixed(6)}`);
      return false;
    } else if (budgetUsed > 0.8) {
      console.warn(`80% of daily budget used. Projected: $${dailyProjection.toFixed(6)}`);
    }

    return true;
  }
}
```

### 4. Automatic Budget Alerts

```javascript
const MAX_DAILY = 1.00; // $1/day

setInterval(() => {
  const projection = (costs.total / hoursRunning) * 24;

  if (projection > MAX_DAILY) {
    // Immediate action!
    console.error('BUDGET EXCEEDED!');
    // Pause non-critical operations
    // Send alert
  } else if (projection > MAX_DAILY * 0.8) {
    console.warn('Approaching budget (80%)');
  }
}, 300000); // Check every 5 min
```

---

## Troubleshooting

### Issue: Costs showing as zero
**Solution**: Ensure the plugin is added correctly as `CostsPlugin` (not `new CostsPlugin()`).

### Issue: Costs seem inaccurate
**Solution**: Verify you're using the latest plugin version. AWS pricing may change over time.

### Issue: Need historical cost data
**Solution**: The plugin only tracks current session costs. Implement your own persistence layer to store historical data.

### Issue: High costs detected
**Solution**: Use the cost breakdown to identify expensive operations and optimize your usage patterns.

---

## FAQ

### Basics

**Q: Does the plugin affect operation performance?**
A: The impact is minimal. Cost tracking adds approximately < 0.1ms per operation (negligible overhead).

**Q: Can I use it in local environments (MinIO/LocalStack)?**
A: Yes! The plugin works with any S3-compatible backend. Costs will be $0 for LocalStack but request metrics will be tracked.

**Q: Do I need to configure AWS credentials?**
A: No. The plugin uses the same credentials already configured in S3DB and doesn't make additional AWS calls.

---

### Configuration

**Q: How to access costs?**
A: Via `client.costs`:
```javascript
console.log(database.client.costs);
// {
//   total: 0.0042,
//   requests: { total: 850, get: 500, put: 200, ... },
//   events: { GetObjectCommand: 500, ... }
// }
```

**Q: Do I need to configure anything?**
A: No, just install the plugin:
```javascript
await database.usePlugin(new CostsPlugin());
```

**Q: How to customize pricing by region?**
A: Modify `CostsPlugin.costs.prices` after installation:
```javascript
CostsPlugin.costs.requests.prices.get = 0.0005 / 1000;  // Regional adjustment
CostsPlugin.costs.requests.prices.put = 0.006 / 1000;
```

---

### Operations

**Q: How to view accumulated costs?**
A: Access the `costs` object:
```javascript
const costs = database.client.costs;
console.log(`Total: $${costs.total.toFixed(6)}`);
console.log(`Requests: ${costs.requests.total}`);
```

**Q: How to reset counters?**
A: There's no public method for reset. Restart the application or recreate the database instance.

**Q: How to export cost reports?**
A: Serialize the `client.costs` object:
```javascript
const report = JSON.stringify(database.client.costs, null, 2);
await fs.writeFile('costs-report.json', report);
```

**Q: What are the prices per operation?**
A:
- PUT/POST/COPY/LIST: $0.005 per 1,000 requests
- GET/SELECT/HEAD/DELETE: $0.0004 per 1,000 requests

---

### Performance

**Q: How to use costs to optimize operations?**
A: Analyze which operations are most expensive:
```javascript
const costs = database.client.costs;
const operationCosts = Object.entries(costs.requests.counts)
  .filter(([op]) => op !== 'total' && costs.requests.counts[op] > 0)
  .map(([op, count]) => ({
    operation: op,
    count,
    totalCost: count * costs.requests.prices[op]
  }))
  .sort((a, b) => b.totalCost - a.totalCost);

console.log('Most expensive operations:', operationCosts);
```

**Q: How to monitor costs in real-time?**
A: Configure periodic checks:
```javascript
setInterval(() => {
  const costs = database.client.costs;
  if (costs.total > 0.10) {
    console.warn(`Budget alert: $${costs.total.toFixed(6)}`);
  }
}, 60000); // Every minute
```

---

### Storage & Data Transfer

**Q: How does storage tracking work?**
A: The plugin automatically tracks object sizes during PUT/POST/COPY operations:
```javascript
const costs = db.client.costs;
console.log(`Storage: ${costs.storage.totalGB.toFixed(2)} GB`);
console.log(`Monthly cost: $${costs.storage.subtotal.toFixed(2)}`);
console.log(`Current tier: ${costs.storage.currentTier + 1}`);
```

**Q: What is data transfer and how is it calculated?**
A: Data transfer tracks uploads (IN) and downloads (OUT):
- **IN (Upload):** Always free, tracked but cost = $0
- **OUT (Download):** Charged per tier, tracked in GET operations
```javascript
console.log(`Upload: ${costs.dataTransfer.inGB.toFixed(2)} GB (FREE)`);
console.log(`Download: ${costs.dataTransfer.outGB.toFixed(2)} GB`);
console.log(`Transfer cost: $${costs.dataTransfer.subtotal.toFixed(2)}`);
```

**Q: How to enable AWS free tier?**
A: Use `considerFreeTier: true` in setup:
```javascript
await CostsPlugin.setup(db, {
  considerFreeTier: true  // 100GB/month OUT free
});

// Check how much of free tier was used
console.log(`Free tier used: ${costs.dataTransfer.freeTierUsed} GB of 100 GB`);
```

**Q: Is it worth enabling the free tier?**
A: **YES!** If you transfer up to 100GB/month:
- Without free tier: 80GB x $0.09 = **$7.20/month**
- With free tier: 80GB = **$0.00/month** (saves $7.20)

**Q: How to know which pricing tier I'm in?**
A: Check `currentTier` for storage and data transfer:
```javascript
const storageTier = costs.storage.tiers[costs.storage.currentTier];
console.log(`Storage tier: $${storageTier.pricePerGB}/GB`);

const transferTier = costs.dataTransfer.tiers[costs.dataTransfer.currentTier];
console.log(`Transfer OUT tier: $${transferTier.pricePerGB}/GB`);
```

**Q: Why is storage.subtotal "monthly" but requests.subtotal is session total?**
A: Storage is charged monthly by AWS ($/GB/month), so we show monthly cost based on current storage. Requests are charged per operation, so we show accumulated session total.

**Q: How to estimate my total monthly cost?**
A: Combine monthly storage + projected requests/transfer:
```javascript
function estimateMonthly(costs, hoursRunning) {
  const monthHours = 30 * 24;
  const requestsMonthly = (costs.requests.subtotal / hoursRunning) * monthHours;
  const transferMonthly = (costs.dataTransfer.subtotal / hoursRunning) * monthHours;
  const storageMonthly = costs.storage.subtotal; // Already monthly

  return {
    requests: requestsMonthly,
    storage: storageMonthly,
    transfer: transferMonthly,
    total: requestsMonthly + storageMonthly + transferMonthly
  };
}

const estimate = estimateMonthly(db.client.costs, 24); // 24h running
console.log(`Estimated monthly: $${estimate.total.toFixed(2)}`);
```

---

### Practical Use Cases

**Q: How to compare costs between different strategies?**
A: Create snapshots and compare:
```javascript
// Initial snapshot
const before = { ...db.client.costs };

// Execute operation
await myOperation();

// Final snapshot
const after = { ...db.client.costs };

// Compare
console.log('Cost impact:', {
  requests: after.requests.subtotal - before.requests.subtotal,
  storage: after.storage.subtotal - before.storage.subtotal,
  transfer: after.dataTransfer.subtotal - before.dataTransfer.subtotal
});
```

---

## See Also

- [Configuration](/plugins/costs/guides/configuration.md) - Detailed configuration options
- [Usage Patterns](/plugins/costs/guides/usage-patterns.md) - Examples and monitoring patterns
- [Cost Optimization](/plugins/costs/guides/cost-optimization.md) - Reduce costs with proven strategies

# Usage Patterns

> **In this guide:** Examples, advanced patterns, and monitoring techniques.

**Navigation:** [← Back to Costs Plugin](/plugins/costs/README.md) | [Configuration](/plugins/costs/guides/configuration.md)

---

## Basic Cost Tracking

```javascript
import { S3db } from 's3db.js';
import { CostsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

await s3db.connect();

const products = s3db.resources.products;

// Perform operations and track costs
await products.insert({ name: 'Widget A', price: 19.99 });
await products.insert({ name: 'Widget B', price: 29.99 });
await products.list();
await products.count();

// Analyze costs
const costs = s3db.client.costs;
console.log(`Operations performed: ${costs.requests.total}`);
console.log(`Total cost: $${costs.total.toFixed(6)}`);
console.log(`Most expensive operation: PUT (${costs.requests.counts.put} requests)`);

// Cost breakdown
console.log('\nCost breakdown:');
Object.entries(costs.requests.counts).forEach(([operation, count]) => {
  if (count > 0) {
    const operationCost = count * costs.requests.prices[operation];
    console.log(`  ${operation.toUpperCase()}: ${count} requests = $${operationCost.toFixed(6)}`);
  }
});
```

---

## Advanced Cost Monitoring

```javascript
import { S3db } from 's3db.js';
import { CostsPlugin } from 's3db.js';

class CostMonitor {
  constructor(s3db) {
    this.s3db = s3db;
    this.startTime = Date.now();
    this.checkpoints = [];
  }

  checkpoint(label) {
    const costs = { ...this.s3db.client.costs };
    const timestamp = Date.now();

    this.checkpoints.push({
      label,
      timestamp,
      costs,
      duration: timestamp - this.startTime
    });

    return costs;
  }

  report() {
    console.log('\n=== Cost Analysis Report ===');

    for (let i = 0; i < this.checkpoints.length; i++) {
      const checkpoint = this.checkpoints[i];
      const prevCheckpoint = i > 0 ? this.checkpoints[i - 1] : null;

      console.log(`\n${checkpoint.label}:`);
      console.log(`  Time: ${checkpoint.duration}ms`);
      console.log(`  Total cost: $${checkpoint.costs.total.toFixed(6)}`);

      if (prevCheckpoint) {
        const costDiff = checkpoint.costs.total - prevCheckpoint.costs.total;
        const requestDiff = checkpoint.costs.requests.total - prevCheckpoint.costs.requests.total;
        console.log(`  Cost increase: $${costDiff.toFixed(6)}`);
        console.log(`  New requests: ${requestDiff}`);
      }
    }

    // Efficiency metrics
    const finalCosts = this.checkpoints[this.checkpoints.length - 1].costs;
    const totalTime = this.checkpoints[this.checkpoints.length - 1].duration;

    console.log('\n=== Efficiency Metrics ===');
    console.log(`Total execution time: ${totalTime}ms`);
    console.log(`Total requests: ${finalCosts.requests.total}`);
    console.log(`Requests per second: ${(finalCosts.requests.total / (totalTime / 1000)).toFixed(2)}`);
    console.log(`Cost per request: $${(finalCosts.total / finalCosts.requests.total).toFixed(8)}`);
    console.log(`Monthly projection (1M ops): $${(finalCosts.total * 1000000).toFixed(2)}`);
  }
}

// Usage
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

await s3db.connect();

const monitor = new CostMonitor(s3db);
const users = s3db.resources.users;

// Bulk operations with cost tracking
monitor.checkpoint('Initial state');

// Bulk insert
const userData = Array.from({ length: 100 }, (_, i) => ({
  name: `User ${i}`,
  email: `user${i}@example.com`,
  role: i % 3 === 0 ? 'admin' : 'user'
}));

await users.insertMany(userData);
monitor.checkpoint('After bulk insert');

// Query operations
await users.count();
await users.list({ limit: 50 });
await users.list({ limit: 25, offset: 25 });
monitor.checkpoint('After queries');

// Generate detailed report
monitor.report();
```

---

## Cost Alerts and Monitoring

```javascript
// Set up cost monitoring with alerts
const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

await s3db.connect();

// Function to check cost thresholds
function checkCostThresholds(costs) {
  const thresholds = {
    warning: 0.01,  // $0.01
    critical: 0.05  // $0.05
  };

  if (costs.total >= thresholds.critical) {
    console.error(`CRITICAL: Cost threshold exceeded: $${costs.total.toFixed(6)}`);
    return 'critical';
  } else if (costs.total >= thresholds.warning) {
    console.warn(`WARNING: Cost threshold exceeded: $${costs.total.toFixed(6)}`);
    return 'warning';
  }

  return 'ok';
}

// Perform operations with monitoring
const users = s3db.resources.users;
await users.insertMany([
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' }
]);

// Check costs after operations
const alertLevel = checkCostThresholds(s3db.client.costs);

// Export detailed cost data
const costReport = {
  timestamp: new Date().toISOString(),
  alertLevel,
  costs: s3db.client.costs,
  projections: {
    dailyCost: s3db.client.costs.total * (24 * 60 * 60 * 1000) / Date.now(),
    monthlyCost: s3db.client.costs.total * 30,
    yearlyProjection: s3db.client.costs.total * 365
  }
};

console.log('Cost Report:', JSON.stringify(costReport, null, 2));
```

---

## Storage and Data Transfer Tracking

```javascript
import { S3db } from 's3db.js';
import { CostsPlugin } from 's3db.js';

const s3db = new S3db({
  connectionString: "s3://ACCESS_KEY:SECRET_KEY@BUCKET_NAME/databases/myapp",
  plugins: [CostsPlugin]
});

await s3db.connect();

// Configure for free tier (optional)
await CostsPlugin.setup(s3db, {
  considerFreeTier: true  // Enable 100GB/month free data transfer OUT
});

const products = s3db.resources.products;

// Perform operations that trigger storage and data transfer costs
for (let i = 0; i < 100; i++) {
  await products.insert({
    name: `Product ${i}`,
    description: 'A'.repeat(1024)  // 1KB of data per product
  });
}

// Retrieve data (triggers data transfer OUT)
const allProducts = await products.list({ limit: 100 });

// Check comprehensive cost breakdown
const costs = s3db.client.costs;

console.log('\n=== Complete Cost Breakdown ===');
console.log(`Total Cost: $${costs.total.toFixed(6)}`);
console.log(`\nRequests:`);
console.log(`  Total: ${costs.requests.total}`);
console.log(`  Subtotal: $${costs.requests.subtotal.toFixed(6)}`);
console.log(`  Operations:`, costs.requests.counts);

console.log(`\nStorage:`);
console.log(`  Total: ${costs.storage.totalGB.toFixed(2)} GB`);
console.log(`  Current Tier: ${costs.storage.currentTier + 1} (${costs.storage.tiers[costs.storage.currentTier].pricePerGB}/GB)`);
console.log(`  Monthly Cost: $${costs.storage.subtotal.toFixed(6)}`);

console.log(`\nData Transfer:`);
console.log(`  IN: ${costs.dataTransfer.inGB.toFixed(2)} GB (Free: $${costs.dataTransfer.inCost})`);
console.log(`  OUT: ${costs.dataTransfer.outGB.toFixed(2)} GB`);
console.log(`  Free Tier Used: ${costs.dataTransfer.freeTierUsed.toFixed(2)} GB of ${costs.dataTransfer.freeTierGB} GB`);
console.log(`  Current OUT Tier: ${costs.dataTransfer.currentTier + 1} (${costs.dataTransfer.tiers[costs.dataTransfer.currentTier].pricePerGB}/GB)`);
console.log(`  Transfer Cost: $${costs.dataTransfer.subtotal.toFixed(6)}`);
```

---

## Monthly Cost Projections

```javascript
// Calculate monthly cost projections based on current usage
function calculateMonthlyProjections(costs) {
  const now = Date.now();
  const sessionDuration = now - costs.sessionStart || now; // Assume session start tracked
  const secondsInMonth = 30 * 24 * 60 * 60;

  const projections = {
    requests: {
      monthlyTotal: (costs.requests.total / (sessionDuration / 1000)) * secondsInMonth,
      monthlyCost: (costs.requests.subtotal / (sessionDuration / 1000)) * secondsInMonth
    },
    storage: {
      currentGB: costs.storage.totalGB,
      monthlyCost: costs.storage.subtotal  // Already monthly
    },
    dataTransfer: {
      monthlyGB: (costs.dataTransfer.outGB / (sessionDuration / 1000)) * secondsInMonth,
      monthlyCost: (costs.dataTransfer.subtotal / (sessionDuration / 1000)) * secondsInMonth,
      withinFreeTier: costs.dataTransfer.outGB < costs.dataTransfer.freeTierGB
    },
    total: {
      monthlyCost:
        ((costs.requests.subtotal + costs.dataTransfer.subtotal) / (sessionDuration / 1000)) * secondsInMonth +
        costs.storage.subtotal
    }
  };

  console.log('\n=== Monthly Cost Projections ===');
  console.log(`Requests: ~${projections.requests.monthlyTotal.toFixed(0)} ops → $${projections.requests.monthlyCost.toFixed(2)}`);
  console.log(`Storage: ${projections.storage.currentGB.toFixed(2)} GB → $${projections.storage.monthlyCost.toFixed(2)}`);
  console.log(`Data Transfer OUT: ~${projections.dataTransfer.monthlyGB.toFixed(2)} GB → $${projections.dataTransfer.monthlyCost.toFixed(2)}`);
  console.log(`\nTotal Monthly Projection: $${projections.total.monthlyCost.toFixed(2)}`);

  return projections;
}

// Usage
const projections = calculateMonthlyProjections(s3db.client.costs);
```

---

## Budget Monitoring Class

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

---

## Export Cost Data

```javascript
// Function to export cost data in various formats
function exportCostData(s3db, format = 'json') {
  const costs = s3db.client.costs;
  const timestamp = new Date().toISOString();

  const data = {
    timestamp,
    costs,
    analysis: {
      mostFrequentOperation: Object.entries(costs.requests.counts)
        .filter(([op]) => op !== 'total')
        .sort(([,a], [,b]) => b - a)[0]?.[0],
      costPerRequest: costs.total / costs.requests.total,
      efficiency: costs.requests.total / costs.total // requests per dollar
    }
  };

  if (format === 'csv') {
    // Convert to CSV format for spreadsheet analysis
    const csv = [
      'Timestamp,Operation,Requests,Cost',
      ...Object.entries(costs.requests.counts)
        .filter(([op]) => op !== 'total')
        .map(([op, count]) =>
          `${timestamp},${op},${count},${(count * costs.requests.prices[op]).toFixed(8)}`
        )
    ].join('\n');
    return csv;
  }

  return JSON.stringify(data, null, 2);
}
```

---

## Performance vs Cost Comparison

```javascript
// Compare different approaches and their costs
async function compareApproaches(s3db) {
  const users = s3db.resources.users;

  // Reset cost tracking
  Object.keys(s3db.client.costs.requests).forEach(key => {
    s3db.client.costs.requests[key] = 0;
  });
  s3db.client.costs.total = 0;

  // Approach 1: Individual inserts
  console.time('Individual inserts');
  for (let i = 0; i < 10; i++) {
    await users.insert({ name: `User ${i}` });
  }
  console.timeEnd('Individual inserts');
  const individualCost = s3db.client.costs.total;

  // Reset for next test
  Object.keys(s3db.client.costs.requests).forEach(key => {
    s3db.client.costs.requests[key] = 0;
  });
  s3db.client.costs.total = 0;

  // Approach 2: Batch insert
  console.time('Batch insert');
  const batchData = Array.from({ length: 10 }, (_, i) => ({ name: `Batch User ${i}` }));
  await users.insertMany(batchData);
  console.timeEnd('Batch insert');
  const batchCost = s3db.client.costs.total;

  console.log(`Individual inserts cost: $${individualCost.toFixed(6)}`);
  console.log(`Batch insert cost: $${batchCost.toFixed(6)}`);
  console.log(`Savings with batch: $${(individualCost - batchCost).toFixed(6)}`);
}
```

---

## See Also

- [Configuration](/plugins/costs/guides/configuration.md) - Detailed configuration options
- [Cost Optimization](/plugins/costs/guides/cost-optimization.md) - Reduce costs with proven strategies
- [Best Practices](/plugins/costs/guides/best-practices.md) - Recommendations and FAQ

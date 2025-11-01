# ReconPlugin - Uptime Behavior

**Monitor target availability and track uptime metrics**

---

## 📊 Overview

The **Uptime Behavior** provides continuous monitoring of target availability with:
- **Periodic health checks** via ping, HTTP, and DNS
- **Uptime percentage calculation** based on historical checks
- **Downtime detection** with configurable thresholds
- **Event-driven alerts** when targets go down/up
- **Historical tracking** with persistent storage

---

## 🚀 Quick Start

### Enable Uptime Behavior

```javascript
import { Database } from 's3db.js';
import { ReconPlugin } from 's3db.js/plugins/recon';

const db = new Database({ connectionString: 'http://user:pass@localhost:9000/bucket' });
await db.connect();

const plugin = new ReconPlugin({
  behaviors: {
    uptime: {
      enabled: true,
      interval: 60000,              // Check every 60 seconds
      methods: ['ping', 'http'],    // Health check methods
      alertOnDowntime: true,         // Alert when down
      downtimeThreshold: 3,          // 3 failed checks = downtime
      timeout: 5000,                 // 5 second timeout per check
      retainHistory: 30 * 24 * 60 * 60 * 1000  // 30 days
    }
  }
});

await db.use(plugin);
```

### Start Monitoring

```javascript
// Start monitoring a target
await plugin.startUptimeMonitoring('example.com');

// Get current status
const status = plugin.getUptimeStatus('example.com');
console.log(`Uptime: ${status.uptimePercentage}%`);
console.log(`Status: ${status.status} (${status.isDown ? 'DOWN' : 'UP'})`);
console.log(`Total Checks: ${status.totalChecks}`);
console.log(`Successful: ${status.successfulChecks}`);
console.log(`Failed: ${status.failedChecks}`);
```

---

## ⚙️ Configuration

### Full Configuration Options

```javascript
{
  behaviors: {
    uptime: {
      enabled: false,                    // Enable/disable uptime monitoring
      interval: 60000,                   // Check interval in milliseconds (default: 60s)
      methods: ['ping', 'http', 'dns'],  // Health check methods to use
      alertOnDowntime: true,              // Emit events when downtime detected
      downtimeThreshold: 3,               // Failed checks before considered down
      timeout: 5000,                      // Timeout per check in milliseconds
      retainHistory: 30 * 24 * 60 * 60 * 1000  // History retention (default: 30 days)
    }
  }
}
```

### Check Methods

| Method | Description | Use Case |
|--------|-------------|----------|
| `ping` | ICMP ping | Network layer connectivity |
| `http` | HTTP/HTTPS GET request | Web service availability |
| `dns` | DNS A record resolution | DNS availability |

**Recommendation**: Use `['ping', 'http']` for web services, `['dns']` for passive monitoring.

---

## 🔌 API Reference

### `startUptimeMonitoring(target)`

Start monitoring a target's uptime.

```javascript
const status = await plugin.startUptimeMonitoring('example.com');
// Returns initial status object
```

**Parameters**:
- `target` (string|object): Target URL/domain or normalized target object

**Returns**: Promise<UptimeStatus>

---

### `stopUptimeMonitoring(host)`

Stop monitoring a target.

```javascript
plugin.stopUptimeMonitoring('example.com');
```

**Parameters**:
- `host` (string): Target hostname

---

### `getUptimeStatus(host)`

Get current uptime status for a target.

```javascript
const status = plugin.getUptimeStatus('example.com');
```

**Returns**: UptimeStatus object

```javascript
{
  host: 'example.com',
  status: 'up',                  // 'up', 'down', 'unknown'
  uptimePercentage: '99.85',     // Uptime as percentage string
  totalChecks: 1440,             // Total checks performed
  successfulChecks: 1438,        // Successful checks
  failedChecks: 2,               // Failed checks
  lastCheck: '2025-01-01T12:00:00.000Z',
  lastUp: '2025-01-01T12:00:00.000Z',
  lastDown: '2025-01-01T06:30:00.000Z',  // null if never down
  consecutiveFails: 0,           // Current consecutive failures
  consecutiveSuccess: 120,       // Current consecutive successes
  isDown: false,                 // Boolean: threshold reached?
  recentHistory: [               // Last 10 checks
    {
      timestamp: '2025-01-01T12:00:00.000Z',
      status: 'up',
      methods: {
        ping: { status: 'ok', latency: 15.2, duration: 20 },
        http: { status: 'ok', statusCode: 200, duration: 145 }
      }
    },
    // ... more entries
  ]
}
```

---

### `getAllUptimeStatuses()`

Get uptime statuses for all monitored targets.

```javascript
const allStatuses = plugin.getAllUptimeStatuses();
// Returns array of UptimeStatus objects
```

**Returns**: Array<UptimeStatus>

---

### `loadUptimeStatus(host)`

Load historical status from persistent storage.

```javascript
const historicalStatus = await plugin.loadUptimeStatus('example.com');
```

**Returns**: Promise<StoredStatus>

```javascript
{
  host: 'example.com',
  status: 'up',
  totalChecks: 1440,
  successfulChecks: 1438,
  failedChecks: 2,
  uptimePercentage: '99.85',
  lastCheck: '2025-01-01T12:00:00.000Z',
  lastUp: '2025-01-01T12:00:00.000Z',
  lastDown: null,
  consecutiveFails: 0,
  consecutiveSuccess: 120,
  updatedAt: '2025-01-01T12:00:00.000Z'
}
```

---

## 📡 Events

### `uptime:transition`

Emitted when a target transitions between up/down states.

```javascript
plugin.on('uptime:transition', (transition) => {
  console.log(`${transition.host}: ${transition.from} → ${transition.to}`);

  // Send alert to Slack, PagerDuty, etc.
  if (transition.to === 'down') {
    sendAlert(`⚠️ ${transition.host} is DOWN!`);
  } else if (transition.to === 'up') {
    sendAlert(`✅ ${transition.host} is back UP!`);
  }
});
```

**Event Data**:
```javascript
{
  host: 'example.com',
  from: 'up',                    // Previous status
  to: 'down',                    // New status
  timestamp: '2025-01-01T12:00:00.000Z',
  checkResults: {                // Results from the check that triggered transition
    timestamp: '2025-01-01T12:00:00.000Z',
    overallStatus: 'down',
    methods: {
      ping: { status: 'timeout', error: 'Ping timeout', duration: 5000 },
      http: { status: 'error', error: 'ECONNREFUSED', duration: 234 }
    }
  }
}
```

---

## 💾 Storage Structure

Uptime data is stored in plugin storage:

```
plugin=recon/uptime/
├── example.com/
│   ├── status.json              # Current status (updated every check)
│   └── transitions/
│       ├── 2025-01-01T06-30-00-000Z.json  # up → down transition
│       └── 2025-01-01T06-45-00-000Z.json  # down → up transition
├── github.com/
│   ├── status.json
│   └── transitions/
│       └── ...
└── ...
```

### status.json

```json
{
  "host": "example.com",
  "status": "up",
  "totalChecks": 1440,
  "successfulChecks": 1438,
  "failedChecks": 2,
  "uptimePercentage": "99.85",
  "lastCheck": "2025-01-01T12:00:00.000Z",
  "lastUp": "2025-01-01T12:00:00.000Z",
  "lastDown": "2025-01-01T06:30:00.000Z",
  "consecutiveFails": 0,
  "consecutiveSuccess": 120,
  "updatedAt": "2025-01-01T12:00:00.000Z"
}
```

### transitions/*.json

```json
{
  "host": "example.com",
  "from": "up",
  "to": "down",
  "timestamp": "2025-01-01T06:30:00.000Z",
  "checkResults": {
    "timestamp": "2025-01-01T06:30:00.000Z",
    "overallStatus": "down",
    "methods": {
      "ping": {
        "status": "timeout",
        "error": "Ping timeout",
        "duration": 5000
      },
      "http": {
        "status": "error",
        "error": "ECONNREFUSED",
        "duration": 234
      }
    }
  }
}
```

---

## 📊 Use Cases

### 1. Monitoring Production Services

```javascript
const plugin = new ReconPlugin({
  behaviors: {
    uptime: {
      enabled: true,
      interval: 30000,              // Every 30 seconds
      methods: ['http', 'dns'],
      alertOnDowntime: true,
      downtimeThreshold: 2          // Alert after 2 failed checks (1 minute)
    }
  }
});

// Monitor critical services
await plugin.startUptimeMonitoring('https://api.example.com');
await plugin.startUptimeMonitoring('https://web.example.com');
await plugin.startUptimeMonitoring('https://cdn.example.com');

// Alert on downtime
plugin.on('uptime:transition', async (transition) => {
  if (transition.to === 'down') {
    await sendSlackAlert({
      channel: '#alerts',
      text: `🚨 ${transition.host} is DOWN!`,
      attachments: [{
        color: 'danger',
        fields: [
          { title: 'Host', value: transition.host },
          { title: 'Status', value: `${transition.from} → ${transition.to}` },
          { title: 'Time', value: transition.timestamp }
        ]
      }]
    });
  }
});
```

---

### 2. SLA Reporting

```javascript
// Generate monthly uptime report
async function generateUptimeReport(host, month) {
  const status = await plugin.loadUptimeStatus(host);

  return {
    host,
    month,
    uptimePercentage: status.uptimePercentage,
    totalChecks: status.totalChecks,
    totalDowntime: status.failedChecks * (plugin.config.behaviors.uptime.interval / 1000), // seconds
    slaTarget: 99.9,
    slaMet: parseFloat(status.uptimePercentage) >= 99.9
  };
}

const report = await generateUptimeReport('api.example.com', '2025-01');
console.log(`SLA Met: ${report.slaMet ? '✅' : '❌'}`);
console.log(`Uptime: ${report.uptimePercentage}%`);
console.log(`Total Downtime: ${report.totalDowntime}s`);
```

---

### 3. Integration with Scheduled Scans

```javascript
// Add targets with uptime monitoring + scheduled scans
const targets = [
  'https://example.com',
  'https://api.example.com',
  'https://cdn.example.com'
];

for (const target of targets) {
  // Start uptime monitoring
  await plugin.startUptimeMonitoring(target);

  // Schedule daily reconnaissance scans
  await plugin.addTarget(target, '0 2 * * *'); // 2 AM daily
}

// Combined view: uptime + scan history
const dynamicTargets = await plugin.listTargets();
for (const target of dynamicTargets) {
  const uptimeStatus = plugin.getUptimeStatus(target.host);
  const reports = await plugin.getReportsByHost(target.host, { limit: 5 });

  console.log(`\n${target.host}:`);
  console.log(`  Uptime: ${uptimeStatus.uptimePercentage}%`);
  console.log(`  Last Scan: ${reports[0]?.timestamp}`);
  console.log(`  Scan Count: ${target.scanCount}`);
  console.log(`  Open Ports: ${reports[0]?.fingerprint?.attackSurface?.openPorts?.length || 0}`);
}
```

---

### 4. Multi-Region Monitoring

```javascript
// Monitor same service from multiple regions
const regions = [
  { name: 'us-east', checker: 'ping' },
  { name: 'eu-west', checker: 'http' },
  { name: 'ap-south', checker: 'dns' }
];

const target = 'example.com';

// Start monitoring with different methods per region
for (const region of regions) {
  const regionalPlugin = new ReconPlugin({
    behaviors: {
      uptime: {
        enabled: true,
        methods: [region.checker],
        interval: 60000
      }
    }
  });

  await regionalPlugin.startUptimeMonitoring(target);

  // Tag with region
  regionalPlugins.set(region.name, regionalPlugin);
}

// Compare uptime across regions
for (const [regionName, regionalPlugin] of regionalPlugins) {
  const status = regionalPlugin.getUptimeStatus(target);
  console.log(`${regionName}: ${status.uptimePercentage}% uptime`);
}
```

---

## 🔧 Advanced Configuration

### Custom Alert Handler

```javascript
class CustomAlertHandler {
  async sendAlert(transition) {
    const severity = this.calculateSeverity(transition);

    switch (severity) {
      case 'critical':
        await this.sendPagerDutyAlert(transition);
        await this.sendSlackAlert(transition);
        await this.sendEmailAlert(transition);
        break;
      case 'warning':
        await this.sendSlackAlert(transition);
        break;
      default:
        console.log('Minor transition, no alert needed');
    }
  }

  calculateSeverity(transition) {
    const status = plugin.getUptimeStatus(transition.host);

    if (status.consecutiveFails >= 10) return 'critical';
    if (status.consecutiveFails >= 5) return 'warning';
    return 'info';
  }
}

const alertHandler = new CustomAlertHandler();

plugin.on('uptime:transition', async (transition) => {
  await alertHandler.sendAlert(transition);
});
```

---

## 🎯 Best Practices

1. **Choose appropriate check interval**:
   - Production services: 30-60 seconds
   - Internal services: 2-5 minutes
   - External monitoring: 5-10 minutes

2. **Select check methods wisely**:
   - Use `http` for web services (most accurate)
   - Use `ping` for network devices
   - Use `dns` for passive monitoring

3. **Set realistic thresholds**:
   - `downtimeThreshold: 3` = 3 minutes at 60s interval
   - Balance between false positives and quick detection

4. **Retain history appropriately**:
   - 30 days for production SLA reporting
   - 7 days for development environments
   - Longer retention increases storage costs

5. **Monitor your monitoring**:
   ```javascript
   const statuses = plugin.getAllUptimeStatuses();
   const staleChecks = statuses.filter(s => {
     const lastCheckTime = new Date(s.lastCheck).getTime();
     return Date.now() - lastCheckTime > 10 * 60 * 1000; // 10 minutes
   });

   if (staleChecks.length > 0) {
     console.warn('Uptime monitoring may be stuck!', staleChecks);
   }
   ```

---

## 🐛 Troubleshooting

### Monitoring not starting

```javascript
// Check if behavior is enabled
if (!plugin.uptimeBehavior) {
  console.error('Uptime behavior not enabled!');
  console.log('Set config.behaviors.uptime.enabled = true');
}
```

### No transition events

```javascript
// Verify event listener is registered BEFORE starting monitoring
plugin.on('uptime:transition', (t) => console.log(t));
await plugin.startUptimeMonitoring('example.com');
```

### High memory usage

```javascript
// Reduce history retention
{
  behaviors: {
    uptime: {
      retainHistory: 7 * 24 * 60 * 60 * 1000  // 7 days instead of 30
    }
  }
}
```

---

## 📚 Related Documentation

- [ReconPlugin Overview](./recon.md)
- [Storage Architecture](./recon-storage-insights.md)
- [Scheduled Scanning](./recon-scheduling.md)
- [Event System](./recon-events.md)

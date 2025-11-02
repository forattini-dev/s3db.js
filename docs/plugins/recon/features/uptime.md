# Uptime Monitoring

Monitor target availability and track uptime metrics with continuous health checks.

## Overview

The Uptime feature provides:
- **Periodic health checks** via ping, HTTP, and DNS
- **Uptime percentage calculation** based on historical checks
- **Downtime detection** with configurable thresholds
- **Event-driven alerts** when targets go down/up
- **Historical tracking** with persistent storage

## Configuration

```javascript
const plugin = new ReconPlugin({
  behaviors: {
    uptime: {
      enabled: true,
      interval: 60000,              // Check every 60 seconds
      methods: ['ping', 'http'],    // Health check methods
      alertOnDowntime: true,        // Alert when down
      downtimeThreshold: 3,         // 3 failed checks = downtime
      timeout: 5000,                // 5 second timeout per check
      retainHistory: 30 * 24 * 60 * 60 * 1000  // 30 days
    }
  }
});
```

## Usage

### Start Monitoring

```javascript
// Start monitoring a target
await plugin.startUptimeMonitoring('example.com');

// Monitor multiple targets
await plugin.startUptimeMonitoring(['example.com', 'api.example.com']);
```

### Check Current Status

```javascript
// Get uptime metrics
const metrics = await plugin.getUptimeMetrics('example.com');
console.log(metrics);
// {
//   target: 'example.com',
//   uptime: 99.8,        // Percentage
//   totalChecks: 1440,   // 24 hours at 1min intervals
//   successfulChecks: 1437,
//   failedChecks: 3,
//   lastCheck: '2025-11-02T14:30:00Z',
//   status: 'up',
//   lastDowntime: '2025-11-01T03:15:00Z'
// }
```

### Query Historical Data

```javascript
// Get uptime history for last 7 days
const history = await plugin.getUptimeHistory('example.com', {
  from: Date.now() - (7 * 24 * 60 * 60 * 1000),
  to: Date.now()
});

history.forEach(check => {
  console.log(`${check.timestamp}: ${check.status} (${check.responseTime}ms)`);
});
```

### Stop Monitoring

```javascript
// Stop monitoring a target
await plugin.stopUptimeMonitoring('example.com');
```

## Events

Listen to uptime events:

```javascript
// Target went down
plugin.on('uptime.down', ({ target, failedChecks, lastSuccess }) => {
  console.error(`🔴 ${target} is DOWN (${failedChecks} failed checks)`);
  // Send alert, create incident, etc.
});

// Target came back up
plugin.on('uptime.up', ({ target, downtime }) => {
  console.log(`🟢 ${target} is UP (was down for ${downtime}ms)`);
});

// Health check completed
plugin.on('uptime.check', ({ target, status, responseTime, method }) => {
  console.log(`${target}: ${status} via ${method} (${responseTime}ms)`);
});
```

## Aggregation

Uptime data is automatically aggregated for performance:

- **Hourly**: Last 7 days
- **Daily**: Last 30 days
- **Weekly**: Last 6 months
- **Monthly**: Forever

Raw data is retained based on `retainHistory` setting, then aggregated and purged.

### Query Aggregated Data

```javascript
// Get daily aggregates
const dailyUptime = await plugin.getUptimeAggregates('example.com', {
  granularity: 'daily',
  from: Date.now() - (30 * 24 * 60 * 60 * 1000)
});

dailyUptime.forEach(day => {
  console.log(`${day.date}: ${day.uptime}% (${day.totalChecks} checks)`);
});
```

## Health Check Methods

### ping

Basic ICMP ping to check if host is reachable.

```javascript
uptime: {
  methods: ['ping'],
  timeout: 5000  // 5 seconds
}
```

### http

HTTP/HTTPS request to check web service availability.

```javascript
uptime: {
  methods: ['http'],
  httpOptions: {
    expectedStatus: [200, 301, 302],
    followRedirects: true,
    validateSSL: true
  }
}
```

### dns

DNS resolution check to verify domain is resolvable.

```javascript
uptime: {
  methods: ['dns'],
  dnsOptions: {
    recordType: 'A',
    expectedRecords: ['1.2.3.4']
  }
}
```

## Best Practices

1. **Set appropriate intervals**: Don't check too frequently (60s is reasonable)
2. **Use multiple methods**: Combine ping + http for comprehensive monitoring
3. **Configure thresholds**: Set `downtimeThreshold` to avoid false alarms
4. **Monitor aggregates**: Use daily/weekly aggregates for dashboards
5. **Clean old data**: Set reasonable `retainHistory` value

## Performance

- Each health check runs asynchronously
- Multiple targets monitored in parallel
- Aggregation runs automatically every hour
- Raw data auto-purged after retention period
- O(1) lookups via partitions

## See Also

- [Targets](./targets.md) - Target management
- [Storage](./storage.md) - Data storage architecture
- [Examples](../examples/) - Working code samples

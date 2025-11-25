# Frequently Asked Questions

> Common questions about the WebSocket Plugin

[← Back to WebSocket Plugin](./README.md)

---

## Table of Contents

- [General](#general)
- [Connection](#connection)
- [Authentication](#authentication)
- [Subscriptions](#subscriptions)
- [Performance](#performance)
- [Security](#security)
- [Integration](#integration)
- [Troubleshooting](#troubleshooting)

---

## General

### What is the WebSocket Plugin?

The WebSocket Plugin provides real-time bidirectional communication for s3db.js resources. It allows clients to:
- Subscribe to resource changes (insert/update/delete)
- Perform CRUD operations via WebSocket
- Send custom messages to other clients
- Receive push notifications

### How does it compare to the API Plugin?

| Feature | API Plugin | WebSocket Plugin |
|---------|------------|------------------|
| Protocol | HTTP/REST | WebSocket |
| Connection | Request/response | Persistent |
| Real-time | Polling required | Native push |
| Use case | General API | Real-time apps |
| Overhead | Higher (per request) | Lower (persistent) |

**Best practice**: Use both! API Plugin for traditional REST operations, WebSocket for real-time features.

### Which resources should I expose via WebSocket?

Expose resources that benefit from real-time updates:
- Chat messages
- Notifications
- Live metrics/analytics
- Collaborative documents
- Game state
- IoT sensor data

Avoid exposing:
- Large static data
- Infrequently changing data
- Sensitive internal resources

---

## Connection

### How do clients connect?

```javascript
// Browser
const ws = new WebSocket('ws://localhost:3001?token=YOUR_TOKEN');

// Node.js
import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:3001', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});
```

### How do I handle reconnection?

```javascript
function connect() {
  const ws = new WebSocket(url);

  ws.onclose = (event) => {
    if (event.code !== 1000) {  // Abnormal close
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      setTimeout(connect, delay);
      reconnectAttempts++;
    }
  };

  ws.onopen = () => {
    reconnectAttempts = 0;
    resubscribe();  // Re-establish subscriptions
  };
}
```

### What's the maximum number of connections?

Default Node.js supports ~10,000 concurrent connections. To increase:

1. Increase file descriptor limit:
```bash
ulimit -n 65535
```

2. Use clustering:
```javascript
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
} else {
  // Start WebSocket server
}
```

3. Use a load balancer with sticky sessions.

### How do I run on a different port?

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 8080,  // Custom port
  host: '0.0.0.0'
});
```

### Can I run WebSocket and API on the same port?

Not directly with this plugin. Options:

1. Use different ports (recommended):
```javascript
const apiPlugin = new ApiPlugin({ port: 3000 });
const wsPlugin = new WebSocketPlugin({ port: 3001 });
```

2. Use a reverse proxy (nginx, Caddy):
```nginx
location /ws {
  proxy_pass http://localhost:3001;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}

location / {
  proxy_pass http://localhost:3000;
}
```

---

## Authentication

### Is authentication required?

No, but strongly recommended for production:

```javascript
auth: {
  required: true,  // Reject unauthenticated connections
  drivers: [/* ... */]
}
```

### How do I pass the token?

1. **Query parameter** (most reliable for WebSocket):
```javascript
ws://localhost:3001?token=YOUR_TOKEN
```

2. **Authorization header** (Node.js only):
```javascript
const ws = new WebSocket(url, {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});
```

### Can I use multiple auth methods?

Yes! Configure multiple drivers:

```javascript
auth: {
  drivers: [
    { driver: 'jwt', config: { secret: '...' } },
    { driver: 'apiKey', config: { keys: { ... } } }
  ]
}
```

The server tries each driver until one succeeds.

### How do I refresh an expired token?

WebSocket doesn't support changing headers after connection. Options:

1. **Reconnect with new token**:
```javascript
async function refreshAndReconnect() {
  const newToken = await refreshToken();
  ws.close();
  ws = new WebSocket(`${url}?token=${newToken}`);
}
```

2. **Use long-lived WebSocket tokens** with short-lived API tokens.

3. **Send token in message** (custom implementation):
```javascript
ws.send(JSON.stringify({
  type: 'refresh_token',
  token: newToken
}));
```

---

## Subscriptions

### How do subscriptions work?

1. Client sends subscribe request
2. Server registers subscription
3. When resource changes, server pushes event to subscribers
4. Events are filtered by subscription criteria

### Can I subscribe with filters?

Yes:

```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  resource: 'messages',
  filter: { channel: 'general', userId: 'user-123' }
}));
```

Only events matching the filter are sent.

### How do I unsubscribe?

```javascript
ws.send(JSON.stringify({
  type: 'unsubscribe',
  resource: 'messages',
  filter: { channel: 'general' }  // Must match original
}));
```

### What happens when I disconnect?

All subscriptions are automatically removed. You must resubscribe after reconnecting.

### Can I subscribe to multiple resources?

Yes, send multiple subscribe messages:

```javascript
['messages', 'notifications', 'users'].forEach(resource => {
  ws.send(JSON.stringify({ type: 'subscribe', resource }));
});
```

---

## Performance

### What's the latency for events?

Typically <5ms from resource change to client notification (on same network).

### How much memory does each connection use?

Approximately 2-4KB per connection for basic metadata. More if:
- Many subscriptions per client
- Large user objects
- Custom metadata stored

### How do I reduce message size?

1. **Use protected fields** to exclude unnecessary data:
```javascript
protected: ['largeField', 'internalData']
```

2. **Subscribe with filters** to reduce events.

3. **Use pagination** for list operations:
```javascript
{ type: 'list', resource: 'messages', limit: 20 }
```

### How do I handle high-traffic resources?

1. **Enable rate limiting**:
```javascript
rateLimit: { enabled: true, maxRequests: 100, windowMs: 60000 }
```

2. **Debounce/throttle on client**:
```javascript
const throttledSend = throttle((data) => ws.send(data), 100);
```

3. **Batch updates on server** (custom implementation).

---

## Security

### Is data encrypted?

WebSocket itself doesn't encrypt. Use WSS (WebSocket Secure):

```javascript
// Client
const ws = new WebSocket('wss://api.example.com');

// Server (with SSL termination at proxy)
// or configure with https server
```

### How do I prevent unauthorized access?

1. **Require authentication**:
```javascript
auth: { required: true }
```

2. **Use guards** for fine-grained control:
```javascript
guard: {
  list: async (user) => ({ ownerId: user.id }),
  get: async (user, ctx) => user.role === 'admin'
}
```

3. **Filter sensitive fields**:
```javascript
protected: ['password', 'apiToken', 'ssn']
```

### Can clients see other clients' data?

Only if guards allow it. Default: full access. Always configure guards for production.

### How do I prevent DoS attacks?

1. **Rate limiting** (built-in):
```javascript
rateLimit: { enabled: true, maxRequests: 100 }
```

2. **Max payload size** (built-in):
```javascript
maxPayloadSize: 64 * 1024  // 64KB
```

3. **Connection limits** (implement in load balancer).

4. **IP blocking** (implement at network level).

---

## Integration

### Can I use with React/Vue/Angular?

Yes! See [Client Protocol Guide](./guides/client-protocol.md) for examples.

**React example**:
```javascript
const [messages, setMessages] = useState([]);

useEffect(() => {
  const ws = new WebSocket(url);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'event') {
      setMessages(prev => [...prev, msg.data]);
    }
  };
  return () => ws.close();
}, []);
```

### Can I use with the API Plugin?

Absolutely! They complement each other:

```javascript
const apiPlugin = new ApiPlugin({ port: 3000 });
const wsPlugin = new WebSocketPlugin({ port: 3001 });

await db.usePlugin(apiPlugin);
await db.usePlugin(wsPlugin);
```

- Use API for: Authentication endpoints, file uploads, complex queries
- Use WebSocket for: Real-time updates, subscriptions, live data

### How do I broadcast from outside WebSocket?

Use the plugin methods:

```javascript
// In your API route or background job
wsPlugin.broadcast({
  type: 'notification',
  message: 'System update complete'
});

// To specific resource subscribers
wsPlugin.broadcastToResource('alerts', {
  type: 'alert',
  severity: 'warning',
  message: 'High CPU usage detected'
});

// To specific client
wsPlugin.sendToClient(clientId, {
  type: 'private',
  data: 'Hello!'
});
```

### Can I use with Redis for scaling?

The plugin doesn't have built-in Redis support yet. For horizontal scaling:

1. **Use sticky sessions** at load balancer.

2. **Implement pub/sub manually**:
```javascript
import Redis from 'ioredis';

const pub = new Redis();
const sub = new Redis();

// When resource changes, publish to Redis
db.resources.messages.on('insert', (data) => {
  pub.publish('messages:insert', JSON.stringify(data));
});

// Subscribe to Redis and broadcast
sub.subscribe('messages:insert');
sub.on('message', (channel, message) => {
  wsPlugin.broadcastToResource('messages', {
    type: 'event',
    event: 'insert',
    data: JSON.parse(message)
  });
});
```

---

## Troubleshooting

### Connection closes immediately

**Causes**:
1. Invalid token
2. Port in use
3. Firewall blocking

**Solutions**:
```javascript
ws.onclose = (event) => {
  console.log('Close code:', event.code);
  console.log('Close reason:', event.reason);
};

// Check server logs
const wsPlugin = new WebSocketPlugin({
  logLevel: 'debug'  // Enable verbose logging
});
```

### Events not being received

**Checklist**:
1. Is resource in `resources` config?
2. Did you send `subscribe` message?
3. Is subscription filter matching?
4. Are guards blocking?

**Debug**:
```javascript
// Log all messages
ws.onmessage = (e) => console.log('Received:', e.data);

// Check server subscriptions
console.log(wsPlugin.getServerInfo());
```

### "RATE_LIMIT_EXCEEDED" error

You're sending too many messages. Options:

1. Increase limit:
```javascript
rateLimit: { maxRequests: 500 }
```

2. Throttle client:
```javascript
const throttledSend = throttle(ws.send.bind(ws), 100);
```

3. Batch messages.

### High memory usage

**Causes**:
- Too many connections
- Large messages
- Memory leaks in handlers

**Solutions**:
1. Monitor with `wsPlugin.getMetrics()`.
2. Implement connection limits.
3. Reduce `maxPayloadSize`.
4. Profile with Node.js inspector.

### Guards not working as expected

**Debug**:
```javascript
guard: {
  list: async (user, ctx) => {
    console.log('Guard called with:', { user, ctx });
    // ... your logic
  }
}
```

**Common issues**:
- Guard returns `undefined` (falsy) instead of `true`
- Async guard doesn't return a value
- Guard throws an error (becomes FORBIDDEN)

---

## Still Need Help?

1. Check [GitHub Issues](https://github.com/forattini-dev/s3db.js/issues)
2. Enable debug logging: `logLevel: 'debug'`
3. Review [examples](./examples/README.md)

---

[← Back to WebSocket Plugin](./README.md)

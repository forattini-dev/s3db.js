# Client Protocol Guide

> Complete guide to the WebSocket message protocol

[← Back to WebSocket Plugin](../README.md)

---

## Table of Contents

- [Overview](#overview)
- [Connection Lifecycle](#connection-lifecycle)
- [Message Format](#message-format)
- [Client Messages](#client-messages)
- [Server Messages](#server-messages)
- [Error Handling](#error-handling)
- [Client Implementation Examples](#client-implementation-examples)

---

## Overview

The WebSocket plugin uses a JSON-based message protocol for client-server communication. All messages are JSON objects with a `type` field that identifies the message kind.

### Key Concepts

- **Request-Response**: Client sends a request, server sends a response
- **Subscriptions**: Client subscribes to resources, server pushes events
- **Bidirectional**: Both client and server can initiate messages
- **Stateful**: Server tracks client subscriptions and authentication

---

## Connection Lifecycle

```
┌─────────┐                              ┌─────────┐
│  Client │                              │  Server │
└────┬────┘                              └────┬────┘
     │                                        │
     │──────── WebSocket Connect ────────────>│
     │        (with auth token)               │
     │                                        │
     │<─────── connected ────────────────────│
     │        {clientId, user, timestamp}     │
     │                                        │
     │──────── subscribe ───────────────────>│
     │        {resource, filter}              │
     │                                        │
     │<─────── subscribed ───────────────────│
     │                                        │
     │<─────── event ────────────────────────│  (push)
     │        {resource, event, data}         │
     │                                        │
     │──────── get/list/insert/... ─────────>│
     │                                        │
     │<─────── data/error ───────────────────│
     │                                        │
     │        ← Server ping ←                 │
     │        → Client pong →                 │
     │                                        │
     │──────── close ───────────────────────>│
     │                                        │
```

### Connection States

| State | Description |
|-------|-------------|
| `CONNECTING` | WebSocket handshake in progress |
| `OPEN` | Connected, can send/receive messages |
| `CLOSING` | Close handshake in progress |
| `CLOSED` | Connection terminated |

---

## Message Format

### Base Structure

All messages follow this structure:

```typescript
interface BaseMessage {
  type: string;         // Required: Message type identifier
  requestId?: string;   // Optional: Echoed in responses
}
```

### Using Request IDs

Request IDs allow you to match responses to requests:

```javascript
// Client sends
{
  "type": "get",
  "requestId": "req-123",
  "resource": "users",
  "id": "user-456"
}

// Server responds
{
  "type": "data",
  "requestId": "req-123",  // Same ID echoed back
  "resource": "users",
  "data": { "id": "user-456", "name": "John" }
}
```

**Best Practice**: Generate unique request IDs and track pending requests:

```javascript
const pending = new Map();
let requestCounter = 0;

function sendRequest(message) {
  const requestId = `req-${++requestCounter}`;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ ...message, requestId }));

    // Timeout after 30s
    setTimeout(() => {
      if (pending.has(requestId)) {
        pending.delete(requestId);
        reject(new Error('Request timeout'));
      }
    }, 30000);
  });
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.requestId && pending.has(msg.requestId)) {
    const { resolve, reject } = pending.get(msg.requestId);
    pending.delete(msg.requestId);

    if (msg.type === 'error') {
      reject(new Error(msg.message));
    } else {
      resolve(msg);
    }
  }
};
```

---

## Client Messages

### subscribe

Subscribe to resource changes.

```javascript
{
  "type": "subscribe",
  "requestId": "sub-1",
  "resource": "messages",              // Required: Resource name
  "filter": { "channel": "general" },  // Optional: Filter criteria
  "events": ["insert", "update"]       // Optional: Events to receive (default: all)
}
```

**Response:**
```javascript
{
  "type": "subscribed",
  "requestId": "sub-1",
  "resource": "messages",
  "filter": { "channel": "general" },
  "events": ["insert", "update"]
}
```

**Notes:**
- Multiple subscriptions to same resource with different filters allowed
- Subscription persists until unsubscribe or disconnect
- Guard `subscribe` function can modify or reject the subscription

### unsubscribe

Remove a subscription.

```javascript
{
  "type": "unsubscribe",
  "requestId": "unsub-1",
  "resource": "messages",
  "filter": { "channel": "general" }  // Must match original subscription
}
```

**Response:**
```javascript
{
  "type": "unsubscribed",
  "requestId": "unsub-1",
  "resource": "messages",
  "filter": { "channel": "general" }
}
```

### get

Retrieve a single record.

```javascript
{
  "type": "get",
  "requestId": "get-1",
  "resource": "users",
  "id": "user-123",
  "partition": { "byRegion": { "region": "US" } }  // Optional
}
```

**Response:**
```javascript
{
  "type": "data",
  "requestId": "get-1",
  "resource": "users",
  "data": {
    "id": "user-123",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### list

Retrieve multiple records.

```javascript
{
  "type": "list",
  "requestId": "list-1",
  "resource": "messages",
  "filter": { "channel": "general" },  // Optional: Query filter
  "partition": { /* ... */ },          // Optional: Partition
  "limit": 50,                         // Optional: Max records (default: 100)
  "cursor": "msg-abc123"               // Optional: Pagination cursor
}
```

**Response:**
```javascript
{
  "type": "data",
  "requestId": "list-1",
  "resource": "messages",
  "data": [
    { "id": "msg-1", "content": "Hello" },
    { "id": "msg-2", "content": "World" }
  ],
  "cursor": "msg-2"  // Use for next page, null if no more
}
```

### insert

Create a new record.

```javascript
{
  "type": "insert",
  "requestId": "ins-1",
  "resource": "messages",
  "data": {
    "content": "Hello, World!",
    "channel": "general"
  }
}
```

**Response:**
```javascript
{
  "type": "inserted",
  "requestId": "ins-1",
  "resource": "messages",
  "data": {
    "id": "msg-xyz789",  // Generated ID
    "content": "Hello, World!",
    "channel": "general",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### update

Modify an existing record.

```javascript
{
  "type": "update",
  "requestId": "upd-1",
  "resource": "messages",
  "id": "msg-xyz789",
  "data": {
    "content": "Updated content!"
  },
  "partition": { /* ... */ }  // Optional
}
```

**Response:**
```javascript
{
  "type": "updated",
  "requestId": "upd-1",
  "resource": "messages",
  "data": {
    "id": "msg-xyz789",
    "content": "Updated content!",
    "channel": "general",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

### delete

Remove a record.

```javascript
{
  "type": "delete",
  "requestId": "del-1",
  "resource": "messages",
  "id": "msg-xyz789",
  "partition": { /* ... */ }  // Optional
}
```

**Response:**
```javascript
{
  "type": "deleted",
  "requestId": "del-1",
  "resource": "messages",
  "id": "msg-xyz789"
}
```

### publish

Send a custom message to subscribers of a channel.

```javascript
{
  "type": "publish",
  "requestId": "pub-1",
  "channel": "notifications",
  "message": {
    "type": "alert",
    "title": "New Feature!",
    "body": "Check out our latest update"
  }
}
```

**Response:**
```javascript
{
  "type": "published",
  "requestId": "pub-1",
  "channel": "notifications",
  "delivered": 42  // Number of clients who received it
}
```

**Notes:**
- Channel name corresponds to resource name for subscription matching
- Sender does NOT receive their own published message
- `publishAuth` resource config controls who can publish

### ping

Check connection health.

```javascript
{
  "type": "ping"
}
```

**Response:**
```javascript
{
  "type": "pong",
  "timestamp": 1705315800000
}
```

---

## Server Messages

### connected

Sent immediately after successful connection.

```javascript
{
  "type": "connected",
  "clientId": "cli_abc123xyz",
  "user": {                      // null if not authenticated
    "id": "user-123",
    "role": "admin"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### event

Pushed when a subscribed resource changes.

```javascript
{
  "type": "event",
  "event": "insert",            // "insert" | "update" | "delete"
  "resource": "messages",
  "data": {
    "id": "msg-new123",
    "content": "New message!",
    "channel": "general",
    "createdAt": "2024-01-15T10:31:00.000Z"
  },
  "timestamp": "2024-01-15T10:31:00.123Z"
}
```

**Event Types:**

| Event | When | Data |
|-------|------|------|
| `insert` | Record created | Full record |
| `update` | Record modified | Updated record |
| `delete` | Record removed | Deleted record (may be partial) |

### message

Custom message from another client (via publish).

```javascript
{
  "type": "message",
  "channel": "notifications",
  "from": "cli_sender456",      // Sender's client ID
  "data": {
    "type": "alert",
    "title": "New Feature!"
  },
  "timestamp": "2024-01-15T10:32:00.000Z"
}
```

### error

Error response.

```javascript
{
  "type": "error",
  "requestId": "req-123",       // If request had one
  "code": "NOT_FOUND",
  "message": "Record not found"
}
```

---

## Error Handling

### Error Codes

| Code | HTTP Equiv | Description | Action |
|------|------------|-------------|--------|
| `INVALID_JSON` | 400 | Message is not valid JSON | Fix message format |
| `UNKNOWN_MESSAGE_TYPE` | 400 | Unknown type field | Check supported types |
| `RESOURCE_NOT_FOUND` | 404 | Resource not configured | Verify resource name |
| `NOT_FOUND` | 404 | Record not found | Check record exists |
| `FORBIDDEN` | 403 | Access denied by guard | Check permissions |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait and retry |
| `INTERNAL_ERROR` | 500 | Server error | Report bug |

### Handling Errors in Client

```javascript
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'error') {
    switch (msg.code) {
      case 'RATE_LIMIT_EXCEEDED':
        // Back off and retry
        await sleep(5000);
        retryLastRequest();
        break;

      case 'FORBIDDEN':
        // User doesn't have access
        showAccessDeniedUI();
        break;

      case 'NOT_FOUND':
        // Record was deleted
        removeFromLocalState(msg.requestId);
        break;

      default:
        console.error('WebSocket error:', msg.message);
    }
  }
};
```

---

## Client Implementation Examples

### Browser (Vanilla JavaScript)

```javascript
class S3DBWebSocketClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.pending = new Map();
    this.subscriptions = new Map();
    this.requestId = 0;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    const wsUrl = this.token
      ? `${this.url}?token=${this.token}`
      : this.url;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to WebSocket');
      this.reconnectAttempts = 0;
      this.resubscribeAll();
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.handleMessage(msg);
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code);
      if (event.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  handleMessage(msg) {
    // Handle pending request responses
    if (msg.requestId && this.pending.has(msg.requestId)) {
      const { resolve, reject } = this.pending.get(msg.requestId);
      this.pending.delete(msg.requestId);

      if (msg.type === 'error') {
        reject(new Error(msg.message));
      } else {
        resolve(msg);
      }
      return;
    }

    // Handle events
    if (msg.type === 'event') {
      const handlers = this.subscriptions.get(msg.resource);
      if (handlers) {
        handlers.forEach(handler => handler(msg.event, msg.data));
      }
    }
  }

  send(message) {
    const requestId = `req-${++this.requestId}`;

    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });

      this.ws.send(JSON.stringify({
        ...message,
        requestId
      }));

      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async subscribe(resource, filter, handler) {
    const response = await this.send({
      type: 'subscribe',
      resource,
      filter
    });

    if (!this.subscriptions.has(resource)) {
      this.subscriptions.set(resource, new Set());
    }
    this.subscriptions.get(resource).add(handler);

    return () => {
      this.subscriptions.get(resource)?.delete(handler);
      this.send({ type: 'unsubscribe', resource, filter });
    };
  }

  resubscribeAll() {
    for (const [resource, handlers] of this.subscriptions) {
      if (handlers.size > 0) {
        this.send({ type: 'subscribe', resource });
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`Reconnecting in ${delay}ms...`);
    setTimeout(() => this.connect(), delay);
  }

  // CRUD methods
  get(resource, id, partition) {
    return this.send({ type: 'get', resource, id, partition });
  }

  list(resource, options = {}) {
    return this.send({ type: 'list', resource, ...options });
  }

  insert(resource, data) {
    return this.send({ type: 'insert', resource, data });
  }

  update(resource, id, data, partition) {
    return this.send({ type: 'update', resource, id, data, partition });
  }

  delete(resource, id, partition) {
    return this.send({ type: 'delete', resource, id, partition });
  }

  publish(channel, message) {
    return this.send({ type: 'publish', channel, message });
  }

  close() {
    this.ws?.close(1000);
  }
}

// Usage
const client = new S3DBWebSocketClient('ws://localhost:3001', 'jwt-token');
client.connect();

// Subscribe to messages
const unsubscribe = await client.subscribe('messages', { channel: 'general' }, (event, data) => {
  console.log(`${event}:`, data);
});

// CRUD operations
const messages = await client.list('messages', { limit: 10 });
await client.insert('messages', { content: 'Hello!' });

// Cleanup
unsubscribe();
client.close();
```

### Node.js Client

```javascript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001', {
  headers: {
    'Authorization': 'Bearer ' + token
  }
});

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    resource: 'events'
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg);
});

ws.on('close', () => {
  console.log('Disconnected');
});
```

### React Hook

```javascript
import { useEffect, useState, useCallback, useRef } from 'react';

export function useWebSocket(url, token) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(`${url}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'event') {
        setMessages(prev => [...prev, msg.data]);
      }
    };

    return () => ws.close();
  }, [url, token]);

  const send = useCallback((message) => {
    wsRef.current?.send(JSON.stringify(message));
  }, []);

  const subscribe = useCallback((resource, filter) => {
    send({ type: 'subscribe', resource, filter });
  }, [send]);

  return { connected, messages, send, subscribe };
}

// Usage
function Chat() {
  const { connected, messages, subscribe } = useWebSocket(
    'ws://localhost:3001',
    localStorage.getItem('token')
  );

  useEffect(() => {
    if (connected) {
      subscribe('messages', { channel: 'general' });
    }
  }, [connected, subscribe]);

  return (
    <div>
      <div>Status: {connected ? 'Connected' : 'Disconnected'}</div>
      {messages.map(msg => (
        <div key={msg.id}>{msg.content}</div>
      ))}
    </div>
  );
}
```

---

[← Back to WebSocket Plugin](../README.md) | [Authentication Guide →](./authentication.md)

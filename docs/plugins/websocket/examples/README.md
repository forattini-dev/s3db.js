# WebSocket Plugin Examples

> Real-world examples and use cases

[← Back to WebSocket Plugin](/plugins/websocket/README.md)

---

## Table of Contents

- [Quick Examples](#quick-examples)
- [Chat Application](#chat-application)
- [Real-time Dashboard](#real-time-dashboard)
- [Collaborative Editing](#collaborative-editing)
- [Live Notifications](#live-notifications)
- [IoT Data Streaming](#iot-data-streaming)
- [Multi-Tenant SaaS](#multi-tenant-saas)
- [Gaming Leaderboard](#gaming-leaderboard)

---

## Quick Examples

### Minimal Setup

```javascript
import { Database, WebSocketPlugin } from 's3db.js';

const db = new Database({
  connectionString: 'http://minioadmin:minioadmin@localhost:9000/bucket'
});
await db.connect();

await db.createResource({
  name: 'events',
  attributes: { data: 'json' },
  timestamps: true
});

const wsPlugin = new WebSocketPlugin({
  port: 3001,
  resources: { events: true }
});

await db.usePlugin(wsPlugin);
```

### With Authentication

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    required: true,
    drivers: [{
      driver: 'jwt',
      config: { secret: process.env.JWT_SECRET }
    }]
  },
  resources: {
    users: { protected: ['password'] },
    messages: true
  }
});
```

---

## Chat Application

A complete real-time chat application with rooms, typing indicators, and message history.

### Server

```javascript
import { Database, WebSocketPlugin } from 's3db.js';

const db = new Database({
  connectionString: process.env.DATABASE_URL
});
await db.connect();

// Define resources
await db.createResource({
  name: 'chat_rooms',
  attributes: {
    name: 'string|required',
    description: 'string|optional',
    isPrivate: 'boolean|default:false',
    members: 'array|items:string|default:[]',
    createdBy: 'string|required'
  },
  timestamps: true
});

await db.createResource({
  name: 'chat_messages',
  attributes: {
    roomId: 'string|required',
    userId: 'string|required',
    username: 'string|required',
    content: 'string|required|maxlength:4000',
    type: 'string|default:text',  // text, image, file, system
    replyTo: 'string|optional',
    metadata: 'json|optional'
  },
  timestamps: true,
  partitions: {
    byRoom: { fields: { roomId: 'string' } }
  }
});

await db.createResource({
  name: 'typing_indicators',
  attributes: {
    roomId: 'string|required',
    userId: 'string|required',
    username: 'string|required',
    expiresAt: 'number|required'
  }
});

// WebSocket plugin
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    required: true,
    drivers: [{
      driver: 'jwt',
      config: { secret: process.env.JWT_SECRET }
    }]
  },
  resources: {
    chat_rooms: {
      events: ['insert', 'update'],
      guard: {
        list: async (user) => true,  // Anyone can list public rooms
        get: async (user, ctx) => {
          const room = await db.resources.chat_rooms.get(ctx.id);
          if (!room.isPrivate) return true;
          return room.members.includes(user.id);
        },
        create: async (user, data) => {
          data.createdBy = user.id;
          data.members = [user.id];
          return true;
        }
      }
    },
    chat_messages: {
      events: ['insert'],
      guard: {
        subscribe: async (user, filter) => {
          if (!filter?.roomId) return false;
          const room = await db.resources.chat_rooms.get(filter.roomId);
          if (!room.isPrivate) return true;
          return room.members.includes(user.id);
        },
        list: async (user, ctx) => {
          const room = await db.resources.chat_rooms.get(ctx.filter?.roomId);
          if (!room) return false;
          if (!room.isPrivate) return true;
          return room.members.includes(user.id);
        },
        create: async (user, data) => {
          // Verify user is in room
          const room = await db.resources.chat_rooms.get(data.roomId);
          if (!room) return false;
          if (room.isPrivate && !room.members.includes(user.id)) {
            return false;
          }

          // Set user info
          data.userId = user.id;
          data.username = user.name || user.email;
          return true;
        }
      }
    },
    typing_indicators: {
      events: ['insert', 'delete'],
      guard: {
        create: async (user, data) => {
          data.userId = user.id;
          data.username = user.name;
          data.expiresAt = Date.now() + 5000;  // 5 second TTL
          return true;
        }
      }
    }
  }
});

await db.usePlugin(wsPlugin);

// Cleanup expired typing indicators
setInterval(async () => {
  const expired = await db.resources.typing_indicators.query({
    expiresAt: { $lt: Date.now() }
  });
  for (const indicator of expired) {
    await db.resources.typing_indicators.delete(indicator.id);
  }
}, 5000);

console.log('Chat server running on ws://localhost:3001');
```

### Client (React)

```jsx
import { useState, useEffect, useCallback, useRef } from 'react';

function ChatRoom({ roomId, token }) {
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState([]);
  const [input, setInput] = useState('');
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3001?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Subscribe to messages in this room
      ws.send(JSON.stringify({
        type: 'subscribe',
        resource: 'chat_messages',
        filter: { roomId }
      }));

      // Subscribe to typing indicators
      ws.send(JSON.stringify({
        type: 'subscribe',
        resource: 'typing_indicators',
        filter: { roomId }
      }));

      // Load message history
      ws.send(JSON.stringify({
        type: 'list',
        requestId: 'history',
        resource: 'chat_messages',
        filter: { roomId },
        limit: 50
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'data' && msg.requestId === 'history') {
        setMessages(msg.data.reverse());
      }

      if (msg.type === 'event' && msg.resource === 'chat_messages') {
        setMessages(prev => [...prev, msg.data]);
      }

      if (msg.type === 'event' && msg.resource === 'typing_indicators') {
        if (msg.event === 'insert') {
          setTyping(prev => [...prev.filter(t => t.userId !== msg.data.userId), msg.data]);
        } else if (msg.event === 'delete') {
          setTyping(prev => prev.filter(t => t.id !== msg.data.id));
        }
      }
    };

    return () => ws.close();
  }, [roomId, token]);

  const sendMessage = () => {
    if (!input.trim()) return;

    wsRef.current?.send(JSON.stringify({
      type: 'insert',
      resource: 'chat_messages',
      data: { roomId, content: input }
    }));

    setInput('');
  };

  const sendTyping = useCallback(() => {
    wsRef.current?.send(JSON.stringify({
      type: 'insert',
      resource: 'typing_indicators',
      data: { roomId }
    }));
  }, [roomId]);

  return (
    <div className="chat-room">
      <div className="messages">
        {messages.map(msg => (
          <div key={msg.id} className="message">
            <strong>{msg.username}:</strong> {msg.content}
          </div>
        ))}
      </div>

      {typing.length > 0 && (
        <div className="typing">
          {typing.map(t => t.username).join(', ')} typing...
        </div>
      )}

      <div className="input">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            sendTyping();
          }}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}
```

---

## Real-time Dashboard

A metrics dashboard that updates in real-time.

### Server

```javascript
import { Database, WebSocketPlugin } from 's3db.js';

const db = new Database({ connectionString: process.env.DATABASE_URL });
await db.connect();

await db.createResource({
  name: 'metrics',
  attributes: {
    type: 'string|required',    // cpu, memory, requests, errors
    value: 'number|required',
    unit: 'string|required',
    host: 'string|required',
    tags: 'json|optional'
  },
  timestamps: true,
  partitions: {
    byType: { fields: { type: 'string' } }
  }
});

await db.createResource({
  name: 'alerts',
  attributes: {
    severity: 'string|required',  // critical, warning, info
    message: 'string|required',
    source: 'string|required',
    acknowledged: 'boolean|default:false',
    acknowledgedBy: 'string|optional',
    resolvedAt: 'string|optional'
  },
  timestamps: true
});

const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    required: true,
    drivers: [{
      driver: 'jwt',
      config: { secret: process.env.JWT_SECRET }
    }]
  },
  resources: {
    metrics: {
      auth: ['admin', 'viewer'],
      events: ['insert'],
      guard: {
        // Only viewers can read, not write
        create: async (user) => user.role === 'admin' || user.role === 'collector'
      }
    },
    alerts: {
      auth: ['admin', 'viewer'],
      events: ['insert', 'update'],
      guard: {
        create: async (user) => user.role === 'admin' || user.role === 'system',
        update: async (user, ctx) => {
          // Only admins can acknowledge
          if (ctx.data.acknowledged) {
            ctx.data.acknowledgedBy = user.id;
          }
          return user.role === 'admin';
        }
      }
    }
  }
});

await db.usePlugin(wsPlugin);

// Simulate metrics collection
setInterval(async () => {
  await db.resources.metrics.insert({
    type: 'cpu',
    value: Math.random() * 100,
    unit: 'percent',
    host: 'server-1'
  });

  await db.resources.metrics.insert({
    type: 'memory',
    value: Math.random() * 16384,
    unit: 'MB',
    host: 'server-1'
  });
}, 5000);
```

### Client

```javascript
class DashboardClient {
  constructor(url, token) {
    this.ws = new WebSocket(`${url}?token=${token}`);
    this.metrics = {};
    this.alerts = [];
    this.listeners = new Set();

    this.ws.onopen = () => this.subscribe();
    this.ws.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
  }

  subscribe() {
    this.ws.send(JSON.stringify({
      type: 'subscribe',
      resource: 'metrics'
    }));

    this.ws.send(JSON.stringify({
      type: 'subscribe',
      resource: 'alerts',
      filter: { acknowledged: false }
    }));
  }

  handleMessage(msg) {
    if (msg.type === 'event') {
      if (msg.resource === 'metrics') {
        const { type, value, host } = msg.data;
        this.metrics[`${host}:${type}`] = { value, timestamp: msg.timestamp };
      }

      if (msg.resource === 'alerts') {
        if (msg.event === 'insert') {
          this.alerts.push(msg.data);
        } else if (msg.event === 'update') {
          const idx = this.alerts.findIndex(a => a.id === msg.data.id);
          if (idx >= 0) {
            this.alerts[idx] = msg.data;
          }
        }
      }

      this.notifyListeners();
    }
  }

  acknowledgeAlert(alertId) {
    this.ws.send(JSON.stringify({
      type: 'update',
      resource: 'alerts',
      id: alertId,
      data: { acknowledged: true }
    }));
  }

  onUpdate(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    this.listeners.forEach(cb => cb({
      metrics: this.metrics,
      alerts: this.alerts
    }));
  }
}
```

---

## Collaborative Editing

Real-time document collaboration with conflict resolution.

### Server

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: { required: true, drivers: [/* ... */] },
  resources: {
    documents: {
      events: ['update'],
      protected: ['content'],  // Don't broadcast full content
      guard: {
        subscribe: async (user, filter) => {
          // Check document access
          const doc = await db.resources.documents.get(filter.documentId);
          return doc?.collaborators?.includes(user.id) || doc?.ownerId === user.id;
        }
      }
    },
    document_operations: {
      events: ['insert'],
      guard: {
        subscribe: async (user, filter) => {
          const doc = await db.resources.documents.get(filter.documentId);
          return doc?.collaborators?.includes(user.id) || doc?.ownerId === user.id;
        },
        create: async (user, data) => {
          const doc = await db.resources.documents.get(data.documentId);
          if (!doc) return false;
          if (!doc.collaborators?.includes(user.id) && doc.ownerId !== user.id) {
            return false;
          }
          data.userId = user.id;
          data.timestamp = Date.now();
          return true;
        }
      }
    },
    cursors: {
      events: ['insert', 'update', 'delete'],
      guard: {
        create: async (user, data) => {
          data.userId = user.id;
          data.username = user.name;
          return true;
        },
        update: async (user, ctx) => ctx.userId === user.id
      }
    }
  }
});
```

---

## Live Notifications

Push notifications to users in real-time.

### Server

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: { required: true, drivers: [/* ... */] },
  resources: {
    notifications: {
      events: ['insert', 'update'],
      guard: {
        // Users can only subscribe to their own notifications
        subscribe: async (user, filter) => {
          return { ...filter, userId: user.id };
        },
        list: async (user) => ({ userId: user.id }),
        // Anyone can create (system creates them)
        create: async () => true,
        // Users can mark their own as read
        update: async (user, ctx) => {
          const notif = await db.resources.notifications.get(ctx.id);
          return notif?.userId === user.id;
        }
      }
    }
  }
});

// Helper to send notification
async function sendNotification(userId, notification) {
  await db.resources.notifications.insert({
    userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    read: false
  });
}

// Usage
await sendNotification('user-123', {
  type: 'message',
  title: 'New message',
  body: 'John sent you a message',
  data: { messageId: 'msg-456' }
});
```

---

## IoT Data Streaming

Stream sensor data from IoT devices.

### Server

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    required: true,
    drivers: [
      // Devices use API keys
      {
        driver: 'apiKey',
        config: {
          keys: await loadDeviceApiKeys()  // From database
        }
      },
      // Users use JWT
      {
        driver: 'jwt',
        config: { secret: process.env.JWT_SECRET }
      }
    ]
  },
  resources: {
    sensor_readings: {
      events: ['insert'],
      guard: {
        // Devices can only write to their own sensor
        create: async (user, data) => {
          if (user.role === 'device') {
            data.deviceId = user.id;
            return true;
          }
          return false;
        },
        // Users can subscribe to devices they own
        subscribe: async (user, filter) => {
          if (user.role === 'device') return false;
          const device = await db.resources.devices.get(filter.deviceId);
          return device?.ownerId === user.id;
        }
      }
    }
  },
  // Higher rate limit for devices
  rateLimit: {
    enabled: true,
    maxRequests: 1000,  // 1000 readings per minute
    windowMs: 60000
  }
});
```

---

## Multi-Tenant SaaS

Strict tenant isolation for SaaS applications.

### Server

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: { required: true, drivers: [/* ... */] },
  resources: {
    projects: {
      guard: {
        // All operations filtered by tenant
        subscribe: async (user, filter) => ({
          ...filter,
          tenantId: user.tenantId
        }),
        list: async (user) => ({ tenantId: user.tenantId }),
        get: async (user, ctx) => {
          const project = await db.resources.projects.get(ctx.id);
          return project?.tenantId === user.tenantId;
        },
        create: async (user, data) => {
          data.tenantId = user.tenantId;
          data.createdBy = user.id;
          return true;
        },
        update: async (user, ctx) => {
          const project = await db.resources.projects.get(ctx.id);
          return project?.tenantId === user.tenantId;
        },
        delete: async (user, ctx) => {
          const project = await db.resources.projects.get(ctx.id);
          return project?.tenantId === user.tenantId && user.role === 'admin';
        }
      }
    },
    tasks: {
      // Same pattern as projects
      guard: {
        subscribe: async (user, filter) => ({
          ...filter,
          tenantId: user.tenantId
        }),
        // ... other guards
      }
    }
  }
});
```

---

## Gaming Leaderboard

Real-time gaming leaderboard with score updates.

### Server

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  resources: {
    leaderboard: {
      events: ['insert', 'update'],
      guard: {
        // Anyone can view
        subscribe: async () => true,
        list: async () => true,
        // Only game server can update scores
        create: async (user) => user.role === 'game-server',
        update: async (user) => user.role === 'game-server'
      }
    },
    matches: {
      events: ['insert', 'update'],
      guard: {
        subscribe: async (user, filter) => {
          // Users can only subscribe to matches they're in
          if (filter.matchId) {
            const match = await db.resources.matches.get(filter.matchId);
            return match?.players?.includes(user.id);
          }
          return { 'players[]': user.id };
        }
      }
    }
  }
});

// Update leaderboard when match ends
async function updateLeaderboard(userId, score) {
  const existing = await db.resources.leaderboard.query({ userId });

  if (existing.length > 0) {
    const current = existing[0];
    if (score > current.highScore) {
      await db.resources.leaderboard.update(current.id, {
        highScore: score,
        gamesPlayed: current.gamesPlayed + 1
      });
    }
  } else {
    await db.resources.leaderboard.insert({
      userId,
      highScore: score,
      gamesPlayed: 1
    });
  }
}
```

---

[← Back to WebSocket Plugin](/plugins/websocket/README.md)

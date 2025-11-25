# Channels & Presence Guide

> Pusher-style channels with real-time presence tracking

[← Back to WebSocket Plugin](../README.md)

---

## Table of Contents

- [Overview](#overview)
- [Channel Types](#channel-types)
- [Client Protocol](#client-protocol)
- [Server Events](#server-events)
- [Configuration](#configuration)
- [Use Cases](#use-cases)
- [API Reference](#api-reference)

---

## Overview

The WebSocket plugin implements Pusher-style channels for organized real-time communication:

| Feature | Description |
|---------|-------------|
| **Public Channels** | Open to all clients, no auth needed |
| **Private Channels** | Require authentication |
| **Presence Channels** | Private + track who's online |

### Key Benefits

- **Organized messaging**: Send messages to specific groups
- **Presence awareness**: Know who's online in a channel
- **User metadata**: Share name, avatar, status with other members
- **Automatic cleanup**: Members removed on disconnect

---

## Channel Types

### Public Channels (`public-*`)

Anyone can join, no authentication required.

```javascript
// Client
ws.send(JSON.stringify({
  type: 'join',
  channel: 'public-announcements'
}));
```

**Use cases:**
- Public chat rooms
- Live event feeds
- System announcements

### Private Channels (`private-*`)

Require authentication. Use guards to control access.

```javascript
// Client (must be authenticated)
ws.send(JSON.stringify({
  type: 'join',
  channel: 'private-team-123'
}));
```

**Server configuration:**
```javascript
const wsPlugin = new WebSocketPlugin({
  channels: {
    guards: {
      'team-*': async (user, channelName) => {
        // Check if user belongs to this team
        const teamId = channelName.replace('private-team-', '');
        return user.teams?.includes(teamId);
      }
    }
  }
});
```

**Use cases:**
- Team chat rooms
- Project channels
- Private groups

### Presence Channels (`presence-*`)

Private channels that also track online members with metadata.

```javascript
// Client
ws.send(JSON.stringify({
  type: 'join',
  channel: 'presence-room-456',
  userInfo: {
    name: 'John Doe',
    avatar: 'https://example.com/avatar.jpg',
    status: 'online'
  }
}));

// Server response
{
  type: 'channel:joined',
  channel: 'presence-room-456',
  channelType: 'presence',
  members: [
    { id: 'user-1', name: 'John Doe', avatar: '...', joinedAt: '...' },
    { id: 'user-2', name: 'Jane Smith', avatar: '...', joinedAt: '...' }
  ],
  me: { id: 'user-1', name: 'John Doe', ... }
}
```

**Use cases:**
- Chat with "who's online" list
- Collaborative editing (show cursors)
- Gaming lobbies
- Support chat with agent presence

---

## Client Protocol

### Join Channel

```javascript
// Request
{
  type: 'join',
  requestId: 'req-1',
  channel: 'presence-chat-room',
  userInfo: {              // Optional, for presence channels
    name: 'John',
    avatar: 'url...',
    customField: 'value'
  }
}

// Success Response
{
  type: 'channel:joined',
  requestId: 'req-1',
  channel: 'presence-chat-room',
  channelType: 'presence',
  members: [...],          // For presence channels
  me: {...}                // Your member info
}

// Error Response
{
  type: 'error',
  requestId: 'req-1',
  code: 'FORBIDDEN',
  message: 'Access denied'
}
```

### Leave Channel

```javascript
// Request
{
  type: 'leave',
  requestId: 'req-2',
  channel: 'presence-chat-room'
}

// Response
{
  type: 'channel:left',
  requestId: 'req-2',
  channel: 'presence-chat-room'
}
```

### Send Message to Channel

```javascript
// Request
{
  type: 'channel:message',
  requestId: 'req-3',
  channel: 'public-chat',
  event: 'new-message',    // Custom event name
  data: {
    text: 'Hello everyone!',
    timestamp: Date.now()
  }
}

// Response (to sender)
{
  type: 'channel:sent',
  requestId: 'req-3',
  channel: 'public-chat',
  delivered: 5             // Number of recipients
}

// Broadcast (to other members)
{
  type: 'channel:message',
  channel: 'public-chat',
  event: 'new-message',
  data: { text: 'Hello everyone!', ... },
  from: { clientId: 'abc123', userId: 'user-1' },
  timestamp: '2024-01-15T10:30:00.000Z'
}
```

### Update Presence Info

```javascript
// Request
{
  type: 'channel:update',
  requestId: 'req-4',
  channel: 'presence-room',
  userInfo: {
    status: 'away',
    lastSeen: Date.now()
  }
}

// Response
{
  type: 'channel:updated',
  requestId: 'req-4',
  channel: 'presence-room',
  member: { id: '...', status: 'away', ... }
}

// Broadcast to others
{
  type: 'presence:member_updated',
  channel: 'presence-room',
  member: { id: '...', status: 'away', ... },
  timestamp: '...'
}
```

---

## Server Events

### Presence Events

These events are automatically broadcast to presence channel members:

#### `presence:member_joined`

Sent when a new member joins.

```javascript
{
  type: 'presence:member_joined',
  channel: 'presence-room',
  member: {
    id: 'user-123',
    clientId: 'cli-abc',
    name: 'John Doe',
    avatar: 'https://...',
    joinedAt: '2024-01-15T10:30:00.000Z'
  },
  timestamp: '2024-01-15T10:30:00.000Z'
}
```

#### `presence:member_left`

Sent when a member leaves or disconnects.

```javascript
{
  type: 'presence:member_left',
  channel: 'presence-room',
  member: {
    id: 'user-123',
    clientId: 'cli-abc',
    name: 'John Doe',
    ...
  },
  timestamp: '2024-01-15T10:35:00.000Z'
}
```

#### `presence:member_updated`

Sent when a member updates their info.

```javascript
{
  type: 'presence:member_updated',
  channel: 'presence-room',
  member: {
    id: 'user-123',
    status: 'away',
    updatedAt: '2024-01-15T10:32:00.000Z',
    ...
  },
  timestamp: '2024-01-15T10:32:00.000Z'
}
```

---

## Configuration

### Basic Setup

Channels are enabled by default:

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  // channels: { enabled: true }  // Default
});
```

### With Guards

Control access to private/presence channels:

```javascript
const wsPlugin = new WebSocketPlugin({
  port: 3001,
  auth: {
    required: true,
    drivers: [{ driver: 'jwt', config: { secret: '...' } }]
  },
  channels: {
    enabled: true,
    guards: {
      // Guard for specific channel pattern
      'room-*': async (user, channelName, userInfo) => {
        const roomId = channelName.replace(/^(private-|presence-)room-/, '');
        const room = await db.resources.rooms.get(roomId);
        return room?.members?.includes(user.id);
      },

      // Wildcard guard for all channels
      '*': async (user, channelName) => {
        // Default: allow authenticated users
        return user !== null;
      }
    }
  }
});
```

### Guard Function

```typescript
type ChannelGuard = (
  user: User | null,          // Authenticated user
  channelName: string,        // Full channel name
  userInfo: object            // User-provided info
) => Promise<boolean | { authorized: boolean; reason?: string }>;
```

**Return values:**
- `true` - Allow access
- `false` - Deny access
- `{ authorized: false, reason: 'message' }` - Deny with custom message

---

## Use Cases

### Chat Room with Online Users

```javascript
// Server
const wsPlugin = new WebSocketPlugin({
  channels: {
    guards: {
      'chat-*': async (user) => user !== null
    }
  }
});

// Client
class ChatRoom {
  constructor(roomId, token) {
    this.roomId = roomId;
    this.members = [];

    this.ws = new WebSocket(`ws://localhost:3001?token=${token}`);
    this.ws.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
  }

  join(userInfo) {
    this.ws.send(JSON.stringify({
      type: 'join',
      channel: `presence-chat-${this.roomId}`,
      userInfo
    }));
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'channel:joined':
        this.members = msg.members;
        this.onMembersChanged(this.members);
        break;

      case 'presence:member_joined':
        this.members.push(msg.member);
        this.onMembersChanged(this.members);
        this.onMemberJoined(msg.member);
        break;

      case 'presence:member_left':
        this.members = this.members.filter(m => m.id !== msg.member.id);
        this.onMembersChanged(this.members);
        this.onMemberLeft(msg.member);
        break;

      case 'channel:message':
        this.onMessage(msg.data, msg.from);
        break;
    }
  }

  send(text) {
    this.ws.send(JSON.stringify({
      type: 'channel:message',
      channel: `presence-chat-${this.roomId}`,
      event: 'message',
      data: { text }
    }));
  }
}

// Usage
const chat = new ChatRoom('general', jwtToken);
chat.onMembersChanged = (members) => updateMembersList(members);
chat.onMessage = (data, from) => displayMessage(data.text, from);
chat.join({ name: 'John', avatar: '...' });
```

### Typing Indicators

```javascript
// Client sends typing status
function sendTyping(isTyping) {
  ws.send(JSON.stringify({
    type: 'channel:message',
    channel: 'presence-chat-room',
    event: 'typing',
    data: { isTyping }
  }));
}

// Handle typing events
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'channel:message' && msg.event === 'typing') {
    if (msg.data.isTyping) {
      showTypingIndicator(msg.from.userId);
    } else {
      hideTypingIndicator(msg.from.userId);
    }
  }
};

// Debounced typing
let typingTimeout;
input.addEventListener('input', () => {
  sendTyping(true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => sendTyping(false), 2000);
});
```

### Collaborative Cursor Tracking

```javascript
// Update cursor position
function updateCursor(x, y) {
  ws.send(JSON.stringify({
    type: 'channel:update',
    channel: 'presence-document-123',
    userInfo: {
      cursor: { x, y },
      selection: editor.getSelection()
    }
  }));
}

// Render other users' cursors
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'presence:member_updated') {
    renderCursor(msg.member.id, msg.member.cursor, msg.member.name);
  }
};
```

---

## API Reference

### Plugin Methods

```javascript
// Get channel info
const channel = wsPlugin.getChannel('presence-room');
// { name, type, memberCount, createdAt, members }

// List all channels
const channels = wsPlugin.listChannels();
const presenceChannels = wsPlugin.listChannels({ type: 'presence' });
const chatChannels = wsPlugin.listChannels({ prefix: 'presence-chat-' });

// Get members in a channel
const members = wsPlugin.getChannelMembers('presence-room');

// Broadcast to channel (server-side)
wsPlugin.broadcastToChannel('public-news', {
  type: 'announcement',
  data: { title: 'New Feature', body: '...' }
});

// Get channel stats
const stats = wsPlugin.getChannelStats();
// { channels: 5, totalMembers: 42, byType: { public: 2, private: 1, presence: 2 } }
```

### Server Events

```javascript
wsPlugin.on('channel.joined', ({ clientId, channel, type }) => {
  console.log(`${clientId} joined ${channel} (${type})`);
});

wsPlugin.on('channel.left', ({ clientId, channel }) => {
  console.log(`${clientId} left ${channel}`);
});
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `CHANNELS_DISABLED` | Channels feature is disabled |
| `INVALID_REQUEST` | Missing required fields |
| `FORBIDDEN` | Not authorized to join channel |
| `NOT_IN_CHANNEL` | Must join channel before sending |
| `JOIN_FAILED` | Failed to join channel |
| `LEAVE_FAILED` | Failed to leave channel |
| `UPDATE_FAILED` | Failed to update member info |
| `NOT_FOUND` | Channel not found |
| `NOT_MEMBER` | Not a member of this channel |

---

[← Back to WebSocket Plugin](../README.md) | [Client Protocol →](./client-protocol.md)

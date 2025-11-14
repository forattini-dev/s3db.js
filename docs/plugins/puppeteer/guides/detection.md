# 🔍 WebRTC & Streams Detection Guide

> **Detect real-time communication and streaming capabilities on web pages.**
>
> **Navigation:** [← Guides Index](./README.md) | [Puppeteer Plugin](../README.md)

---

## Overview

The Puppeteer plugin provides four detection methods to analyze WebRTC, media streams, and streaming protocols on web pages:

- **`detectWebRTC()`** - Peer connections, ICE candidates, IP addresses
- **`detectMediaStreams()`** - Audio/video elements, permissions, canvas
- **`detectStreamingProtocols()`** - HLS, DASH, RTMP, manifest URLs
- **`detectWebRTCAndStreams()`** - Comprehensive one-call detection

---

## Quick Start

```javascript
import { Database } from 's3db.js';
import { PuppeteerPlugin } from 's3db.js/plugins';

const db = new Database({ connectionString: 's3://key:secret@bucket/path' });
const plugin = new PuppeteerPlugin({ pool: { maxBrowsers: 3 } });
await db.usePlugin(plugin);

// Get page and navigate
const page = await plugin.getPage();
await page.goto('https://example.com', { waitUntil: 'networkidle2' });

// Detect WebRTC
const webrtc = await plugin.detectWebRTC(page);
console.log('WebRTC detected:', webrtc.webrtcDetected);
console.log('IPs:', webrtc.webrtcInfo.detectedIPs);

// Detect streams
const streams = await plugin.detectMediaStreams(page);
console.log('Has video:', streams.streamsInfo.videoElements.length > 0);

// Detect protocols
const protocols = await plugin.detectStreamingProtocols(page);
console.log('Streaming protocols:', protocols.protocolsInfo.protocols);

// Or all at once
const all = await plugin.detectWebRTCAndStreams(page);
console.log('Any activity:', all.summary.anyActivity);

await plugin.releasePage(page);
```

---

## detectWebRTC()

Detects WebRTC peer connections and ICE candidate information.

### Signature

```javascript
await plugin.detectWebRTC(page): Promise<{
  webrtcDetected: boolean,
  webrtcInfo: {
    peerConnections: Array,
    iceServers: Array,
    iceGatheringState: string,
    connectionState: string,
    iceConnectionState: string,
    signalingState: string,
    dataChannels: Array,
    mediaStreams: Array,
    detectedIPs: Array<{
      candidate: string,
      protocol: 'udp' | 'tcp',
      type: 'host' | 'srflx' | 'prflx' | 'relay',
      address: string,
      port: number
    }>,
    stunServers: Array,
    turnServers: Array,
    isActive: boolean
  }
}>
```

### Example

```javascript
const result = await plugin.detectWebRTC(page);

if (result.webrtcDetected) {
  result.webrtcInfo.detectedIPs.forEach(ip => {
    console.log(`${ip.address}:${ip.port} (${ip.type})`);
  });
}
```

### Use Cases

- Detect video conferencing (Zoom, Teams, Google Meet)
- Extract local/public IP addresses
- Identify NAT/proxy configuration
- Monitor WebRTC-based communication

---

## detectMediaStreams()

Detects audio/video elements, canvas, and media permissions.

### Signature

```javascript
await plugin.detectMediaStreams(page): Promise<{
  streamsDetected: boolean,
  streamsInfo: {
    audioElements: Array<{
      src: string,
      sources: Array,
      autoplay: boolean,
      controls: boolean,
      loop: boolean,
      muted: boolean
    }>,
    videoElements: Array<{
      src: string,
      sources: Array,
      width: number,
      height: number,
      autoplay: boolean,
      controls: boolean,
      loop: boolean,
      muted: boolean,
      poster: string
    }>,
    canvasElements: Array<{
      width: number,
      height: number,
      id: string,
      class: string
    }>,
    mediaRecorders: Array,
    audioContexts: Array,
    videoStreams: Array,
    displayCapture: boolean,
    permissions: {
      microphone: string,
      camera: string,
      displayCapture: string
    }
  }
}>
```

### Example

```javascript
const result = await plugin.detectMediaStreams(page);

if (result.streamsDetected) {
  console.log(`Found ${result.streamsInfo.videoElements.length} videos`);
  console.log(`Camera permission: ${result.streamsInfo.permissions.camera}`);
}
```

### Use Cases

- Detect media playback on pages
- Check microphone/camera permission status
- Identify screen capture support
- Monitor media recorder availability

---

## detectStreamingProtocols()

Detects streaming protocols and manifest files (HLS, DASH, etc.).

### Signature

```javascript
await plugin.detectStreamingProtocols(page): Promise<{
  streamingProtocolsDetected: boolean,
  protocolsInfo: {
    hls: boolean,
    dash: boolean,
    rtmp: boolean,
    smoothStreaming: boolean,
    protocols: Array<string>,
    m3u8Files: Array<string>,
    mpdFiles: Array<string>,
    manifestFiles: Array<string>
  }
}>
```

### Example

```javascript
const result = await plugin.detectStreamingProtocols(page);

if (result.protocolsInfo.hls) {
  console.log('HLS streams found:');
  result.protocolsInfo.m3u8Files.forEach(url => console.log('  ' + url));
}
```

### Detected Players

- HLS.js
- DASH.js
- Shaka Player
- Video.js
- JW Player

### Use Cases

- Detect live streaming services
- Extract playlist/manifest URLs
- Identify streaming player implementations
- Monitor VOD/live streaming infrastructure

---

## detectWebRTCAndStreams()

Comprehensive detection combining all three in one call.

### Signature

```javascript
await plugin.detectWebRTCAndStreams(page): Promise<{
  webrtc: { webrtcDetected, webrtcInfo },
  streams: { streamsDetected, streamsInfo },
  protocols: { streamingProtocolsDetected, protocolsInfo },
  summary: {
    webrtcActive: boolean,
    streamsPresent: boolean,
    streamingProtocols: boolean,
    anyActivity: boolean
  }
}>
```

### Example

```javascript
const result = await plugin.detectWebRTCAndStreams(page);

if (result.summary.anyActivity) {
  console.log('Page uses real-time communication or streaming');

  if (result.summary.webrtcActive) {
    // Handle WebRTC
  }
  if (result.summary.streamsPresent) {
    // Handle media streams
  }
  if (result.summary.streamingProtocols) {
    // Handle streaming
  }
}
```

### Performance

Faster than calling individual methods separately (40-50ms vs 45-90ms).

---

## Best Practices

### 1. Wait for Page Load

Always wait for page load before detecting:

```javascript
// ❌ Wrong
await page.goto(url);
const result = await plugin.detectWebRTC(page);

// ✅ Correct
await page.goto(url, { waitUntil: 'networkidle2' });
const result = await plugin.detectWebRTC(page);
```

### 2. Batch Detections

Use comprehensive call for multiple detections:

```javascript
// ❌ Inefficient
const webrtc = await plugin.detectWebRTC(page);
const streams = await plugin.detectMediaStreams(page);
const protocols = await plugin.detectStreamingProtocols(page);

// ✅ Efficient
const result = await plugin.detectWebRTCAndStreams(page);
```

### 3. Always Release Pages

```javascript
const page = await plugin.getPage();
try {
  const result = await plugin.detectWebRTC(page);
  // Process result
} finally {
  await plugin.releasePage(page);
}
```

### 4. Handle Edge Cases

Some pages may block permission queries:

```javascript
const result = await plugin.detectMediaStreams(page);

if (result.streamsDetected) {
  const perm = result.streamsInfo.permissions;
  // Permissions may be 'unknown' if blocked
  console.log('Microphone:', perm.microphone); // 'granted', 'denied', 'prompt', 'unknown'
}
```

---

## Performance

Each detection method runs JavaScript evaluation in browser context:

| Method | Time | Impact |
|--------|------|--------|
| `detectWebRTC()` | 15-30ms | Minimal |
| `detectMediaStreams()` | 15-30ms | Minimal |
| `detectStreamingProtocols()` | 15-30ms | Minimal |
| `detectWebRTCAndStreams()` | 40-50ms | Minimal |

No network requests or DOM mutations - browser context only.

---

## Common Patterns

### Analyze Multiple URLs

```javascript
const urls = ['https://example.com/live', 'https://example.com/video'];
const results = [];

for (const url of urls) {
  const page = await plugin.getPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    const result = await plugin.detectWebRTCAndStreams(page);
    results.push({ url, result });
  } finally {
    await plugin.releasePage(page);
  }
}

// Process results
results.forEach(({ url, result }) => {
  if (result.summary.streamingProtocols) {
    console.log(`${url} uses streaming`);
  }
});
```

### Extract Manifest URLs

```javascript
const page = await plugin.getPage();
await page.goto('https://streaming.example.com', { waitUntil: 'networkidle2' });

const result = await plugin.detectStreamingProtocols(page);
const manifests = [
  ...result.protocolsInfo.m3u8Files,
  ...result.protocolsInfo.mpdFiles
];

console.log('Found manifests:', manifests);
```

### Check Media Permissions

```javascript
const page = await plugin.getPage();
await page.goto('https://video-chat.example.com', { waitUntil: 'networkidle2' });

const result = await plugin.detectMediaStreams(page);
const permissions = result.streamsInfo.permissions;

if (permissions.camera === 'granted' && permissions.microphone === 'granted') {
  console.log('Video chat enabled');
}
```

---

## Related

- [Performance Guide](./performance.md) - Optimize Puppeteer plugin
- [Network Monitoring](./network-monitoring.md) - Track requests during navigation
- [Main Plugin Guide](../README.md) - Complete Puppeteer plugin documentation

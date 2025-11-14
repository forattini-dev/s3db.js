# 🎭 Puppeteer Plugin - Guides

Advanced guides for optimizing and extending PuppeteerPlugin performance, monitoring, and analysis.

## 📚 Available Guides

### Detection & Analysis
- **[detection.md](./detection.md)** - WebRTC and streaming detection
  - Detect WebRTC peer connections and ICE candidates
  - Detect audio/video elements and media permissions
  - Detect streaming protocols (HLS, DASH, RTMP)
  - Comprehensive one-call detection
  - Extract manifest URLs and IP addresses

### Performance Optimization
- **[performance.md](./performance.md)** - Core Web Vitals, resource timing, Lighthouse-style scoring
  - Core Web Vitals (LCP, FID, CLS, TTFB, FCP, INP)
  - Navigation timing breakdown
  - Resource waterfall analysis
  - Performance scoring (0-100)
  - Actionable optimization recommendations
  - Track improvements over time

### Network Monitoring
- **[network-monitoring.md](./network-monitoring.md)** - CDP-based network traffic tracking
  - Request/Response capture
  - Resource type classification
  - Failed request diagnostics
  - CDN detection
  - Compression analysis
  - Cache behavior tracking
  - Timing breakdown (DNS, TCP, TLS, etc.)

### Partitioning Strategy
- **[partitions-analysis.md](./partitions-analysis.md)** - Data partitioning patterns for browser sessions
  - Partition key optimization
  - Session organization
  - Storage efficiency
  - Query performance

---

## 🎯 Quick Links

- [← Back to Puppeteer Plugin](../README.md)
- [← Plugin Index](../../README.md)

---

## 💡 When to Use These Guides

| Guide | When to Use |
|-------|-----------|
| **Detection** | Analyzing WebRTC, media streams, and streaming protocols |
| **Performance** | Measuring, analyzing, and optimizing page load times |
| **Network Monitoring** | Debugging network issues, analyzing requests, detecting problems |
| **Partitions** | Understanding data storage patterns and optimization |

---

**Last Updated:** November 2024
**Puppeteer Plugin Version:** 1.0.0+

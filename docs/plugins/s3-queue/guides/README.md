# S3-Queue Plugin Guides

Complete documentation for the S3-Queue plugin, organized by topic. Each guide is focused on a specific aspect of using the plugin.

## Quick Navigation

| Guide | Focus | When to Read |
|-------|-------|--------------|
| **[onMessage Handler](./onmessage-handler.md)** | Message processing logic | Writing your first queue handler |
| **[Configuration](./configuration.md)** | Plugin options & real-world setups | Tuning queue behavior |
| **[Architecture](./architecture.md)** | Internal design & events | Understanding how it works |
| **[Performance & Scalability](./performance-scalability.md)** | Optimization & multi-pod deployment | Production scaling |
| **[Patterns & Best Practices](./patterns-best-practices.md)** | Practical patterns, troubleshooting, FAQ | Solving common problems |

## By Problem

### Getting Started
- [How to write an onMessage handler](./onmessage-handler.md#function-signature)
- [Quick start examples](./onmessage-handler.md#examples-different-message-processing-scenarios)
- [Common configuration patterns](./configuration.md#real-world-use-cases)

### Production Deployment
- [Multi-pod scaling](./performance-scalability.md#-scalability--multi-pod-deployment)
- [Performance tuning](./performance-scalability.md#-performance--tuning)
- [Monitoring & health checks](./patterns-best-practices.md#monitoring)

### Troubleshooting
- [Common issues & fixes](./patterns-best-practices.md#-troubleshooting)
- [FAQ (80+ questions)](./patterns-best-practices.md#-faq)
- [Error handling patterns](./onmessage-handler.md#error-handling-in-onmessage)

### Advanced Topics
- [Zero-duplication architecture](./architecture.md#-architecture-deep-dive)
- [Event system reference](./architecture.md#-event-system)
- [Coordinator mode](../README.md#-coordinator-mode)

## Back to Main Documentation

[← Back to S3-Queue README](../README.md)

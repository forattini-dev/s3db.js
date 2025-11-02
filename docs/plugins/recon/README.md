# 🛰️ ReconPlugin Documentation

Complete reconnaissance and security scanning plugin for s3db.js.

## Quick Links

- **Main Plugin Docs**: [../recon.md](../recon.md) - Complete plugin documentation
- **Quick Start**: [tools/quick-start.md](tools/quick-start.md) - Get started in 5 minutes
- **Examples**: [examples/](examples/) - Working code samples

## Documentation Structure

### 🔧 Tools

Installation and setup guides for reconnaissance tools.

- [Quick Start](tools/quick-start.md) - Fast setup (5-15 minutes)
- [Installation Guide](tools/installation.md) - Detailed installation steps
- [Tool Coverage](tools/coverage.md) - Available tools and roadmap

### ⚡ Features

Core functionality and capabilities.

- [Artifacts](features/artifacts.md) - Data collection and storage
- [Namespaces](features/namespaces.md) - Multi-tenant isolation
- [Storage](features/storage.md) - Storage architecture
- [Targets](features/targets.md) - Target management
- [Uptime](features/uptime.md) - Availability monitoring

### 📚 Guides

Implementation and best practices guides.

- [Process Cleanup](guides/process-cleanup.md) - Automatic process management
- [Security](guides/security.md) - Security considerations

### 🏗️ Architecture

- [Architecture](architecture.md) - System design and components

### 💡 Examples

Working code samples in [examples/](examples/) directory.

## Overview

The ReconPlugin provides comprehensive reconnaissance capabilities:

- **🔍 DNS**: Subdomain enumeration, DNS records, zone transfers
- **🌐 HTTP/HTTPS**: Web servers, headers, technologies, screenshots
- **🔐 TLS/SSL**: Certificate analysis, cipher suites, vulnerabilities
- **🔓 Port Scanning**: Open ports, services, banners
- **📁 Directory Discovery**: Hidden paths, files, backups
- **🔎 OSINT**: Social media, email harvesting, metadata
- **🐛 Vulnerability Scanning**: Known CVEs, misconfigurations
- **📊 Uptime Monitoring**: Availability tracking, health checks

## Quick Start

```javascript
import { Database } from 's3db.js';
import { ReconPlugin } from 's3db.js/plugins';

const db = new Database({
  connectionString: 's3://key:secret@bucket/recon'
});

const plugin = new ReconPlugin({
  tools: {
    dns: { enabled: true },
    http: { enabled: true },
    tls: { enabled: true }
  },
  behaviors: {
    uptime: { enabled: true, interval: 60000 }
  }
});

await db.usePlugin(plugin);
await db.connect();

// Start reconnaissance
const result = await plugin.scan('example.com', {
  depth: 'full',
  timeout: 300000
});
```

## Installation

See [tools/quick-start.md](tools/quick-start.md) for automated installation:

```bash
sudo bash docs/install-recon-tools.sh
source ~/.bashrc
```

This installs 29 reconnaissance tools including:
- DNS: subfinder, assetfinder, amass
- HTTP: ffuf, gobuster, nikto, whatweb
- TLS: sslscan, sslyze, testssl.sh
- Ports: nmap, masscan
- OSINT: theHarvester, sherlock, maigret

## Contributing

See main plugin documentation at [../recon.md](../recon.md) for:
- Configuration reference
- API documentation
- Best practices
- Troubleshooting

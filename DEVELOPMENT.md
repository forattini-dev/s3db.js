# Development Setup Guide

This guide explains how to set up s3db.js for development with minimal dependencies.

---

## 🎯 TL;DR - Quick Start

```bash
# For users (end-users consuming the library)
pnpm add s3db.js              # Installs ONLY core (~1MB)
pnpm add pg                   # Installs plugin deps as needed

# For developers (contributing to s3db.js)
git clone <repo> && cd s3db.js
pnpm install                  # Installs core dev tools (~50MB)
pnpm run test:core            # Tests core without plugins
pnpm run install:dev:common   # Install when working on plugins
pnpm run test:ci              # Full CI test (installs everything)
```

**Key Concept:**
- 👥 **End Users** (using s3db.js in their projects):
  - Install via: `pnpm add s3db.js`
  - Get: Only core dependencies (~1MB)
  - Add plugins: `pnpm add pg` (manual, as needed)
  - **NO access to `install:dev:*` scripts** (not in published package)

- 🔧 **Contributors** (developing s3db.js itself):
  - Clone repo: `git clone <repo>`
  - Run: `pnpm install` (gets dev tools)
  - **HAS access to `install:dev:*` scripts** (in repo)
  - Choose what to install based on what you're working on

---

## ⚠️ Important: Two Different Scenarios

This guide is for **contributors developing s3db.js**. If you're a **user** wanting to use s3db.js in your project, see the main [README.md](README.md) instead.

| I want to... | I am a... | Guide |
|--------------|-----------|-------|
| Use s3db.js in my app | **End User** | [README.md](README.md) |
| Contribute to s3db.js | **Contributor** | This guide (DEVELOPMENT.md) |

---

## 🎯 Problem

s3db.js has **40+ optional plugin dependencies** (AWS SDKs, BigQuery, Puppeteer, etc). Installing all of them takes:
- ⏱️ **10+ minutes** to download
- 💾 **2+ GB** of node_modules
- 🚀 **Slows down CI/CD**

But you probably only need **a few** for your work!

## ✅ Solution: Modular Installation

We've split dependencies into **optional groups**. Install only what you need!

### 📦 Installation Tiers

```bash
# 1. Minimal (CORE ONLY - recommended for most work)
pnpm install                          # Install base s3db.js
pnpm run install:dev:minimal          # No extra deps

# 2. Common (CORE + Replicators + Plugins)
pnpm install
pnpm run install:dev:common           # PostgreSQL, BigQuery, API, Identity

# 3. Full (ALL dependencies - only for comprehensive testing)
pnpm install
pnpm run install:dev:full             # Everything (~2GB node_modules)
```

### 🎨 Granular Installation

Install specific plugin groups as needed:

```bash
# Database Replicators (PostgreSQL, BigQuery, MySQL, SQS)
pnpm run install:dev:replicators

# Plugins (API, Identity, ML, Scheduler)
pnpm run install:dev:plugins

# Web Scraping (Puppeteer, Stealth, Ghost Cursor)
pnpm run install:dev:puppeteer

# Cloud Inventory (30+ AWS SDK clients)
pnpm run install:dev:cloud
```

## 🧪 Testing Strategy

### Run tests without all dependencies:

```bash
# Core tests only (no plugins)
pnpm test -- tests/database.test.js
pnpm test -- tests/resource.test.js
pnpm test -- tests/schema.test.js

# Specific plugin tests
pnpm run install:dev:replicators
pnpm test -- tests/plugins/replicator.test.js

pnpm run install:dev:puppeteer
pnpm test -- tests/plugins/puppeteer.test.js
```

### CI/CD Optimization

For CI pipelines, install only what you test:

```yaml
# .github/workflows/test.yml
- name: Install minimal deps
  run: pnpm install

- name: Run core tests
  run: pnpm test -- tests/ --testPathIgnorePatterns=plugins/

- name: Install plugin deps
  run: pnpm run install:dev:common

- name: Run plugin tests
  run: pnpm test -- tests/plugins/
```

## 📊 Dependency Groups Breakdown

### Core (Always Installed - ~50MB)
```
@aws-sdk/client-s3
fastest-validator
nanoid
lodash-es
```

### Replicators (~500MB)
```
pg                      # PostgreSQL
@google-cloud/bigquery  # BigQuery
@planetscale/database   # PlanetScale
@libsql/client         # Turso/LibSQL
@aws-sdk/client-sqs    # SQS
amqplib                # RabbitMQ
```

### Plugins (~300MB)
```
hono                   # API server
jose                   # JWT/OAuth2
bcrypt                 # Password hashing
nodemailer            # Email
node-cron             # Scheduler
@tensorflow/tfjs-node # ML
```

### Puppeteer (~400MB)
```
puppeteer-extra
puppeteer-extra-plugin-stealth
user-agents
ghost-cursor
```

### Cloud Inventory (~800MB)
```
30+ AWS SDK clients for CloudInventoryPlugin
(EC2, ECS, Lambda, RDS, etc.)
```

## 🔧 Troubleshooting

### "Cannot find module 'pg'"

You tried to use a plugin without its dependencies. Install them:

```bash
pnpm run install:dev:replicators  # For PostgresReplicator
```

### "Module not found: @google-cloud/bigquery"

```bash
pnpm run install:dev:replicators  # Includes BigQuery
```

### Tests failing with "Optional dependency not installed"

This is expected! The test checks for graceful failures. If you want to run the test:

```bash
# Identify which group the dependency belongs to
pnpm run install:dev:replicators  # or :plugins, :puppeteer, :cloud
```

## 🎯 Recommended Workflow

### For Core Development (Database, Schema, Encoding)
```bash
pnpm install
pnpm run build
pnpm run test:core  # Tests ONLY core features (ignores plugins)
```

**What works without extra deps:**
- ✅ Database operations (CRUD)
- ✅ Schema validation
- ✅ Partitioning
- ✅ Encryption
- ✅ Streaming API
- ✅ Core plugins (TTL, Cache with memory driver, Metrics)

### For Plugin Development
```bash
pnpm install
pnpm run install:dev:common  # Installs replicators + plugins

# Test specific plugin
pnpm test -- tests/plugins/replicator.test.js
pnpm test -- tests/plugins/api.test.js
```

### For Release Testing (All Tests)
```bash
pnpm install
pnpm run test:ci  # Installs all deps + runs full test suite
```

### CI/CD Configuration

Use the modular approach in your `.github/workflows/test.yml`:

```yaml
name: Test

on: [push, pull_request]

jobs:
  test-core:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install core dependencies
        run: pnpm install

      - name: Run core tests
        run: pnpm run test:core

  test-plugins:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install all dependencies
        run: |
          pnpm install
          pnpm run install:dev:full

      - name: Run plugin tests
        run: pnpm run test:plugins

  test-full:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install and test everything
        run: pnpm run test:ci
```

This approach:
- ✅ Runs core tests in ~2 minutes (fast feedback)
- ✅ Runs plugin tests in parallel
- ✅ Full test suite runs only when needed
- ✅ Saves CI/CD costs (less downloads, faster builds)

## 📝 Notes

- **Users are unaffected**: `pnpm add s3db.js` still installs ONLY core dependencies
- **All dependencies are optional**: Plugins check at runtime with helpful error messages
- **CI/CD is faster**: Install only what you test (3-10x faster!)
- **Node_modules is smaller**: 50MB → 500MB → 2GB (your choice!)

## 🚀 Publishing

Before releasing, verify the package size:

```bash
pnpm pack --dry-run
# Should be ~500KB (core only, no devDependencies)
```

The published package:
- ✅ Contains only `dependencies` (core S3 SDK)
- ✅ Lists plugins in `peerDependencies` (optional)
- ✅ Has zero bloat (no dev tools, no test files)

Users install plugins on-demand:

```bash
# User installs s3db.js
pnpm add s3db.js         # ~1MB (core only)

# User wants PostgreSQL replication
pnpm add pg              # Installs peer dependency
```

---

## 📊 How It Works - Visual Guide

### 👥 End Users (Using s3db.js in their projects)

**Context**: Someone installing s3db.js via npm/pnpm to use in their app.

```
User runs: pnpm add s3db.js
     ↓
Installs ONLY dependencies (core)
     ├── @aws-sdk/client-s3
     ├── fastest-validator
     ├── nanoid
     └── lodash-es
     Total: ~1MB

User imports: import { PostgresReplicator } from 's3db.js/plugins'
     ↓
Runtime check fails: "Missing dependency 'pg'"
     ↓
User runs: pnpm add pg
     ↓
✅ Works! PostgresReplicator now functional
```

### 🔧 Contributors (Developing s3db.js itself)

**Context**: Someone who cloned the s3db.js repo to contribute code.

```
Developer clones repo and runs: pnpm install
     ↓
Installs dependencies + devDependencies
     ├── Core S3 SDK
     ├── Build tools (Rollup, esbuild)
     ├── Test tools (Jest, TypeScript)
     └── ❌ NO plugin dependencies (peerDependencies are optional)
     Total: ~50MB

Developer wants to work on PostgresReplicator
     ↓
Runs: pnpm run install:dev:replicators
     ↓
Installs: pg, @google-cloud/bigquery, etc.
     Total: ~500MB

Developer runs: pnpm test -- tests/plugins/replicator.test.js
     ↓
✅ Tests pass! Dependencies available
```

### 🤖 CI/CD (Automated testing in GitHub Actions)

**Context**: GitHub Actions workflow running tests on every commit.

```
GitHub Actions triggered
     ↓
Job 1: Core Tests (fast, 2 min)
     pnpm install
     pnpm run test:core
     Total: ~50MB downloads

Job 2: Plugin Tests (parallel, 5 min)
     pnpm install
     pnpm run install:dev:full
     pnpm run test:plugins
     Total: ~2GB downloads

Job 3: Full Suite (when needed)
     pnpm run test:ci
     (installs everything + runs all tests)
```

---

## 🔑 Key Files

| File | Purpose |
|------|---------|
| `package.json` | Defines `dependencies` (core), `peerDependencies` (plugins), `devDependencies` (build tools) |
| `.npmrc` | Sets `auto-install-peers=false` to prevent auto-installing optional deps |
| `src/plugins/concerns/plugin-dependencies.js` | Runtime validation of plugin dependencies |
| `scripts/install-deps.sh` | Interactive installer for developers |
| `DEVELOPMENT.md` | This file! |

---

## 🆘 Common Questions

**Q: I'm a user. Why do I get "Missing dependency" errors?**

A: You're using a plugin that requires an optional dependency. Install it manually:
```bash
pnpm add pg  # For PostgresReplicator
pnpm add @google-cloud/bigquery  # For BigQueryReplicator
```

**Q: I'm a developer. Why are my plugin tests failing?**

A: You need to install plugin dependencies:
```bash
pnpm run install:dev:common  # For most plugins
pnpm run install:dev:full    # For all plugins
```

**Q: How do I run tests without installing everything?**

A: Use targeted test commands:
```bash
pnpm run test:core     # Core only (no plugins)
pnpm test -- tests/database.test.js  # Specific file
```

**Q: Will this affect published package size?**

A: No! Published package still has:
- ✅ Core dependencies (installed automatically)
- ✅ Peer dependencies (optional, user installs manually)
- ❌ Dev dependencies (NOT included in published package)

**Q: How do I add a new plugin dependency?**

1. Add to `peerDependencies` in package.json
2. Add to `peerDependenciesMeta` with `"optional": true`
3. Add to appropriate `install:dev:*` script
4. Register in `src/plugins/concerns/plugin-dependencies.js`
5. Use `requirePluginDependency()` in plugin constructor

---

**Questions?** Check the [Plugin Dependency System](src/plugins/concerns/plugin-dependencies.js) for how validation works.

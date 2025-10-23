# Development Scripts

This directory contains utility scripts for development and testing.

## 📦 PeerDependencies Management

s3db.js uses a **dual approach** for plugin dependencies:

### For Developers (You)

All plugin dependencies are already included as **devDependencies** in `package.json`:

```bash
pnpm install  # Installs everything automatically
```

No extra steps needed! This includes:
- `@aws-sdk/client-sqs` - For SQS replicator/consumer
- `@google-cloud/bigquery` - For BigQuery replicator
- `amqplib` - For RabbitMQ consumer
- `node-cron` - For Tfstate Plugin auto-sync
- `pg` - For PostgreSQL replicator

### For End Users

Plugin dependencies are declared as **peerDependencies**:
- Package managers automatically check version compatibility
- Users only install what they need
- Clear error messages if versions don't match

**Example:** User wants PostgreSQL replication:
```bash
pnpm add s3db.js pg  # pnpm checks that pg version is compatible
```

## 🧪 Testing

Just run tests - dependencies are already installed:

```bash
pnpm test           # All tests
pnpm test:plugins   # Plugin tests specifically
```

## 🔧 Optional Scripts

These scripts are still available but **no longer required** for development:

```bash
# Reinstall all peer dependencies (useful if you deleted node_modules)
pnpm run install:peers

# Use shell script (dynamic reading from package.json)
./scripts/install-peer-deps.sh
```

## 📝 Benefits of This Approach

✅ **Developers:** `pnpm install` and you're ready
✅ **End users:** Only install what they use
✅ **Package managers:** Automatic version compatibility checking
✅ **CI/CD:** No special configuration needed
✅ **Documentation:** Clear in peerDependencies what each plugin needs

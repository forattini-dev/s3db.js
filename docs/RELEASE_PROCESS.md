# 🚀 S3DB.js Release Process

This document outlines the professional release process for S3DB.js, ensuring clean npm packages and proper binary distribution.

## 📦 Package Structure

### What gets published to NPM:
```
s3db.js/
├── dist/           # Compiled JavaScript (CJS + ESM + Types)
├── src/            # Source code (for debugging/transparency)
├── bin/cli.js      # Lightweight Node.js CLI script
├── mcp/server.js   # Lightweight MCP server script
├── package.json    # Package metadata
├── README.md       # Main documentation
└── UNLICENSE       # License file
```

### What gets excluded from NPM (via .npmignore):
- `releases/` - Standalone binaries
- `build-binaries/` - Build artifacts  
- `tests/` - Test files
- `examples/` - Example code
- `scripts/` - Build scripts
- Development configs
- Documentation except README.md

## 🔄 Release Workflow

### 1. Prepare Release
```bash
# Install dependencies
pnpm install

# Run full test suite
pnpm run test:full

# Build distributions
pnpm run build

# Generate performance benchmark
pnpm run benchmark
```

### 2. Version Bump
```bash
# Update version in package.json
npm version patch|minor|major

# Or manually edit version and run:
git add package.json
git commit -m "chore: bump version to X.Y.Z"
git tag vX.Y.Z
```

### 3. Build Standalone Binaries
```bash
# Build all platform binaries
pnpm run build:binaries

# This creates:
# releases/s3db-linux-x64
# releases/s3db-macos-x64  
# releases/s3db-macos-arm64
# releases/s3db-win-x64.exe
# releases/s3db-mcp-linux-x64
# releases/s3db-mcp-macos-x64
# releases/s3db-mcp-macos-arm64
# releases/s3db-mcp-win-x64.exe
```

### 4. Test Package Contents
```bash
# Preview what will be published
npm pack --dry-run

# Create actual package for testing
npm pack

# Extract and verify contents
tar -tf s3db.js-X.Y.Z.tgz
```

### 5. Publish to NPM
```bash
# Publish to npm (runs prepack automatically)
npm publish

# Or for scoped packages:
npm publish --access public
```

### 6. Create GitHub Release
```bash
# Push code and tags
git push origin main --tags

# Create GitHub release with binaries
gh release create vX.Y.Z releases/* \\
  --title "S3DB.js vX.Y.Z" \\
  --notes "Release notes here"
```

## 📋 Pre-publish Checks

The `prepack` script automatically runs:
- ✅ Build process (`pnpm run build`)
- ✅ Quick tests (`pnpm run test:quick`)

Manual verification:
- ✅ All tests pass
- ✅ TypeScript definitions valid
- ✅ No development files in package
- ✅ README.md up to date
- ✅ Version bumped correctly

## 🎯 Distribution Strategy

### NPM Package (Lightweight)
- **Size**: ~200KB (no binaries)
- **Use case**: Node.js projects, libraries
- **Installation**: `npm install s3db.js`
- **CLI**: `npx s3db --help`
- **MCP**: `npx s3db-mcp --transport=sse`

### Standalone Binaries (GitHub Releases)
- **Size**: ~40-55MB per binary (includes all dependencies)
- **Use case**: System deployment, CI/CD, Docker
- **Installation**: Download from GitHub releases
- **No Node.js required**

## 🔍 Quality Assurance

### Package Size Monitoring
```bash
# Check package size
npm pack --dry-run | grep "package size"

# Analyze bundle
npx bundlesize
```

### Dependency Audit
```bash
# Security audit
npm audit

# Check for unused dependencies
npx depcheck
```

### Cross-platform Testing
```bash
# Test binaries on different platforms
./releases/s3db-linux-x64 --version
./releases/s3db-macos-x64 --version
./releases/s3db-win-x64.exe --version
```

## 🚨 Troubleshooting

### Binary Size Too Large
- Review dependencies in `package.json`
- Check if dev dependencies leaked into production
- Consider splitting optional features

### NPM Package Too Large  
- Verify `.npmignore` is working
- Remove unnecessary files from `package.json` `files` array
- Check for binary artifacts in `dist/`

### Missing Dependencies in Binaries
- Ensure `--packages=bundle` in esbuild config
- Check `pkg` configuration for native modules
- Test binary on clean system without Node.js

## 📈 Success Metrics

- NPM package < 500KB
- Standalone binaries < 60MB
- All tests passing
- No security vulnerabilities
- TypeScript definitions valid
- Cross-platform compatibility verified
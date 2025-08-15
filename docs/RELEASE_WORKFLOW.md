# 🚀 S3DB.js Release Workflow

## 🎯 The Challenge

S3DB.js has a version dependency cycle:
1. **Version must be in package.json** for build process
2. **Build embeds version** from package.json into JavaScript
3. **dist/ must be updated** for npm installs to work
4. **Everything must be committed** together

## ✅ Correct Release Sequence

### Option A: Manual Sequence (Recommended for first time)

```bash
# 1. 🔍 Pre-check (optional but recommended)
pnpm run release:check

# 2. 📝 Update version manually in package.json
# Edit package.json: "version": "9.0.2" (without 'v' prefix)

# 3. 🏗️ Build with new version
pnpm run build

# 4. 🧪 Test with new version
pnpm run test:quick
pnpm run test:ts

# 5. 📦 Commit everything together
git add package.json dist/ 
git commit -m "chore: release v9.0.2

🚀 Release v9.0.2 with embedded version

- Updated package.json version to 9.0.2  
- Rebuilt dist/ with embedded version
- All tests passing

Co-Authored-By: Claude <noreply@anthropic.com>"

# 6. 🏷️ Create and push tag
git tag -a v9.0.2 -m "Release v9.0.2"
git push origin main --tags

# 7. 🎉 GitHub Actions takes over automatically!
```

### Option B: Automated Script (After testing Option A)

```bash
# All-in-one command (after we test the flow)
pnpm run release v9.0.2
```

## 🔄 What Happens After Tag Push

GitHub Actions automatically:
1. **Checks out code** with your updated dist/
2. **Runs full test suite** 
3. **Builds binaries** for all platforms
4. **Creates GitHub release** with binaries
5. **Publishes to npm** (if configured)

## 📋 Step-by-Step Guide

### 1. Pre-Release Preparation

```bash
# Ensure clean working directory
git status

# Check current version
node -p "require('./package.json').version"

# Run pre-checks
pnpm run release:check
```

### 2. Version Update

**Edit `package.json`:**
```json
{
  "version": "9.0.2"  // ← Update this (no 'v' prefix)
}
```

### 3. Build with New Version

```bash
# This embeds the version from package.json into the JavaScript
pnpm run build

# Verify version was embedded
grep -r "9.0.2" dist/
```

### 4. Test Everything

```bash
# Quick tests to ensure build works
pnpm run test:quick

# TypeScript definitions  
pnpm run test:ts

# Optional: Test benchmark
pnpm run benchmark
```

### 5. Commit & Tag

```bash
# Add all changes
git add package.json dist/

# Commit with descriptive message
git commit -m "chore: release v9.0.2

🚀 Release v9.0.2 with embedded version

- Updated package.json version to 9.0.2
- Rebuilt dist/ with embedded version  
- All tests passing

Co-Authored-By: Claude <noreply@anthropic.com>"

# Create annotated tag
git tag -a v9.0.2 -m "Release v9.0.2

🚀 S3DB.js v9.0.2

Features:
- Advanced metadata encoding (31% better than base64)
- Dictionary compression for common values  
- ISO timestamp optimization (62.5% savings)
- UUID compression (30.6% reduction)
- Smart encoding selection
- Performance optimizations

📦 Installation:
npm install s3db.js@9.0.2

📥 Binaries available on GitHub Releases"

# Push everything
git push origin main --tags
```

### 6. Monitor Release

```bash
# GitHub Actions will now:
# 1. Run full CI/CD pipeline
# 2. Build cross-platform binaries  
# 3. Create GitHub release
# 4. Publish to npm

# Monitor at:
echo "https://github.com/forattini-dev/s3db.js/actions"
echo "https://github.com/forattini-dev/s3db.js/releases"
```

## 🛠️ Improved Release Script

The current script needs to be updated to handle this flow. Here's the corrected sequence it should do:

1. **Update package.json version**
2. **Run build with new version** 
3. **Run tests**
4. **Commit package.json + dist/**
5. **Create and push tag**

## ⚠️ Important Notes

### Version Format
- **package.json**: `"9.0.2"` (no prefix)
- **Git tag**: `v9.0.2` (with 'v' prefix)

### What Gets Committed
```
✅ package.json     # Updated version
✅ dist/           # Built with embedded version
❌ releases/       # Excluded (.gitignore)
❌ build-binaries/ # Excluded (.gitignore)
```

### NPM vs GitHub
- **npm package**: Uses dist/ from your commit
- **GitHub binaries**: Built fresh by Actions

## 🚨 Troubleshooting

### Version Mismatch
```bash
# Check embedded version
node -p "require('./dist/s3db.cjs.js')" | grep -o '"[0-9]\+\.[0-9]\+\.[0-9]\+"'

# Should match package.json
node -p "require('./package.json').version"
```

### Build Fails
```bash
# Clean and rebuild
rm -rf dist/
pnpm run build

# Check rollup config version replacement
grep -r "__PACKAGE_VERSION__" src/
```

### Tests Fail After Version Change
```bash
# Some tests might expect specific version
# Update test fixtures if needed
grep -r "9\\.0\\." tests/
```

## 🎉 Success Indicators

After successful release:
- ✅ **GitHub release created** with all binaries
- ✅ **npm package published** with correct version
- ✅ **dist/ has embedded version** matching package.json
- ✅ **Tag pushed** and visible on GitHub
- ✅ **All Actions passed** in CI/CD

## 🔄 Next Release

For the next release, repeat the process:
```bash
# Always start clean
git pull origin main
git status  # Should be clean

# Update version → build → test → commit → tag → push
```

This ensures every release has:
- Correct version in package.json
- Built dist/ with embedded version
- All files properly committed
- Automatic binary generation via Actions
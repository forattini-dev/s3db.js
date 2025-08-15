# S3DB.js Distribution Strategy

## NPM Package Distribution

### ✅ What to Include in NPM

```
s3db.js/
├── dist/           # ✅ Compiled JavaScript (all formats)
│   ├── s3db.cjs.js      # CommonJS
│   ├── s3db.es.js       # ES Modules  
│   ├── s3db.iife.js     # Browser
│   └── s3db.d.ts        # TypeScript definitions
├── src/            # ✅ Source code (for source maps & debugging)
├── bin/            # ✅ CLI scripts (NOT compiled binaries)
│   ├── cli.js           # Legacy CLI
│   └── s3db-cli.js      # New CLI
├── mcp/            # ✅ MCP server
├── package.json    # ✅ Required
├── README.md       # ✅ Required
├── LICENSE         # ✅ Required
└── PLUGINS.md      # ✅ Documentation
```

### ❌ What NOT to Include

- Compiled binaries (s3db-linux, s3db-win.exe, etc.)
- Test files and test data
- Development configs (jest, rollup, etc.)
- Coverage reports
- Examples folder (too heavy)
- .env files
- Build scripts

### 📦 Package Size Guidelines

| Status | Size | Action |
|--------|------|--------|
| ✅ Ideal | < 1MB | Ship it! |
| ⚠️ Acceptable | 1-5MB | Consider optimizing |
| ⚠️ Large | 5-10MB | Need good reason |
| ❌ Too Large | > 10MB | Split or use CDN |

Current S3DB.js: ~500KB unpacked ✅

## Binary Distribution Options

### Option 1: GitHub Releases (Recommended) ⭐

```yaml
# .github/workflows/release.yml
- name: Build Binaries
  run: npm run build:binaries
  
- name: Upload to GitHub Release
  uses: softprops/action-gh-release@v1
  with:
    files: |
      bin/s3db-linux-x64
      bin/s3db-macos-x64
      bin/s3db-win-x64.exe
```

**Users install via:**
```bash
# NPM for Node.js usage
npm install s3db.js

# Binary from GitHub
curl -L https://github.com/you/s3db.js/releases/latest/download/s3db-linux-x64 -o s3db
chmod +x s3db
```

### Option 2: Separate NPM Package

```json
// package.json for @s3db/cli-binary
{
  "name": "@s3db/cli-binary",
  "version": "9.0.0",
  "description": "Precompiled S3DB CLI binaries",
  "bin": {
    "s3db": "./install.js"
  },
  "scripts": {
    "postinstall": "node install.js"
  }
}
```

### Option 3: Optional Dependencies

```json
// package.json
{
  "optionalDependencies": {
    "@s3db/cli-linux-x64": "9.0.0",
    "@s3db/cli-darwin-x64": "9.0.0",
    "@s3db/cli-win32-x64": "9.0.0"
  }
}
```

### Option 4: CDN Distribution

```bash
# Direct download from CDN
curl -L https://unpkg.com/@s3db/cli-binary@latest/linux-x64 -o s3db

# Or from custom CDN
curl -L https://cdn.s3db.io/cli/latest/linux-x64 -o s3db
```

## Installation Instructions for Users

### For Node.js Projects
```bash
# Install package
npm install s3db.js

# Use programmatically
import { S3db } from 's3db.js';

# Use CLI (requires Node.js)
npx s3db --help
```

### For Standalone CLI
```bash
# Option 1: Install globally with Node.js
npm install -g s3db.js
s3db --help

# Option 2: Download binary (no Node.js required)
curl -L https://github.com/forattini-dev/s3db.js/releases/latest/download/s3db-$(uname -s)-$(uname -m) -o s3db
chmod +x s3db
./s3db --help

# Option 3: Homebrew (macOS/Linux)
brew install s3db

# Option 4: Docker
docker run -it s3db/cli --help
```

## Platform-Specific Distribution

### macOS
```bash
# Homebrew Formula
brew tap forattini-dev/s3db
brew install s3db
```

### Windows
```powershell
# Chocolatey
choco install s3db

# Scoop
scoop bucket add s3db https://github.com/forattini-dev/s3db-bucket
scoop install s3db

# WinGet
winget install s3db
```

### Linux
```bash
# Snap
snap install s3db

# APT (Debian/Ubuntu)
curl -s https://packagecloud.io/install/repositories/s3db/stable/script.deb.sh | sudo bash
sudo apt-get install s3db

# YUM (RHEL/CentOS)
curl -s https://packagecloud.io/install/repositories/s3db/stable/script.rpm.sh | sudo bash
sudo yum install s3db
```

## Best Practices Summary

1. **NPM Package**: JavaScript only, no binaries
2. **Binaries**: GitHub Releases or separate distribution
3. **Size**: Keep NPM package under 1MB
4. **Dependencies**: Mark AWS SDK as peer dependency
5. **Source Maps**: Include source for debugging
6. **Documentation**: README.md only in NPM

## Package.json Configuration

```json
{
  "name": "s3db.js",
  "files": [
    "dist",
    "src", 
    "bin/*.js",
    "mcp",
    "README.md",
    "LICENSE",
    "PLUGINS.md"
  ],
  "bin": {
    "s3db": "./bin/s3db-cli.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "peerDependencies": {
    "@aws-sdk/client-s3": "^3.0.0"
  }
}
```

## Release Checklist

- [ ] Run tests: `npm test`
- [ ] Build dist: `npm run build`
- [ ] Check package size: `npm pack --dry-run`
- [ ] Verify files: `npm publish --dry-run`
- [ ] Update version: `npm version minor`
- [ ] Publish to NPM: `npm publish`
- [ ] Create GitHub Release
- [ ] Upload binaries to Release
- [ ] Update Homebrew formula
- [ ] Update Docker image
- [ ] Announce on social media
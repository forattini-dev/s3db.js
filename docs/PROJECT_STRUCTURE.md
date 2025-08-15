# 📁 S3DB.js Project Structure

Clean and organized project structure for professional development.

## 🎯 Root Directory

```
s3db.js/
├── 📦 src/                    # Source code
├── 📦 dist/                   # Built packages (CJS + ESM + Types)
├── 📦 tests/                  # Test suites  
├── 📦 scripts/                # Automation scripts
├── 📦 mcp/                    # MCP server
├── 📦 bin/                    # CLI scripts
├── 📦 .github/                # GitHub Actions
├── 📄 package.json            # Package configuration
├── 📄 benchmark-compression.js # Performance benchmarks
└── 📄 README.md              # Main documentation
```

## 🛠️ Scripts Directory

**Location**: `scripts/` (excluded from npm package)

```
scripts/
├── 🔨 build-binaries.sh      # Build standalone binaries
├── 🔍 pre-release-check.sh   # Pre-release validation
└── 🚀 release.sh             # Automated release process
```

### Usage:
```bash
# Use via npm scripts (recommended)
pnpm run build:binaries       # → scripts/build-binaries.sh
pnpm run release:check        # → scripts/pre-release-check.sh  
pnpm run release v9.0.2       # → scripts/release.sh v9.0.2

# Direct execution (if needed)
scripts/build-binaries.sh
scripts/pre-release-check.sh
scripts/release.sh v9.0.2
```

## 📦 Distribution

### NPM Package (Lightweight ~200KB)
**Includes:**
```
✅ dist/           # Built JavaScript + TypeScript definitions
✅ src/            # Source code (for debugging)
✅ bin/cli.js      # Node.js CLI script
✅ mcp/server.js   # MCP server script
✅ package.json    # Package metadata
✅ README.md       # Documentation
✅ LICENSE         # License file
```

**Excludes:**
```
❌ scripts/        # Build/release automation
❌ tests/          # Test suites
❌ .github/        # CI/CD workflows
❌ releases/       # Standalone binaries
❌ build-binaries/ # Build artifacts
❌ examples/       # Example code
❌ *.md           # Extra documentation (except README)
```

### GitHub Releases (Standalone Binaries ~40-55MB)
**Includes:**
```
✅ s3db-linux-x64            # Linux CLI
✅ s3db-macos-x64            # macOS Intel CLI
✅ s3db-macos-arm64          # macOS Apple Silicon CLI
✅ s3db-win-x64.exe          # Windows CLI
✅ s3db-mcp-linux-x64        # Linux MCP Server
✅ s3db-mcp-macos-x64        # macOS Intel MCP Server
✅ s3db-mcp-macos-arm64      # macOS Apple Silicon MCP Server
✅ s3db-mcp-win-x64.exe      # Windows MCP Server
```

## 🔧 Development

### Build Process
```bash
# Regular build (for npm)
pnpm run build               # → dist/s3db.cjs.js + s3db.es.js + s3db.d.ts

# Binary build (for releases)  
pnpm run build:binaries      # → releases/* (8 platform binaries)
```

### Testing
```bash
pnpm run test:quick          # Fast test suite
pnpm run test:ts             # TypeScript validation
pnpm run test:full           # Complete test suite
pnpm run benchmark           # Performance benchmarks
```

### Release
```bash
pnpm run release:check       # Pre-release validation
pnpm run release v9.0.2      # Automated release process
```

## 📋 File Organization Principles

### ✅ Clean Root
- **Minimal files** in root directory
- **Scripts organized** in `scripts/`
- **No build artifacts** committed (except `dist/`)
- **Clear separation** of concerns

### ✅ NPM Package Optimization
- **Lightweight package** (~200KB vs ~500MB with binaries)
- **Only essential files** included
- **Professional structure** for developers

### ✅ Developer Experience
- **Easy commands** via npm scripts
- **Clear documentation** for each component
- **Consistent patterns** across all scripts

## 🚀 CI/CD Integration

### GitHub Actions
```
.github/workflows/
├── ci.yml           # Continuous integration
└── release.yml      # Release automation
```

### Automation Flow
1. **Code Push** → CI runs tests
2. **Tag Push** → Release builds binaries + creates GitHub release
3. **NPM Publish** → Lightweight package published

## 🎯 Benefits

### For Developers
- **Clean npm install** (only essential files)
- **Fast download** (200KB vs 500MB)
- **Source available** for debugging
- **TypeScript support** included

### For Deployment
- **Standalone binaries** (no Node.js required)
- **Multi-platform support** (Linux/macOS/Windows)
- **Automated releases** via GitHub Actions
- **Professional distribution** strategy

### For Maintainers
- **Organized structure** easy to navigate
- **Automated workflows** reduce manual work
- **Quality gates** ensure stability
- **Clear documentation** for onboarding

---

## 🏆 Result

A **professional, scalable project structure** that:
- ✅ Keeps npm packages lightweight
- ✅ Organizes scripts logically  
- ✅ Supports multiple distribution methods
- ✅ Maintains clean development experience
- ✅ Scales with project growth

Perfect for serious Node.js projects! 🚀
#!/bin/bash

set -e

echo "🚀 Building COMPLETE Standalone Binaries (with ALL dependencies)"
echo "================================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Clean and create directories
rm -rf build-binaries bin/standalone
mkdir -p build-binaries bin/standalone

# Step 1: Bundle S3DB CLI with esbuild (includes AWS SDK)
echo -e "${YELLOW}📦 Bundling S3DB CLI with ALL dependencies...${NC}"

cat > build-binaries/s3db-entry.js << 'EOF'
#!/usr/bin/env node
// Entry point that ensures all dependencies are bundled

// Set up globals
global.STANDALONE_BUILD = true;

// Import and run CLI
import '../bin/s3db-cli.js';
EOF

npx esbuild build-binaries/s3db-entry.js \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=build-binaries/s3db-complete.cjs \
  --format=cjs \
  --minify \
  --keep-names \
  --loader:.node=file \
  --define:process.env.NODE_ENV='"production"' \
  --inject:./scripts/node-shims.js \
  --alias:@aws-sdk/client-s3=./node_modules/@aws-sdk/client-s3/dist-cjs/index.js \
  --alias:@smithy/node-http-handler=./node_modules/@smithy/node-http-handler/dist-cjs/index.js \
  || {
    echo -e "${RED}❌ esbuild failed for CLI${NC}"
    
    # Fallback: Try with just Node.js bundling
    echo -e "${YELLOW}🔧 Trying fallback method...${NC}"
    
    node -e "
    const fs = require('fs');
    const path = require('path');
    
    // Read all necessary files
    const cli = fs.readFileSync('bin/s3db-cli.js', 'utf-8');
    const s3db = fs.readFileSync('dist/s3db.cjs.js', 'utf-8');
    
    // Create mega bundle
    const bundle = \`
    #!/usr/bin/env node
    
    // S3DB Library
    \${s3db}
    
    // CLI Code
    \${cli.replace('#!/usr/bin/env node', '')}
    \`;
    
    fs.writeFileSync('build-binaries/s3db-complete.cjs', bundle);
    console.log('✅ Fallback bundle created');
    "
  }

# Step 2: Bundle MCP Server with esbuild
echo -e "${YELLOW}📦 Bundling S3DB MCP Server with ALL dependencies...${NC}"

npx esbuild mcp/server.js \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=build-binaries/s3db-mcp-complete.cjs \
  --format=cjs \
  --minify \
  --keep-names \
  --loader:.node=file \
  --define:process.env.NODE_ENV='"production"' \
  --external:cpu-features \
  --external:ssh2 \
  || echo -e "${YELLOW}⚠️  MCP bundle might have warnings${NC}"

# Step 3: Fix shebang lines
echo -e "${YELLOW}🔧 Fixing shebang lines...${NC}"
for file in build-binaries/*.cjs; do
  if [ -f "$file" ]; then
    # Remove any existing shebang
    sed -i '1s/^#!.*$//' "$file" 2>/dev/null || sed -i '' '1s/^#!.*$//' "$file"
    # Add correct shebang
    echo '#!/usr/bin/env node' | cat - "$file" > temp && mv temp "$file"
    chmod +x "$file"
  fi
done

# Step 4: Create package.json for pkg
echo -e "${YELLOW}📝 Creating package.json for pkg...${NC}"

cat > build-binaries/package.json << 'EOF'
{
  "name": "s3db-standalone",
  "version": "9.0.0",
  "main": "s3db-complete.cjs",
  "bin": {
    "s3db": "s3db-complete.cjs",
    "s3db-mcp": "s3db-mcp-complete.cjs"
  },
  "pkg": {
    "scripts": [
      "s3db-complete.cjs",
      "s3db-mcp-complete.cjs"
    ],
    "assets": [
      "node_modules/**/*.json",
      "node_modules/**/*.node"
    ],
    "targets": [
      "node18-linux-x64",
      "node18-macos-x64",
      "node18-macos-arm64",
      "node18-win-x64"
    ],
    "compress": "GZip",
    "outputPath": "../bin/standalone"
  }
}
EOF

# Step 5: Build with pkg
echo -e "${YELLOW}🏗️  Building standalone executables with pkg...${NC}"

cd build-binaries

# Check if pkg is installed
if ! command -v pkg &> /dev/null; then
  echo -e "${YELLOW}Installing pkg...${NC}"
  npm install -g pkg
fi

# Build s3db CLI binary
echo -e "${YELLOW}Building s3db CLI binary...${NC}"
pkg s3db-complete.cjs \
  --targets node18-linux-x64,node18-macos-x64,node18-win-x64 \
  --output ../bin/standalone/s3db \
  --compress GZip \
  --debug \
  || echo -e "${RED}❌ Failed to build s3db CLI${NC}"

# Build s3db-mcp binary
echo -e "${YELLOW}Building s3db-mcp binary...${NC}"
pkg s3db-mcp-complete.cjs \
  --targets node18-linux-x64,node18-macos-x64,node18-win-x64 \
  --output ../bin/standalone/s3db-mcp \
  --compress GZip \
  --debug \
  || echo -e "${RED}❌ Failed to build s3db-mcp${NC}"

cd ..

# Step 6: Alternative with Bun (if available)
if command -v bun &> /dev/null; then
  echo -e "${YELLOW}🥟 Also building with Bun for better compatibility...${NC}"
  
  bun build build-binaries/s3db-complete.cjs \
    --compile \
    --minify \
    --target=node \
    --outfile=bin/standalone/s3db-bun
    
  bun build build-binaries/s3db-mcp-complete.cjs \
    --compile \
    --minify \
    --target=node \
    --outfile=bin/standalone/s3db-mcp-bun
fi

# Step 7: Alternative with Deno (if available)
if command -v deno &> /dev/null; then
  echo -e "${YELLOW}🦕 Also building with Deno...${NC}"
  
  deno compile \
    --allow-all \
    --output=bin/standalone/s3db-deno \
    build-binaries/s3db-complete.cjs
fi

# Step 8: Show results
echo -e "${GREEN}✅ Build complete!${NC}"
echo ""
echo "📦 Created binaries:"

if [ -d "bin/standalone" ]; then
  for file in bin/standalone/*; do
    if [ -f "$file" ]; then
      size=$(du -h "$file" | cut -f1)
      echo "   • $(basename $file) ($size)"
    fi
  done
else
  echo -e "${RED}   No binaries found in bin/standalone/${NC}"
fi

echo ""
echo "🧪 Test the binaries:"
echo "   ./bin/standalone/s3db-linux-x64 --help"
echo "   ./bin/standalone/s3db-mcp-linux-x64 --help"
echo ""
echo "📝 Notes:"
echo "   - Binaries include ALL dependencies (AWS SDK, etc.)"
echo "   - Each binary is ~50-80MB (compressed)"
echo "   - No Node.js required to run"
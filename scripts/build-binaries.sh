#!/bin/bash

set -e

echo "🚀 Building S3DB Standalone Binaries"
echo "===================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Clean previous builds
echo -e "${YELLOW}🧹 Cleaning previous builds...${NC}"
rm -rf build-binaries releases
mkdir -p build-binaries releases

# Build CommonJS version if needed
if [ ! -f "dist/s3db.cjs.js" ]; then
    echo -e "${YELLOW}📦 Building CommonJS version...${NC}"
    pnpm run build
fi

# Bundle s3db CLI
echo -e "${YELLOW}📦 Bundling s3db CLI with all dependencies...${NC}"
npx esbuild bin/s3db-cli-standalone.js \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=build-binaries/s3db.cjs \
  --format=cjs \
  --minify-whitespace \
  --packages=bundle

# Bundle s3db-mcp server
echo -e "${YELLOW}📦 Bundling s3db-mcp server with all dependencies...${NC}"
npx esbuild mcp/server-standalone.js \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=build-binaries/s3db-mcp.cjs \
  --format=cjs \
  --minify-whitespace \
  --packages=bundle

# Create binaries with pkg
echo -e "${YELLOW}🏗️  Creating standalone executables...${NC}"

# s3db CLI
echo "Building s3db CLI binaries..."
npx pkg build-binaries/s3db.cjs \
  --targets node18-linux-x64,node18-macos-x64,node18-macos-arm64,node18-win-x64 \
  --output releases/s3db \
  --compress GZip

# s3db-mcp server
echo "Building s3db-mcp server binaries..."
npx pkg build-binaries/s3db-mcp.cjs \
  --targets node18-linux-x64,node18-macos-x64,node18-macos-arm64,node18-win-x64 \
  --output releases/s3db-mcp \
  --compress GZip

# Show results
echo -e "${GREEN}✅ Build complete!${NC}"
echo ""
echo "📦 Created binaries:"
for file in releases/*; do
    if [ -f "$file" ]; then
        size=$(du -h "$file" | cut -f1)
        echo "   • $(basename $file) ($size)"
    fi
done

echo ""
echo "🧪 Test commands:"
echo "   ./releases/s3db-linux-x64 --help"
echo "   ./releases/s3db-mcp-linux-x64 --help"
echo ""
echo "📝 Notes:"
echo "   - Each binary includes ALL dependencies"
echo "   - No Node.js required to run"
echo "   - macOS binaries need code signing: codesign --sign - <binary>"
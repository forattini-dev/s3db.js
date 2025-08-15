#!/bin/bash

set -e

echo "🚀 Building Final Standalone Binaries"
echo "====================================="

rm -rf build-binaries bin/standalone
mkdir -p build-binaries bin/standalone

# Build S3DB CLI
echo "📦 Building S3DB CLI..."
npx esbuild bin/s3db-cli-standalone.js \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=build-binaries/s3db.cjs \
  --format=cjs \
  --minify-whitespace \
  --packages=bundle

# Build MCP Server  
echo "📦 Building S3DB MCP Server..."
npx esbuild mcp/server.js \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=build-binaries/s3db-mcp.cjs \
  --format=cjs \
  --minify-whitespace \
  --packages=bundle

# Create package.json for pkg
cat > build-binaries/package.json << 'JSON'
{
  "bin": {
    "s3db": "s3db.cjs",
    "s3db-mcp": "s3db-mcp.cjs"
  },
  "pkg": {
    "scripts": ["*.cjs"],
    "targets": ["node18-linux-x64", "node18-macos-x64", "node18-win-x64"]
  }
}
JSON

cd build-binaries

# Build binaries
echo "🏗️ Building executables..."
npx pkg . --compress GZip --out-path ../bin/standalone

cd ..

echo "✅ Done! Binaries in ./bin/standalone/"
ls -lh bin/standalone/

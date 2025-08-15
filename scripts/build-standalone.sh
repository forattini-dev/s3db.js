#!/bin/bash

echo "🔨 Building S3DB Standalone Binary..."

# Create build directory
mkdir -p build-standalone
cd build-standalone

# Step 1: Bundle everything with esbuild (faster than Rollup for this)
echo "📦 Bundling with esbuild..."
npx esbuild ../bin/s3db-cli.js \
  --bundle \
  --platform=node \
  --target=node18 \
  --outfile=s3db-bundled.js \
  --external:@aws-sdk/* \
  --external:@smithy/* \
  --minify \
  --sourcemap

# Step 2: Create package.json for pkg
echo "📝 Creating package.json..."
cat > package.json << EOF
{
  "name": "s3db",
  "version": "9.0.0",
  "bin": "s3db-bundled.js",
  "dependencies": {
    "@aws-sdk/client-s3": "^3.850.0",
    "@aws-sdk/lib-storage": "^3.850.0",
    "@smithy/node-http-handler": "^4.1.0"
  },
  "pkg": {
    "scripts": ["s3db-bundled.js"],
    "targets": ["node18-linux-x64", "node18-macos-x64", "node18-win-x64"],
    "outputPath": "../bin"
  }
}
EOF

# Step 3: Install production dependencies
echo "📥 Installing AWS SDK..."
npm install --production --no-save

# Step 4: Build with pkg
echo "🏗️ Building binaries with pkg..."
npx pkg . --compress GZip

# Step 5: Clean up
cd ..
echo "🧹 Cleaning up..."
# rm -rf build-standalone

echo "✅ Done! Binaries are in ./bin/"
ls -lh bin/s3db-*
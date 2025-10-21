#!/bin/bash

# Script to install all peerDependencies for local development and testing
# This ensures all plugins can be tested without missing dependencies

echo "📦 Installing all peerDependencies for local development..."
echo ""

# Extract peerDependencies from package.json and install them
PEER_DEPS=$(node -pe "
  const pkg = require('./package.json');
  Object.keys(pkg.peerDependencies || {}).join(' ');
")

if [ -z "$PEER_DEPS" ]; then
  echo "❌ No peerDependencies found in package.json"
  exit 1
fi

echo "Found peerDependencies:"
echo "$PEER_DEPS" | tr ' ' '\n' | sed 's/^/  - /'
echo ""

echo "Installing as devDependencies..."
pnpm add -D $PEER_DEPS

echo ""
echo "✅ All peerDependencies installed!"
echo ""
echo "You can now test all plugins locally without missing dependency errors."

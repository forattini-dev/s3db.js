#!/bin/bash

# Build S3DB binary using Bun (much simpler!)

echo "🔨 Building S3DB binary with Bun..."

# Create standalone CLI file
cat > dist/s3db-standalone.js << 'EOF'
#!/usr/bin/env node

import { S3db } from '../src/index.js';
import { Command } from 'commander';
import chalk from 'chalk';

// Import all CLI code
import '../src/cli/index.js';
EOF

# Build with Bun
if command -v bun &> /dev/null; then
  echo "Building with Bun..."
  bun build dist/s3db-standalone.js \
    --compile \
    --minify \
    --outfile bin/s3db \
    --target=node
    
  echo "✅ Binary created at ./bin/s3db"
  echo "Size: $(du -h bin/s3db | cut -f1)"
else
  echo "❌ Bun not installed. Install with: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
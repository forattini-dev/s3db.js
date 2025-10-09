#!/bin/bash

# Install Git hooks for s3db.js development
echo "📦 Installing Git hooks..."

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Copy pre-commit hook
cp hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

echo "✅ Git hooks installed successfully!"
echo ""
echo "Pre-commit hook will:"
echo "  - Build the project (pnpm run build)"
echo "  - Stage dist/ files automatically"
echo "  - Ensure dist/ is always in sync with source"

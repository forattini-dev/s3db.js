#!/bin/bash

# S3DB.js Release Preparation Script

set -e

echo "🚀 S3DB.js Release Preparation"
echo "=============================="

# 1. Check if on main branch
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "⚠️  Warning: Not on main branch (current: $BRANCH)"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# 2. Run tests
echo "🧪 Running tests..."
npm test || { echo "❌ Tests failed"; exit 1; }

# 3. Build distribution
echo "📦 Building distribution..."
npm run build

# 4. Check package contents
echo "📋 Package contents:"
npm pack --dry-run

# 5. Get package size
SIZE=$(npm pack --dry-run 2>&1 | grep "package size" | awk '{print $3, $4}')
echo "📊 Package size: $SIZE"

# 6. Check if size is acceptable
SIZE_KB=$(npm pack --dry-run 2>&1 | grep "package size" | awk '{print $3}' | sed 's/[^0-9.]//g')
if (( $(echo "$SIZE_KB > 1000" | bc -l) )); then
  echo "⚠️  Warning: Package size > 1MB"
fi

# 7. Version bump
echo ""
echo "📌 Current version: $(node -p "require('./package.json').version")"
echo "Select version bump:"
echo "1) Patch (bug fixes)"
echo "2) Minor (new features)"
echo "3) Major (breaking changes)"
echo "4) Skip version bump"
read -p "Choice (1-4): " VERSION_CHOICE

case $VERSION_CHOICE in
  1) npm version patch ;;
  2) npm version minor ;;
  3) npm version major ;;
  4) echo "Skipping version bump" ;;
  *) echo "Invalid choice"; exit 1 ;;
esac

NEW_VERSION=$(node -p "require('./package.json').version")
echo "📌 New version: $NEW_VERSION"

# 8. Create release notes
echo ""
echo "📝 Creating release notes..."
cat > RELEASE_NOTES.md << EOF
# Release v$NEW_VERSION

## What's New
- 

## Bug Fixes
- 

## Breaking Changes
- None

## Installation

\`\`\`bash
npm install s3db.js@$NEW_VERSION
\`\`\`

## Standalone CLI

Download pre-compiled binaries from the [releases page](https://github.com/forattini-dev/s3db.js/releases/tag/v$NEW_VERSION).

### Linux/macOS
\`\`\`bash
curl -L https://github.com/forattini-dev/s3db.js/releases/download/v$NEW_VERSION/s3db-\$(uname -s)-\$(uname -m) -o s3db
chmod +x s3db
./s3db --help
\`\`\`

### Windows
Download \`s3db-win-x64.exe\` from the releases page.
EOF

echo "✅ Release notes created in RELEASE_NOTES.md"

# 9. Build binaries (optional)
read -p "Build standalone binaries? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "🔨 Building binaries..."
  bash scripts/build-standalone.sh
  
  echo "📦 Binary sizes:"
  ls -lh bin/s3db-* 2>/dev/null || echo "No binaries found"
fi

# 10. Dry run publish
echo ""
echo "📤 Dry run publish to NPM..."
npm publish --dry-run

# 11. Final confirmation
echo ""
echo "========================================="
echo "Ready to release v$NEW_VERSION"
echo "========================================="
echo "Next steps:"
echo "1. Review RELEASE_NOTES.md"
echo "2. Run: npm publish"
echo "3. Run: git push && git push --tags"
echo "4. Create GitHub release with binaries"
echo ""
echo "NPM command:"
echo "  npm publish"
echo ""
echo "GitHub release command:"
echo "  gh release create v$NEW_VERSION --title 'v$NEW_VERSION' --notes-file RELEASE_NOTES.md bin/s3db-*"
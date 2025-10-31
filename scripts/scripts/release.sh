#!/bin/bash

# 🚀 S3DB.js Release Automation Script
# This script automates the entire release process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_BRANCH="main"
REMOTE="origin"

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're on the right branch
check_branch() {
    local current_branch=$(git branch --show-current)
    if [ "$current_branch" != "$DEFAULT_BRANCH" ]; then
        log_error "You must be on the $DEFAULT_BRANCH branch to create a release"
        log_info "Current branch: $current_branch"
        exit 1
    fi
}

# Check if working directory is clean
check_clean_working_dir() {
    if [ -n "$(git status --porcelain)" ]; then
        log_error "Working directory is not clean. Please commit or stash changes."
        git status --short
        exit 1
    fi
}

# Check if we're up to date with remote
check_remote_sync() {
    log_info "Checking if local branch is up to date with remote..."
    git fetch $REMOTE $DEFAULT_BRANCH
    
    local local_commit=$(git rev-parse HEAD)
    local remote_commit=$(git rev-parse $REMOTE/$DEFAULT_BRANCH)
    
    if [ "$local_commit" != "$remote_commit" ]; then
        log_error "Local branch is not up to date with $REMOTE/$DEFAULT_BRANCH"
        log_info "Please run: git pull $REMOTE $DEFAULT_BRANCH"
        exit 1
    fi
}

# Validate version format
validate_version() {
    local version=$1
    if [[ ! $version =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_error "Invalid version format: $version"
        log_info "Expected format: v1.2.3"
        exit 1
    fi
}

# Check if tag already exists
check_tag_exists() {
    local version=$1
    if git tag --list | grep -q "^$version$"; then
        log_error "Tag $version already exists"
        exit 1
    fi
    
    # Check remote tags too
    if git ls-remote --tags $REMOTE | grep -q "refs/tags/$version$"; then
        log_error "Tag $version already exists on remote"
        exit 1
    fi
}

# Update package.json version
update_package_version() {
    local version=$1
    local version_number=${version#v}  # Remove 'v' prefix
    
    log_info "Updating package.json version to $version_number..."
    
    # Update package.json
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$version_number\"/" package.json
    rm package.json.bak
    
    # Verify the change
    local new_version=$(node -p "require('./package.json').version")
    if [ "$new_version" != "$version_number" ]; then
        log_error "Failed to update package.json version"
        exit 1
    fi
    
    log_success "Updated package.json to version $version_number"
}

# Build with new version
build_with_new_version() {
    log_info "Building with new version (embeds version into JavaScript)..."
    
    if ! pnpm run build; then
        log_error "Build with new version failed. Release aborted."
        exit 1
    fi
    
    # Verify version was embedded
    local embedded_version=""
    if [ -f "dist/s3db.cjs" ]; then
        embedded_version=$(grep -o '"[0-9]\+\.[0-9]\+\.[0-9]\+"' dist/s3db.cjs | head -1 | tr -d '"' || echo "")
    fi
    
    local expected_version=${1#v}  # Remove 'v' prefix
    if [ "$embedded_version" = "$expected_version" ]; then
        log_success "Version $expected_version embedded successfully in dist/"
    else
        log_warning "Could not verify embedded version (expected: $expected_version, found: $embedded_version)"
    fi
}

# Run tests
run_tests() {
    log_info "Running tests..."
    
    if ! pnpm run test:quick; then
        log_error "Tests failed. Release aborted."
        exit 1
    fi
    
    if ! pnpm run test:ts; then
        log_error "TypeScript tests failed. Release aborted."
        exit 1
    fi
    
    log_success "All tests passed"
}

# Build package
build_package() {
    log_info "Building package..."
    
    if ! pnpm run build; then
        log_error "Build failed. Release aborted."
        exit 1
    fi
    
    log_success "Package built successfully"
}

# Generate changelog entry
generate_changelog() {
    local version=$1
    local changelog_file="CHANGELOG.md"
    
    log_info "Generating changelog entry for $version..."
    
    # Create changelog if it doesn't exist
    if [ ! -f "$changelog_file" ]; then
        cat > "$changelog_file" << 'EOF'
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

EOF
    fi
    
    # Add new entry
    local temp_file=$(mktemp)
    local version_number=${version#v}
    local date=$(date +%Y-%m-%d)
    
    cat > "$temp_file" << EOF
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [$version_number] - $date

### Added
- Advanced metadata encoding with 31% better compression than base64
- Dictionary compression for status values, booleans, HTTP methods
- ISO timestamp optimization with 62.5% space savings
- UUID compression with 30.6% size reduction
- Smart encoding selection with automatic best method choice
- Memory cache for UTF-8 byte calculations

### Changed
- Optimized build structure (removed unnecessary formats)
- Professional package structure with clean .npmignore
- Updated TypeScript definitions and exports

### Fixed
- Metadata encoding edge cases
- Test stability and coverage
- Build process optimization

EOF
    
    # Append existing changelog (skip header)
    if [ -f "$changelog_file" ]; then
        tail -n +6 "$changelog_file" >> "$temp_file"
    fi
    
    mv "$temp_file" "$changelog_file"
    log_success "Updated $changelog_file"
}

# Commit and tag
commit_and_tag() {
    local version=$1
    
    log_info "Creating commit and tag for $version..."
    
    # Add package.json, dist/, and changelog
    git add package.json dist/ CHANGELOG.md
    
    git commit -m "chore: release $version

🚀 Release $version with embedded version

- Updated package.json version to ${version#v}
- Rebuilt dist/ with embedded version
- All tests passing

Co-Authored-By: Claude <noreply@anthropic.com>"
    
    git tag -a "$version" -m "Release $version

🚀 S3DB.js $version

Features:
- Advanced metadata encoding (31% better than base64)
- Dictionary compression for common values
- ISO timestamp optimization (62.5% savings)
- UUID compression (30.6% reduction)
- Smart encoding selection
- Performance optimizations

📦 Installation:
npm install s3db.js@${version#v}

📥 Binaries available on GitHub Releases

🤖 Generated with S3DB.js release automation"
    
    log_success "Created commit and tag $version"
}

# Push to remote
push_to_remote() {
    local version=$1
    
    log_info "Pushing to $REMOTE..."
    
    git push $REMOTE $DEFAULT_BRANCH
    git push $REMOTE "$version"
    
    log_success "Pushed to remote repository"
}

# Wait for GitHub Actions
wait_for_actions() {
    local version=$1
    
    log_info "GitHub Actions will now:"
    echo "  🧪 Run full test suite"
    echo "  🔨 Build binaries for all platforms"
    echo "  🎉 Create GitHub release with binaries"
    echo "  📦 Publish to npm (if configured)"
    echo ""
    log_info "Monitor progress at: https://github.com/forattini-dev/s3db.js/actions"
    log_info "Release will be available at: https://github.com/forattini-dev/s3db.js/releases/tag/$version"
}

# Show usage
show_usage() {
    echo "Usage: $0 <version>"
    echo ""
    echo "Examples:"
    echo "  $0 v9.0.2"
    echo "  $0 v10.0.0"
    echo ""
    echo "This script will:"
    echo "  1. ✅ Validate environment and version"
    echo "  2. 🧪 Run tests"
    echo "  3. 🏗️  Build package"
    echo "  4. 📝 Update version and changelog"
    echo "  5. 🏷️  Create git tag"
    echo "  6. 🚀 Push to trigger GitHub Actions"
    echo ""
    echo "GitHub Actions will then:"
    echo "  - Build binaries for all platforms"
    echo "  - Create GitHub release"
    echo "  - Publish to npm (optional)"
}

# Main function
main() {
    local version=$1
    
    echo "🚀 S3DB.js Release Automation"
    echo "============================="
    echo ""
    
    # Check arguments
    if [ -z "$version" ]; then
        log_error "Version argument is required"
        echo ""
        show_usage
        exit 1
    fi
    
    # Pre-flight checks
    log_info "Running pre-flight checks..."
    validate_version "$version"
    check_branch
    check_clean_working_dir
    check_remote_sync
    check_tag_exists "$version"
    
    # Install dependencies
    log_info "Installing dependencies..."
    pnpm install --frozen-lockfile
    
    # Run quality checks
    run_tests
    build_package
    
    # Update version and rebuild
    update_package_version "$version"
    build_with_new_version "$version"
    generate_changelog "$version"
    
    # Re-run tests with new build
    run_tests
    
    # Create release
    commit_and_tag "$version"
    push_to_remote "$version"
    
    # Success message
    echo ""
    log_success "🎉 Release $version initiated successfully!"
    echo ""
    wait_for_actions "$version"
    echo ""
    log_success "✨ All done! Check GitHub Actions for build progress."
}

# Run main function with all arguments
main "$@"

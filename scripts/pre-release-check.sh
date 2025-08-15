#!/bin/bash

# 🔍 S3DB.js Pre-Release Check Script
# Comprehensive checks before releasing

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNED=0

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((CHECKS_PASSED++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((CHECKS_WARNED++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((CHECKS_FAILED++))
}

# Check Git status
check_git_status() {
    log_info "Checking Git status..."
    
    if [ -n "$(git status --porcelain)" ]; then
        log_error "Working directory has uncommitted changes"
        git status --short
        return 1
    fi
    
    log_success "Working directory is clean"
}

# Check branch
check_branch() {
    log_info "Checking current branch..."
    
    local current_branch=$(git branch --show-current)
    if [ "$current_branch" != "main" ]; then
        log_warning "Not on main branch (current: $current_branch)"
    else
        log_success "On main branch"
    fi
}

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed"
        return 1
    fi
    
    # Check Node.js version
    local node_version=$(node --version)
    local node_major=$(echo $node_version | cut -d'.' -f1 | sed 's/v//')
    
    if [ "$node_major" -lt 18 ]; then
        log_error "Node.js version $node_version is too old (require 18+)"
        return 1
    fi
    
    log_success "Dependencies OK (Node.js $node_version, pnpm $(pnpm --version))"
}

# Check package.json
check_package_json() {
    log_info "Checking package.json..."
    
    # Check required fields
    local name=$(node -p "require('./package.json').name" 2>/dev/null || echo "")
    local version=$(node -p "require('./package.json').version" 2>/dev/null || echo "")
    local description=$(node -p "require('./package.json').description" 2>/dev/null || echo "")
    
    if [ -z "$name" ] || [ -z "$version" ] || [ -z "$description" ]; then
        log_error "package.json missing required fields"
        return 1
    fi
    
    # Check version format
    if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_error "Invalid version format in package.json: $version"
        return 1
    fi
    
    log_success "package.json OK (name: $name, version: $version)"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    if ! pnpm install --frozen-lockfile; then
        log_error "Failed to install dependencies"
        return 1
    fi
    
    log_success "Dependencies installed"
}

# Run build
run_build() {
    log_info "Running build..."
    
    if ! pnpm run build; then
        log_error "Build failed"
        return 1
    fi
    
    log_success "Build completed"
}

# Check build outputs
check_build_outputs() {
    log_info "Checking build outputs..."
    
    local required_files=("dist/s3db.cjs.js" "dist/s3db.es.js" "dist/s3db.d.ts")
    
    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Missing build output: $file"
            return 1
        fi
        
        local size=$(stat -c%s "$file")
        if [ "$size" -eq 0 ]; then
            log_error "Build output is empty: $file"
            return 1
        fi
    done
    
    log_success "Build outputs OK"
}

# Run TypeScript check
run_typescript_check() {
    log_info "Running TypeScript check..."
    
    if ! pnpm run test:ts; then
        log_error "TypeScript check failed"
        return 1
    fi
    
    log_success "TypeScript check passed"
}

# Run quick tests
run_quick_tests() {
    log_info "Running quick tests..."
    
    if ! timeout 300s pnpm run test:quick; then
        log_error "Quick tests failed or timed out"
        return 1
    fi
    
    log_success "Quick tests passed"
}

# Check package size
check_package_size() {
    log_info "Checking package size..."
    
    # Create a test package
    local pack_output=$(npm pack --dry-run 2>/dev/null || echo "")
    
    if [[ $pack_output =~ package\ size:\ ([0-9.]+)\ ([A-Za-z]+) ]]; then
        local size_value="${BASH_REMATCH[1]}"
        local size_unit="${BASH_REMATCH[2]}"
        
        # Convert to MB for comparison
        local size_mb=0
        case $size_unit in
            "B") size_mb=$(echo "scale=2; $size_value / 1024 / 1024" | bc -l) ;;
            "kB") size_mb=$(echo "scale=2; $size_value / 1024" | bc -l) ;;
            "MB") size_mb=$size_value ;;
            "GB") size_mb=$(echo "scale=2; $size_value * 1024" | bc -l) ;;
        esac
        
        if (( $(echo "$size_mb > 5" | bc -l) )); then
            log_warning "Package size is large: $size_value $size_unit"
        else
            log_success "Package size OK: $size_value $size_unit"
        fi
    else
        log_warning "Could not determine package size"
    fi
}

# Check security
run_security_audit() {
    log_info "Running security audit..."
    
    if pnpm audit --audit-level moderate; then
        log_success "No security vulnerabilities found"
    else
        log_warning "Security audit found issues (review recommended)"
    fi
}

# Check binary build
check_binary_build() {
    log_info "Testing binary build (quick check)..."
    
    # Test if binary build script works (with timeout)
    if timeout 60s ./build-binaries.sh > /dev/null 2>&1; then
        log_success "Binary build script works"
        
        # Check if any binaries were created
        if [ -d "releases" ] && [ "$(ls -A releases/ 2>/dev/null)" ]; then
            log_success "Binaries created successfully"
        else
            log_warning "No binaries found in releases/"
        fi
    else
        log_warning "Binary build test timed out (expected in some environments)"
    fi
}

# Check changelog
check_changelog() {
    log_info "Checking changelog..."
    
    if [ -f "CHANGELOG.md" ]; then
        log_success "CHANGELOG.md exists"
    else
        log_warning "No CHANGELOG.md found (will be created during release)"
    fi
}

# Check README
check_readme() {
    log_info "Checking README..."
    
    if [ -f "README.md" ]; then
        local readme_size=$(stat -c%s "README.md")
        if [ "$readme_size" -gt 1000 ]; then
            log_success "README.md exists and has content"
        else
            log_warning "README.md is very short"
        fi
    else
        log_error "README.md is missing"
        return 1
    fi
}

# Main function
main() {
    echo "🔍 S3DB.js Pre-Release Check"
    echo "============================"
    echo ""
    
    # Run all checks
    check_git_status || true
    check_branch || true
    check_dependencies || true
    check_package_json || true
    check_readme || true
    check_changelog || true
    
    install_dependencies || true
    run_build || true
    check_build_outputs || true
    run_typescript_check || true
    run_quick_tests || true
    
    check_package_size || true
    run_security_audit || true
    check_binary_build || true
    
    # Summary
    echo ""
    echo "📊 Pre-Release Check Summary"
    echo "=============================="
    echo ""
    
    if [ $CHECKS_FAILED -eq 0 ]; then
        log_success "All critical checks passed! ✨"
        
        if [ $CHECKS_WARNED -gt 0 ]; then
            log_warning "Found $CHECKS_WARNED warnings (review recommended)"
        fi
        
        echo ""
        log_info "Ready to release! Run: ./scripts/release.sh v<version>"
        echo ""
        exit 0
    else
        log_error "Found $CHECKS_FAILED critical issues that must be fixed before release"
        
        if [ $CHECKS_WARNED -gt 0 ]; then
            log_warning "Also found $CHECKS_WARNED warnings"
        fi
        
        echo ""
        log_info "Fix the issues above, then run this check again"
        echo ""
        exit 1
    fi
}

# Run main function
main "$@"
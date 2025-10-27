# GitHub Actions Workflows

## Overview

This project uses **3 focused workflows** designed to be fast, reliable, and useful.

## Workflows

### 1. CI (Fast) - `ci-fast.yml`

**Triggers:**
- Every push to `main` or `develop`
- Every pull request to `main` or `develop`

**What it does:**
- Code Quality check (build + type check)
- Tests on Node.js 22 only
- Runs in ~3-5 minutes

**Purpose:** Fast feedback for developers. If this passes, your code is good to merge.

**Branch Protection:** Set this as required check for PRs.

---

### 2. CI (Full) - `ci-full.yml`

**Triggers:**
- Push to `main` branch only
- Manual trigger via GitHub UI

**What it does:**
- Tests on Node.js 22, 24, 25 (matrix)
- Coverage report with Codecov
- Runs in ~10-15 minutes

**Purpose:** Comprehensive testing after merge. Ensures compatibility across Node versions.

---

### 3. Release - `release.yml`

**Triggers:**
- Git tag push (e.g., `git tag v11.4.0 && git push --tags`)
- Manual trigger via GitHub UI

**What it does:**
- Builds binaries for all platforms (Linux, macOS Intel/ARM, Windows)
- Creates GitHub Release with binaries
- Publishes to NPM (if tag starts with `v`)
- Runs in ~15-20 minutes

**Usage:**
```bash
# Create release
git tag v11.4.0
git push origin v11.4.0

# Or manually trigger from GitHub Actions UI
```

---

## Key Features

### Fast & Reliable
- Concurrency control (cancels previous runs on same PR)
- Timeouts on all jobs (no hanging forever)
- Fail-fast disabled on matrix (see all failures)

### Useful Output
- Job summaries with coverage stats
- Clear error messages
- Artifact retention (7 days for binaries)

### Efficient Caching
- pnpm cache for dependencies
- Docker layer caching for MinIO

---

## Secrets Required

### For Full Functionality

| Secret | Required For | How to Get |
|--------|-------------|------------|
| `CODECOV_TOKEN` | Coverage reports | [codecov.io](https://codecov.io) |
| `NPM_TOKEN` | NPM publishing | [npmjs.com](https://www.npmjs.com/settings/~/tokens) |

**Both secrets are optional** - workflows will continue without them.

---

## Branch Protection Settings

### Recommended Setup

1. Go to: Repository Settings → Branches → Branch protection rules → `main`
2. Enable: "Require status checks to pass before merging"
3. Add required check: `CI Status` (from ci-fast.yml)
4. Optional: "Require branches to be up to date before merging"

This ensures:
- No broken code gets merged
- Fast feedback (~3-5 min, not 10-15 min)
- Full CI runs after merge to main

---

## Troubleshooting

### Workflow fails immediately
- Check YAML syntax: `yamllint .github/workflows/*.yml`
- Verify secrets are set (if needed)

### Tests fail on CI but pass locally
- Check Node.js version (use 22)
- Check MinIO connection (CI uses localhost:9000)
- Check environment variables

### Coverage upload fails
- Add `CODECOV_TOKEN` secret
- Or remove Codecov step (it's optional)

### NPM publish fails
- Add `NPM_TOKEN` secret
- Or remove publish job (binaries will still be released)

---

## Migration from Old Workflows

### What Changed

**Old (`tests.yml`):**
- Ran tests 3 times (matrix + summary)
- No MinIO in summary job
- Wrong Node version (20 instead of 22)
- ~15-20 minutes per PR

**New (`ci-fast.yml` + `ci-full.yml`):**
- Fast CI: 1 test run (~3-5 min)
- Full CI: Matrix only on main (~10-15 min)
- Correct Node versions (22, 24, 25)
- Faster feedback for PRs

**Old (`release-binaries.yml`):**
- Manual only
- No NPM publish
- Complex triggers

**New (`release.yml`):**
- Tag-triggered
- Automatic NPM publish
- Simple and reliable

---

## Local Testing

### Test build locally
```bash
pnpm install
pnpm run build
pnpm test
```

### Test binary build locally
```bash
./scripts/build-binaries.sh
ls -lh bin/standalone/
```

### Simulate CI environment
```bash
# Start MinIO
docker run -d \
  --name minio \
  -p 9000:9000 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin123 \
  minio/minio:latest server /data --quiet

# Create bucket
docker run --rm --network="host" \
  -e AWS_ACCESS_KEY_ID=minioadmin \
  -e AWS_SECRET_ACCESS_KEY=minioadmin123 \
  amazon/aws-cli \
  --endpoint-url http://localhost:9000 \
  s3 mb s3://s3db

# Run tests
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin123
export AWS_ENDPOINT=http://localhost:9000
export AWS_BUCKET=s3db
pnpm test

# Cleanup
docker stop minio && docker rm minio
```

---

## Future Improvements

- Add security scanning (Snyk, Dependabot)
- Add performance benchmarks
- Add documentation deployment
- Add changelog generation

---

## Questions?

Check existing runs: https://github.com/forattini-dev/s3db.js/actions

Need help? Open an issue or check workflow logs.

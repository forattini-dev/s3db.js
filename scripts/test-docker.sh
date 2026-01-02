#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🐳 Starting test infrastructure..."
docker compose --profile test up -d

echo "⏳ Waiting for services to be ready..."
sleep 5

echo "📦 Installing dependencies in container..."
docker compose --profile test exec -T test-runner pnpm install --frozen-lockfile

echo "🔨 Building project..."
docker compose --profile test exec -T test-runner pnpm run build

if [ -z "$1" ]; then
  echo "🧪 Running all tests..."
  docker compose --profile test exec -T test-runner pnpm vitest run
else
  echo "🧪 Running tests: $@"
  docker compose --profile test exec -T test-runner pnpm vitest run "$@"
fi

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Tests passed!"
else
  echo "❌ Tests failed with exit code $EXIT_CODE"
fi

exit $EXIT_CODE

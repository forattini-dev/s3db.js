#!/bin/bash

echo "🧪 Testing EventualConsistencyPlugin Hooks Scenario"
echo ""

# Check if docker-compose exists
if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker to run this test."
    exit 1
fi

# Start MinIO
echo "1️⃣  Starting MinIO..."
docker-compose up -d minio 2>/dev/null || docker compose up -d minio 2>/dev/null

if [ $? -ne 0 ]; then
    echo "⚠️  MinIO not started (docker-compose not found or failed)"
    echo "   Starting MinIO manually..."
    docker run -d --name minio-test \
      -p 9100:9000 \
      -e MINIO_ROOT_USER=minioadmin \
      -e MINIO_ROOT_PASSWORD=minioadmin123 \
      minio/minio server /data
fi

echo "   ✅ MinIO started"
echo ""

# Wait for MinIO to be ready
echo "2️⃣  Waiting for MinIO to be ready..."
for i in {1..10}; do
  if curl -s http://localhost:9100/minio/health/live > /dev/null 2>&1; then
    echo "   ✅ MinIO is ready"
    break
  fi
  echo "   ⏳ Waiting... ($i/10)"
  sleep 2
done

echo ""

# Run the test
echo "3️⃣  Running hooks scenario test..."
echo ""
node --no-warnings --experimental-vm-modules node_modules/jest/bin/jest.js \
  tests/plugins/eventual-consistency-hooks-scenario.test.js \
  --verbose \
  --detectOpenHandles

TEST_EXIT_CODE=$?

echo ""
echo "4️⃣  Cleanup..."
docker stop minio-test 2>/dev/null && docker rm minio-test 2>/dev/null
echo "   ✅ Cleanup done"

echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ ALL TESTS PASSED!"
else
  echo "❌ TESTS FAILED"
fi

exit $TEST_EXIT_CODE

#!/bin/bash

# Setup script for s3db.js test environment
# This script helps set up the environment variables needed for running tests

echo "Setting up s3db.js test environment..."

# Check if .env file exists
if [ ! -f .env ]; then
  echo "Creating .env file..."
  cat > .env << EOF
# MinIO Configuration for local testing
BUCKET_CONNECTION_STRING=http://USER:PASSWORD@localhost:9000/s3db
MINIO_USER=s3db
MINIO_PASSWORD=thisissecret
EOF
  echo "Created .env file with default MinIO configuration"
else
  echo ".env file already exists"
fi

# Check if docker-compose is available
if command -v docker-compose &> /dev/null; then
  echo "Docker Compose found. You can start MinIO with:"
  echo "  docker-compose up -d"
  echo ""
  echo "Then run tests with:"
  echo "  npm test"
else
  echo "Docker Compose not found. Please install it to run local MinIO tests."
  echo ""
  echo "Alternatively, you can:"
  echo "1. Set up your own S3-compatible service (MinIO, AWS S3, etc.)"
  echo "2. Update the .env file with your connection details"
  echo "3. Run tests with: npm test"
fi

echo ""
echo "Test environment setup complete!" 
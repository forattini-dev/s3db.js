# S3DB MCP Server Makefile

.PHONY: help server server-v2 test test-simple test-interactive health tools minio clean

# Default target
help:
	@echo "S3DB MCP Server Commands"
	@echo "========================"
	@echo ""
	@echo "Server Commands:"
	@echo "  make server        - Start original MCP server (SSE)"
	@echo "  make server-v2     - Start refactored MCP server v2 (SSE)"
	@echo "  make server-stdio  - Start server with stdio transport"
	@echo ""
	@echo "Test Commands:"
	@echo "  make test          - Run automated tests"
	@echo "  make test-simple   - Run simple HTTP tests"
	@echo "  make test-mock     - Run tests with mock client"
	@echo "  make test-interactive - Interactive test client"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make health        - Check server health"
	@echo "  make tools         - List available tools"
	@echo "  make minio         - Start MinIO for local testing"
	@echo "  make clean         - Clean cache and temp files"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make docker-build  - Build Docker image"
	@echo "  make docker-run    - Run in Docker container"
	@echo "  make docker-compose - Start with docker-compose"

# Server targets
server:
	@echo "Starting MCP Server (original)..."
	@node server.js --transport=sse

server-v2:
	@echo "Starting MCP Server v2..."
	@node server-v2.js --transport=sse

server-stdio:
	@echo "Starting MCP Server (stdio)..."
	@node server-v2.js --transport=stdio

# Test targets
test:
	@echo "Running automated tests..."
	@node test-mcp-v2.js

test-simple:
	@echo "Running simple tests..."
	@node test-simple.js

test-mock:
	@echo "Running tests with mock client..."
	@node test-mcp-v2.js --mock

test-interactive:
	@echo "Starting interactive test client..."
	@node test-mcp-v2.js --interactive

# Utility targets
health:
	@echo "Checking server health..."
	@curl -s http://localhost:8001/health | jq '.' || echo "Server not running"

tools:
	@echo "Listing available tools..."
	@curl -s http://localhost:8001/tools | jq '.' || echo "Server not running"

minio:
	@echo "Starting MinIO..."
	@docker run -d \
		--name minio-s3db \
		-p 9000:9000 \
		-p 9001:9001 \
		-e MINIO_ROOT_USER=minioadmin \
		-e MINIO_ROOT_PASSWORD=minioadmin \
		-v minio-data:/data \
		minio/minio server /data --console-address ":9001"
	@echo "MinIO started at http://localhost:9000 (console: http://localhost:9001)"
	@echo "Credentials: minioadmin/minioadmin"

minio-stop:
	@echo "Stopping MinIO..."
	@docker stop minio-s3db && docker rm minio-s3db

# Docker targets
docker-build:
	@echo "Building Docker image..."
	@docker build -t s3db-mcp-server .

docker-run:
	@echo "Running in Docker..."
	@docker run -it --rm \
		-p 8000:8000 \
		-p 8001:8001 \
		-e S3DB_CONNECTION=$${S3DB_CONNECTION} \
		s3db-mcp-server

docker-compose:
	@echo "Starting with docker-compose..."
	@docker-compose up -d

docker-compose-down:
	@echo "Stopping docker-compose..."
	@docker-compose down

# Clean target
clean:
	@echo "Cleaning cache and temp files..."
	@rm -rf cache/
	@rm -rf ./test-cache/
	@rm -f *.log
	@echo "Cleaned!"

# Development targets
dev:
	@echo "Starting development environment..."
	@make minio
	@sleep 2
	@make server-v2 &
	@sleep 2
	@make test-simple

dev-stop:
	@echo "Stopping development environment..."
	@pkill -f "node server" || true
	@make minio-stop

# Watch for changes
watch:
	@echo "Watching for changes..."
	@nodemon --watch lib --watch server-v2.js --exec "make server-v2"

# Benchmark
benchmark:
	@echo "Running benchmarks..."
	@node test-mcp-v2.js --benchmark

# Installation
install:
	@echo "Installing dependencies..."
	@pnpm install
	@pnpm install -D @modelcontextprotocol/sdk nodemon

# Environment setup
setup:
	@echo "Setting up environment..."
	@cp .env.example .env 2>/dev/null || echo "No .env.example found"
	@echo "S3DB_CONNECTION=s3://minioadmin:minioadmin@test-bucket?endpoint=http://localhost:9000&forcePathStyle=true" >> .env
	@echo "MCP_TRANSPORT=sse" >> .env
	@echo "MCP_SERVER_HOST=0.0.0.0" >> .env
	@echo "MCP_SERVER_PORT=8000" >> .env
	@echo "Environment setup complete!"

# Combined targets
all: install setup minio server-v2

test-all: test-simple test-mock

.DEFAULT_GOAL := help
# S3DB MCP Server Makefile
# ========================

# Variables
NODE_VERSION := 20
DOCKER_IMAGE := s3db-mcp-server
DOCKER_TAG := latest
CONTAINER_NAME := s3db-mcp-container
MCP_PORT := 8000
MINIO_PORT := 9000
MINIO_CONSOLE_PORT := 9001

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
PURPLE := \033[0;35m
CYAN := \033[0;36m
NC := \033[0m # No Color

# Default target
.DEFAULT_GOAL := help

# Help target
.PHONY: help
help: ## Show this help message
	@echo "$(CYAN)S3DB MCP Server - Available Commands$(NC)"
	@echo "====================================="
	@awk 'BEGIN {FS = ":.*##"; printf "\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

.PHONY: install
install: ## Install dependencies
	@echo "$(BLUE)Installing dependencies...$(NC)"
	npm install

.PHONY: install-global
install-global: ## Install globally via npm
	@echo "$(BLUE)Installing s3db-mcp-server globally...$(NC)"
	npm install -g .

.PHONY: dev
dev: ## Start development server with auto-reload
	@echo "$(BLUE)Starting development server...$(NC)"
	npm run dev

.PHONY: start
start: ## Start the MCP server (SSE transport)
	@echo "$(BLUE)Starting S3DB MCP Server (SSE)...$(NC)"
	npm run start:sse

.PHONY: start-stdio
start-stdio: ## Start the MCP server (STDIO transport)
	@echo "$(BLUE)Starting S3DB MCP Server (STDIO)...$(NC)"
	npm run start:stdio

.PHONY: test
test: ## Run test suite
	@echo "$(BLUE)Running tests...$(NC)"
	node examples/test-mcp.js

.PHONY: test-config
test-config: ## Show configuration examples
	@echo "$(BLUE)Showing configuration examples...$(NC)"
	node examples/test-mcp.js --config

.PHONY: test-real
test-real: ## Show real MCP client examples
	@echo "$(BLUE)Showing real MCP client examples...$(NC)"
	node examples/test-mcp.js --real

##@ Docker

.PHONY: docker-build
docker-build: ## Build Docker image
	@echo "$(BLUE)Building Docker image...$(NC)"
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

.PHONY: docker-run
docker-run: ## Run Docker container
	@echo "$(BLUE)Running Docker container...$(NC)"
	docker run --rm -p $(MCP_PORT):8000 --env-file .env --name $(CONTAINER_NAME) $(DOCKER_IMAGE):$(DOCKER_TAG)

.PHONY: docker-run-detached
docker-run-detached: ## Run Docker container in background
	@echo "$(BLUE)Running Docker container in background...$(NC)"
	docker run -d -p $(MCP_PORT):8000 --env-file .env --name $(CONTAINER_NAME) $(DOCKER_IMAGE):$(DOCKER_TAG)

.PHONY: docker-stop
docker-stop: ## Stop Docker container
	@echo "$(BLUE)Stopping Docker container...$(NC)"
	docker stop $(CONTAINER_NAME) || true

.PHONY: docker-logs
docker-logs: ## View Docker container logs
	@echo "$(BLUE)Viewing Docker container logs...$(NC)"
	docker logs -f $(CONTAINER_NAME)

.PHONY: docker-shell
docker-shell: ## Get shell access to running container
	@echo "$(BLUE)Accessing container shell...$(NC)"
	docker exec -it $(CONTAINER_NAME) /bin/bash

.PHONY: docker-clean
docker-clean: ## Clean up Docker containers and images
	@echo "$(BLUE)Cleaning up Docker resources...$(NC)"
	docker stop $(CONTAINER_NAME) || true
	docker rm $(CONTAINER_NAME) || true
	docker rmi $(DOCKER_IMAGE):$(DOCKER_TAG) || true

##@ Docker Compose

.PHONY: compose-up
compose-up: ## Start services with docker-compose
	@echo "$(BLUE)Starting services with docker-compose...$(NC)"
	docker compose up

.PHONY: compose-up-detached
compose-up-detached: ## Start services with docker-compose in background
	@echo "$(BLUE)Starting services with docker-compose (detached)...$(NC)"
	docker compose up -d

.PHONY: compose-build
compose-build: ## Build and start services with docker-compose
	@echo "$(BLUE)Building and starting services...$(NC)"
	docker compose up --build

.PHONY: compose-down
compose-down: ## Stop docker-compose services
	@echo "$(BLUE)Stopping docker-compose services...$(NC)"
	docker compose down

.PHONY: compose-logs
compose-logs: ## View docker-compose logs
	@echo "$(BLUE)Viewing docker-compose logs...$(NC)"
	docker compose logs -f

.PHONY: compose-local
compose-local: ## Start with local testing profile (MinIO + LocalStack)
	@echo "$(BLUE)Starting with local testing services...$(NC)"
	docker compose --profile local-testing up

.PHONY: compose-clean
compose-clean: ## Clean up docker-compose resources
	@echo "$(BLUE)Cleaning up docker-compose resources...$(NC)"
	docker compose down -v --rmi all

##@ Environment

.PHONY: env-setup
env-setup: ## Create .env file from template
	@echo "$(BLUE)Setting up environment file...$(NC)"
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(GREEN)Created .env file from template$(NC)"; \
		echo "$(YELLOW)Please edit .env with your configuration$(NC)"; \
	else \
		echo "$(YELLOW).env file already exists$(NC)"; \
	fi

.PHONY: env-validate
env-validate: ## Validate environment configuration
	@echo "$(BLUE)Validating environment configuration...$(NC)"
	@if [ -f .env ]; then \
		echo "$(GREEN)✓ .env file exists$(NC)"; \
		if grep -q "S3DB_CONNECTION_STRING=s3://" .env; then \
			echo "$(GREEN)✓ S3DB_CONNECTION_STRING is configured$(NC)"; \
		else \
			echo "$(RED)✗ S3DB_CONNECTION_STRING needs configuration$(NC)"; \
		fi; \
	else \
		echo "$(RED)✗ .env file not found$(NC)"; \
		echo "$(YELLOW)Run 'make env-setup' to create it$(NC)"; \
	fi

##@ NPM Package

.PHONY: npm-pack
npm-pack: ## Create npm package
	@echo "$(BLUE)Creating npm package...$(NC)"
	npm pack

.PHONY: npm-publish-dry
npm-publish-dry: ## Dry run npm publish
	@echo "$(BLUE)Dry run npm publish...$(NC)"
	npm publish --dry-run

.PHONY: npm-publish
npm-publish: ## Publish to npm registry
	@echo "$(BLUE)Publishing to npm registry...$(NC)"
	@echo "$(YELLOW)Make sure you're logged in: npm login$(NC)"
	npm publish

##@ Testing & Quality

.PHONY: lint
lint: ## Run linter (if configured)
	@echo "$(BLUE)Running linter...$(NC)"
	@if [ -f "package.json" ] && npm list eslint >/dev/null 2>&1; then \
		npm run lint; \
	else \
		echo "$(YELLOW)No linter configured$(NC)"; \
	fi

.PHONY: format
format: ## Format code (if prettier is configured)
	@echo "$(BLUE)Formatting code...$(NC)"
	@if [ -f "package.json" ] && npm list prettier >/dev/null 2>&1; then \
		npm run format; \
	else \
		echo "$(YELLOW)No formatter configured$(NC)"; \
	fi

.PHONY: check-deps
check-deps: ## Check for outdated dependencies
	@echo "$(BLUE)Checking for outdated dependencies...$(NC)"
	npm outdated

.PHONY: audit
audit: ## Run security audit
	@echo "$(BLUE)Running security audit...$(NC)"
	npm audit

.PHONY: audit-fix
audit-fix: ## Fix security vulnerabilities
	@echo "$(BLUE)Fixing security vulnerabilities...$(NC)"
	npm audit fix

##@ Utilities

.PHONY: clean
clean: ## Clean up temporary files and caches
	@echo "$(BLUE)Cleaning up...$(NC)"
	rm -rf node_modules/
	rm -rf .npm/
	rm -rf coverage/
	rm -rf dist/
	rm -f *.log
	rm -f *.tgz

.PHONY: reset
reset: clean install ## Reset project (clean + install)
	@echo "$(GREEN)Project reset complete$(NC)"

.PHONY: status
status: ## Show service status
	@echo "$(BLUE)Service Status$(NC)"
	@echo "=============="
	@echo "MCP Server: http://localhost:$(MCP_PORT)/sse"
	@echo "MinIO: http://localhost:$(MINIO_PORT)"
	@echo "MinIO Console: http://localhost:$(MINIO_CONSOLE_PORT)"
	@echo ""
	@echo "$(BLUE)Docker Status:$(NC)"
	@docker ps --filter name=$(CONTAINER_NAME) --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || echo "No containers running"

.PHONY: urls
urls: ## Show service URLs
	@echo "$(CYAN)Service URLs:$(NC)"
	@echo "============="
	@echo "$(GREEN)MCP Server (SSE):$(NC) http://localhost:$(MCP_PORT)/sse"
	@echo "$(GREEN)MinIO API:$(NC) http://localhost:$(MINIO_PORT)"
	@echo "$(GREEN)MinIO Console:$(NC) http://localhost:$(MINIO_CONSOLE_PORT)"
	@echo ""
	@echo "$(CYAN)Configuration Examples:$(NC)"
	@echo "========================"
	@echo "$(YELLOW)Claude Desktop:$(NC) http://localhost:$(MCP_PORT)/sse"
	@echo "$(YELLOW)Cursor IDE:$(NC) http://localhost:$(MCP_PORT)/sse"

.PHONY: health
health: ## Check service health
	@echo "$(BLUE)Checking service health...$(NC)"
	@curl -f http://localhost:$(MCP_PORT)/health 2>/dev/null && echo "$(GREEN)✓ MCP Server is healthy$(NC)" || echo "$(RED)✗ MCP Server is not responding$(NC)"

##@ Documentation

.PHONY: docs
docs: ## Generate documentation
	@echo "$(BLUE)Documentation available:$(NC)"
	@echo "• README.md - Complete documentation with examples and configuration"
	@echo "• .env.example - Configuration template"
	@echo "• examples/ - Test scripts and usage examples"

.PHONY: readme
readme: ## Open README in browser
	@echo "$(BLUE)Opening README...$(NC)"
	@if command -v open >/dev/null 2>&1; then \
		open README.md; \
	elif command -v xdg-open >/dev/null 2>&1; then \
		xdg-open README.md; \
	else \
		echo "$(YELLOW)Please open README.md manually$(NC)"; \
	fi

##@ Quick Start

.PHONY: quick-start
quick-start: env-setup install compose-local ## Quick start for development
	@echo "$(GREEN)Quick start complete!$(NC)"
	@echo "$(CYAN)Next steps:$(NC)"
	@echo "1. Edit .env with your S3 configuration"
	@echo "2. Access MinIO Console: http://localhost:$(MINIO_CONSOLE_PORT)"
	@echo "3. Test MCP Server: make test"
	@echo "4. View logs: make compose-logs"

.PHONY: demo
demo: ## Run demo with mock data
	@echo "$(BLUE)Running S3DB MCP Server demo...$(NC)"
	@make test
	@echo ""
	@echo "$(GREEN)Demo complete!$(NC)"
	@echo "$(CYAN)To run with real server:$(NC)"
	@echo "1. make start"
	@echo "2. Configure your AI client to use: http://localhost:$(MCP_PORT)/sse"

# Include local makefile if it exists
-include Makefile.local
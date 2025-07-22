# syntax=docker/dockerfile:1.9
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY s3db_mcp_server.js ./

# Create non-root user
RUN groupadd -r s3dbmcp && useradd -r -d /app -g s3dbmcp s3dbmcp

# Change ownership to app user
RUN chown -Rv s3dbmcp:s3dbmcp /app

# Switch to non-root user
USER s3dbmcp

# Set environment variables
ENV NODE_ENV=production \
    MCP_SERVER_HOST=0.0.0.0 \
    MCP_SERVER_PORT=8000 \
    MCP_TRANSPORT=sse

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

# Default command
CMD ["node", "s3db_mcp_server.js", "--transport=sse"]
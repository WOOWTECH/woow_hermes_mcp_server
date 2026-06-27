# Hermes MCP Admin — Admin GUI + MCP Server in one container
#
# Usage:
#   podman run -p 8080:8080 -v ./data:/data hermes-mcp-admin
#   docker run -p 8080:8080 -v ./data:/data hermes-mcp-admin

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package.json frontend/
RUN cd frontend && npm install --production=false
COPY frontend/ frontend/
RUN cd frontend && npm run build

# Stage 2: Python runtime
FROM python:3.12-slim
WORKDIR /app

# Install core library
COPY pyproject.toml /app/pyproject.toml
COPY mcp_admin_core/ /app/mcp_admin_core/
COPY hermes_mcp_admin/ /app/hermes_mcp_admin/
COPY hermes_mcp_server/ /app/hermes_mcp_server/
RUN pip install --no-cache-dir .

# Copy frontend build
COPY --from=frontend-builder /build/frontend/dist /app/static

# Config volume
RUN mkdir -p /data
VOLUME /data

# Single port — admin GUI + MCP proxy
EXPOSE 8080

ENV MCP_ADMIN_CONFIG=/data/config.json

CMD ["uvicorn", "hermes_mcp_admin.main:app", "--host", "0.0.0.0", "--port", "8080"]

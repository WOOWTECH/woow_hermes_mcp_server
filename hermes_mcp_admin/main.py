"""FastAPI application entry point for Hermes MCP Admin."""

from __future__ import annotations

from mcp_admin_core.app import create_app

from .routers import config, dashboard_proxy, health, logs, tokens, tools

app = create_app(
    title="Hermes MCP Admin",
    extra_routers=[
        config.router,
        tools.router,
        tokens.router,
        health.router,
        logs.router,
        dashboard_proxy.router,
    ],
)

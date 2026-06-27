"""Hermes MCP Server — FastMCP server with 9 tools bridging Gateway + Dashboard APIs.

Gateway API  (:8642) — OpenAI-compatible API with Bearer auth  [A]
Dashboard API (:9119) — Management REST API with Basic auth    [B]

Environment variables for connection config:
  HERMES_GATEWAY_URL, HERMES_GATEWAY_API_KEY
  HERMES_DASHBOARD_URL, HERMES_DASHBOARD_USERNAME, HERMES_DASHBOARD_PASSWORD
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

# ---------------------------------------------------------------------------
# FastMCP server instance
# ---------------------------------------------------------------------------

mcp = FastMCP("hermes-mcp-server")

# ---------------------------------------------------------------------------
# Deny-list for config writes
# ---------------------------------------------------------------------------

DENIED_CONFIG_KEYS = {
    "terminal.backend",
    "api_server.cors_origins",
    "api_server.host",
}

# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------


def _get_connection() -> dict[str, str]:
    """Read connection config from environment variables."""
    return {
        "gateway_url": os.environ.get("HERMES_GATEWAY_URL", ""),
        "gateway_api_key": os.environ.get("HERMES_GATEWAY_API_KEY", ""),
        "dashboard_url": os.environ.get("HERMES_DASHBOARD_URL", ""),
        "dashboard_username": os.environ.get("HERMES_DASHBOARD_USERNAME", ""),
        "dashboard_password": os.environ.get("HERMES_DASHBOARD_PASSWORD", ""),
    }


def _gateway_client(url: str, api_key: str) -> httpx.AsyncClient:
    """Create an httpx client for the Hermes Gateway API with Bearer auth."""
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return httpx.AsyncClient(
        base_url=url.rstrip("/"),
        headers=headers,
        timeout=30.0,
    )


def _dashboard_client(url: str, username: str, password: str) -> httpx.AsyncClient:
    """Create an httpx client for the Hermes Dashboard API with Basic auth."""
    auth = httpx.BasicAuth(username, password) if username else None
    return httpx.AsyncClient(
        base_url=url.rstrip("/"),
        auth=auth,
        headers={"Content-Type": "application/json"},
        timeout=30.0,
    )


# ---------------------------------------------------------------------------
# Tool 1: hermes_inspect
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_inspect(profile: str = "default") -> str:
    """Inspect Hermes Gateway capabilities, Dashboard config, and model info.

    Calls:
      [A] GET /v1/capabilities
      [B] GET /api/config
      [B] GET /api/model/info
    """
    conn = _get_connection()
    result: dict[str, Any] = {}

    # Gateway capabilities
    try:
        async with _gateway_client(conn["gateway_url"], conn["gateway_api_key"]) as client:
            resp = await client.get("/v1/capabilities")
            resp.raise_for_status()
            result["capabilities"] = resp.json()
    except Exception as exc:
        result["capabilities_error"] = str(exc)

    # Dashboard config
    try:
        async with _dashboard_client(conn["dashboard_url"], conn["dashboard_username"], conn["dashboard_password"]) as client:
            resp = await client.get("/api/config")
            resp.raise_for_status()
            result["config"] = resp.json()
    except Exception as exc:
        result["config_error"] = str(exc)

    # Model info
    try:
        async with _dashboard_client(conn["dashboard_url"], conn["dashboard_username"], conn["dashboard_password"]) as client:
            resp = await client.get("/api/model/info")
            resp.raise_for_status()
            result["model_info"] = resp.json()
    except Exception as exc:
        result["model_info_error"] = str(exc)

    return json.dumps(result, indent=2)


# ---------------------------------------------------------------------------
# Tool 2: hermes_skill
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_skill(
    action: str,
    name: str | None = None,
    profile: str = "default",
) -> str:
    """Manage Hermes skills (list, enable, disable).

    Actions: list, enable, disable
    Calls: [B] /api/skills endpoints
    """
    conn = _get_connection()

    async with _dashboard_client(conn["dashboard_url"], conn["dashboard_username"], conn["dashboard_password"]) as client:
        if action == "list":
            resp = await client.get("/api/skills")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action in ("enable", "disable"):
            if not name:
                return json.dumps({"error": f"Skill name is required for '{action}' action"})
            resp = await client.post(f"/api/skills/{name}/{action}")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        return json.dumps({"error": f"Unknown action: {action}. Valid: list, enable, disable"})


# ---------------------------------------------------------------------------
# Tool 3: hermes_mcp
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_mcp(
    action: str,
    name: str | None = None,
    url: str | None = None,
    profile: str = "default",
) -> str:
    """Manage Hermes MCP server connections (list, add, remove).

    Actions: list, add, remove
    Calls: [B] /api/mcp endpoints
    Note: stdio command-based MCP servers are blocked for security.
    """
    conn = _get_connection()

    async with _dashboard_client(conn["dashboard_url"], conn["dashboard_username"], conn["dashboard_password"]) as client:
        if action == "list":
            resp = await client.get("/api/mcp")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action == "add":
            if not name or not url:
                return json.dumps({"error": "Both 'name' and 'url' are required for 'add' action"})
            # Block stdio command-based MCP servers
            if url.startswith("stdio:") or url.startswith("command:"):
                return json.dumps({
                    "error": "stdio/command-based MCP servers are blocked for security. Use SSE URL transport only.",
                    "denied_operation": "add_stdio_command",
                })
            payload = {"name": name, "url": url}
            resp = await client.post("/api/mcp", json=payload)
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action == "remove":
            if not name:
                return json.dumps({"error": "Skill name is required for 'remove' action"})
            resp = await client.delete(f"/api/mcp/{name}")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        return json.dumps({"error": f"Unknown action: {action}. Valid: list, add, remove"})


# ---------------------------------------------------------------------------
# Tool 4: hermes_model
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_model(
    action: str = "info",
    model: str | None = None,
    provider: str | None = None,
    profile: str = "default",
) -> str:
    """Manage Hermes model configuration (info, set, list providers).

    Actions: info, set, list
    Calls: [B] /api/model/* endpoints
    """
    conn = _get_connection()

    async with _dashboard_client(conn["dashboard_url"], conn["dashboard_username"], conn["dashboard_password"]) as client:
        if action == "info":
            resp = await client.get("/api/model/info")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action == "list":
            resp = await client.get("/api/model/providers")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action == "set":
            payload: dict[str, Any] = {}
            if model:
                payload["model"] = model
            if provider:
                payload["provider"] = provider
            if not payload:
                return json.dumps({"error": "At least 'model' or 'provider' must be specified for 'set' action"})
            resp = await client.put("/api/model/config", json=payload)
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        return json.dumps({"error": f"Unknown action: {action}. Valid: info, set, list"})


# ---------------------------------------------------------------------------
# Tool 5: hermes_config
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_config(
    action: str = "get",
    key: str | None = None,
    value: str | None = None,
    dry_run: bool = False,
    profile: str = "default",
) -> str:
    """Read or update Hermes Dashboard configuration keys.

    Actions: get, set
    Calls: [B] /api/config endpoints
    Certain keys are denied for security (see deny-list).
    """
    conn = _get_connection()

    async with _dashboard_client(conn["dashboard_url"], conn["dashboard_username"], conn["dashboard_password"]) as client:
        if action == "get":
            resp = await client.get("/api/config")
            resp.raise_for_status()
            data = resp.json()
            if key and isinstance(data, dict):
                # Navigate dotted key path
                parts = key.split(".")
                current = data
                for part in parts:
                    if isinstance(current, dict) and part in current:
                        current = current[part]
                    else:
                        return json.dumps({"error": f"Key '{key}' not found in config"})
                return json.dumps({"key": key, "value": current}, indent=2)
            return json.dumps(data, indent=2)

        if action == "set":
            if not key or value is None:
                return json.dumps({"error": "Both 'key' and 'value' are required for 'set' action"})

            # Check deny-list
            if key in DENIED_CONFIG_KEYS:
                return json.dumps({
                    "error": f"Config key '{key}' is denied for security reasons",
                    "denied_keys": sorted(DENIED_CONFIG_KEYS),
                })

            if dry_run:
                return json.dumps({
                    "dry_run": True,
                    "action": "set",
                    "key": key,
                    "value": value,
                    "message": "Would set this config key (dry_run=True, no changes made)",
                }, indent=2)

            payload = {"key": key, "value": value}
            resp = await client.put("/api/config", json=payload)
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        return json.dumps({"error": f"Unknown action: {action}. Valid: get, set"})


# ---------------------------------------------------------------------------
# Tool 6: hermes_tools
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_tools(
    action: str = "list",
    toolset: str | None = None,
    enabled: bool | None = None,
    profile: str = "default",
) -> str:
    """Manage Hermes toolsets (list, enable, disable).

    Actions: list, enable, disable
    Calls: [B] /api/tools/toolsets endpoints
    """
    conn = _get_connection()

    async with _dashboard_client(conn["dashboard_url"], conn["dashboard_username"], conn["dashboard_password"]) as client:
        if action == "list":
            resp = await client.get("/api/tools/toolsets")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action in ("enable", "disable"):
            if not toolset:
                return json.dumps({"error": f"Toolset name is required for '{action}' action"})
            enable_flag = action == "enable"
            payload = {"toolset": toolset, "enabled": enable_flag}
            resp = await client.put("/api/tools/toolsets", json=payload)
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        return json.dumps({"error": f"Unknown action: {action}. Valid: list, enable, disable"})


# ---------------------------------------------------------------------------
# Tool 7: hermes_gateway
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_gateway(
    action: str = "status",
    profile: str = "default",
) -> str:
    """Manage Hermes Gateway (status, restart).

    Actions: status, restart
    Calls: [B] /api/gateway/restart, /api/status endpoints
    """
    conn = _get_connection()

    async with _dashboard_client(conn["dashboard_url"], conn["dashboard_username"], conn["dashboard_password"]) as client:
        if action == "status":
            resp = await client.get("/api/status")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action == "restart":
            resp = await client.post("/api/gateway/restart")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        return json.dumps({"error": f"Unknown action: {action}. Valid: status, restart"})


# ---------------------------------------------------------------------------
# Tool 8: hermes_chat
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_chat(
    message: str,
    session_id: str | None = None,
    profile: str = "default",
) -> str:
    """Send a chat message to Hermes and receive a response.

    If session_id is provided, continues an existing session via
    [A] /api/sessions/{session_id}/chat.
    Otherwise creates a new chat via [A] POST /v1/responses.
    """
    conn = _get_connection()

    if session_id:
        # Continue existing session via Gateway
        async with _gateway_client(conn["gateway_url"], conn["gateway_api_key"]) as client:
            payload = {"message": message}
            resp = await client.post(f"/api/sessions/{session_id}/chat", json=payload)
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)
    else:
        # New chat via Gateway responses API
        async with _gateway_client(conn["gateway_url"], conn["gateway_api_key"]) as client:
            payload = {
                "model": "default",
                "input": message,
            }
            resp = await client.post("/v1/responses", json=payload)
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)


# ---------------------------------------------------------------------------
# Tool 9: hermes_session
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_session(
    action: str = "list",
    session_id: str | None = None,
    profile: str = "default",
) -> str:
    """List, get, or delete Hermes chat sessions.

    Actions: list, get, delete
    Calls: [A] /api/sessions/* endpoints
    """
    conn = _get_connection()

    async with _gateway_client(conn["gateway_url"], conn["gateway_api_key"]) as client:
        if action == "list":
            resp = await client.get("/api/sessions")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action == "get":
            if not session_id:
                return json.dumps({"error": "session_id is required for 'get' action"})
            resp = await client.get(f"/api/sessions/{session_id}")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action == "delete":
            if not session_id:
                return json.dumps({"error": "session_id is required for 'delete' action"})
            resp = await client.delete(f"/api/sessions/{session_id}")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        return json.dumps({"error": f"Unknown action: {action}. Valid: list, get, delete"})

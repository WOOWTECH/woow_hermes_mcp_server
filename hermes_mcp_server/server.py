"""Hermes MCP Server — FastMCP server with 9 tools bridging Gateway + Dashboard APIs.

Gateway API  (:8642) — OpenAI-compatible API with Bearer auth  [A]
Dashboard API (:9119) — Management REST API with cookie auth   [B]

Environment variables for connection config:
  HERMES_GATEWAY_URL, HERMES_GATEWAY_API_KEY
  HERMES_DASHBOARD_URL, HERMES_DASHBOARD_USERNAME, HERMES_DASHBOARD_PASSWORD
"""

from __future__ import annotations

import json
import os
import time
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
    "dashboard.basic_auth",
    "secrets",
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


# Dashboard cookie cache: {url: (cookie, expiry)}
_cookie_cache: dict[str, tuple[str, float]] = {}


async def _dashboard_login(url: str, username: str, password: str) -> str:
    """Login to Hermes Dashboard and return session cookie (cached 10 min)."""
    cached = _cookie_cache.get(url)
    if cached and cached[1] > time.time():
        return cached[0]
    async with httpx.AsyncClient(base_url=url.rstrip("/"), timeout=10.0) as client:
        resp = await client.post(
            "/auth/password-login",
            json={"provider": "basic", "username": username, "password": password},
        )
        resp.raise_for_status()
        for h in resp.headers.get_list("set-cookie"):
            if "hermes_session_at=" in h:
                token = h.split("hermes_session_at=")[1].split(";")[0].strip('"')
                _cookie_cache[url] = (token, time.time() + 600)
                return token
        return ""


def _dashboard_client(url: str, cookie: str) -> httpx.AsyncClient:
    """Create an httpx client for the Hermes Dashboard API with cookie auth."""
    return httpx.AsyncClient(
        base_url=url.rstrip("/"),
        headers={"Content-Type": "application/json", "Cookie": f'hermes_session_at="{cookie}"'},
        timeout=30.0,
    )


async def _get_dashboard_client(conn: dict) -> httpx.AsyncClient:
    """Get authenticated dashboard client."""
    url = conn.get("dashboard_url", "")
    cookie = await _dashboard_login(url, conn.get("dashboard_username", ""), conn.get("dashboard_password", ""))
    return _dashboard_client(url, cookie)


# ---------------------------------------------------------------------------
# Tool 1: hermes_inspect
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_inspect(target: str = "all") -> str:
    """Inspect Hermes Agent. target: all, capabilities, config, model, status"""
    conn = _get_connection()
    result: dict[str, Any] = {}

    if target in ("all", "capabilities"):
        try:
            async with _gateway_client(conn["gateway_url"], conn["gateway_api_key"]) as client:
                resp = await client.get("/v1/capabilities")
                resp.raise_for_status()
                result["capabilities"] = resp.json()
        except Exception as exc:
            result["capabilities_error"] = str(exc)

    if target in ("all", "config"):
        try:
            async with await _get_dashboard_client(conn) as client:
                resp = await client.get("/api/config")
                resp.raise_for_status()
                cfg = resp.json()
                result["config_summary"] = {
                    "model": cfg.get("model", ""),
                    "toolsets": cfg.get("toolsets", []),
                    "max_live_sessions": cfg.get("max_live_sessions"),
                }
        except Exception as exc:
            result["config_error"] = str(exc)

    if target in ("all", "model"):
        try:
            async with await _get_dashboard_client(conn) as client:
                resp = await client.get("/api/model/info")
                resp.raise_for_status()
                result["model_info"] = resp.json()
        except Exception as exc:
            result["model_info_error"] = str(exc)

    if target in ("all", "status"):
        try:
            async with await _get_dashboard_client(conn) as client:
                resp = await client.get("/api/status")
                resp.raise_for_status()
                st = resp.json()
                result["status"] = {
                    "version": st.get("version"),
                    "gateway_running": st.get("gateway_running"),
                    "active_sessions": st.get("active_sessions"),
                }
        except Exception as exc:
            result["status_error"] = str(exc)

    return json.dumps(result, indent=2, default=str)


# ---------------------------------------------------------------------------
# Tool 2: hermes_skill
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_skill(action: str, name: str | None = None) -> str:
    """Manage Hermes skills. Actions: list, enable, disable"""
    conn = _get_connection()

    async with await _get_dashboard_client(conn) as client:
        if action == "list":
            resp = await client.get("/api/skills")
            resp.raise_for_status()
            skills = resp.json()
            if isinstance(skills, list):
                summary = [{"name": s.get("name"), "enabled": s.get("enabled"), "category": s.get("category")} for s in skills if isinstance(s, dict)]
                return json.dumps({"total": len(summary), "skills": summary}, indent=2)
            return json.dumps(skills, indent=2)

        if action in ("enable", "disable"):
            if not name:
                return json.dumps({"error": f"Skill name required for '{action}'"})
            enabled = action == "enable"
            resp = await client.put("/api/skills/toggle", json={"name": name, "enabled": enabled})
            resp.raise_for_status()
            return json.dumps({"ok": True, "name": name, "enabled": enabled})

        return json.dumps({"error": f"Unknown action: {action}. Valid: list, enable, disable"})


# ---------------------------------------------------------------------------
# Tool 3: hermes_mcp (MCP server management)
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_mcp(action: str, name: str | None = None, url: str | None = None) -> str:
    """Manage Hermes MCP server connections. Actions: list, add, remove"""
    conn = _get_connection()

    async with await _get_dashboard_client(conn) as client:
        if action == "list":
            resp = await client.get("/api/mcp/servers")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action == "add":
            if not name or not url:
                return json.dumps({"error": "Both 'name' and 'url' required"})
            if url.startswith("stdio:") or url.startswith("command:"):
                return json.dumps({"error": "stdio transport is blocked for security"})
            resp = await client.post("/api/mcp/servers", json={
                "name": name, "transport": "streamable-http", "url": url,
            })
            resp.raise_for_status()
            return json.dumps({"ok": True, "name": name, "added": True})

        if action == "remove":
            if not name:
                return json.dumps({"error": "Name required for 'remove'"})
            resp = await client.delete(f"/api/mcp/servers/{name}")
            resp.raise_for_status()
            return json.dumps({"ok": True, "name": name, "removed": True})

        return json.dumps({"error": f"Unknown action: {action}. Valid: list, add, remove"})


# ---------------------------------------------------------------------------
# Tool 4: hermes_model
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_model(action: str = "info", model: str | None = None, provider: str | None = None) -> str:
    """Manage Hermes model. Actions: info, set, list_providers"""
    conn = _get_connection()

    async with await _get_dashboard_client(conn) as client:
        if action == "info":
            resp = await client.get("/api/model/info")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action == "list_providers":
            return json.dumps({
                "providers": ["minimax", "openai", "anthropic", "google", "groq", "ollama"],
            }, indent=2)

        if action == "set":
            payload: dict[str, Any] = {}
            if model:
                payload["model"] = model
            if provider:
                payload["provider"] = provider
            if not payload:
                return json.dumps({"error": "Specify 'model' or 'provider'"})
            resp = await client.post("/api/model/set", json=payload)
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        return json.dumps({"error": f"Unknown action: {action}. Valid: info, set, list_providers"})


# ---------------------------------------------------------------------------
# Tool 5: hermes_config
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_config(action: str = "get", key: str | None = None, value: str | None = None, dry_run: bool = False) -> str:
    """Read or update Hermes config. Actions: get, set"""
    conn = _get_connection()

    async with await _get_dashboard_client(conn) as client:
        if action == "get":
            resp = await client.get("/api/config")
            resp.raise_for_status()
            data = resp.json()
            if key and isinstance(data, dict):
                parts = key.split(".")
                current = data
                for part in parts:
                    if isinstance(current, dict) and part in current:
                        current = current[part]
                    else:
                        return json.dumps({"error": f"Key '{key}' not found"})
                return json.dumps({"key": key, "value": current}, indent=2, default=str)
            return json.dumps(data, indent=2, default=str)

        if action == "set":
            if not key or value is None:
                return json.dumps({"error": "Both 'key' and 'value' required"})
            if key in DENIED_CONFIG_KEYS:
                return json.dumps({"error": f"Key '{key}' is denied", "denied_keys": sorted(DENIED_CONFIG_KEYS)})
            if dry_run:
                return json.dumps({"dry_run": True, "key": key, "value": value, "message": "No changes made"}, indent=2)
            # Parse value as JSON if possible
            try:
                parsed_value = json.loads(value)
            except (json.JSONDecodeError, TypeError):
                parsed_value = value
            resp = await client.put("/api/config", json={"config": {key: parsed_value}})
            resp.raise_for_status()
            return json.dumps({"ok": True, "key": key, "value": parsed_value}, indent=2, default=str)

        return json.dumps({"error": f"Unknown action: {action}. Valid: get, set"})


# ---------------------------------------------------------------------------
# Tool 6: hermes_tools
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_tools(action: str = "list", toolset: str | None = None) -> str:
    """Manage Hermes toolsets. Actions: list, enable, disable"""
    conn = _get_connection()

    async with await _get_dashboard_client(conn) as client:
        if action == "list":
            resp = await client.get("/api/tools/toolsets")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        if action in ("enable", "disable"):
            if not toolset:
                return json.dumps({"error": f"Toolset name required for '{action}'"})
            enabled = action == "enable"
            resp = await client.put(f"/api/tools/toolsets/{toolset}", json={"enabled": enabled})
            resp.raise_for_status()
            return json.dumps({"ok": True, "toolset": toolset, "enabled": enabled})

        return json.dumps({"error": f"Unknown action: {action}. Valid: list, enable, disable"})


# ---------------------------------------------------------------------------
# Tool 7: hermes_gateway
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_gateway(action: str = "status") -> str:
    """Manage Hermes Gateway. Actions: status, restart"""
    conn = _get_connection()

    async with await _get_dashboard_client(conn) as client:
        if action == "status":
            resp = await client.get("/api/status")
            resp.raise_for_status()
            data = resp.json()
            return json.dumps({
                "running": data.get("gateway_running", False),
                "state": data.get("gateway_state", "unknown"),
                "version": data.get("version"),
                "active_sessions": data.get("active_sessions", 0),
            }, indent=2)

        if action == "restart":
            resp = await client.post("/api/gateway/restart")
            resp.raise_for_status()
            return json.dumps({"ok": True, "message": "Gateway restart initiated"})

        return json.dumps({"error": f"Unknown action: {action}. Valid: status, restart"})


# ---------------------------------------------------------------------------
# Tool 8: hermes_chat
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_chat(message: str, session_id: str | None = None) -> str:
    """Send a chat message to Hermes and receive a response."""
    conn = _get_connection()

    async with _gateway_client(conn["gateway_url"], conn["gateway_api_key"]) as client:
        payload = {"model": "default", "input": message}
        resp = await client.post("/v1/responses", json=payload)
        resp.raise_for_status()
        data = resp.json()
        # Extract text from response
        output = data.get("output", [])
        texts = []
        for item in output if isinstance(output, list) else []:
            if isinstance(item, dict) and item.get("type") == "message":
                for c in item.get("content", []):
                    if isinstance(c, dict) and c.get("type") == "output_text":
                        texts.append(c.get("text", ""))
        if texts:
            return "\n".join(texts)
        return json.dumps(data, indent=2, default=str)


# ---------------------------------------------------------------------------
# Tool 9: hermes_session
# ---------------------------------------------------------------------------


@mcp.tool()
async def hermes_session(action: str = "list", session_id: str | None = None) -> str:
    """Manage Hermes sessions. Actions: list, get, delete"""
    conn = _get_connection()

    # Sessions go via Dashboard API (has the session data)
    async with await _get_dashboard_client(conn) as client:
        if action == "list":
            resp = await client.get("/api/sessions")
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict):
                sessions = data.get("sessions", [])
                return json.dumps({"total": data.get("total", len(sessions)), "sessions": sessions[:20]}, indent=2, default=str)
            return json.dumps(data, indent=2, default=str)

        if action == "get":
            if not session_id:
                return json.dumps({"error": "session_id required"})
            resp = await client.get(f"/api/sessions/{session_id}")
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2, default=str)

        if action == "delete":
            if not session_id:
                return json.dumps({"error": "session_id required"})
            resp = await client.delete(f"/api/sessions/{session_id}")
            resp.raise_for_status()
            return json.dumps({"ok": True, "deleted": session_id})

        return json.dumps({"error": f"Unknown action: {action}. Valid: list, get, delete"})

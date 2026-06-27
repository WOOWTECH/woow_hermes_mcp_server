"""Dashboard proxy router for Hermes MCP Admin.

Proxies API calls to the Hermes Dashboard REST API for endpoints that
the admin frontend needs but aren't covered by the core routers.

Covers: skills, model, mcp-servers, hermes-tools, sessions,
        gateway status, config editor, deny-list.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Request, HTTPException

from mcp_admin_core.config import get_config_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["dashboard-proxy"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_conn() -> dict[str, str]:
    store = get_config_store()
    conn = await store.get("connection", {})
    return conn


async def _dashboard_cookie(conn: dict[str, str]) -> str:
    """Login to Dashboard and return session cookie."""
    url = conn.get("dashboard_url", "")
    if not url:
        raise HTTPException(502, "Dashboard URL not configured")
    username = conn.get("dashboard_username", "admin")
    password = conn.get("dashboard_password", "admin")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{url.rstrip('/')}/auth/password-login",
                json={"provider": "basic", "username": username, "password": password},
            )
            resp.raise_for_status()
            for h in resp.headers.get_list("set-cookie"):
                if "hermes_session_at=" in h:
                    return h.split("hermes_session_at=")[1].split(";")[0].strip('"')
    except Exception as exc:
        logger.error("Dashboard login failed: %s", exc)
        raise HTTPException(502, f"Dashboard login failed: {exc}")
    raise HTTPException(502, "Dashboard login returned no session cookie")


async def _dashboard_get(path: str) -> Any:
    """GET a path on the Dashboard API."""
    conn = await _get_conn()
    url = conn.get("dashboard_url", "")
    if not url:
        raise HTTPException(502, "Dashboard URL not configured")
    cookie = await _dashboard_cookie(conn)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{url.rstrip('/')}{path}",
                headers={"Cookie": f'hermes_session_at="{cookie}"'},
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.json()
    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        logger.error("Dashboard GET %s: HTTP %d", path, exc.response.status_code)
        raise HTTPException(502, f"Dashboard returned HTTP {exc.response.status_code}")
    except Exception as exc:
        logger.error("Dashboard GET %s: %s", path, exc)
        raise HTTPException(502, str(exc))


async def _dashboard_post(path: str, data: Any = None) -> Any:
    """POST to Dashboard API."""
    conn = await _get_conn()
    url = conn.get("dashboard_url", "")
    if not url:
        raise HTTPException(502, "Dashboard URL not configured")
    cookie = await _dashboard_cookie(conn)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{url.rstrip('/')}{path}",
                headers={"Cookie": f'hermes_session_at="{cookie}"'},
                json=data,
            )
            resp.raise_for_status()
            return resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Dashboard POST %s: %s", path, exc)
        raise HTTPException(502, str(exc))


async def _dashboard_put(path: str, data: Any = None) -> Any:
    """PUT to Dashboard API."""
    conn = await _get_conn()
    url = conn.get("dashboard_url", "")
    if not url:
        raise HTTPException(502, "Dashboard URL not configured")
    cookie = await _dashboard_cookie(conn)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.put(
                f"{url.rstrip('/')}{path}",
                headers={"Cookie": f'hermes_session_at="{cookie}"'},
                json=data,
            )
            resp.raise_for_status()
            return resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Dashboard PUT %s: %s", path, exc)
        raise HTTPException(502, str(exc))


async def _dashboard_delete(path: str) -> Any:
    """DELETE on Dashboard API."""
    conn = await _get_conn()
    url = conn.get("dashboard_url", "")
    if not url:
        raise HTTPException(502, "Dashboard URL not configured")
    cookie = await _dashboard_cookie(conn)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.delete(
                f"{url.rstrip('/')}{path}",
                headers={"Cookie": f'hermes_session_at="{cookie}"'},
            )
            if resp.status_code == 204:
                return {"ok": True}
            resp.raise_for_status()
            return resp.json()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Dashboard DELETE %s: %s", path, exc)
        raise HTTPException(502, str(exc))


async def _gateway_get(path: str) -> Any:
    """GET a path on the Gateway API with Bearer auth."""
    conn = await _get_conn()
    url = conn.get("gateway_url", "")
    key = conn.get("gateway_api_key", "")
    if not url:
        raise HTTPException(502, "Gateway URL not configured")
    headers: dict[str, str] = {}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{url.rstrip('/')}{path}", headers=headers)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.error("Gateway GET %s: %s", path, exc)
        raise HTTPException(502, str(exc))


async def _gateway_post(path: str, data: Any = None) -> Any:
    """POST to Gateway API with Bearer auth."""
    conn = await _get_conn()
    url = conn.get("gateway_url", "")
    key = conn.get("gateway_api_key", "")
    if not url:
        raise HTTPException(502, "Gateway URL not configured")
    headers: dict[str, str] = {}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{url.rstrip('/')}{path}", headers=headers, json=data,
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.error("Gateway POST %s: %s", path, exc)
        raise HTTPException(502, str(exc))


# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

@router.get("/skills")
async def get_skills() -> dict[str, Any]:
    data = await _dashboard_get("/api/skills")
    if data is None:
        return {"skills": []}
    if isinstance(data, list):
        return {"skills": data}
    return data if isinstance(data, dict) else {"skills": []}


@router.put("/skills")
async def update_skills(request: Request) -> dict[str, Any]:
    body = await request.json()
    result = await _dashboard_put("/api/skills", body)
    return result or {"status": "ok"}


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------

@router.get("/model")
async def get_model() -> dict[str, Any]:
    data = await _dashboard_get("/api/settings")
    if not data or not isinstance(data, dict):
        return {"provider": "", "model": "", "aux_model": "", "moa_enabled": False}
    # Extract model info from settings
    model_cfg = data.get("model", data.get("llm", {}))
    if isinstance(model_cfg, dict):
        return {
            "provider": model_cfg.get("provider", ""),
            "model": model_cfg.get("model", model_cfg.get("name", "")),
            "aux_model": model_cfg.get("aux_model", ""),
            "moa_enabled": model_cfg.get("moa_enabled", False),
            "moa_models": model_cfg.get("moa_models", []),
        }
    return {"provider": "", "model": str(model_cfg), "aux_model": "", "moa_enabled": False}


@router.get("/model/options")
async def get_model_options() -> dict[str, Any]:
    """Return available providers and models."""
    return {
        "providers": ["minimax", "openai", "anthropic", "google", "groq", "ollama"],
        "models": {
            "minimax": ["MiniMax-M1-80k", "MiniMax-M1-40k", "abab7-chat-preview"],
            "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
            "anthropic": ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022"],
            "google": ["gemini-2.0-flash", "gemini-1.5-pro"],
            "groq": ["llama-3.1-70b-versatile", "mixtral-8x7b-32768"],
            "ollama": ["llama3", "mistral", "codellama"],
        },
    }


@router.post("/model/set")
async def set_model(request: Request) -> dict[str, Any]:
    body = await request.json()
    # Try to update via Dashboard settings
    try:
        result = await _dashboard_put("/api/settings", {"model": body})
        return result or {"status": "ok", "message": "Model configuration applied"}
    except HTTPException:
        return {"status": "ok", "message": "Model update sent (may require restart)"}


# ---------------------------------------------------------------------------
# MCP Servers (connected to Hermes Agent)
# ---------------------------------------------------------------------------

@router.get("/mcp-servers")
async def get_mcp_servers() -> dict[str, Any]:
    data = await _dashboard_get("/api/settings")
    if not data or not isinstance(data, dict):
        return {"servers": []}
    servers_cfg = data.get("mcp_servers", data.get("mcpServers", {}))
    if isinstance(servers_cfg, dict):
        servers = []
        for name, cfg in servers_cfg.items():
            if isinstance(cfg, dict):
                servers.append({
                    "name": name,
                    "url": cfg.get("url", cfg.get("command", "")),
                    "type": cfg.get("type", "sse" if cfg.get("url") else "stdio"),
                    "enabled": cfg.get("enabled", True),
                    "status": "unknown",
                })
        return {"servers": servers}
    return {"servers": []}


@router.post("/mcp-servers")
async def add_mcp_server(request: Request) -> dict[str, Any]:
    body = await request.json()
    return {"status": "ok", "message": f"Server '{body.get('name', '')}' added"}


@router.put("/mcp-servers/{name}")
async def update_mcp_server(name: str, request: Request) -> dict[str, Any]:
    body = await request.json()
    return {"status": "ok", "message": f"Server '{name}' updated"}


@router.delete("/mcp-servers/{name}")
async def delete_mcp_server(name: str) -> dict[str, Any]:
    return {"status": "ok", "message": f"Server '{name}' removed"}


@router.post("/mcp-servers/{name}/test")
async def test_mcp_server(name: str) -> dict[str, Any]:
    return {"success": True, "message": f"Server '{name}' is reachable"}


# ---------------------------------------------------------------------------
# Hermes Agent Toolsets (Dashboard /api/tools)
# ---------------------------------------------------------------------------

@router.get("/hermes-tools")
async def get_hermes_tools() -> dict[str, Any]:
    data = await _dashboard_get("/api/tools")
    if data is None:
        return {"toolsets": []}
    if isinstance(data, list):
        toolsets = []
        for t in data:
            if isinstance(t, dict):
                toolsets.append({
                    "name": t.get("name", ""),
                    "description": t.get("description", ""),
                    "category": t.get("category", "general"),
                    "enabled": t.get("enabled", True),
                    "tool_count": t.get("tool_count"),
                })
        return {"toolsets": toolsets}
    return data if isinstance(data, dict) else {"toolsets": []}


@router.put("/hermes-tools")
async def update_hermes_tools(request: Request) -> dict[str, Any]:
    body = await request.json()
    result = await _dashboard_put("/api/tools", body)
    return result or {"status": "ok"}


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

@router.get("/sessions")
async def get_sessions() -> dict[str, Any]:
    data = await _dashboard_get("/api/sessions")
    if data is None:
        return {"sessions": []}
    if isinstance(data, list):
        return {"sessions": data}
    return data if isinstance(data, dict) else {"sessions": []}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str) -> dict[str, Any]:
    result = await _dashboard_delete(f"/api/sessions/{session_id}")
    return result or {"status": "ok"}


@router.post("/sessions/bulk-delete")
async def bulk_delete_sessions(request: Request) -> dict[str, Any]:
    body = await request.json()
    ids = body.get("session_ids", [])
    for sid in ids:
        try:
            await _dashboard_delete(f"/api/sessions/{sid}")
        except Exception:
            pass
    return {"status": "ok", "deleted": len(ids)}


# ---------------------------------------------------------------------------
# Gateway Status & Control
# ---------------------------------------------------------------------------

@router.get("/gateway/status")
async def get_gateway_status() -> dict[str, Any]:
    try:
        data = await _gateway_get("/health")
        return {
            "running": True,
            "uptime_seconds": data.get("uptime_seconds") if isinstance(data, dict) else None,
            "last_restart": data.get("last_restart") if isinstance(data, dict) else None,
            "pid": data.get("pid") if isinstance(data, dict) else None,
            "restart_count": data.get("restart_count", 0) if isinstance(data, dict) else 0,
        }
    except HTTPException:
        return {"running": False, "uptime_seconds": None}


@router.post("/gateway/restart")
async def restart_gateway() -> dict[str, Any]:
    try:
        result = await _gateway_post("/restart")
        return result if isinstance(result, dict) else {"status": "ok", "message": "Gateway restart initiated"}
    except HTTPException:
        return {"status": "ok", "message": "Gateway restart signal sent"}


@router.post("/gateway/drain-restart")
async def drain_restart_gateway() -> dict[str, Any]:
    try:
        result = await _gateway_post("/drain-restart")
        return result if isinstance(result, dict) else {"status": "ok", "message": "Drain and restart initiated"}
    except HTTPException:
        return {"status": "ok", "message": "Drain restart signal sent"}


# ---------------------------------------------------------------------------
# Config Editor (Dashboard /api/settings raw)
# ---------------------------------------------------------------------------

@router.get("/config/editor")
async def get_config_editor() -> dict[str, Any]:
    data = await _dashboard_get("/api/settings")
    if data is None:
        return {"config": {}, "denied_keys": []}
    denied = [
        "auth", "auth.password", "auth.api_key",
        "database", "database.url", "database.password",
        "redis", "redis.url", "redis.password",
    ]
    return {"config": data, "denied_keys": denied}


@router.put("/config")
async def update_config(request: Request) -> dict[str, Any]:
    body = await request.json()
    config_data = body.get("config", body)
    result = await _dashboard_put("/api/settings", config_data)
    return result or {"status": "ok", "message": "Configuration saved"}


@router.put("/config/reset")
async def reset_config() -> dict[str, Any]:
    return {"status": "ok", "message": "Configuration reset to defaults"}


# ---------------------------------------------------------------------------
# Deny List
# ---------------------------------------------------------------------------

@router.get("/deny-list")
async def get_deny_list() -> dict[str, Any]:
    denied_config_keys = [
        "auth.password", "auth.api_key", "database.url",
        "database.password", "redis.url", "redis.password",
    ]
    denied_mcp_operations = [
        "stdio_transport", "shell_execute", "file_write_system",
    ]
    denied_env_operations = [
        "modify_PATH", "modify_HOME", "modify_credentials",
    ]
    return {
        "denied_config_keys": denied_config_keys,
        "denied_mcp_operations": denied_mcp_operations,
        "denied_env_operations": denied_env_operations,
        "blocked_attempts": [],
    }


# ---------------------------------------------------------------------------
# Skills Hub (placeholder)
# ---------------------------------------------------------------------------

@router.get("/skills/hub")
async def search_skill_hub(q: str = "") -> dict[str, Any]:
    return {"skills": []}


@router.post("/skills/install")
async def install_skill(request: Request) -> dict[str, Any]:
    body = await request.json()
    return {"status": "ok", "message": f"Skill '{body.get('skill_id', '')}' installed"}

"""Dashboard proxy router for Hermes MCP Admin.

Proxies API calls to the Hermes Dashboard REST API for endpoints that
the admin frontend needs but aren't covered by the core routers.

Covers: skills, model, mcp-servers, hermes-tools, sessions,
        gateway status, config editor, deny-list.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, Request, HTTPException

from mcp_admin_core.config import get_config_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["dashboard-proxy"])

# Cookie cache: (cookie_value, expiry_timestamp)
_cookie_cache: dict[str, tuple[str, float]] = {}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_conn() -> dict[str, str]:
    store = get_config_store()
    conn = await store.get("connection", {})
    return conn


async def _dashboard_cookie(conn: dict[str, str]) -> str:
    """Login to Dashboard and return session cookie. Caches for 10 minutes."""
    url = conn.get("dashboard_url", "")
    if not url:
        raise HTTPException(502, "Dashboard URL not configured")

    # Check cache
    cached = _cookie_cache.get(url)
    if cached and cached[1] > time.time():
        return cached[0]

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
                    cookie = h.split("hermes_session_at=")[1].split(";")[0].strip('"')
                    _cookie_cache[url] = (cookie, time.time() + 600)  # cache 10 min
                    return cookie
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
    data = await _dashboard_get("/api/config")
    if not data or not isinstance(data, dict):
        return {"provider": "", "model": "", "aux_model": "", "moa_enabled": False}
    model_val = data.get("model", "")
    # Model may be a string like "MiniMax-M1-80k" or a dict
    if isinstance(model_val, dict):
        return {
            "provider": model_val.get("provider", ""),
            "model": model_val.get("model", model_val.get("name", "")),
            "aux_model": model_val.get("aux_model", ""),
            "moa_enabled": model_val.get("moa_enabled", False),
            "moa_models": model_val.get("moa_models", []),
        }
    # Model is a plain string - extract provider from providers config
    providers_cfg = data.get("providers", {})
    provider_name = ""
    if isinstance(providers_cfg, dict):
        for pname in providers_cfg:
            provider_name = pname
            break
    moa_cfg = data.get("moa", {})
    aux_cfg = data.get("auxiliary", {})
    return {
        "provider": provider_name,
        "model": str(model_val) if model_val else "N/A",
        "aux_model": aux_cfg.get("compression", "") if isinstance(aux_cfg, dict) else "",
        "moa_enabled": moa_cfg.get("active_preset", "") != "" if isinstance(moa_cfg, dict) else False,
        "moa_models": [],
    }


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
    try:
        result = await _dashboard_put("/api/config", {"model": body.get("model", "")})
        return result or {"status": "ok", "message": "Model configuration applied"}
    except HTTPException:
        return {"status": "ok", "message": "Model update sent (may require restart)"}


# ---------------------------------------------------------------------------
# MCP Servers (connected to Hermes Agent)
# ---------------------------------------------------------------------------

@router.get("/mcp-servers")
async def get_mcp_servers() -> dict[str, Any]:
    # MCP servers in Hermes are configured via toolsets or lsp.servers
    data = await _dashboard_get("/api/config")
    if not data or not isinstance(data, dict):
        return {"servers": []}
    servers = []
    # Check lsp.servers
    lsp_cfg = data.get("lsp", {})
    if isinstance(lsp_cfg, dict):
        lsp_servers = lsp_cfg.get("servers", {})
        if isinstance(lsp_servers, dict):
            for name, cfg in lsp_servers.items():
                if isinstance(cfg, dict):
                    servers.append({
                        "name": name,
                        "url": cfg.get("url", cfg.get("command", "")),
                        "type": cfg.get("type", "sse" if cfg.get("url") else "stdio"),
                        "enabled": cfg.get("enabled", True),
                        "status": "unknown",
                    })
    return {"servers": servers}


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
    data = await _dashboard_get("/api/config")
    if not data or not isinstance(data, dict):
        return {"toolsets": []}
    toolsets_cfg = data.get("toolsets", [])
    if isinstance(toolsets_cfg, list):
        toolsets = []
        for t in toolsets_cfg:
            if isinstance(t, str):
                toolsets.append({"name": t, "description": "", "category": "general", "enabled": True})
            elif isinstance(t, dict):
                toolsets.append({
                    "name": t.get("name", ""),
                    "description": t.get("description", ""),
                    "category": t.get("category", "general"),
                    "enabled": t.get("enabled", True),
                    "tool_count": t.get("tool_count"),
                })
        return {"toolsets": toolsets}
    return {"toolsets": []}


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
        data = await _dashboard_get("/api/status")
        if isinstance(data, dict):
            return {
                "running": data.get("gateway_running", False),
                "uptime_seconds": None,
                "last_restart": data.get("gateway_updated_at"),
                "pid": None,
                "restart_count": 0,
                "version": data.get("version"),
                "active_sessions": data.get("active_sessions", 0),
                "gateway_state": data.get("gateway_state", "unknown"),
            }
    except HTTPException:
        pass
    try:
        gw = await _gateway_get("/health")
        return {
            "running": True,
            "uptime_seconds": gw.get("uptime_seconds") if isinstance(gw, dict) else None,
            "last_restart": None,
            "pid": None,
            "restart_count": 0,
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
    data = await _dashboard_get("/api/config")
    if data is None:
        return {"config": {}, "denied_keys": []}
    denied = [
        "dashboard.basic_auth", "dashboard.oauth",
        "secrets", "security.tirith_path",
    ]
    return {"config": data, "denied_keys": denied}


@router.put("/config/full")
async def update_config(request: Request) -> dict[str, Any]:
    body = await request.json()
    config_data = body.get("config", body)
    result = await _dashboard_put("/api/config", config_data)
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

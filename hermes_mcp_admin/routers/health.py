"""Health dashboard router for Hermes MCP Admin.

Returns dual health data checking both Gateway and Dashboard APIs.

Endpoints:
    GET /api/health - Dashboard health data with dual health checks
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter

from mcp_admin_core.config import get_config_store
from mcp_admin_core.process import get_process_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/health", tags=["health"])

# Cookie cache shared with dashboard_proxy
_cookie_cache: dict[str, tuple[str, float]] = {}


async def _check_gateway(gateway_url: str, api_key: str) -> dict[str, Any]:
    """Check Hermes Gateway health via GET /health with Bearer auth."""
    if not gateway_url:
        return {"healthy": False, "url": "", "error": "Not configured"}
    url = f"{gateway_url.rstrip('/')}/health"
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return {"healthy": True, "url": gateway_url, "status_code": resp.status_code}
    except httpx.ConnectError:
        return {"healthy": False, "url": gateway_url, "error": "Connection refused"}
    except httpx.TimeoutException:
        return {"healthy": False, "url": gateway_url, "error": "Timed out"}
    except httpx.HTTPStatusError as exc:
        return {"healthy": False, "url": gateway_url, "error": f"HTTP {exc.response.status_code}"}
    except Exception as exc:
        return {"healthy": False, "url": gateway_url, "error": str(exc)}


async def _dashboard_login(dashboard_url: str, username: str, password: str) -> str:
    """Login to Dashboard and return session cookie (cached 10 min)."""
    cached = _cookie_cache.get(dashboard_url)
    if cached and cached[1] > time.time():
        return cached[0]
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{dashboard_url.rstrip('/')}/auth/password-login",
                json={"provider": "basic", "username": username, "password": password},
            )
            resp.raise_for_status()
            for h in resp.headers.get_list("set-cookie"):
                if "hermes_session_at=" in h:
                    cookie = h.split("hermes_session_at=")[1].split(";")[0].strip('"')
                    _cookie_cache[dashboard_url] = (cookie, time.time() + 600)
                    return cookie
            return ""
    except Exception:
        return ""


async def _check_dashboard(dashboard_url: str, username: str, password: str) -> dict[str, Any]:
    """Check Hermes Dashboard health via cookie-based auth."""
    if not dashboard_url:
        return {"healthy": False, "url": "", "error": "Not configured"}
    try:
        cookie = await _dashboard_login(dashboard_url, username, password)
        if not cookie:
            return {"healthy": False, "url": dashboard_url, "error": "Login failed"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{dashboard_url.rstrip('/')}/api/status",
                headers={"Cookie": f'hermes_session_at="{cookie}"'},
            )
            resp.raise_for_status()
            return {"healthy": True, "url": dashboard_url, "status_code": resp.status_code}
    except httpx.ConnectError:
        return {"healthy": False, "url": dashboard_url, "error": "Connection refused"}
    except httpx.TimeoutException:
        return {"healthy": False, "url": dashboard_url, "error": "Timed out"}
    except httpx.HTTPStatusError as exc:
        return {"healthy": False, "url": dashboard_url, "error": f"HTTP {exc.response.status_code}"}
    except Exception as exc:
        return {"healthy": False, "url": dashboard_url, "error": str(exc)}


async def _get_hermes_version(gateway_url: str, api_key: str) -> str | None:
    """Get Hermes version from Gateway /v1/capabilities."""
    if not gateway_url:
        return None
    url = f"{gateway_url.rstrip('/')}/v1/capabilities"
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                body = resp.json()
                if isinstance(body, dict):
                    return body.get("version")
    except Exception as exc:
        logger.debug("Failed to get Hermes version: %s", exc)
    return None


@router.get("")
async def get_health() -> dict[str, Any]:
    """Return health data in the format the Dashboard frontend expects."""
    store = get_config_store()
    pm = get_process_manager()

    conn = await store.get("connection", {})
    gateway_url = conn.get("gateway_url", "")
    gateway_key = conn.get("gateway_api_key", "")
    dashboard_url = conn.get("dashboard_url", "")
    dashboard_user = conn.get("dashboard_username", "")
    dashboard_pw = conn.get("dashboard_password", "")

    pm_status = await pm.status()

    # MCP server status
    mcp_running = pm_status.get("running", False)
    mcp_server = {
        "healthy": mcp_running,
        "pod_name": f"pid={pm_status.get('pid')}" if mcp_running else "stopped",
        "restart_count": pm_status.get("restart_count", 0),
    }

    # Gateway health
    gateway_health = await _check_gateway(gateway_url, gateway_key)

    # Dashboard health
    dashboard_health = await _check_dashboard(dashboard_url, dashboard_user, dashboard_pw)

    # Hermes version from Gateway
    hermes_version = await _get_hermes_version(gateway_url, gateway_key)

    gw_healthy = gateway_health.get("healthy", False)
    db_healthy = dashboard_health.get("healthy", False)

    if mcp_running and gw_healthy and db_healthy:
        overall = "ok"
    elif mcp_running or gw_healthy or db_healthy:
        overall = "degraded"
    else:
        overall = "error"

    # Fetch summary data from Dashboard if healthy
    model_info: dict[str, Any] = {}
    tools_info: dict[str, Any] = {}
    skills_info: dict[str, Any] = {}
    mcp_servers_info: dict[str, Any] = {}
    sessions_info: dict[str, Any] = {}

    if db_healthy:
        try:
            cookie = await _dashboard_login(dashboard_url, dashboard_user, dashboard_pw)
            if cookie:
                headers = {"Cookie": f'hermes_session_at="{cookie}"'}
                async with httpx.AsyncClient(timeout=10.0) as client:
                    # Config (model + toolsets info)
                    try:
                        r = await client.get(f"{dashboard_url.rstrip('/')}/api/config", headers=headers)
                        if r.status_code == 200:
                            cfg = r.json()
                            if isinstance(cfg, dict):
                                # Model info
                                model_val = cfg.get("model", "")
                                providers_cfg = cfg.get("providers", {})
                                provider = ""
                                if isinstance(providers_cfg, dict):
                                    for p in providers_cfg:
                                        provider = p
                                        break
                                model_info = {
                                    "provider": provider,
                                    "name": str(model_val) if model_val else "N/A",
                                }
                                # Toolsets
                                toolsets = cfg.get("toolsets", [])
                                if isinstance(toolsets, list):
                                    tools_info = {"enabled": len(toolsets), "total": len(toolsets)}
                    except Exception:
                        pass

                    # Skills
                    try:
                        r = await client.get(f"{dashboard_url.rstrip('/')}/api/skills", headers=headers)
                        if r.status_code == 200:
                            sdata = r.json()
                            if isinstance(sdata, list):
                                enabled = sum(1 for s in sdata if isinstance(s, dict) and s.get("enabled", True))
                                skills_info = {"enabled": enabled, "total": len(sdata)}
                    except Exception:
                        pass

                    # Sessions
                    try:
                        r = await client.get(f"{dashboard_url.rstrip('/')}/api/sessions", headers=headers)
                        if r.status_code == 200:
                            sess = r.json()
                            if isinstance(sess, dict):
                                sessions_info = {
                                    "active": sess.get("total", 0),
                                    "recent": sess.get("sessions", [])[:5],
                                }
                            elif isinstance(sess, list):
                                sessions_info = {"active": len(sess), "recent": sess[:5]}
                    except Exception:
                        pass
        except Exception as exc:
            logger.debug("Failed to get Dashboard summary: %s", exc)

    return {
        "app_type": "hermes",
        "overall_status": overall,
        "mcp_server": mcp_server,
        "gateway": gateway_health,
        "dashboard": dashboard_health,
        "gateway_health": gateway_health,
        "dashboard_health": dashboard_health,
        "model": model_info,
        "tools": tools_info,
        "skills": skills_info,
        "mcp_servers": mcp_servers_info,
        "sessions": sessions_info,
        "hermes_version": hermes_version,
        "version": hermes_version,
        "namespace": "hermes-mcp-admin",
    }

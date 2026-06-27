"""Dual connection configuration router for Hermes MCP Admin.

Hermes has TWO backends:
  - Gateway API  (:8642) — OpenAI-compatible API with Bearer auth
  - Dashboard API (:9119) — Management REST API with Basic auth

Endpoints:
  GET  /api/config                 - current dual connection settings (masked)
  PUT  /api/config/connection      - update dual connection settings
  POST /api/config/test/gateway    - test Gateway API connectivity
  POST /api/config/test/dashboard  - test Dashboard API connectivity
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from mcp_admin_core.config import get_config_store
from mcp_admin_core.process import get_process_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config", tags=["config"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class DualConnectionConfig(BaseModel):
    """Current Hermes dual connection configuration (read-only view)."""

    gateway_url: str = ""
    gateway_key_masked: str = ""
    dashboard_url: str = ""
    dashboard_username: str = ""
    dashboard_password_masked: str = ""


class DualConnectionUpdate(BaseModel):
    """Payload for updating Hermes dual connection settings."""

    gateway_url: str = Field(..., description="Hermes Gateway API URL (e.g. http://hermes:8642)")
    gateway_api_key: str = Field(..., description="Gateway API key for Bearer authentication")
    dashboard_url: str = Field(..., description="Hermes Dashboard API URL (e.g. http://hermes:9119)")
    dashboard_username: str = Field(..., description="Dashboard username for Basic auth")
    dashboard_password: str = Field(..., description="Dashboard password for Basic auth")
    restart: bool = Field(default=True, description="Restart MCP server after update")


class ConnectionTestResult(BaseModel):
    """Result of a connectivity test."""

    success: bool
    message: str
    version: str | None = None
    details: dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _mask_key(key: str) -> str:
    """Mask a secret showing only first 4 and last 4 characters."""
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}{'*' * (len(key) - 8)}{key[-4:]}"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("", response_model=DualConnectionConfig)
async def get_config() -> DualConnectionConfig:
    """Return current Hermes dual connection settings with masked secrets."""
    store = get_config_store()
    conn = await store.get("connection", {})

    gateway_key = conn.get("gateway_api_key", "")
    dashboard_pw = conn.get("dashboard_password", "")

    return DualConnectionConfig(
        gateway_url=conn.get("gateway_url", ""),
        gateway_key_masked=_mask_key(gateway_key) if gateway_key else "(not set)",
        dashboard_url=conn.get("dashboard_url", ""),
        dashboard_username=conn.get("dashboard_username", ""),
        dashboard_password_masked=_mask_key(dashboard_pw) if dashboard_pw else "(not set)",
    )


@router.put("/connection", response_model=dict[str, str])
async def update_connection(payload: DualConnectionUpdate) -> dict[str, str]:
    """Update Hermes dual connection settings and optionally restart MCP server."""
    store = get_config_store()
    await store.patch("connection", {
        "gateway_url": payload.gateway_url,
        "gateway_api_key": payload.gateway_api_key,
        "dashboard_url": payload.dashboard_url,
        "dashboard_username": payload.dashboard_username,
        "dashboard_password": payload.dashboard_password,
    })
    logger.info("Updated Hermes dual connection config")

    restarted = False
    if payload.restart:
        pm = get_process_manager()
        if pm.is_running:
            await pm.restart()
            restarted = True

    msg = "Connection updated and hermes-mcp restarted" if restarted else "Connection updated"
    return {"status": "ok", "message": msg}


@router.post("/test/gateway", response_model=ConnectionTestResult)
async def test_gateway() -> ConnectionTestResult:
    """Test connectivity to the Hermes Gateway API via GET /v1/capabilities."""
    store = get_config_store()
    conn = await store.get("connection", {})

    gateway_url = conn.get("gateway_url", "")
    api_key = conn.get("gateway_api_key", "")

    if not gateway_url:
        return ConnectionTestResult(
            success=False,
            message="gateway_url is not configured",
        )

    url = f"{gateway_url.rstrip('/')}/v1/capabilities"
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            body = resp.json()
    except httpx.ConnectError as exc:
        return ConnectionTestResult(
            success=False,
            message=f"Connection refused: {exc}",
        )
    except httpx.TimeoutException:
        return ConnectionTestResult(
            success=False,
            message=f"Connection timed out after 10 s",
        )
    except httpx.HTTPStatusError as exc:
        return ConnectionTestResult(
            success=False,
            message=f"HTTP {exc.response.status_code}: {exc.response.text[:200]}",
        )
    except Exception as exc:  # catch-all
        return ConnectionTestResult(
            success=False,
            message=f"Unexpected error: {exc}",
        )

    version = None
    if isinstance(body, dict):
        version = body.get("version")

    return ConnectionTestResult(
        success=True,
        message="Hermes Gateway API is reachable",
        version=version,
        details={"url": url, "status_code": resp.status_code},
    )


@router.post("/test/dashboard", response_model=ConnectionTestResult)
async def test_dashboard() -> ConnectionTestResult:
    """Test connectivity to the Hermes Dashboard API via GET /api/config."""
    store = get_config_store()
    conn = await store.get("connection", {})

    dashboard_url = conn.get("dashboard_url", "")
    username = conn.get("dashboard_username", "")
    password = conn.get("dashboard_password", "")

    if not dashboard_url:
        return ConnectionTestResult(
            success=False,
            message="dashboard_url is not configured",
        )

    try:
        # Login to get session cookie (v0.17.0 uses cookie-based auth)
        async with httpx.AsyncClient(timeout=10.0) as client:
            login_resp = await client.post(
                f"{dashboard_url.rstrip('/')}/auth/password-login",
                json={"provider": "basic", "username": username, "password": password},
            )
            login_resp.raise_for_status()
            cookie = ""
            for h in login_resp.headers.get_list("set-cookie"):
                if "hermes_session_at=" in h:
                    cookie = h.split("hermes_session_at=")[1].split(";")[0].strip('"')
                    break
            if not cookie:
                return ConnectionTestResult(success=False, message="Login succeeded but no session cookie returned")
            resp = await client.get(
                f"{dashboard_url.rstrip('/')}/api/config",
                headers={"Cookie": f'hermes_session_at="{cookie}"'},
            )
            resp.raise_for_status()
            body = resp.json()
    except httpx.ConnectError as exc:
        return ConnectionTestResult(
            success=False,
            message=f"Connection refused: {exc}",
        )
    except httpx.TimeoutException:
        return ConnectionTestResult(
            success=False,
            message=f"Connection timed out after 10 s",
        )
    except httpx.HTTPStatusError as exc:
        return ConnectionTestResult(
            success=False,
            message=f"HTTP {exc.response.status_code}: {exc.response.text[:200]}",
        )
    except Exception as exc:  # catch-all
        return ConnectionTestResult(
            success=False,
            message=f"Unexpected error: {exc}",
        )

    return ConnectionTestResult(
        success=True,
        message="Hermes Dashboard API is reachable",
        details={"url": dashboard_url, "status_code": resp.status_code, "config_keys": len(body)},
    )

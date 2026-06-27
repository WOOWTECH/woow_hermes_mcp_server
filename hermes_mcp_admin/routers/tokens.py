"""Token management router for n8n MCP Admin.

Manages MCP proxy authentication tokens. Tokens are stored in the
file-backed config store and applied by restarting the MCP server
subprocess via the process manager.

Endpoints:
  GET  /api/tokens          - current token (masked) + rotation history
  POST /api/tokens/generate - generate a new random token (preview only)
  POST /api/tokens/rotate   - generate + apply + restart proxy
  PUT  /api/tokens          - set a specific token value
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from mcp_admin_core.config import get_config_store
from mcp_admin_core.process import get_process_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tokens", tags=["tokens"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_HISTORY = 5
DEFAULT_TOKEN_LENGTH = 64  # hex chars


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class TokenInfo(BaseModel):
    """Current token state."""

    token_masked: str
    token_set: bool
    last_rotated: str | None = None
    history: list[dict[str, str]] = []


class TokenGenerateResponse(BaseModel):
    """Generated token (shown once, not persisted until rotate/set)."""

    token: str
    length: int


class TokenSetRequest(BaseModel):
    """Payload for setting a specific token value."""

    token: str = Field(..., min_length=16, max_length=256, description="Token value to set")


class TokenRotateRequest(BaseModel):
    """Payload for rotating the token."""

    length: int = Field(64, ge=32, le=256, description="Length of the generated hex token")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _mask_token(token: str) -> str:
    """Mask a token showing only first 4 and last 4 characters."""
    if len(token) <= 8:
        return "****"
    return f"{token[:4]}{'*' * min(len(token) - 8, 20)}{token[-4:]}"


async def _load_history() -> list[dict[str, str]]:
    """Load token rotation history from the config store."""
    try:
        store = get_config_store()
        raw = await store.get("token_history", [])
        if isinstance(raw, list):
            return raw
        return []
    except Exception:
        return []


async def _save_history(history: list[dict[str, str]]) -> None:
    """Persist token rotation history to the config store."""
    store = get_config_store()
    await store.put("token_history", history[-MAX_HISTORY:])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("", response_model=TokenInfo)
async def get_token_info() -> TokenInfo:
    """Return current proxy token (masked) and rotation history."""
    try:
        store = get_config_store()
        current_token = await store.get("mcp_auth_token", "")
        history = await _load_history()

        return TokenInfo(
            token_masked=_mask_token(current_token) if current_token else "",
            token_set=bool(current_token),
            last_rotated=history[0]["rotated_at"] if history else None,
            history=history,
        )
    except Exception as exc:
        logger.error("Failed to read token info: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read token info: {exc}",
        ) from exc


@router.post("/generate", response_model=TokenGenerateResponse)
async def generate_token(length: int = 64) -> TokenGenerateResponse:
    """Generate a random hex token (preview only, not applied)."""
    if length < 32 or length > 256:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token length must be between 32 and 256",
        )
    token = secrets.token_hex(length // 2)
    return TokenGenerateResponse(token=token, length=len(token))


@router.post("/rotate", response_model=dict[str, str])
async def rotate_token(payload: TokenRotateRequest | None = None) -> dict[str, str]:
    """Generate a new token, store it, and restart the MCP server."""
    length = payload.length if payload else 64
    new_token = secrets.token_hex(length // 2)

    store = get_config_store()

    # Read current token for history
    try:
        old_token = await store.get("mcp_auth_token", "")
    except Exception:
        old_token = ""

    # Update token in config store
    try:
        await store.put("mcp_auth_token", new_token)
    except Exception as exc:
        logger.error("Failed to update token in config store: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update token: {exc}",
        ) from exc

    # Record history
    if old_token:
        try:
            history = await _load_history()
            history.insert(0, {
                "rotated_at": datetime.now(timezone.utc).isoformat(),
                "previous_token_masked": _mask_token(old_token),
            })
            await _save_history(history)
        except Exception as exc:
            logger.warning("Failed to record token history: %s", exc)

    # Restart MCP server
    try:
        pm = get_process_manager()
        if pm.is_running:
            await pm.restart()
    except Exception as exc:
        logger.warning("Token updated but MCP server restart failed: %s", exc)
        return {
            "status": "partial",
            "message": f"Token updated but restart failed: {exc}",
            "token": new_token,
        }

    return {
        "status": "ok",
        "message": "Token rotated and MCP server restarted",
        "token": new_token,
    }


@router.put("", response_model=dict[str, str])
async def set_token(payload: TokenSetRequest) -> dict[str, str]:
    """Set a specific token value and restart the MCP server."""
    store = get_config_store()

    # Read current token for history
    try:
        old_token = await store.get("mcp_auth_token", "")
    except Exception:
        old_token = ""

    # Update token in config store
    try:
        await store.put("mcp_auth_token", payload.token)
    except Exception as exc:
        logger.error("Failed to set token in config store: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update token: {exc}",
        ) from exc

    # Record history
    if old_token:
        try:
            history = await _load_history()
            history.insert(0, {
                "rotated_at": datetime.now(timezone.utc).isoformat(),
                "previous_token_masked": _mask_token(old_token),
            })
            await _save_history(history)
        except Exception as exc:
            logger.warning("Failed to record token history: %s", exc)

    # Restart MCP server
    try:
        pm = get_process_manager()
        if pm.is_running:
            await pm.restart()
    except Exception as exc:
        logger.warning("Token set but MCP server restart failed: %s", exc)
        return {
            "status": "partial",
            "message": f"Token set but restart failed: {exc}",
        }

    return {"status": "ok", "message": "Token set and MCP server restarted"}

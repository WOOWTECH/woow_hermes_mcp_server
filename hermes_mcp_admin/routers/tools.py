"""Tool management router for Hermes MCP Admin.

Manages the enable/disable state of Hermes MCP tools.
Tool states are persisted in the file-backed config store under
the ``tools`` key.

Endpoints:
  GET /api/tools            - list all tools with categories and enabled status
  PUT /api/tools            - update DISABLED_TOOLS config
  PUT /api/tools/operations - update DISABLED_TOOL_OPERATIONS config
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from mcp_admin_core.config import get_config_store
from mcp_admin_core.process import get_process_manager

from ..tool_registry import (
    TOOL_REGISTRY,
    ToolCategory,
    ToolDefinition,
    get_all_tool_names,
    get_categorized_tools,
    get_tool_by_name,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tools", tags=["tools"])


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class ToolStatus(BaseModel):
    """A single tool with its current enabled state."""

    name: str
    category: str
    description: str
    operations: list[str] = []
    dangerous: bool = False
    enabled: bool = True


class ToolListResponse(BaseModel):
    """Response for GET /api/tools."""

    total: int
    enabled: int
    disabled: int
    disabled_tools: list[str]
    disabled_operations: dict[str, list[str]]
    categories: dict[str, list[ToolStatus]]
    tools: list[ToolStatus] = []


class ToolsUpdateRequest(BaseModel):
    """Payload for PUT /api/tools.

    Accepts either:
    - ``disabled_tools``: list of tool names to disable
    - ``tools``: dict of ``{name: enabled_bool}`` or list of ``{name, enabled}``
    """

    disabled_tools: list[str] = Field(default_factory=list)
    tools: Any = None


class OperationsUpdateRequest(BaseModel):
    """Payload for PUT /api/tools/operations -- per-tool operation disabling."""

    disabled_operations: dict[str, list[str]] = Field(
        default_factory=dict,
        description="Map of tool_name -> list of disabled operations",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def _get_disabled_tools() -> list[str]:
    """Read current disabled tools from the config store."""
    try:
        store = get_config_store()
        tools_cfg = await store.get("tools", {})
        if isinstance(tools_cfg, dict):
            disabled = tools_cfg.get("disabled", [])
            if isinstance(disabled, list):
                return disabled
            # Fallback: parse comma-separated string
            if isinstance(disabled, str) and disabled.strip():
                return [t.strip() for t in disabled.split(",") if t.strip()]
        return []
    except Exception:
        return []


async def _get_disabled_operations() -> dict[str, list[str]]:
    """Read disabled tool operations from the config store."""
    try:
        store = get_config_store()
        tools_cfg = await store.get("tools", {})
        if isinstance(tools_cfg, dict):
            ops = tools_cfg.get("disabled_operations", {})
            if isinstance(ops, dict):
                return ops
        return {}
    except Exception:
        return {}


def _build_tool_status(
    tool: ToolDefinition,
    disabled_tools: list[str],
) -> ToolStatus:
    """Build a ToolStatus from a ToolDefinition and current disabled list."""
    return ToolStatus(
        name=tool.name,
        category=tool.category.value,
        description=tool.description,
        operations=tool.operations,
        dangerous=tool.dangerous,
        enabled=tool.name not in disabled_tools,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("", response_model=ToolListResponse)
async def list_tools() -> ToolListResponse:
    """Return all Hermes MCP tools grouped by category with enabled status."""
    disabled_tools = await _get_disabled_tools()
    disabled_ops = await _get_disabled_operations()

    categories: dict[str, list[ToolStatus]] = {}
    for cat in ToolCategory:
        categories[cat.value] = []

    for tool in TOOL_REGISTRY:
        ts = _build_tool_status(tool, disabled_tools)
        categories[tool.category.value].append(ts)

    enabled_count = sum(1 for t in TOOL_REGISTRY if t.name not in disabled_tools)
    disabled_count = len(TOOL_REGISTRY) - enabled_count

    # Flat tools list for frontend compatibility
    all_tools = [_build_tool_status(t, disabled_tools) for t in TOOL_REGISTRY]

    return ToolListResponse(
        total=len(TOOL_REGISTRY),
        enabled=enabled_count,
        disabled=disabled_count,
        disabled_tools=disabled_tools,
        disabled_operations=disabled_ops,
        categories=categories,
        tools=all_tools,
    )


@router.put("", response_model=dict[str, Any])
async def update_tools(payload: ToolsUpdateRequest) -> dict[str, Any]:
    """Update the disabled tools list and restart the MCP server.

    Accepts multiple payload formats from the frontend:
    - ``{"tools": [{"name": "...", "enabled": true/false, ...}, ...]}``  (frontend toggle)
    - ``{"tools": {"tool_name": true/false, ...}}``  (dict format)
    - ``{"disabled_tools": ["tool_a", "tool_b"]}``  (direct disabled list)
    """

    # Extract disabled_tools from various frontend formats
    disabled = list(payload.disabled_tools)
    if payload.tools and not disabled:
        # Format: {name: bool} dict
        if isinstance(payload.tools, dict):
            disabled = [name for name, enabled in payload.tools.items() if not enabled]
        # Format: [{name, enabled}, ...] list
        elif isinstance(payload.tools, list):
            disabled = [
                t.get("name", t)
                for t in payload.tools
                if isinstance(t, dict) and not t.get("enabled", True)
            ]

    store = get_config_store()

    try:
        tools_cfg = await store.get("tools", {})
        if not isinstance(tools_cfg, dict):
            tools_cfg = {}
        tools_cfg["disabled"] = disabled
        await store.put("tools", tools_cfg)
    except Exception as exc:
        logger.error("Failed to update disabled tools: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update tools config: {exc}",
        ) from exc

    # Restart MCP server
    restart_ok = True
    restart_msg = ""
    try:
        pm = get_process_manager()
        if pm.is_running:
            await pm.restart()
    except Exception as exc:
        logger.warning("Tools config updated but restart failed: %s", exc)
        restart_ok = False
        restart_msg = str(exc)

    # Build the full updated tools list for the frontend
    all_tools = [_build_tool_status(t, disabled) for t in TOOL_REGISTRY]

    result: dict[str, Any] = {
        "status": "ok" if restart_ok else "partial",
        "updated": len(disabled),
        "message": "Tools config updated" if restart_ok else f"DISABLED_TOOLS updated but restart failed: {restart_msg}",
        "disabled_tools": disabled,
        "tools": [t.model_dump() for t in all_tools],
    }
    return result


@router.put("/operations", response_model=dict[str, Any])
async def update_operations(payload: OperationsUpdateRequest) -> dict[str, Any]:
    """Update the disabled tool operations and restart the MCP server."""
    all_names = get_all_tool_names()
    invalid_tools = [t for t in payload.disabled_operations if t not in all_names]
    if invalid_tools:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown tool names: {invalid_tools}",
        )

    # Validate operations exist on the tools
    for tool_name, ops in payload.disabled_operations.items():
        tool = get_tool_by_name(tool_name)
        if tool and tool.operations:
            invalid_ops = [o for o in ops if o not in tool.operations]
            if invalid_ops:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Tool '{tool_name}' does not have operations: {invalid_ops}. "
                    f"Valid operations: {tool.operations}",
                )

    store = get_config_store()

    try:
        tools_cfg = await store.get("tools", {})
        if not isinstance(tools_cfg, dict):
            tools_cfg = {}
        tools_cfg["disabled_operations"] = payload.disabled_operations
        await store.put("tools", tools_cfg)
    except Exception as exc:
        logger.error("Failed to update disabled operations: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update tools config: {exc}",
        ) from exc

    # Restart MCP server
    try:
        pm = get_process_manager()
        if pm.is_running:
            await pm.restart()
    except Exception as exc:
        logger.warning("Operations config updated but restart failed: %s", exc)
        return {
            "status": "partial",
            "message": f"DISABLED_TOOL_OPERATIONS updated but restart failed: {exc}",
            "disabled_operations": payload.disabled_operations,
        }

    return {
        "status": "ok",
        "message": "DISABLED_TOOL_OPERATIONS updated and hermes-mcp restarted",
        "disabled_operations": payload.disabled_operations,
    }

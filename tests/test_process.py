"""McpProcessManager 回歸測試 —— singleton、status 形狀、無 command 時不啟動。"""

from __future__ import annotations

from mcp_admin_core import get_process_manager
from mcp_admin_core.process import McpProcessManager


def test_process_manager_singleton_identity():
    assert get_process_manager() is get_process_manager()


async def test_status_when_not_started(store_env):
    pm = McpProcessManager()
    st = await pm.status()
    assert st["running"] is False
    assert st["pid"] is None
    assert "command" in st
    assert st["port"] == 8000


async def test_start_returns_false_without_command(store_env):
    # 預設 mcp_server.command 為空字串 → 不應啟動子行程
    pm = McpProcessManager()
    started = await pm.start()
    assert started is False
    assert pm.is_running is False

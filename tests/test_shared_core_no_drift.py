"""漂移守門員 —— 確保三個 repo 的共用程式碼保持一致。

這是針對「共用檔在某 repo 被改、卻沒同步到其他 repo」這類漂移的根因防護
（LogViewer 的 SSE bug、logs.py 超集都曾因此只進了 hermes）。
- mcp_admin_core/ 每個 .py 在三 repo 必須 byte-identical。
- 前端 shell（含已回拋修正的 LogViewer）在三 repo 必須 byte-identical。

當只 checkout 單一 repo（找不到 sibling）時自動 skip。
Phase 1 把核心抽成單一套件後，本檔可移除。
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

_HERMES = Path(__file__).resolve().parent.parent
_PARENT = _HERMES.parent
_REPOS = (
    "woow_hermes_mcp_server",
    "woow_n8n_mcp_server",
    "woow_odoo_mcp_server",
)

# 三 repo 應 byte-identical 的前端 shell 檔（LogViewer 為 Phase 0 已回拋對齊）
_FRONTEND_SHELL = (
    "frontend/src/api.js",
    "frontend/src/main.jsx",
    "frontend/src/index.css",
    "frontend/src/components/StatusCard.jsx",
    "frontend/src/pages/LoginPage.jsx",
    "frontend/vite.config.js",
    "frontend/src/pages/LogViewer.jsx",
)


def _present_repos() -> list[Path]:
    return [_PARENT / r for r in _REPOS if (_PARENT / r / "mcp_admin_core").is_dir()]


def _md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def _core_rel_files() -> list[Path]:
    core = _HERMES / "mcp_admin_core"
    if not core.is_dir():
        return []
    return sorted(
        f.relative_to(_HERMES)
        for f in core.rglob("*.py")
        if "__pycache__" not in f.parts
    )


@pytest.mark.parametrize("rel", _core_rel_files(), ids=lambda r: str(r))
def test_mcp_admin_core_identical_across_repos(rel: Path):
    repos = _present_repos()
    if len(repos) < 2:
        pytest.skip("需要 >=2 個 sibling repo 才能比較漂移")
    hashes: dict[str, str] = {}
    for repo in repos:
        f = repo / rel
        assert f.exists(), f"{rel} 在 {repo.name} 不存在（共用核心應一致）"
        hashes[repo.name] = _md5(f)
    assert len(set(hashes.values())) == 1, f"mcp_admin_core 漂移於 {rel}: {hashes}"


@pytest.mark.parametrize("rel", _FRONTEND_SHELL)
def test_frontend_shell_identical_across_repos(rel: str):
    repos = _present_repos()
    if len(repos) < 2:
        pytest.skip("需要 >=2 個 sibling repo 才能比較漂移")
    hashes: dict[str, str] = {}
    for repo in repos:
        f = repo / rel
        if f.exists():
            hashes[repo.name] = _md5(f)
    assert len(set(hashes.values())) == 1, f"前端 shell 漂移於 {rel}: {hashes}"

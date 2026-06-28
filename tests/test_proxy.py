"""MCP reverse-proxy token 驗證回歸測試。

只測「token 驗證」這段確定性行為：錯誤 token → 403；正確 token 通過驗證後
才嘗試連上游（測試環境無上游 → 502），藉此證明 token 正確時確實放行。
"""

from __future__ import annotations

# 指向幾乎不可能有人監聽的埠，讓「正確 token」案例必定走到 ConnectError → 502
_DEAD_PORT = 59999


def test_proxy_rejects_when_no_token_configured(make_app):
    c = make_app()  # 預設 mcp_auth_token = "" → 任何 token 皆拒絕
    assert c.get("/private_anything/health").status_code == 403


def test_proxy_rejects_wrong_token(make_app):
    c = make_app({"mcp_auth_token": "secret"})
    assert c.get("/private_wrong/health").status_code == 403


def test_proxy_accepts_correct_token_then_upstream_down(make_app):
    c = make_app(
        {
            "mcp_auth_token": "secret",
            "mcp_server": {"command": "", "args": [], "port": _DEAD_PORT, "env": {}},
        }
    )
    # token 正確 → 通過驗證 → 嘗試連 127.0.0.1:59999（無上游）→ 502
    r = c.get("/private_secret/health")
    assert r.status_code == 502

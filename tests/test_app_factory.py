"""create_app 工廠回歸測試 —— 基本組裝、extra_routers 注入並受 auth 保護。"""

from __future__ import annotations

import json


def test_create_app_exposes_healthz(make_app):
    c = make_app()
    assert c.get("/healthz").json() == {"status": "ok"}


def test_extra_router_is_mounted_and_auth_protected(tmp_config_path, monkeypatch):
    import mcp_admin_core.config.store as store_mod
    from fastapi import APIRouter
    from fastapi.testclient import TestClient

    tmp_config_path.write_text(json.dumps(dict(store_mod._DEFAULT_CONFIG)))
    monkeypatch.setenv("MCP_ADMIN_CONFIG", str(tmp_config_path))
    monkeypatch.setattr(store_mod, "_instance", None)
    store_mod.get_config_store()

    from mcp_admin_core import create_app

    extra = APIRouter()

    @extra.get("/api/ping")
    async def ping():
        return {"pong": True}

    app = create_app(title="Factory Test", extra_routers=[extra])
    assert app.title == "Factory Test"

    c = TestClient(app)
    # extra router 上的 /api/* 也受 middleware 保護
    assert c.get("/api/ping").status_code == 401
    token = c.post("/api/auth/login", json={"password": "admin"}).json()["token"]
    r = c.get("/api/ping", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json() == {"pong": True}

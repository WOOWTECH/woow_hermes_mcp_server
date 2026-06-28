"""AuthMiddleware + login router 回歸測試 —— allow-list、JWT 登入與保護。"""

from __future__ import annotations


def test_healthz_is_public(make_app):
    c = make_app()
    r = c.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_non_api_path_is_public(make_app):
    c = make_app()
    # 非 /api/ 路徑不應被 middleware 擋（無對應路由 → 404，但不是 401）
    r = c.get("/some-spa-route")
    assert r.status_code != 401


def test_protected_api_requires_token(make_app):
    c = make_app()
    assert c.get("/api/settings").status_code == 401


def test_login_wrong_password_rejected(make_app):
    c = make_app()
    r = c.post("/api/auth/login", json={"password": "wrong"})
    assert r.status_code == 401


def test_login_success_returns_token(make_app):
    c = make_app()  # 預設 admin_password = "admin"
    r = c.post("/api/auth/login", json={"password": "admin"})
    assert r.status_code == 200
    assert "token" in r.json()


def test_bearer_token_grants_access(make_app):
    c = make_app()
    token = c.post("/api/auth/login", json={"password": "admin"}).json()["token"]
    r = c.get("/api/settings", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200


def test_invalid_token_rejected(make_app):
    c = make_app()
    r = c.get("/api/settings", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401

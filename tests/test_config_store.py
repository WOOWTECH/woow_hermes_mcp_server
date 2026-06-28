"""ConfigStore 行為回歸測試 —— 預設值、get/put/patch、persistence、deep-merge、reload。"""

from __future__ import annotations

import json

from mcp_admin_core.config.store import ConfigStore


async def test_defaults_seeded_on_first_load(fresh_store):
    cfg = await fresh_store.load()
    assert cfg["admin_password"] == "admin"
    assert cfg["mcp_auth_token"] == ""
    assert cfg["mcp_server"]["port"] == 8000
    assert cfg["proxy"]["timeout"] == 86400
    assert cfg["tools"]["disabled"] == []


async def test_ensure_file_created_on_init(fresh_store):
    assert fresh_store.path.exists()
    data = json.loads(fresh_store.path.read_text())
    assert data["admin_password"] == "admin"


async def test_put_and_get_roundtrip(fresh_store):
    await fresh_store.put("admin_password", "s3cret")
    assert await fresh_store.get("admin_password") == "s3cret"


async def test_get_returns_default_for_missing_key(fresh_store):
    assert await fresh_store.get("does_not_exist", "fallback") == "fallback"


async def test_patch_merges_into_dict_value(fresh_store):
    merged = await fresh_store.patch("connection", {"odoo_url": "http://x"})
    assert merged["odoo_url"] == "http://x"
    cfg = await fresh_store.load()
    assert cfg["connection"]["odoo_url"] == "http://x"


async def test_patch_resets_non_dict_value(fresh_store):
    await fresh_store.put("connection", "not-a-dict")
    merged = await fresh_store.patch("connection", {"a": 1})
    assert merged == {"a": 1}


async def test_persistence_across_instances(tmp_config_path):
    s1 = ConfigStore(path=tmp_config_path)
    await s1.put("mcp_auth_token", "tok-123")
    s2 = ConfigStore(path=tmp_config_path)
    assert await s2.get("mcp_auth_token") == "tok-123"


async def test_deep_merge_keeps_default_subkeys(tmp_config_path):
    # 只寫入部分 mcp_server 子鍵，load() 應補回預設子鍵（deep merge）
    tmp_config_path.write_text(json.dumps({"mcp_server": {"command": "foo"}}))
    s = ConfigStore(path=tmp_config_path)
    cfg = await s.load()
    assert cfg["mcp_server"]["command"] == "foo"
    assert cfg["mcp_server"]["port"] == 8000
    assert cfg["mcp_server"]["env"] == {}


async def test_reload_picks_up_external_change(fresh_store):
    await fresh_store.load()  # prime cache
    data = json.loads(fresh_store.path.read_text())
    data["admin_password"] = "changed-on-disk"
    fresh_store.path.write_text(json.dumps(data))
    # reload 前仍為 cache 值
    assert await fresh_store.get("admin_password") == "admin"
    await fresh_store.reload()
    assert await fresh_store.get("admin_password") == "changed-on-disk"

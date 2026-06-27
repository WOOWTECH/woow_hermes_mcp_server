# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-06-27

### Added
- Dashboard proxy router (`dashboard_proxy.py`) — proxies 8 endpoint groups to Hermes Dashboard API
- Full health endpoint with model, tools, skills, sessions, MCP servers summary data
- Cookie caching (10-minute TTL) to prevent Dashboard 429 rate limiting
- Mobile responsive layout with hamburger menu sidebar
- 15 screenshots captured from live deployment

### Fixed
- Health response keys (`gateway_health` → `gateway`) to match frontend expectations
- ConfigEditor stale closure bug (treeData → rawContent sync)
- SessionManager bulk delete count closure bug
- Model provider fallback to `"auto"` when providers config is empty
- Correct Dashboard API paths (`/api/config` not `/api/settings`)

### Changed
- All 17 frontend files updated for responsive web design (RWD)
- Page headers use responsive text sizing and flex-wrap
- Viewport height calculations account for mobile header

## [1.0.0] - 2026-06-27

### Added
- Initial release
- 3-package Python architecture: `mcp_admin_core`, `hermes_mcp_admin`, `hermes_mcp_server`
- 9 FastMCP tools (Read/Write/Agent categories)
- 15 React admin pages with dark theme
- Dual connection support (Gateway API + Dashboard API)
- Cookie-based auth for Hermes Dashboard v0.17.0
- JWT authentication for admin GUI
- K8s deployment manifest with RBAC
- Docker multi-stage build (Node 20 + Python 3.12)
- Cloudflare Tunnel integration

# woow-hermes-mcp-server

WoowTech Hermes MCP Admin — FastMCP wrapper that lets Claude app fully control a Hermes Agent instance via remote connector.

## Architecture

```
Claude app ──(Streamable HTTP, /private_{token}/sse)──► woow-hermes-mcp (FastMCP, K3s)
                                                              │
                          ┌───────────────────────────────────┴──────────────────┐
                          ▼                                                      ▼
              [A] Gateway API Server :8642                         [B] Dashboard REST API :9119
                  Bearer API_SERVER_KEY                                Basic Auth
```

## 9 MCP Tools

| Tool | Endpoint | Type | Description |
|------|---------|------|-------------|
| `hermes_inspect` | [A]+[B] | Read | Full snapshot: capabilities, config, model |
| `hermes_skill` | [B] /api/skills | Write | list/search/install/enable/disable |
| `hermes_mcp` | [B] /api/mcp | Write | list/add/remove/enable/test (URL only) |
| `hermes_model` | [B] /api/model/* | Write | Switch model/provider/aux |
| `hermes_config` | [B] /api/config | Write | Config key R/W (deny-list filtered) |
| `hermes_tools` | [B] /api/tools/* | Write | Toolset enable/disable |
| `hermes_gateway` | [B] /api/gateway/* | Write | Status/restart |
| `hermes_chat` | [A] /v1/responses | Write | Run agent conversation |
| `hermes_session` | [A] /api/sessions/* | R/W | list/read/fork/delete |

## Web GUI (15 Pages)

- Dashboard (dual connection status)
- Connection (dual Gateway + Dashboard auth)
- MCP Tools (9 wrapper tools)
- Hermes Toolsets (21 agent toolsets)
- Model Manager
- Skills Manager (+ Hub install)
- MCP Servers Manager
- Config Editor (deny-list protected)
- Gateway Control
- Sessions Manager
- Tokens Manager
- Log Viewer
- Deny List (read-only)
- Settings

## Quick Start

```bash
# Docker Compose
cp .env.example .env  # fill in credentials
docker compose up -d

# Access
# Admin GUI: http://localhost:9003
# MCP: http://localhost:9003/private_{token}/sse
```

## K8s Deployment

```bash
kubectl apply -f k8s-deploy.yaml -n <namespace>
```

## Security

- Deny-list blocks: stdio MCP commands, terminal.backend, CORS, 0.0.0.0 binding
- Env keys: write-only (no readback)
- All write tools support `dry_run=true`
- Single token for MCP proxy (URL-path based)
- Dual auth (Gateway Bearer + Dashboard Basic) never exposed to Claude

## License

MIT

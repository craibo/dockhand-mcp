# dockhand-mcp

MCP (Model Context Protocol) sidecar server for [Dockhand](https://dockhand.pro) ([GitHub](https://github.com/Finsys/dockhand)). Exposes Dockhand's container, image, volume, network, and stack management as MCP tools over Streamable HTTP, so MCP clients (Claude Desktop, Claude Code, etc.) can manage Docker resources through Dockhand.

This is a standalone service — it does not modify Dockhand itself, and calls Dockhand's existing REST API using a Dockhand API token.

## Configuration

| Var | Required | Description |
|---|---|---|
| `DOCKHAND_URL` | yes | Base URL of the Dockhand instance, e.g. `http://dockhand:3000` |
| `DOCKHAND_API_TOKEN` | one of these two | Dockhand API token (create one in Dockhand under Profile → API tokens) |
| `DOCKHAND_API_TOKEN_FILE` | one of these two | Path to a file/Docker secret containing the token |
| `MCP_AUTH_TOKEN` | yes | Shared secret required by MCP clients calling this sidecar |
| `MCP_ALLOWED_HOSTS` | no | Comma-separated list of exact hostnames to allow via DNS-rebinding host-header validation. Unset by default — no host filtering is applied, and MCP_AUTH_TOKEN remains the primary access-control gate. |
| `DOCKHAND_MCP_READONLY` | no (default `false`) | Set `true` to only register read/list/inspect tools |
| `DOCKHAND_MCP_ENABLE_BACKUPS` | no (default `false`) | Set `true` to register backup config/snapshot tools |
| `DOCKHAND_MCP_ENABLE_USERS` | no (default `false`) | Set `true` to register user and role tools |
| `DOCKHAND_MCP_ENABLE_REGISTRIES` | no (default `false`) | Set `true` to register the registry listing tool |
| `DOCKHAND_MCP_ENABLE_VULNERABILITIES` | no (default `false`) | Set `true` to register vulnerability listing and scan tools |
| `DOCKHAND_MCP_ENABLE_GIT` | no (default `false`) | Set `true` to register git-backed stack tools |
| `DOCKHAND_MCP_ENABLE_SCHEDULES` | no (default `false`) | Set `true` to register schedule tools |
| `PORT` | no (default `8787`) | Port the MCP endpoint listens on |

## Running

```bash
docker build -t dockhand-mcp .
docker run -p 8787:8787 \
  -e DOCKHAND_URL=http://dockhand:3000 \
  -e DOCKHAND_API_TOKEN=dh_... \
  -e MCP_AUTH_TOKEN=... \
  dockhand-mcp
```

See `docker-compose.example.yaml` for running alongside Dockhand itself.

On startup, the sidecar checks connectivity to `DOCKHAND_URL` by calling `GET /api/environments` and logs the result, along with the minimum supported Dockhand version. A failed check is logged as an error but does not prevent the server from starting — Dockhand may simply not be ready yet — so tool calls will fail individually with clear errors until Dockhand is reachable. Dockhand does not expose its own app version through a REST endpoint, so the minimum-version notice is informational rather than actively enforced.

## MCP endpoint

`POST /mcp` — Streamable HTTP MCP endpoint. Requires `Authorization: Bearer <MCP_AUTH_TOKEN>`.

`GET /health` — unauthenticated liveness check.

## Client configuration

Example `.mcp.json` for Claude Code (or `~/.claude.json` for a user-scoped config), pointing at a deployed sidecar:

```json
{
  "mcpServers": {
    "dockhand-mcp": {
      "type": "http",
      "url": "https://dockhand-mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${MCP_AUTH_TOKEN}"
      }
    }
  }
}
```

Equivalent CLI command:

```bash
claude mcp add dockhand-mcp --transport http https://dockhand-mcp.example.com/mcp --header "Authorization: Bearer ${MCP_AUTH_TOKEN}"
```

`${MCP_AUTH_TOKEN}` expands from the environment Claude Code runs in — set it to the same value configured on the sidecar, rather than hardcoding the token in the config file.

## Tools

Every tool except `list_environments`, `list_users`, `get_user`, `list_roles`, `list_registries`, and `list_schedules` requires an `environmentId` (or an id scoped to a specific stored resource) — call `list_environments` first to discover valid environment IDs.

### Core (always registered)

Read-only: `list_environments`, `list_containers`, `get_container`, `get_container_logs`, `list_images`, `list_volumes`, `list_networks`, `list_stacks`

Mutating (disabled when `DOCKHAND_MCP_READONLY=true`): `start_container`, `stop_container`, `restart_container`, `remove_container`, `pull_image`, `remove_image`, `remove_volume`, `deploy_stack`, `stop_stack`

### Extended (each domain disabled by default — see Configuration table above)

| Domain | Toggle | Read-only tools | Mutating tools (also disabled when `DOCKHAND_MCP_READONLY=true`) |
|---|---|---|---|
| Backups | `DOCKHAND_MCP_ENABLE_BACKUPS` | `list_backup_configs`, `list_snapshots` | `run_backup_config` |
| Users/Roles | `DOCKHAND_MCP_ENABLE_USERS` | `list_users`, `get_user`, `list_roles` | — |
| Registries | `DOCKHAND_MCP_ENABLE_REGISTRIES` | `list_registries` | — |
| Vulnerabilities | `DOCKHAND_MCP_ENABLE_VULNERABILITIES` | `list_vulnerabilities` | `scan_all_vulnerabilities` |
| Git deploy | `DOCKHAND_MCP_ENABLE_GIT` | `list_git_stacks` | `sync_git_stack`, `deploy_git_stack` |
| Schedules | `DOCKHAND_MCP_ENABLE_SCHEDULES` | `list_schedules` | `run_schedule`, `toggle_schedule` |

These six domains intentionally wrap only a minimal slice of Dockhand's REST surface for each area (no user/role/registry/git-credential CRUD) — full CRUD for these domains is out of scope, consistent with the project's minimal, LLM-friendly tool surface.

## Development

```bash
npm install
npm run dev     # watch mode
npm test        # run tests
npm run build   # compile to dist/
```

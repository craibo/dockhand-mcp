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

Mutating tools are also disabled whenever `DOCKHAND_MCP_READONLY=true`, regardless of the domain toggle below.

### Core (always registered — no toggle required)

| Tool | Type | Description |
|---|---|---|
| `list_environments` | Read-only | List all Dockhand environments (Docker hosts). Call this first to discover valid `environmentId` values for other tools. |
| `list_containers` | Read-only | List containers in a Dockhand environment. |
| `get_container` | Read-only | Get full inspect details for a single container. |
| `get_container_logs` | Read-only | Get recent logs for a container. |
| `list_images` | Read-only | List images in a Dockhand environment. |
| `list_volumes` | Read-only | List volumes in a Dockhand environment. |
| `list_networks` | Read-only | List networks in a Dockhand environment. |
| `list_stacks` | Read-only | List Compose stacks in a Dockhand environment. |
| `get_stack_env` | Read-only | Get all environment variables for a stack (merged view of the `.env` file and stored secrets). Secret values are masked as `***`. |
| `get_stack_env_file` | Read-only | Get the raw `.env` file content for a stack, as-is (comments and formatting preserved). Non-secret variables only. |
| `start_container` | Mutating | Start a stopped container. |
| `stop_container` | Mutating | Stop a running container. |
| `restart_container` | Mutating | Restart a container. |
| `remove_container` | Mutating | Remove (delete) a container. |
| `pull_image` | Mutating | Pull an image from a registry. Returns immediately with a jobId — poll with `get_image_pull_status`. |
| `get_image_pull_status` | Read-only | Check the status of an image pull started by `pull_image`. |
| `cancel_image_pull` | Mutating | Cancel a running image pull started by `pull_image`. |
| `remove_image` | Mutating | Remove (delete) an image. |
| `remove_volume` | Mutating | Remove (delete) a volume. |
| `deploy_stack` | Mutating | Deploy (up) a Compose stack. Returns immediately with a jobId — poll with `get_stack_deploy_status`. |
| `get_stack_deploy_status` | Read-only | Check the status of a stack deploy started by `deploy_stack`. |
| `cancel_stack_deploy` | Mutating | Cancel a running stack deploy started by `deploy_stack`. |
| `stop_stack` | Mutating | Stop (down) a Compose stack. Returns immediately with a jobId — poll with `get_stack_stop_status`. |
| `get_stack_stop_status` | Read-only | Check the status of a stack stop started by `stop_stack`. |
| `cancel_stack_stop` | Mutating | Cancel a running stack stop started by `stop_stack`. |
| `set_stack_secret` | Mutating | Save secret environment variables for a stack. Pass value `"***"` for a variable to keep its existing secret unchanged. |
| `set_stack_env_file` | Mutating | Overwrite the raw `.env` file content for a stack. Replaces the entire file; empty content deletes it. |

### Extended (each domain off by default — set its toggle to `true` to enable)

| Domain | Toggle | Status | Tool | Type | Description |
|---|---|---|---|---|---|
| Backups | `DOCKHAND_MCP_ENABLE_BACKUPS` | disabled by default | `list_backup_configs` | Read-only | List configured backups (stack or volume backup jobs) in Dockhand. |
| Backups | `DOCKHAND_MCP_ENABLE_BACKUPS` | disabled by default | `list_snapshots` | Read-only | List backup snapshots, optionally scoped to a single backup config. |
| Backups | `DOCKHAND_MCP_ENABLE_BACKUPS` | disabled by default | `run_backup_config` | Mutating | Manually trigger a backup config to run now. Returns immediately with a jobId — poll with `get_backup_run_status`. |
| Backups | `DOCKHAND_MCP_ENABLE_BACKUPS` | disabled by default | `get_backup_run_status` | Read-only | Check the status of a backup run started by `run_backup_config`. |
| Backups | `DOCKHAND_MCP_ENABLE_BACKUPS` | disabled by default | `cancel_backup_run` | Mutating | Cancel a running backup started by `run_backup_config`. |
| Users/Roles | `DOCKHAND_MCP_ENABLE_USERS` | disabled by default | `list_users` | Read-only | List all Dockhand users. |
| Users/Roles | `DOCKHAND_MCP_ENABLE_USERS` | disabled by default | `get_user` | Read-only | Get details for a single Dockhand user. |
| Users/Roles | `DOCKHAND_MCP_ENABLE_USERS` | disabled by default | `list_roles` | Read-only | List all Dockhand roles. Requires an Enterprise license (returns an error on free-tier instances with auth enabled). |
| Registries | `DOCKHAND_MCP_ENABLE_REGISTRIES` | disabled by default | `list_registries` | Read-only | List configured container registries in Dockhand. Credentials are never included — only a `hasCredentials` flag. |
| Vulnerabilities | `DOCKHAND_MCP_ENABLE_VULNERABILITIES` | disabled by default | `list_vulnerabilities` | Read-only | List aggregated vulnerability findings for an environment, with optional filtering and pagination. |
| Vulnerabilities | `DOCKHAND_MCP_ENABLE_VULNERABILITIES` | disabled by default | `scan_all_vulnerabilities` | Mutating | Scan every image in an environment for vulnerabilities. Returns immediately with a jobId — poll with `get_vulnerability_scan_status`. |
| Vulnerabilities | `DOCKHAND_MCP_ENABLE_VULNERABILITIES` | disabled by default | `get_vulnerability_scan_status` | Read-only | Check the status of a vulnerability scan started by `scan_all_vulnerabilities`. |
| Vulnerabilities | `DOCKHAND_MCP_ENABLE_VULNERABILITIES` | disabled by default | `cancel_vulnerability_scan` | Mutating | Cancel a running vulnerability scan started by `scan_all_vulnerabilities`. |
| Git deploy | `DOCKHAND_MCP_ENABLE_GIT` | disabled by default | `list_git_stacks` | Read-only | List git-backed Compose stacks in Dockhand. |
| Git deploy | `DOCKHAND_MCP_ENABLE_GIT` | disabled by default | `sync_git_stack` | Mutating | Pull the latest commit for a git-backed stack from its remote, without redeploying. |
| Git deploy | `DOCKHAND_MCP_ENABLE_GIT` | disabled by default | `deploy_git_stack` | Mutating | Sync and redeploy a git-backed stack. Returns immediately with a jobId — poll with `get_git_deploy_status`. Check the `success` field in the final result once done — a failed deploy is reported there, not as a tool error. |
| Git deploy | `DOCKHAND_MCP_ENABLE_GIT` | disabled by default | `get_git_deploy_status` | Read-only | Check the status of a git stack deploy started by `deploy_git_stack`. |
| Git deploy | `DOCKHAND_MCP_ENABLE_GIT` | disabled by default | `cancel_git_deploy` | Mutating | Cancel a running git stack deploy started by `deploy_git_stack`. |
| Schedules | `DOCKHAND_MCP_ENABLE_SCHEDULES` | disabled by default | `list_schedules` | Read-only | List all active Dockhand schedules (container auto-updates, git stack syncs, backups, and system jobs). |
| Schedules | `DOCKHAND_MCP_ENABLE_SCHEDULES` | disabled by default | `run_schedule` | Mutating | Manually trigger a schedule to run now. |
| Schedules | `DOCKHAND_MCP_ENABLE_SCHEDULES` | disabled by default | `toggle_schedule` | Mutating | Enable or disable a schedule. Flips its current enabled state — check the returned `enabled` field to see the new state. |

To enable a domain, set its toggle to `true` in the sidecar's environment (see [Configuration](#configuration)), e.g.:

```bash
docker run -p 8787:8787 \
  -e DOCKHAND_URL=http://dockhand:3000 \
  -e DOCKHAND_API_TOKEN=dh_... \
  -e MCP_AUTH_TOKEN=... \
  -e DOCKHAND_MCP_ENABLE_BACKUPS=true \
  -e DOCKHAND_MCP_ENABLE_GIT=true \
  dockhand-mcp
```

These six domains intentionally wrap only a minimal slice of Dockhand's REST surface for each area (no user/role/registry/git-credential CRUD) — full CRUD for these domains is out of scope, consistent with the project's minimal, LLM-friendly tool surface.

## Development

```bash
npm install
npm run dev     # watch mode
npm test        # run tests
npm run build   # compile to dist/
```

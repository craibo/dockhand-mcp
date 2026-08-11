# dockhand-mcp

MCP (Model Context Protocol) sidecar server for [Dockhand](https://dockhand.pro). Exposes Dockhand's container, image, volume, network, and stack management as MCP tools over Streamable HTTP, so MCP clients (Claude Desktop, Claude Code, etc.) can manage Docker resources through Dockhand.

This is a standalone service — it does not modify Dockhand itself, and calls Dockhand's existing REST API using a Dockhand API token.

## Configuration

| Var | Required | Description |
|---|---|---|
| `DOCKHAND_URL` | yes | Base URL of the Dockhand instance, e.g. `http://dockhand:3000` |
| `DOCKHAND_API_TOKEN` | one of these two | Dockhand API token (create one in Dockhand under Settings → Auth → API Tokens) |
| `DOCKHAND_API_TOKEN_FILE` | one of these two | Path to a file/Docker secret containing the token |
| `MCP_AUTH_TOKEN` | yes | Shared secret required by MCP clients calling this sidecar |
| `MCP_ALLOWED_HOSTS` | no | Comma-separated list of exact hostnames to allow via DNS-rebinding host-header validation. Unset by default — no host filtering is applied, and MCP_AUTH_TOKEN remains the primary access-control gate. |
| `DOCKHAND_MCP_READONLY` | no (default `false`) | Set `true` to only register read/list/inspect tools |
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

## MCP endpoint

`POST /mcp` — Streamable HTTP MCP endpoint. Requires `Authorization: Bearer <MCP_AUTH_TOKEN>`.

`GET /health` — unauthenticated liveness check.

## Tools

Every tool except `list_environments` requires an `environmentId` — call `list_environments` first to discover valid IDs.

Read-only: `list_environments`, `list_containers`, `get_container`, `get_container_logs`, `list_images`, `list_volumes`, `list_networks`, `list_stacks`

Mutating (disabled when `DOCKHAND_MCP_READONLY=true`): `start_container`, `stop_container`, `restart_container`, `remove_container`, `pull_image`, `remove_image`, `remove_volume`, `deploy_stack`, `stop_stack`

## Development

```bash
npm install
npm run dev     # watch mode
npm test        # run tests
npm run build   # compile to dist/
```

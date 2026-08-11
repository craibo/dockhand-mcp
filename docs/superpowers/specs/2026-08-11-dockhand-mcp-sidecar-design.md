# dockhand-mcp: sidecar MCP server design

## Purpose

Dockhand (`github/dockhand`) is a self-hosted Docker management web app with a mature REST API (235 endpoints across containers, images, volumes, networks, stacks, environments, backups, etc.) and a purpose-built Bearer API token system (`dh_...`) designed for external programmatic callers.

`dockhand-mcp` is a standalone sidecar service that exposes a subset of Dockhand's capabilities as MCP (Model Context Protocol) tools, so LLM clients (Claude Desktop, Claude Code, etc.) can manage Docker resources through Dockhand. It holds no state of its own — every tool call is a thin translation into a call against Dockhand's existing REST API.

This is a new, independent repository (`github/dockhand-mcp`) — it does not modify Dockhand itself. See Dockhand's own `CLAUDE.md` for background on why a sidecar (rather than an in-process MCP server built into Dockhand) was chosen: the REST API already covers the full domain surface, and the `dh_` token system was purpose-built for exactly this kind of external caller.

## Non-goals (v1)

- Not wrapping the full 235-endpoint REST surface — only "core Docker ops" (see Tool List below). Backups, users/roles, registries, vulnerabilities, git-deploy config, schedules are left for a later pass.
- Not implementing stdio transport — Streamable HTTP only, since this runs as a long-lived networked sidecar, not a locally-spawned process.
- Not generating schemas from Dockhand's source types/OpenAPI — Dockhand has no OpenAPI spec, and hand-written per-tool Zod schemas keep the MCP tool surface minimal and LLM-friendly rather than mirroring full REST payloads.
- No new database, no persistent state — fully stateless, purely a protocol translator.

## Architecture

```
MCP client (Claude Desktop/Code)
      │  Streamable HTTP + Authorization: Bearer <MCP_AUTH_TOKEN>
      ▼
dockhand-mcp (this repo)
      │  HTTP + Authorization: Bearer <DOCKHAND_API_TOKEN>
      ▼
Dockhand REST API (/api/*)
```

Two independent auth layers:
- **Inbound** (`MCP_AUTH_TOKEN`): gates who may call the sidecar's MCP endpoint at all. Checked on every request before any tool logic runs.
- **Outbound** (`DOCKHAND_API_TOKEN` / `DOCKHAND_API_TOKEN_FILE`): the Dockhand `dh_...` Bearer token used when calling Dockhand's REST API. Governs what the sidecar itself is permitted to do in Dockhand (RBAC-aware on Enterprise, admin-equivalent on free tier) — this is the operator's real authorization boundary, since whoever controls this token controls what the sidecar can touch in Dockhand.

## Config (env vars)

| Var | Required | Notes |
|---|---|---|
| `DOCKHAND_URL` | yes | Base URL of the Dockhand instance, e.g. `http://dockhand:3000` |
| `DOCKHAND_API_TOKEN` | one of these two | Dockhand `dh_...` Bearer token |
| `DOCKHAND_API_TOKEN_FILE` | one of these two | Path to a file/Docker secret containing the token, for operators who don't want it directly in compose env |
| `MCP_AUTH_TOKEN` | yes | Shared secret required on every request to the sidecar's MCP endpoint |
| `DOCKHAND_MCP_READONLY` | no (default `false`) | When `true`, only read/list/inspect tools are registered — mutating tools are omitted entirely, not just blocked at call time |
| `PORT` | no (default `8787`) | Port the Streamable HTTP MCP endpoint listens on |

## Repo layout

```
src/
  index.ts              # entrypoint: creates MCP server, registers tools, starts HTTP transport
  config.ts             # env var parsing/validation (fails fast on missing required vars)
  dockhandClient.ts      # thin fetch wrapper: base URL + Bearer header + error normalization
  sse.ts                 # consumes Dockhand's SSE "job" endpoints, resolves to a final result
  auth.ts                 # inbound MCP_AUTH_TOKEN check middleware
  tools/
    environments.ts       # list_environments
    containers.ts          # container tools
    images.ts               # image tools
    volumes.ts               # volume tools
    networks.ts               # network tools
    stacks.ts                  # stack tools
  types.ts                # shared Zod schemas (e.g. environmentId)
tests/
  ...                    # Vitest, mocking Dockhand REST via msw
Dockerfile
docker-compose.example.yaml
package.json / tsconfig.json
README.md
```

## Tool list (v1 — "core Docker ops")

All tools except `list_environments` take a required `environmentId` (number) parameter, since Dockhand's REST API scopes every domain endpoint by `?env=<id>` to support multi-host management. `list_environments` is the discovery entry point an LLM client calls first to learn valid IDs/names.

Read-only (always registered):
- `list_environments` → `GET /api/environments`
- `list_containers` → `GET /api/containers?env=`
- `get_container` → `GET /api/containers/:id?env=`
- `get_container_logs` → `GET /api/containers/:id/logs?env=`
- `list_images` → `GET /api/images?env=`
- `list_volumes` → `GET /api/volumes?env=`
- `list_networks` → `GET /api/networks?env=`
- `list_stacks` → `GET /api/stacks?env=`

Mutating (omitted entirely when `DOCKHAND_MCP_READONLY=true`):
- `start_container` → `POST /api/containers/:id/start?env=`
- `stop_container` → `POST /api/containers/:id/stop?env=`
- `restart_container` → `POST /api/containers/:id/restart?env=`
- `remove_container` → `DELETE /api/containers/:id?env=&force=`
- `pull_image` → `POST /api/images/pull?env=`
- `remove_image` → `DELETE /api/images/:id?env=`
- `remove_volume` → `DELETE /api/volumes/:name?env=`
- `deploy_stack` → `POST /api/stacks/:name/deploy?env=` (SSE job — see below)
- `stop_stack` → `POST /api/stacks/:name/down?env=` (SSE job — see below)

## SSE job handling

Stack deploy/down (and potentially other future job-style endpoints) use Dockhand's `createJobResponse` SSE pattern: the HTTP response is a stream of `progress` events followed by a final `result` event, rather than a single JSON body like container/image endpoints return.

`sse.ts` provides a helper that opens the request, consumes the event stream server-side, discards intermediate `progress` events (or optionally surfaces the last one on error), and resolves once the `result` event arrives — returning a plain object to the calling tool. This keeps every MCP tool response uniform (plain JSON content) regardless of which response style the underlying Dockhand endpoint uses.

## Error handling

Dockhand's REST errors are consistently shaped: `{ error: string, details?: string }` plus a non-2xx HTTP status (401/403/404/500 are the ones tools will realistically hit). `dockhandClient.ts` normalizes these into MCP tool error results (`isError: true`, with the error/details text as content) rather than throwing raw HTTP/fetch errors up through the MCP SDK — so a 403 from a token lacking permission, or a 404 for a missing container, comes back to the LLM as a readable failure message it can reason about, not a transport-level exception.

## Testing

Vitest, with Dockhand's REST API mocked via `msw` — no live Dockhand instance required for unit tests covering tool registration, request construction, response mapping, and error normalization. Live integration testing against a real Dockhand container is out of scope for v1 and can be added later if needed.

## Deployment

- `Dockerfile`: `node:slim` base, non-root user, multi-stage build (install → build → slim runtime).
- `docker-compose.example.yaml`: shows `dockhand-mcp` added as a second service on the same Docker network as `dockhand`, with `DOCKHAND_URL=http://dockhand:3000`, `DOCKHAND_API_TOKEN_FILE` pointed at a Docker secret, and `MCP_AUTH_TOKEN` set from an operator-supplied secret/env value. No ports are published to the host by default beyond what the operator needs for their MCP client to reach it.

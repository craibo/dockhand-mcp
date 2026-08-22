# Async job tools: replace blocking deploy/pull/scan calls with poll-based tools

## Problem

Six MCP tools each make a single HTTP request that Dockhand's server holds open for the entire duration of a long-running operation (deploy, pull, scan, backup run):

- `deploy_stack`, `stop_stack` (`src/tools/stacks.ts`)
- `pull_image` (`src/tools/images.ts`)
- `deploy_git_stack` (`src/tools/git.ts`)
- `scan_all_vulnerabilities` (`src/tools/vulnerabilities.ts`)
- `run_backup_config` (`src/tools/backups.ts`)

Dockhand's server (`src/lib/server/sse.ts`, `createJobResponse`) supports two modes for these routes, selected by the request's `Accept` header (`src/lib/server/sse-parser.ts`, `prefersJSON()`):

- `Accept: application/json` (no `text/event-stream`) → server runs the job synchronously and holds the HTTP connection open until it finishes, then returns the final result as one JSON body. **This is what `dockhandClient.ts` sends today**, on every request.
- Any other `Accept` value → server returns `{ jobId }` immediately; the job continues in the background, poll-able via `GET /api/jobs/:id` (`src/routes/api/jobs/[id]/+server.ts`) and cancellable via `DELETE /api/jobs/:id`.

Long jobs risk exceeding the MCP client's or transport's request timeout even when the underlying operation would have succeeded. Switching these six tools to the async mode removes that risk.

## Non-goals

- No change to any tool that isn't one of the six listed above. Confirmed via source inspection that `sync_git_stack` (`POST /api/git/stacks/:id/sync`), `restart_container`, and every `list_*`/`get_*` tool call plain synchronous Dockhand endpoints, not `createJobResponse`-backed ones.
- No change to `list_stacks`, `list_images`, etc. — the `Accept` header change is scoped to exactly the six job-backed calls, not applied globally in `dockhandClient.ts`.
- No generic/shared `get_job_status(jobId)` tool. Status and cancel tools are one per source operation (see Tool Surface below) — an explicit choice over a generic job tool, so each tool's name/description stays specific to what triggered it.

## Design

### `dockhandClient.ts`: new `postJob` method

Add one new method alongside the existing `get`/`post`/`del`:

```typescript
postJob<T>(path: string, body?: unknown, params?: QueryParams): Promise<T>;
```

Implementation mirrors `post`, with one difference: the request sends `Accept: application/json, text/event-stream` instead of the plain `Accept: application/json` that `request()` currently hardcodes. This flips Dockhand's `prefersJSON()` check to `false`, so the response is `{ jobId: string }` returned immediately rather than the final job result.

To support this, `request()`'s internal signature gains an optional `accept` override (default stays `application/json`, used by `get`/`post`/`del` unchanged); `postJob` passes the SSE-inclusive value. No change to `get`, `post`, `del`, or their existing call sites elsewhere in the codebase.

### New shared helper: `src/jobStatus.ts`

Dockhand's job-status and cancel responses are identical in shape regardless of what started the job:

- `GET /api/jobs/:id` → `{ id: string, status: 'running' | 'done' | 'error', lines: unknown[], result: unknown | null }`
- `DELETE /api/jobs/:id` → `{ cancelled: boolean }`

One helper builds both tools for a given operation, so the six operations don't each hand-write near-identical `registerTool` calls:

```typescript
export function registerJobStatusTool(
  server: McpServer,
  client: DockhandClient,
  toolName: string,        // e.g. 'get_stack_deploy_status'
  description: string      // e.g. 'Check the status of a stack deploy started by deploy_stack.'
): void;

export function registerJobCancelTool(
  server: McpServer,
  client: DockhandClient,
  toolName: string,        // e.g. 'cancel_stack_deploy'
  description: string      // e.g. 'Cancel a running stack deploy started by deploy_stack.'
): void;
```

Both take a single required `jobId: z.string()` parameter. Both call `client.get('/api/jobs/' + jobId)` / `client.del('/api/jobs/' + jobId)` respectively (plain `get`/`del` — status/cancel checks are themselves fast, not job-backed) and return the raw response via `toTextResult`. A 404 (`DockhandError` with `status === 404`, e.g. because the job finished and was cleaned up after Dockhand's 10-minute job TTL, or the ID was never valid) is not special-cased — it propagates through the existing `toErrorResult` path like any other `DockhandError`, giving the LLM a clear "Dockhand API error (404): Job not found" message it can reason about.

`registerJobCancelTool` is only called when `readonly` is `false` — matching the existing gating on the six start tools. `registerJobStatusTool` is always called, since it has no side effects.

### Six affected tool files: swap `post` → `postJob`, add status + cancel

Each of the six operations changes from:

```typescript
const result = await client.post(path, body, params);
return toTextResult(result);
```

to:

```typescript
const result = await client.postJob(path, body, params);
return toTextResult(result); // now { jobId, status: 'running' } instead of the final result
```

and each tool file adds two calls to the new helper, immediately after its existing start-tool registration:

```typescript
registerJobStatusTool(server, client, 'get_stack_deploy_status', 'Check the status of a stack deploy started by deploy_stack.');
if (!readonly) {
  registerJobCancelTool(server, client, 'cancel_stack_deploy', 'Cancel a running stack deploy started by deploy_stack.');
}
```

(Same pattern repeated for the other five, with tool-appropriate names/descriptions — see Tool Surface below for the exact list.)

### Tool descriptions must teach the poll pattern

Since the LLM now needs to call two or three tools instead of one to complete an operation, each start tool's `description` is updated to say so explicitly, e.g.:

> "Deploy (up) a Compose stack. Returns immediately with a jobId — call get_stack_deploy_status with that jobId to check progress, and cancel_stack_deploy to abort."

This is the only way the LLM learns the new two-step flow, since MCP tool descriptions are the interface the LLM reasons from.

## Tool Surface (full list of the 18 tools touched)

| Existing tool (return shape changes) | New status tool (always registered) | New cancel tool (registered when `readonly=false`) |
|---|---|---|
| `deploy_stack` | `get_stack_deploy_status` | `cancel_stack_deploy` |
| `stop_stack` | `get_stack_stop_status` | `cancel_stack_stop` |
| `pull_image` | `get_image_pull_status` | `cancel_image_pull` |
| `deploy_git_stack` | `get_git_deploy_status` | `cancel_git_deploy` |
| `scan_all_vulnerabilities` | `get_vulnerability_scan_status` | `cancel_vulnerability_scan` |
| `run_backup_config` | `get_backup_run_status` | `cancel_backup_run` |

`README.md`'s tool reference table is updated to list all 18 (12 new + 6 changed-behavior) and to note the new poll pattern in the six start tools' one-line descriptions.

## Error handling

- Start tools (`deploy_stack`, etc.): unchanged — `DockhandError` from the `postJob` call (e.g. 403 permission denied, 404 stack not found) still goes through `toErrorResult` exactly as today, just on the immediate `{jobId}`-returning request instead of the long-held one.
- Status/cancel tools: `DockhandError` (including 404 job-not-found) goes through `toErrorResult` unchanged — no special-casing, per the Job-not-found handling decision above.

## Testing

- `tests/dockhandClient.test.ts`: add coverage for `postJob` — asserts the request sends `Accept: application/json, text/event-stream` (verifiable via msw's captured request headers, following the existing pattern in that file) and that the mocked `{jobId}` response is returned as-is.
- Each of the six affected `tests/tools/*.test.ts` files: update the existing start-tool test to assert on the new `{jobId, status}` return shape (mocking `client.postJob` instead of `client.post`), and add two new test cases (status tool calls `client.get` on the right path, cancel tool calls `client.del` on the right path) — mirroring the existing per-file test structure.
- New `tests/jobStatus.test.ts`: unit tests for `registerJobStatusTool`/`registerJobCancelTool` directly — correct path construction, correct method (`get`/`del`), 404 propagates as `isError: true`, cancel tool omitted when `readonly=true`.

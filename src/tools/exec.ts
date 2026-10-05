// src/tools/exec.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

export function registerExecTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  // Running commands in a container is never read-only.
  if (readonly) {
    return;
  }

  server.registerTool(
    'exec_container',
    {
      description:
        'Run a short, non-interactive command in a running container and wait for the result (stdout, stderr and exit code). Bounded to about 30s on remote environments. The command is an argv array, not a shell string — use ["sh", "-c", "..."] for shell syntax.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        containerId: z.string(),
        cmd: z.array(z.string()).min(1).describe('Command and arguments, e.g. ["ls", "-la", "/app"]'),
        user: z.string().optional().describe('User to run the command as'),
        workingDir: z.string().optional().describe('Working directory inside the container')
      })
    },
    async ({ environmentId, containerId, cmd, user, workingDir }) => {
      try {
        // This endpoint takes the environment as `envId`, unlike the rest of the API (`env`).
        const result = await client.post(
          `/api/containers/${encodeURIComponent(containerId)}/exec/run`,
          { cmd, user, workingDir },
          { envId: environmentId }
        );
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

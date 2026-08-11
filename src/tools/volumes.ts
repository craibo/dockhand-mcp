import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

export function registerVolumeTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_volumes',
    {
      description: 'List volumes in a Dockhand environment.',
      inputSchema: z.object({ environmentId: environmentIdSchema })
    },
    async ({ environmentId }) => {
      try {
        const volumes = await client.get('/api/volumes', { env: environmentId });
        return toTextResult(volumes);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  if (readonly) {
    return;
  }

  server.registerTool(
    'remove_volume',
    {
      description: 'Remove (delete) a volume.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        volumeName: z.string(),
        force: z.boolean().optional().describe('Force removal. Defaults to false.')
      })
    },
    async ({ environmentId, volumeName, force }) => {
      try {
        const result = await client.del(`/api/volumes/${encodeURIComponent(volumeName)}`, { env: environmentId, force });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

export function registerNetworkTools(server: McpServer, client: DockhandClient): void {
  server.registerTool(
    'list_networks',
    {
      description: 'List networks in a Dockhand environment.',
      inputSchema: z.object({ environmentId: environmentIdSchema })
    },
    async ({ environmentId }) => {
      try {
        const networks = await client.get('/api/networks', { env: environmentId });
        return toTextResult(networks);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

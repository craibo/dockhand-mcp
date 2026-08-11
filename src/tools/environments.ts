// src/tools/environments.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';

export function registerEnvironmentTools(server: McpServer, client: DockhandClient): void {
  server.registerTool(
    'list_environments',
    {
      description: 'List all Dockhand environments (Docker hosts). Call this first to discover valid environmentId values for other tools.',
      inputSchema: z.object({})
    },
    async () => {
      try {
        const environments = await client.get('/api/environments');
        return toTextResult(environments);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

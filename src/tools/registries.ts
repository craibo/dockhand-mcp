// src/tools/registries.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';

export function registerRegistryTools(server: McpServer, client: DockhandClient): void {
  server.registerTool(
    'list_registries',
    {
      description: 'List configured container registries in Dockhand. Credentials are never included — only a hasCredentials flag.',
      inputSchema: z.object({})
    },
    async () => {
      try {
        const registries = await client.get('/api/registries');
        return toTextResult(registries);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

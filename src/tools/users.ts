// src/tools/users.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';

export function registerUserTools(server: McpServer, client: DockhandClient): void {
  server.registerTool(
    'list_users',
    {
      description: 'List all Dockhand users.',
      inputSchema: z.object({})
    },
    async () => {
      try {
        const users = await client.get('/api/users');
        return toTextResult(users);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'get_user',
    {
      description: 'Get details for a single Dockhand user.',
      inputSchema: z.object({
        userId: z.number().int().positive().describe('User ID, from list_users')
      })
    },
    async ({ userId }) => {
      try {
        const user = await client.get(`/api/users/${userId}`);
        return toTextResult(user);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'list_roles',
    {
      description: 'List all Dockhand roles. Requires an Enterprise license (returns an error on free-tier instances with auth enabled).',
      inputSchema: z.object({})
    },
    async () => {
      try {
        const roles = await client.get('/api/roles');
        return toTextResult(roles);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

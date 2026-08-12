// src/tools/backups.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

export function registerBackupTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_backup_configs',
    {
      description: 'List configured backups (stack or volume backup jobs) in Dockhand.',
      inputSchema: z.object({
        type: z.string().optional().describe('Filter by backup type, e.g. "stack" or "volume"'),
        target: z.string().optional().describe('Filter by target name (stack or volume name)'),
        environmentId: environmentIdSchema.optional()
      })
    },
    async ({ type, target, environmentId }) => {
      try {
        const configs = await client.get('/api/backup/configs', { type, target, env: environmentId });
        return toTextResult(configs);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'list_snapshots',
    {
      description: 'List backup snapshots, optionally scoped to a single backup config.',
      inputSchema: z.object({
        configId: z.number().int().positive().optional().describe('Backup config ID, from list_backup_configs. Omit to list recent snapshots across all configs.')
      })
    },
    async ({ configId }) => {
      try {
        const snapshots = await client.get('/api/backup/snapshots', { configId });
        return toTextResult(snapshots);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  if (readonly) {
    return;
  }

  server.registerTool(
    'run_backup_config',
    {
      description: 'Manually trigger a backup config to run now. Blocks until the backup completes or fails.',
      inputSchema: z.object({
        configId: z.number().int().positive().describe('Backup config ID, from list_backup_configs')
      })
    },
    async ({ configId }) => {
      try {
        const result = await client.post(`/api/backup/configs/${configId}/run`);
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

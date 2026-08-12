// src/tools/schedules.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';

const scheduleTypeSchema = z
  .enum(['container_update', 'git_stack_sync', 'system_cleanup', 'env_update_check', 'image_prune', 'backup'])
  .describe('Schedule type, from list_schedules');

export function registerScheduleTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_schedules',
    {
      description: 'List all active Dockhand schedules (container auto-updates, git stack syncs, backups, and system jobs).',
      inputSchema: z.object({})
    },
    async () => {
      try {
        const schedules = await client.get('/api/schedules');
        return toTextResult(schedules);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  if (readonly) {
    return;
  }

  server.registerTool(
    'run_schedule',
    {
      description: 'Manually trigger a schedule to run now.',
      inputSchema: z.object({
        scheduleType: scheduleTypeSchema,
        scheduleId: z.number().int().positive().describe('Schedule ID, from list_schedules')
      })
    },
    async ({ scheduleType, scheduleId }) => {
      try {
        const result = await client.post(`/api/schedules/${scheduleType}/${scheduleId}/run`);
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'toggle_schedule',
    {
      description: 'Enable or disable a schedule. Flips its current enabled state — check the returned "enabled" field to see the new state.',
      inputSchema: z.object({
        scheduleType: scheduleTypeSchema,
        scheduleId: z.number().int().positive().describe('Schedule ID, from list_schedules')
      })
    },
    async ({ scheduleType, scheduleId }) => {
      try {
        const result = await client.post(`/api/schedules/${scheduleType}/${scheduleId}/toggle`);
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

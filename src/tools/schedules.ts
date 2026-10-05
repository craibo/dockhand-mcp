// src/tools/schedules.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';

const scheduleTypeSchema = z
  .enum([
    'container_update',
    'git_stack_sync',
    'system_cleanup',
    'env_update_check',
    'image_prune',
    'backup',
    'repo_prune',
    'repo_check',
    'repo_verify',
    'deploy_log_reconcile'
  ])
  .describe('Schedule type, from list_schedules');

// Execution records carry bulky `details` and `logs` fields (tens of KB each) that make the
// full listing exceed MCP tool-result limits, so they are stripped unless explicitly requested.
function slimExecution(execution: unknown): unknown {
  if (execution === null || typeof execution !== 'object') {
    return execution;
  }
  const { details: _details, logs: _logs, ...rest } = execution as Record<string, unknown>;
  return rest;
}

function slimSchedules(result: unknown): unknown {
  if (result === null || typeof result !== 'object' || !Array.isArray((result as { schedules?: unknown }).schedules)) {
    return result;
  }
  const { schedules, ...others } = result as { schedules: Record<string, unknown>[] };
  return {
    ...others,
    schedules: schedules.map((schedule) => ({
      ...schedule,
      lastExecution: slimExecution(schedule.lastExecution),
      recentExecutions: Array.isArray(schedule.recentExecutions)
        ? schedule.recentExecutions.map(slimExecution)
        : schedule.recentExecutions
    }))
  };
}

export function registerScheduleTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_schedules',
    {
      description:
        'List all active Dockhand schedules (container auto-updates, git stack syncs, backups, and system jobs). Execution records are returned without their bulky details and logs unless includeExecutionDetails is true.',
      inputSchema: z.object({
        includeExecutionDetails: z
          .boolean()
          .optional()
          .describe('Keep the full details and logs of each execution record. Can be hundreds of KB. Defaults to false.')
      })
    },
    async ({ includeExecutionDetails }) => {
      try {
        const schedules = await client.get('/api/schedules');
        return toTextResult(includeExecutionDetails ? schedules : slimSchedules(schedules));
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

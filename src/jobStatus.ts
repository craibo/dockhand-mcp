// src/jobStatus.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from './dockhandClient.js';
import { toErrorResult, toTextResult } from './toolError.js';

export function registerJobStatusTool(
  server: McpServer,
  client: DockhandClient,
  toolName: string,
  description: string
): void {
  server.registerTool(
    toolName,
    {
      description,
      inputSchema: z.object({
        jobId: z.string().describe('Job ID returned by the tool that started this job')
      })
    },
    async ({ jobId }) => {
      try {
        const result = await client.get(`/api/jobs/${encodeURIComponent(jobId)}`);
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

export function registerJobCancelTool(
  server: McpServer,
  client: DockhandClient,
  toolName: string,
  description: string
): void {
  server.registerTool(
    toolName,
    {
      description,
      inputSchema: z.object({
        jobId: z.string().describe('Job ID returned by the tool that started this job')
      })
    },
    async ({ jobId }) => {
      try {
        const result = await client.del(`/api/jobs/${encodeURIComponent(jobId)}`);
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

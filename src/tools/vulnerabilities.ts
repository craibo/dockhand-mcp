// src/tools/vulnerabilities.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';
import { registerJobStatusTool, registerJobCancelTool } from '../jobStatus.js';

export function registerVulnerabilityTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_vulnerabilities',
    {
      description: 'List aggregated vulnerability findings for an environment, with optional filtering and pagination.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        limit: z.number().int().positive().optional().describe('Max findings to return'),
        offset: z.number().int().nonnegative().optional().describe('Pagination offset'),
        q: z.string().optional().describe('Free-text search'),
        severity: z.string().optional().describe('Filter by severity, e.g. "critical", "high"'),
        image: z.string().optional().describe('Filter by image reference'),
        container: z.string().optional().describe('Filter by container name'),
        stack: z.string().optional().describe('Filter by stack name'),
        sort: z.string().optional().describe('Sort field'),
        dir: z.string().optional().describe('Sort direction, "asc" or "desc"')
      })
    },
    async ({ environmentId, limit, offset, q, severity, image, container, stack, sort, dir }) => {
      try {
        const result = await client.get('/api/vulnerabilities', {
          env: environmentId,
          limit,
          offset,
          q,
          severity,
          image,
          container,
          stack,
          sort,
          dir
        });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  registerJobStatusTool(server, client, 'get_vulnerability_scan_status', 'Check the status of a vulnerability scan started by scan_all_vulnerabilities.');

  if (readonly) {
    return;
  }

  server.registerTool(
    'scan_all_vulnerabilities',
    {
      description: 'Scan every image in an environment for vulnerabilities. Returns immediately with a jobId — call get_vulnerability_scan_status with that jobId to check progress, and cancel_vulnerability_scan to abort.',
      inputSchema: z.object({
        environmentId: environmentIdSchema.optional().describe('Limit the scan to this environment. Omit to scan all accessible environments.')
      })
    },
    async ({ environmentId }) => {
      try {
        const result = await client.postJob('/api/vulnerabilities/scan-all', undefined, { env: environmentId });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
  registerJobCancelTool(server, client, 'cancel_vulnerability_scan', 'Cancel a running vulnerability scan started by scan_all_vulnerabilities.');
}

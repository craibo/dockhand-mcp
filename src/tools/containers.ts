// src/tools/containers.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

export function registerContainerTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_containers',
    {
      description: 'List containers in a Dockhand environment.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        all: z.boolean().optional().describe('Include stopped containers. Defaults to true.')
      })
    },
    async ({ environmentId, all }) => {
      try {
        const containers = await client.get('/api/containers', { env: environmentId, all });
        return toTextResult(containers);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'get_container',
    {
      description: 'Get full inspect details for a single container.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        containerId: z.string().describe('Container ID or name')
      })
    },
    async ({ environmentId, containerId }) => {
      try {
        const details = await client.get(`/api/containers/${encodeURIComponent(containerId)}`, { env: environmentId });
        return toTextResult(details);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'get_container_logs',
    {
      description: 'Get recent logs for a container.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        containerId: z.string(),
        tail: z.number().int().positive().optional().describe('Number of lines from the end of the logs. Defaults to 100.'),
        since: z.string().optional().describe('Only return logs since this timestamp (Unix seconds or RFC3339)'),
        until: z.string().optional().describe('Only return logs before this timestamp (Unix seconds or RFC3339)')
      })
    },
    async ({ environmentId, containerId, tail, since, until }) => {
      try {
        const result = await client.get(`/api/containers/${encodeURIComponent(containerId)}/logs`, {
          env: environmentId,
          tail,
          since,
          until
        });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  if (readonly) {
    return;
  }

  server.registerTool(
    'start_container',
    {
      description: 'Start a stopped container.',
      inputSchema: z.object({ environmentId: environmentIdSchema, containerId: z.string() })
    },
    async ({ environmentId, containerId }) => {
      try {
        const result = await client.post(`/api/containers/${encodeURIComponent(containerId)}/start`, undefined, {
          env: environmentId
        });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'stop_container',
    {
      description: 'Stop a running container.',
      inputSchema: z.object({ environmentId: environmentIdSchema, containerId: z.string() })
    },
    async ({ environmentId, containerId }) => {
      try {
        const result = await client.post(`/api/containers/${encodeURIComponent(containerId)}/stop`, undefined, {
          env: environmentId
        });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'restart_container',
    {
      description: 'Restart a container.',
      inputSchema: z.object({ environmentId: environmentIdSchema, containerId: z.string() })
    },
    async ({ environmentId, containerId }) => {
      try {
        const result = await client.post(`/api/containers/${encodeURIComponent(containerId)}/restart`, undefined, {
          env: environmentId
        });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'remove_container',
    {
      description: 'Remove (delete) a container.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        containerId: z.string(),
        force: z.boolean().optional().describe('Force removal of a running container. Defaults to false.')
      })
    },
    async ({ environmentId, containerId, force }) => {
      try {
        const result = await client.del(`/api/containers/${encodeURIComponent(containerId)}`, {
          env: environmentId,
          force
        });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

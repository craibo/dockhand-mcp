// src/tools/updates.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';
import { registerJobStatusTool, registerJobCancelTool } from '../jobStatus.js';

export function registerUpdateTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_pending_updates',
    {
      description:
        'List containers in an environment that have a newer image available, from the last update check. Does not trigger a fresh check — call check_container_updates first for current data.',
      inputSchema: z.object({ environmentId: environmentIdSchema })
    },
    async ({ environmentId }) => {
      try {
        const result = await client.get('/api/containers/pending-updates', { env: environmentId });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  registerJobStatusTool(
    server,
    client,
    'get_container_update_check_status',
    'Check the status of an update check started by check_container_updates.'
  );

  if (readonly) {
    return;
  }

  server.registerTool(
    'check_container_updates',
    {
      description:
        'Check every container in an environment for a newer image. Returns immediately with a jobId — call get_container_update_check_status with that jobId, then list_pending_updates for the results. Use cancel_container_update_check to abort.',
      inputSchema: z.object({ environmentId: environmentIdSchema })
    },
    async ({ environmentId }) => {
      try {
        const result = await client.postJob('/api/containers/check-updates', undefined, { env: environmentId });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
  registerJobCancelTool(
    server,
    client,
    'cancel_container_update_check',
    'Cancel a running update check started by check_container_updates.'
  );

  server.registerTool(
    'update_container',
    {
      description:
        'Recreate a container with a newer image, preserving its configuration. Blocks until the update finishes (including the image pull), which can take a while.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        containerId: z.string().describe('Container ID or name'),
        image: z.string().optional().describe('Image to update to, e.g. "nginx:1.27". Defaults to the container\'s current image.'),
        repullImage: z.boolean().optional().describe('Pull the image again before recreating. Defaults to false.'),
        startAfterUpdate: z.boolean().optional().describe('Start the container after it is recreated.')
      })
    },
    async ({ environmentId, containerId, image, repullImage, startAfterUpdate }) => {
      try {
        const result = await client.post(
          `/api/containers/${encodeURIComponent(containerId)}/update`,
          { image, repullImage, startAfterUpdate },
          { env: environmentId }
        );
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'batch_update_containers',
    {
      description:
        'Recreate several containers with their latest images, preserving their settings. Blocks until all updates finish. Use list_pending_updates to pick containers.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        containerIds: z.array(z.string()).min(1).describe('IDs of the containers to update')
      })
    },
    async ({ environmentId, containerIds }) => {
      try {
        const result = await client.post('/api/containers/batch-update', { containerIds }, { env: environmentId });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

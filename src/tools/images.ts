import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';
import { registerJobStatusTool, registerJobCancelTool } from '../jobStatus.js';

export function registerImageTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_images',
    {
      description: 'List images in a Dockhand environment.',
      inputSchema: z.object({ environmentId: environmentIdSchema })
    },
    async ({ environmentId }) => {
      try {
        const images = await client.get('/api/images', { env: environmentId });
        return toTextResult(images);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  registerJobStatusTool(server, client, 'get_image_pull_status', 'Check the status of an image pull started by pull_image.');

  if (readonly) {
    return;
  }

  server.registerTool(
    'pull_image',
    {
      description: 'Pull an image from a registry. Returns immediately with a jobId — call get_image_pull_status with that jobId to check progress, and cancel_image_pull to abort.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        image: z.string().describe('Image reference, e.g. nginx:latest'),
        scanAfterPull: z.boolean().optional().describe('Run a vulnerability scan after pulling, if a scanner is configured. Defaults to the environment setting.')
      })
    },
    async ({ environmentId, image, scanAfterPull }) => {
      try {
        const result = await client.postJob('/api/images/pull', { image, scanAfterPull }, { env: environmentId });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
  registerJobCancelTool(server, client, 'cancel_image_pull', 'Cancel a running image pull started by pull_image.');

  server.registerTool(
    'remove_image',
    {
      description: 'Remove (delete) an image.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        imageId: z.string().describe('Image ID or reference'),
        force: z.boolean().optional().describe('Force removal. Defaults to false.')
      })
    },
    async ({ environmentId, imageId, force }) => {
      try {
        const result = await client.del(`/api/images/${encodeURIComponent(imageId)}`, { env: environmentId, force });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

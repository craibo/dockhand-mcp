import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

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

  if (readonly) {
    return;
  }

  server.registerTool(
    'pull_image',
    {
      description: 'Pull an image from a registry. Blocks until the pull completes or fails.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        image: z.string().describe('Image reference, e.g. nginx:latest'),
        scanAfterPull: z.boolean().optional().describe('Run a vulnerability scan after pulling, if a scanner is configured. Defaults to the environment setting.')
      })
    },
    async ({ environmentId, image, scanAfterPull }) => {
      try {
        const result = await client.post('/api/images/pull', { image, scanAfterPull }, { env: environmentId });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

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

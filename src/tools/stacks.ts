import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';

export function registerStackTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_stacks',
    {
      description: 'List Compose stacks in a Dockhand environment.',
      inputSchema: z.object({ environmentId: environmentIdSchema })
    },
    async ({ environmentId }) => {
      try {
        const stacks = await client.get('/api/stacks', { env: environmentId });
        return toTextResult(stacks);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  if (readonly) {
    return;
  }

  server.registerTool(
    'deploy_stack',
    {
      description: 'Deploy (up) a Compose stack. Blocks until the deploy completes or fails.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        stackName: z.string(),
        pull: z.boolean().optional().describe('Pull images before deploying. Defaults to false.'),
        build: z.boolean().optional().describe('Build images before deploying. Defaults to false.'),
        forceRecreate: z.boolean().optional().describe('Force recreation of containers. Defaults to false.')
      })
    },
    async ({ environmentId, stackName, pull, build, forceRecreate }) => {
      try {
        const result = await client.post(
          `/api/stacks/${encodeURIComponent(stackName)}/deploy`,
          { pull, build, forceRecreate },
          { env: environmentId }
        );
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'stop_stack',
    {
      description: 'Stop (down) a Compose stack. Blocks until it completes or fails.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        stackName: z.string(),
        removeVolumes: z.boolean().optional().describe('Also remove named volumes declared in the stack. Defaults to false.')
      })
    },
    async ({ environmentId, stackName, removeVolumes }) => {
      try {
        const result = await client.post(
          `/api/stacks/${encodeURIComponent(stackName)}/down`,
          { removeVolumes },
          { env: environmentId }
        );
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

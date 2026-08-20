// src/tools/git.ts
import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';
import { registerJobStatusTool, registerJobCancelTool } from '../jobStatus.js';

export function registerGitTools(server: McpServer, client: DockhandClient, readonly: boolean): void {
  server.registerTool(
    'list_git_stacks',
    {
      description: 'List git-backed Compose stacks in Dockhand.',
      inputSchema: z.object({
        environmentId: environmentIdSchema.optional()
      })
    },
    async ({ environmentId }) => {
      try {
        const stacks = await client.get('/api/git/stacks', { env: environmentId });
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
    'sync_git_stack',
    {
      description: 'Pull the latest commit for a git-backed stack from its remote, without redeploying.',
      inputSchema: z.object({
        gitStackId: z.number().int().positive().describe('Git stack ID, from list_git_stacks')
      })
    },
    async ({ gitStackId }) => {
      try {
        const result = await client.post(`/api/git/stacks/${gitStackId}/sync`);
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'deploy_git_stack',
    {
      description: 'Sync and redeploy a git-backed stack. Returns immediately with a jobId — call get_git_deploy_status with that jobId to check progress, and cancel_git_deploy to abort. Check the "success" field in the final result once done — a failed deploy is reported there, not as a tool error.',
      inputSchema: z.object({
        gitStackId: z.number().int().positive().describe('Git stack ID, from list_git_stacks')
      })
    },
    async ({ gitStackId }) => {
      try {
        const result = await client.postJob(`/api/git/stacks/${gitStackId}/deploy`);
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
  registerJobStatusTool(server, client, 'get_git_deploy_status', 'Check the status of a git stack deploy started by deploy_git_stack.');
  registerJobCancelTool(server, client, 'cancel_git_deploy', 'Cancel a running git stack deploy started by deploy_git_stack.');
}

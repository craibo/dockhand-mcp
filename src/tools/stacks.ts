import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { DockhandClient } from '../dockhandClient.js';
import { toErrorResult, toTextResult } from '../toolError.js';
import { environmentIdSchema } from '../types.js';
import { registerJobStatusTool, registerJobCancelTool } from '../jobStatus.js';

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

  registerJobStatusTool(server, client, 'get_stack_deploy_status', 'Check the status of a stack deploy started by deploy_stack.');
  registerJobStatusTool(server, client, 'get_stack_stop_status', 'Check the status of a stack stop started by stop_stack.');

  server.registerTool(
    'get_stack_env',
    {
      description: 'Get all environment variables for a stack (merged view of the .env file and stored secrets). Secret values are masked as "***" and are never returned in plain text.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        stackName: z.string()
      })
    },
    async ({ environmentId, stackName }) => {
      try {
        const result = await client.get(`/api/stacks/${encodeURIComponent(stackName)}/env`, { env: environmentId });
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'get_stack_env_file',
    {
      description: 'Get the raw .env file content for a stack, as-is (comments and formatting preserved). Only contains non-secret variables — secrets live separately, see get_stack_env.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        stackName: z.string()
      })
    },
    async ({ environmentId, stackName }) => {
      try {
        const result = await client.get(`/api/stacks/${encodeURIComponent(stackName)}/env/raw`, { env: environmentId });
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
    'deploy_stack',
    {
      description: 'Deploy (up) a Compose stack. Returns immediately with a jobId — call get_stack_deploy_status with that jobId to check progress, and cancel_stack_deploy to abort.',
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
        const result = await client.postJob(
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
  registerJobCancelTool(server, client, 'cancel_stack_deploy', 'Cancel a running stack deploy started by deploy_stack.');

  server.registerTool(
    'stop_stack',
    {
      description: 'Stop (down) a Compose stack. Returns immediately with a jobId — call get_stack_stop_status with that jobId to check progress, and cancel_stack_stop to abort.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        stackName: z.string(),
        removeVolumes: z.boolean().optional().describe('Also remove named volumes declared in the stack. Defaults to false.')
      })
    },
    async ({ environmentId, stackName, removeVolumes }) => {
      try {
        const result = await client.postJob(
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
  registerJobCancelTool(server, client, 'cancel_stack_stop', 'Cancel a running stack stop started by stop_stack.');

  server.registerTool(
    'set_stack_secret',
    {
      description: 'Save secret environment variables for a stack. Only affects variables with isSecret: true — pass the value "***" for a variable to keep its existing secret value unchanged (e.g. when round-tripping from get_stack_env without knowing the real value). Non-secret variables are not affected by this tool; use set_stack_env_file for those.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        stackName: z.string(),
        variables: z.array(
          z.object({
            key: z.string().describe('Variable name — must start with a letter or underscore, alphanumeric/underscore only'),
            value: z.string().describe('Variable value, or "***" to preserve the existing secret value'),
            isSecret: z.boolean().optional().describe('Whether this is a secret variable. Defaults to false.')
          })
        )
      })
    },
    async ({ environmentId, stackName, variables }) => {
      try {
        const result = await client.put(
          `/api/stacks/${encodeURIComponent(stackName)}/env`,
          { variables },
          { env: environmentId }
        );
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );

  server.registerTool(
    'set_stack_env_file',
    {
      description: 'Overwrite the raw .env file content for a stack. Replaces the entire file — pass the full desired content, not a partial update. Passing empty content deletes the file. Never pass a masked "***" placeholder value here, as it would corrupt secret values.',
      inputSchema: z.object({
        environmentId: environmentIdSchema,
        stackName: z.string(),
        content: z.string().describe('Full .env file content, e.g. "FOO=bar\\nBAZ=qux\\n"')
      })
    },
    async ({ environmentId, stackName, content }) => {
      try {
        const result = await client.put(
          `/api/stacks/${encodeURIComponent(stackName)}/env/raw`,
          { content },
          { env: environmentId }
        );
        return toTextResult(result);
      } catch (error) {
        return toErrorResult(error);
      }
    }
  );
}

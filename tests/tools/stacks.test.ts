import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerStackTools } from '../../src/tools/stacks.js';
import type { DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), postJob: vi.fn(), del: vi.fn(), ...overrides };
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  // @ts-expect-error accessing internal registry for direct unit testing
  const tool = server._registeredTools[name];
  return tool.handler(args);
}

function hasTool(server: McpServer, name: string): boolean {
  // @ts-expect-error accessing internal registry for direct unit testing
  return name in server._registeredTools;
}

describe('registerStackTools', () => {
  it('list_stacks passes environmentId', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ name: 'my-app' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'list_stacks', { environmentId: 5 });
    expect(client.get).toHaveBeenCalledWith('/api/stacks', { env: 5 });
  });

  it('deploy_stack posts options via postJob and encodes the stack name', async () => {
    const client = makeClient({ postJob: vi.fn().mockResolvedValue({ jobId: 'job-1' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    const result = await callTool(server, 'deploy_stack', {
      environmentId: 5,
      stackName: 'my app',
      pull: true,
      build: false,
      forceRecreate: false
    });
    expect(client.postJob).toHaveBeenCalledWith(
      '/api/stacks/my%20app/deploy',
      { pull: true, build: false, forceRecreate: false },
      { env: 5 }
    );
    expect(result.content[0].text).toContain('job-1');
  });

  it('stop_stack posts removeVolumes via postJob', async () => {
    const client = makeClient({ postJob: vi.fn().mockResolvedValue({ jobId: 'job-2' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'stop_stack', { environmentId: 5, stackName: 'my-app', removeVolumes: true });
    expect(client.postJob).toHaveBeenCalledWith('/api/stacks/my-app/down', { removeVolumes: true }, { env: 5 });
  });

  it('omits deploy_stack and stop_stack when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, makeClient(), true);
    expect(hasTool(server, 'deploy_stack')).toBe(false);
    expect(hasTool(server, 'stop_stack')).toBe(false);
    expect(hasTool(server, 'list_stacks')).toBe(true);
  });

  it('registers status and cancel tools for deploy_stack and stop_stack', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, makeClient(), false);
    expect(hasTool(server, 'get_stack_deploy_status')).toBe(true);
    expect(hasTool(server, 'cancel_stack_deploy')).toBe(true);
    expect(hasTool(server, 'get_stack_stop_status')).toBe(true);
    expect(hasTool(server, 'cancel_stack_stop')).toBe(true);
  });

  it('get_stack_deploy_status calls client.get on the jobs endpoint', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({ status: 'done' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'get_stack_deploy_status', { jobId: 'job-1' });
    expect(client.get).toHaveBeenCalledWith('/api/jobs/job-1');
  });

  it('cancel_stack_deploy calls client.del on the jobs endpoint', async () => {
    const client = makeClient({ del: vi.fn().mockResolvedValue({ cancelled: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'cancel_stack_deploy', { jobId: 'job-1' });
    expect(client.del).toHaveBeenCalledWith('/api/jobs/job-1');
  });

  it('omits cancel tools but keeps status tools when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, makeClient(), true);
    expect(hasTool(server, 'cancel_stack_deploy')).toBe(false);
    expect(hasTool(server, 'cancel_stack_stop')).toBe(false);
    expect(hasTool(server, 'get_stack_deploy_status')).toBe(false);
    expect(hasTool(server, 'get_stack_stop_status')).toBe(false);
  });
});

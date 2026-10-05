import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerStackTools } from '../../src/tools/stacks.js';
import type { DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), postJob: vi.fn(), put: vi.fn(), del: vi.fn(), ...overrides };
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

  it('down_stack posts removeVolumes via postJob', async () => {
    const client = makeClient({ postJob: vi.fn().mockResolvedValue({ jobId: 'job-2' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'down_stack', { environmentId: 5, stackName: 'my-app', removeVolumes: true });
    expect(client.postJob).toHaveBeenCalledWith('/api/stacks/my-app/down', { removeVolumes: true }, { env: 5 });
  });

  it('start_stack and stop_stack post to their own endpoints via postJob', async () => {
    const client = makeClient({ postJob: vi.fn().mockResolvedValue({ jobId: 'job-3' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'start_stack', { environmentId: 5, stackName: 'my app' });
    expect(client.postJob).toHaveBeenLastCalledWith('/api/stacks/my%20app/start', undefined, { env: 5 });
    await callTool(server, 'stop_stack', { environmentId: 5, stackName: 'my-app' });
    expect(client.postJob).toHaveBeenLastCalledWith('/api/stacks/my-app/stop', undefined, { env: 5 });
  });

  it('restart_stack passes mode as a query param via postJob', async () => {
    const client = makeClient({ postJob: vi.fn().mockResolvedValue({ jobId: 'job-4' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'restart_stack', { environmentId: 5, stackName: 'my-app', mode: 'ordered' });
    expect(client.postJob).toHaveBeenCalledWith('/api/stacks/my-app/restart', undefined, { env: 5, mode: 'ordered' });
  });

  it('omits mutating stack tools when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, makeClient(), true);
    expect(hasTool(server, 'deploy_stack')).toBe(false);
    for (const name of ['down_stack', 'start_stack', 'stop_stack', 'restart_stack']) {
      expect(hasTool(server, name)).toBe(false);
    }
    expect(hasTool(server, 'list_stacks')).toBe(true);
  });

  it('registers status and cancel tools for deploy, down and lifecycle jobs', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, makeClient(), false);
    expect(hasTool(server, 'get_stack_deploy_status')).toBe(true);
    expect(hasTool(server, 'cancel_stack_deploy')).toBe(true);
    expect(hasTool(server, 'get_stack_down_status')).toBe(true);
    expect(hasTool(server, 'cancel_stack_down')).toBe(true);
    expect(hasTool(server, 'get_stack_lifecycle_status')).toBe(true);
    expect(hasTool(server, 'cancel_stack_lifecycle')).toBe(true);
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
    expect(hasTool(server, 'cancel_stack_down')).toBe(false);
    expect(hasTool(server, 'cancel_stack_lifecycle')).toBe(false);
    expect(hasTool(server, 'get_stack_deploy_status')).toBe(true);
    expect(hasTool(server, 'get_stack_down_status')).toBe(true);
    expect(hasTool(server, 'get_stack_lifecycle_status')).toBe(true);
  });

  it('get_stack_env passes environmentId and encodes stack name', async () => {
    const client = makeClient({
      get: vi.fn().mockResolvedValue({ variables: [{ key: 'FOO', value: 'bar', isSecret: false }] })
    });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    const result = await callTool(server, 'get_stack_env', { environmentId: 5, stackName: 'my app' });
    expect(client.get).toHaveBeenCalledWith('/api/stacks/my%20app/env', { env: 5 });
    expect(result.content[0].text).toContain('FOO');
  });

  it('set_stack_secret puts variables and encodes stack name', async () => {
    const client = makeClient({ put: vi.fn().mockResolvedValue({ success: true, count: 1 }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    const variables = [{ key: 'DB_PASSWORD', value: 'secret123', isSecret: true }];
    const result = await callTool(server, 'set_stack_secret', { environmentId: 5, stackName: 'my-app', variables });
    expect(client.put).toHaveBeenCalledWith('/api/stacks/my-app/env', { variables }, { env: 5 });
    expect(result.content[0].text).toContain('success');
  });

  it('omits set_stack_secret when readonly but keeps get_stack_env', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, makeClient(), true);
    expect(hasTool(server, 'set_stack_secret')).toBe(false);
    expect(hasTool(server, 'get_stack_env')).toBe(true);
  });

  it('get_stack_env_file passes environmentId and encodes stack name', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({ content: 'FOO=bar\n' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    const result = await callTool(server, 'get_stack_env_file', { environmentId: 5, stackName: 'my app' });
    expect(client.get).toHaveBeenCalledWith('/api/stacks/my%20app/env/raw', { env: 5 });
    expect(result.content[0].text).toContain('FOO=bar');
  });

  it('set_stack_env_file puts raw content and encodes stack name', async () => {
    const client = makeClient({ put: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    const result = await callTool(server, 'set_stack_env_file', {
      environmentId: 5,
      stackName: 'my-app',
      content: 'FOO=bar\n'
    });
    expect(client.put).toHaveBeenCalledWith('/api/stacks/my-app/env/raw', { content: 'FOO=bar\n' }, { env: 5 });
    expect(result.content[0].text).toContain('success');
  });

  it('omits set_stack_env_file when readonly but keeps get_stack_env_file', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, makeClient(), true);
    expect(hasTool(server, 'set_stack_env_file')).toBe(false);
    expect(hasTool(server, 'get_stack_env_file')).toBe(true);
  });
});

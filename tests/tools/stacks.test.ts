import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerStackTools } from '../../src/tools/stacks.js';
import type { DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn(), ...overrides };
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

  it('deploy_stack posts options and encodes the stack name', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'deploy_stack', {
      environmentId: 5,
      stackName: 'my app',
      pull: true,
      build: false,
      forceRecreate: false
    });
    expect(client.post).toHaveBeenCalledWith(
      '/api/stacks/my%20app/deploy',
      { pull: true, build: false, forceRecreate: false },
      { env: 5 }
    );
  });

  it('stop_stack posts removeVolumes', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, client, false);

    await callTool(server, 'stop_stack', { environmentId: 5, stackName: 'my-app', removeVolumes: true });
    expect(client.post).toHaveBeenCalledWith('/api/stacks/my-app/down', { removeVolumes: true }, { env: 5 });
  });

  it('omits deploy_stack and stop_stack when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerStackTools(server, makeClient(), true);
    expect(hasTool(server, 'deploy_stack')).toBe(false);
    expect(hasTool(server, 'stop_stack')).toBe(false);
    expect(hasTool(server, 'list_stacks')).toBe(true);
  });
});

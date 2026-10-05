// tests/tools/containers.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerContainerTools } from '../../src/tools/containers.js';
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

describe('registerContainerTools — read-only tools', () => {
  it('list_containers passes environmentId and all through as query params', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ id: 'c1' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'list_containers', { environmentId: 1, all: false });
    expect(client.get).toHaveBeenCalledWith('/api/containers', { env: 1, all: false });
  });

  it('get_container calls the inspect endpoint', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({ Id: 'c1' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'get_container', { environmentId: 1, containerId: 'c1' });
    expect(client.get).toHaveBeenCalledWith('/api/containers/c1', { env: 1 });
  });

  it('get_container_logs passes tail/since/until', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({ logs: 'log line' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'get_container_logs', { environmentId: 1, containerId: 'c1', tail: 200 });
    expect(client.get).toHaveBeenCalledWith('/api/containers/c1/logs', {
      env: 1,
      tail: 200,
      since: undefined,
      until: undefined
    });
  });
});

describe('registerContainerTools — stats and top', () => {
  it('get_container_stats and get_container_top call their endpoints', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({}) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, true);

    await callTool(server, 'get_container_stats', { environmentId: 5, containerId: 'c 1' });
    expect(client.get).toHaveBeenLastCalledWith('/api/containers/c%201/stats', { env: 5 });
    await callTool(server, 'get_container_top', { environmentId: 5, containerId: 'c1' });
    expect(client.get).toHaveBeenLastCalledWith('/api/containers/c1/top', { env: 5 });
  });
});

describe('registerContainerTools — pause, unpause, rename', () => {
  it('pause_container and unpause_container post to their endpoints', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({}) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'pause_container', { environmentId: 5, containerId: 'c1' });
    expect(client.post).toHaveBeenLastCalledWith('/api/containers/c1/pause', undefined, { env: 5 });
    await callTool(server, 'unpause_container', { environmentId: 5, containerId: 'c1' });
    expect(client.post).toHaveBeenLastCalledWith('/api/containers/c1/unpause', undefined, { env: 5 });
  });

  it('rename_container posts the new name', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({}) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'rename_container', { environmentId: 5, containerId: 'c1', name: 'web-2' });
    expect(client.post).toHaveBeenCalledWith('/api/containers/c1/rename', { name: 'web-2' }, { env: 5 });
  });

  it('omits pause, unpause and rename when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, makeClient(), true);
    for (const name of ['pause_container', 'unpause_container', 'rename_container']) {
      expect(hasTool(server, name)).toBe(false);
    }
    expect(hasTool(server, 'get_container_stats')).toBe(true);
  });
});

describe('registerContainerTools — mutating tools when readonly=false', () => {
  it('registers start_container, stop_container, restart_container, remove_container', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, makeClient(), false);
    expect(hasTool(server, 'start_container')).toBe(true);
    expect(hasTool(server, 'stop_container')).toBe(true);
    expect(hasTool(server, 'restart_container')).toBe(true);
    expect(hasTool(server, 'remove_container')).toBe(true);
  });

  it('start_container posts to the start endpoint', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'start_container', { environmentId: 1, containerId: 'c1' });
    expect(client.post).toHaveBeenCalledWith('/api/containers/c1/start', undefined, { env: 1 });
  });

  it('remove_container deletes with force param', async () => {
    const client = makeClient({ del: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, client, false);

    await callTool(server, 'remove_container', { environmentId: 1, containerId: 'c1', force: true });
    expect(client.del).toHaveBeenCalledWith('/api/containers/c1', { env: 1, force: true });
  });
});

describe('registerContainerTools — readonly=true', () => {
  it('does not register mutating tools', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerContainerTools(server, makeClient(), true);
    expect(hasTool(server, 'start_container')).toBe(false);
    expect(hasTool(server, 'stop_container')).toBe(false);
    expect(hasTool(server, 'restart_container')).toBe(false);
    expect(hasTool(server, 'remove_container')).toBe(false);
    expect(hasTool(server, 'list_containers')).toBe(true);
    expect(hasTool(server, 'get_container')).toBe(true);
    expect(hasTool(server, 'get_container_logs')).toBe(true);
  });
});

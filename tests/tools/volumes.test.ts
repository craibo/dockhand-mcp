import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerVolumeTools } from '../../src/tools/volumes.js';
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

describe('registerVolumeTools', () => {
  it('list_volumes passes environmentId', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ Name: 'data' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVolumeTools(server, client, false);

    await callTool(server, 'list_volumes', { environmentId: 3 });
    expect(client.get).toHaveBeenCalledWith('/api/volumes', { env: 3 });
  });

  it('remove_volume deletes with force param', async () => {
    const client = makeClient({ del: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVolumeTools(server, client, false);

    await callTool(server, 'remove_volume', { environmentId: 3, volumeName: 'data', force: true });
    expect(client.del).toHaveBeenCalledWith('/api/volumes/data', { env: 3, force: true });
  });

  it('omits remove_volume when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVolumeTools(server, makeClient(), true);
    expect(hasTool(server, 'remove_volume')).toBe(false);
    expect(hasTool(server, 'list_volumes')).toBe(true);
  });
});

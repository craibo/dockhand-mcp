import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerNetworkTools } from '../../src/tools/networks.js';
import type { DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn(), ...overrides };
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  // @ts-expect-error accessing internal registry for direct unit testing
  const tool = server._registeredTools[name];
  return tool.handler(args);
}

describe('registerNetworkTools', () => {
  it('list_networks passes environmentId', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ Name: 'bridge' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerNetworkTools(server, client);

    await callTool(server, 'list_networks', { environmentId: 4 });
    expect(client.get).toHaveBeenCalledWith('/api/networks', { env: 4 });
  });

  it('returns isError on failure', async () => {
    const client = makeClient({ get: vi.fn().mockRejectedValue(new Error('down')) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerNetworkTools(server, client);

    const result = await callTool(server, 'list_networks', { environmentId: 4 });
    expect(result.isError).toBe(true);
  });
});

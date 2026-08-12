// tests/tools/registries.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerRegistryTools } from '../../src/tools/registries.js';
import type { DockhandClient } from '../../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn(), ...overrides };
}

async function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  // @ts-expect-error accessing internal registry for direct unit testing
  const tool = server._registeredTools[name];
  return tool.handler(args);
}

describe('registerRegistryTools', () => {
  it('list_registries calls /api/registries with no params', async () => {
    const client = makeClient({
      get: vi.fn().mockResolvedValue([{ id: 1, url: 'ghcr.io', hasCredentials: true }])
    });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerRegistryTools(server, client);

    const result = await callTool(server, 'list_registries', {});
    expect(client.get).toHaveBeenCalledWith('/api/registries');
    expect(result.content[0].text).toContain('ghcr.io');
    expect(result.content[0].text).not.toContain('"password"');
  });

  it('returns isError on failure', async () => {
    const client = makeClient({ get: vi.fn().mockRejectedValue(new Error('down')) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerRegistryTools(server, client);

    const result = await callTool(server, 'list_registries', {});
    expect(result.isError).toBe(true);
  });
});

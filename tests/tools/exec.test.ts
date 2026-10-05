import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerExecTools } from '../../src/tools/exec.js';
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

describe('registerExecTools', () => {
  it('exec_container posts the command with envId (not env) as the query param', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ stdout: 'hi', stderr: '', exitCode: 0 }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerExecTools(server, client, false);

    const result = await callTool(server, 'exec_container', {
      environmentId: 5,
      containerId: 'c 1',
      cmd: ['echo', 'hi'],
      workingDir: '/app'
    });
    expect(client.post).toHaveBeenCalledWith(
      '/api/containers/c%201/exec/run',
      { cmd: ['echo', 'hi'], user: undefined, workingDir: '/app' },
      { envId: 5 }
    );
    expect(result.content[0].text).toContain('hi');
  });

  it('registers nothing when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerExecTools(server, makeClient(), true);
    expect(hasTool(server, 'exec_container')).toBe(false);
  });
});

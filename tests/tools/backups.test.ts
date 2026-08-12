// tests/tools/backups.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerBackupTools } from '../../src/tools/backups.js';
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

describe('registerBackupTools — read-only tools', () => {
  it('list_backup_configs passes optional type/target/environmentId filters', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ id: 1 }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerBackupTools(server, client, false);

    await callTool(server, 'list_backup_configs', { type: 'stack', target: 'media', environmentId: 1 });
    expect(client.get).toHaveBeenCalledWith('/api/backup/configs', { type: 'stack', target: 'media', env: 1 });
  });

  it('list_backup_configs works with no filters', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerBackupTools(server, client, false);

    await callTool(server, 'list_backup_configs', {});
    expect(client.get).toHaveBeenCalledWith('/api/backup/configs', { type: undefined, target: undefined, env: undefined });
  });

  it('list_snapshots passes optional configId', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ id: 'snap1' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerBackupTools(server, client, false);

    await callTool(server, 'list_snapshots', { configId: 5 });
    expect(client.get).toHaveBeenCalledWith('/api/backup/snapshots', { configId: 5 });
  });
});

describe('registerBackupTools — mutating tools when readonly=false', () => {
  it('registers run_backup_config', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerBackupTools(server, makeClient(), false);
    expect(hasTool(server, 'run_backup_config')).toBe(true);
  });

  it('run_backup_config posts to the run endpoint with no body', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ status: 'success' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerBackupTools(server, client, false);

    const result = await callTool(server, 'run_backup_config', { configId: 5 });
    expect(client.post).toHaveBeenCalledWith('/api/backup/configs/5/run');
    expect(result.content[0].text).toContain('success');
  });
});

describe('registerBackupTools — readonly=true', () => {
  it('does not register run_backup_config but keeps read tools', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerBackupTools(server, makeClient(), true);
    expect(hasTool(server, 'run_backup_config')).toBe(false);
    expect(hasTool(server, 'list_backup_configs')).toBe(true);
    expect(hasTool(server, 'list_snapshots')).toBe(true);
  });
});

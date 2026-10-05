import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerUpdateTools } from '../../src/tools/updates.js';
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

describe('registerUpdateTools', () => {
  it('list_pending_updates passes environmentId', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerUpdateTools(server, client, false);

    await callTool(server, 'list_pending_updates', { environmentId: 5 });
    expect(client.get).toHaveBeenCalledWith('/api/containers/pending-updates', { env: 5 });
  });

  it('check_container_updates starts a job via postJob', async () => {
    const client = makeClient({ postJob: vi.fn().mockResolvedValue({ jobId: 'job-9' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerUpdateTools(server, client, false);

    const result = await callTool(server, 'check_container_updates', { environmentId: 5 });
    expect(client.postJob).toHaveBeenCalledWith('/api/containers/check-updates', undefined, { env: 5 });
    expect(result.content[0].text).toContain('job-9');
  });

  it('get_container_update_check_status and cancel hit the jobs endpoint', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({}), del: vi.fn().mockResolvedValue({}) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerUpdateTools(server, client, false);

    await callTool(server, 'get_container_update_check_status', { jobId: 'job-9' });
    expect(client.get).toHaveBeenCalledWith('/api/jobs/job-9');
    await callTool(server, 'cancel_container_update_check', { jobId: 'job-9' });
    expect(client.del).toHaveBeenCalledWith('/api/jobs/job-9');
  });

  it('update_container posts options and encodes the container id', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerUpdateTools(server, client, false);

    await callTool(server, 'update_container', {
      environmentId: 5,
      containerId: 'my web',
      repullImage: true,
      startAfterUpdate: true
    });
    expect(client.post).toHaveBeenCalledWith(
      '/api/containers/my%20web/update',
      { image: undefined, repullImage: true, startAfterUpdate: true },
      { env: 5 }
    );
  });

  it('batch_update_containers posts containerIds', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({}) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerUpdateTools(server, client, false);

    await callTool(server, 'batch_update_containers', { environmentId: 5, containerIds: ['a', 'b'] });
    expect(client.post).toHaveBeenCalledWith('/api/containers/batch-update', { containerIds: ['a', 'b'] }, { env: 5 });
  });

  it('keeps only list_pending_updates and the status tool when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerUpdateTools(server, makeClient(), true);
    expect(hasTool(server, 'list_pending_updates')).toBe(true);
    expect(hasTool(server, 'get_container_update_check_status')).toBe(true);
    for (const name of ['check_container_updates', 'cancel_container_update_check', 'update_container', 'batch_update_containers']) {
      expect(hasTool(server, name)).toBe(false);
    }
  });
});

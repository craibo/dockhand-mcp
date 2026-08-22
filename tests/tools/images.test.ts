import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerImageTools } from '../../src/tools/images.js';
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

describe('registerImageTools', () => {
  it('list_images passes environmentId', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ Id: 'sha256:abc' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerImageTools(server, client, false);

    await callTool(server, 'list_images', { environmentId: 2 });
    expect(client.get).toHaveBeenCalledWith('/api/images', { env: 2 });
  });

  it('pull_image posts image name and scanAfterPull via postJob', async () => {
    const client = makeClient({ postJob: vi.fn().mockResolvedValue({ jobId: 'job-1' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerImageTools(server, client, false);

    const result = await callTool(server, 'pull_image', { environmentId: 2, image: 'nginx:latest', scanAfterPull: false });
    expect(client.postJob).toHaveBeenCalledWith('/api/images/pull', { image: 'nginx:latest', scanAfterPull: false }, { env: 2 });
    expect(result.content[0].text).toContain('job-1');
  });

  it('remove_image deletes with force param', async () => {
    const client = makeClient({ del: vi.fn().mockResolvedValue({ success: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerImageTools(server, client, false);

    await callTool(server, 'remove_image', { environmentId: 2, imageId: 'sha256:abc', force: true });
    expect(client.del).toHaveBeenCalledWith('/api/images/sha256%3Aabc', { env: 2, force: true });
  });

  it('omits pull_image and remove_image when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerImageTools(server, makeClient(), true);
    expect(hasTool(server, 'pull_image')).toBe(false);
    expect(hasTool(server, 'remove_image')).toBe(false);
    expect(hasTool(server, 'list_images')).toBe(true);
  });

  it('registers status and cancel tools for pull_image', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerImageTools(server, makeClient(), false);
    expect(hasTool(server, 'get_image_pull_status')).toBe(true);
    expect(hasTool(server, 'cancel_image_pull')).toBe(true);
  });

  it('get_image_pull_status calls client.get on the jobs endpoint', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({ status: 'done' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerImageTools(server, client, false);

    await callTool(server, 'get_image_pull_status', { jobId: 'job-1' });
    expect(client.get).toHaveBeenCalledWith('/api/jobs/job-1');
  });

  it('keeps get_image_pull_status but omits cancel_image_pull when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerImageTools(server, makeClient(), true);
    expect(hasTool(server, 'get_image_pull_status')).toBe(true);
    expect(hasTool(server, 'cancel_image_pull')).toBe(false);
  });
});

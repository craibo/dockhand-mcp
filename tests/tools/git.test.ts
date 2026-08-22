// tests/tools/git.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerGitTools } from '../../src/tools/git.js';
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

describe('registerGitTools — read-only tool', () => {
  it('list_git_stacks passes optional environmentId', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ id: 1, stackName: 'app' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerGitTools(server, client, false);

    await callTool(server, 'list_git_stacks', { environmentId: 2 });
    expect(client.get).toHaveBeenCalledWith('/api/git/stacks', { env: 2 });
  });
});

describe('registerGitTools — mutating tools when readonly=false', () => {
  it('registers sync_git_stack and deploy_git_stack', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerGitTools(server, makeClient(), false);
    expect(hasTool(server, 'sync_git_stack')).toBe(true);
    expect(hasTool(server, 'deploy_git_stack')).toBe(true);
  });

  it('sync_git_stack posts to the sync endpoint by id', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ synced: true }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerGitTools(server, client, false);

    await callTool(server, 'sync_git_stack', { gitStackId: 9 });
    expect(client.post).toHaveBeenCalledWith('/api/git/stacks/9/sync');
  });

  it('deploy_git_stack posts to the deploy endpoint via postJob', async () => {
    const client = makeClient({ postJob: vi.fn().mockResolvedValue({ jobId: 'job-1' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerGitTools(server, client, false);

    const result = await callTool(server, 'deploy_git_stack', { gitStackId: 9 });
    expect(client.postJob).toHaveBeenCalledWith('/api/git/stacks/9/deploy');
    expect(result.content[0].text).toContain('job-1');
  });

  it('registers status and cancel tools for deploy_git_stack', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerGitTools(server, makeClient(), false);
    expect(hasTool(server, 'get_git_deploy_status')).toBe(true);
    expect(hasTool(server, 'cancel_git_deploy')).toBe(true);
  });

  it('get_git_deploy_status calls client.get on the jobs endpoint', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({ status: 'done' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerGitTools(server, client, false);

    await callTool(server, 'get_git_deploy_status', { jobId: 'job-1' });
    expect(client.get).toHaveBeenCalledWith('/api/jobs/job-1');
  });
});

describe('registerGitTools — readonly=true', () => {
  it('does not register mutating tools but keeps list_git_stacks', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerGitTools(server, makeClient(), true);
    expect(hasTool(server, 'sync_git_stack')).toBe(false);
    expect(hasTool(server, 'deploy_git_stack')).toBe(false);
    expect(hasTool(server, 'list_git_stacks')).toBe(true);
  });

  it('keeps get_git_deploy_status but omits cancel_git_deploy when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerGitTools(server, makeClient(), true);
    expect(hasTool(server, 'get_git_deploy_status')).toBe(true);
    expect(hasTool(server, 'cancel_git_deploy')).toBe(false);
  });
});

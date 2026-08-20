// tests/jobStatus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerJobStatusTool, registerJobCancelTool } from '../src/jobStatus.js';
import { DockhandError, type DockhandClient } from '../src/dockhandClient.js';

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

describe('registerJobStatusTool', () => {
  it('registers a tool under the given name with the given description', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerJobStatusTool(server, makeClient(), 'get_stack_deploy_status', 'Check deploy status.');
    expect(hasTool(server, 'get_stack_deploy_status')).toBe(true);
  });

  it('calls client.get on /api/jobs/{jobId} and returns the result', async () => {
    const client = makeClient({
      get: vi.fn().mockResolvedValue({ id: 'job-1', status: 'running', lines: [], result: null })
    });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerJobStatusTool(server, client, 'get_stack_deploy_status', 'Check deploy status.');

    const result = await callTool(server, 'get_stack_deploy_status', { jobId: 'job-1' });
    expect(client.get).toHaveBeenCalledWith('/api/jobs/job-1');
    expect(result.content[0].text).toContain('running');
  });

  it('propagates a 404 as an MCP tool error', async () => {
    const client = makeClient({
      get: vi.fn().mockRejectedValue(new DockhandError(404, 'Job not found'))
    });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerJobStatusTool(server, client, 'get_stack_deploy_status', 'Check deploy status.');

    const result = await callTool(server, 'get_stack_deploy_status', { jobId: 'job-missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Job not found');
  });
});

describe('registerJobCancelTool', () => {
  it('registers a tool under the given name with the given description', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerJobCancelTool(server, makeClient(), 'cancel_stack_deploy', 'Cancel a running deploy.');
    expect(hasTool(server, 'cancel_stack_deploy')).toBe(true);
  });

  it('calls client.del on /api/jobs/{jobId} and returns the result', async () => {
    const client = makeClient({
      del: vi.fn().mockResolvedValue({ cancelled: true })
    });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerJobCancelTool(server, client, 'cancel_stack_deploy', 'Cancel a running deploy.');

    const result = await callTool(server, 'cancel_stack_deploy', { jobId: 'job-1' });
    expect(client.del).toHaveBeenCalledWith('/api/jobs/job-1');
    expect(result.content[0].text).toContain('cancelled');
  });

  it('propagates a 404 as an MCP tool error', async () => {
    const client = makeClient({
      del: vi.fn().mockRejectedValue(new DockhandError(404, 'Job not found'))
    });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerJobCancelTool(server, client, 'cancel_stack_deploy', 'Cancel a running deploy.');

    const result = await callTool(server, 'cancel_stack_deploy', { jobId: 'job-missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Job not found');
  });
});

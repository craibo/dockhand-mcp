// tests/tools/vulnerabilities.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerVulnerabilityTools } from '../../src/tools/vulnerabilities.js';
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

describe('registerVulnerabilityTools — read-only tool', () => {
  it('list_vulnerabilities passes environmentId and optional filters', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({ findings: [], total: 0 }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVulnerabilityTools(server, client, false);

    await callTool(server, 'list_vulnerabilities', { environmentId: 1, severity: 'critical', limit: 50 });
    expect(client.get).toHaveBeenCalledWith('/api/vulnerabilities', {
      env: 1,
      limit: 50,
      offset: undefined,
      q: undefined,
      severity: 'critical',
      image: undefined,
      container: undefined,
      stack: undefined,
      sort: undefined,
      dir: undefined
    });
  });
});

describe('registerVulnerabilityTools — mutating tool when readonly=false', () => {
  it('registers scan_all_vulnerabilities', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVulnerabilityTools(server, makeClient(), false);
    expect(hasTool(server, 'scan_all_vulnerabilities')).toBe(true);
  });

  it('scan_all_vulnerabilities posts with optional environmentId via postJob', async () => {
    const client = makeClient({ postJob: vi.fn().mockResolvedValue({ jobId: 'job-1' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVulnerabilityTools(server, client, false);

    const result = await callTool(server, 'scan_all_vulnerabilities', { environmentId: 1 });
    expect(client.postJob).toHaveBeenCalledWith('/api/vulnerabilities/scan-all', undefined, { env: 1 });
    expect(result.content[0].text).toContain('job-1');
  });

  it('registers status and cancel tools for scan_all_vulnerabilities', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVulnerabilityTools(server, makeClient(), false);
    expect(hasTool(server, 'get_vulnerability_scan_status')).toBe(true);
    expect(hasTool(server, 'cancel_vulnerability_scan')).toBe(true);
  });

  it('get_vulnerability_scan_status calls client.get on the jobs endpoint', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue({ status: 'done' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVulnerabilityTools(server, client, false);

    await callTool(server, 'get_vulnerability_scan_status', { jobId: 'job-1' });
    expect(client.get).toHaveBeenCalledWith('/api/jobs/job-1');
  });
});

describe('registerVulnerabilityTools — readonly=true', () => {
  it('does not register scan_all_vulnerabilities but keeps list_vulnerabilities', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVulnerabilityTools(server, makeClient(), true);
    expect(hasTool(server, 'scan_all_vulnerabilities')).toBe(false);
    expect(hasTool(server, 'list_vulnerabilities')).toBe(true);
  });

  it('omits get_vulnerability_scan_status and cancel_vulnerability_scan when readonly', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVulnerabilityTools(server, makeClient(), true);
    expect(hasTool(server, 'get_vulnerability_scan_status')).toBe(false);
    expect(hasTool(server, 'cancel_vulnerability_scan')).toBe(false);
  });
});

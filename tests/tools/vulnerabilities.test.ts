// tests/tools/vulnerabilities.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerVulnerabilityTools } from '../../src/tools/vulnerabilities.js';
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

  it('scan_all_vulnerabilities posts with optional environmentId', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ scanned: 10 }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVulnerabilityTools(server, client, false);

    const result = await callTool(server, 'scan_all_vulnerabilities', { environmentId: 1 });
    expect(client.post).toHaveBeenCalledWith('/api/vulnerabilities/scan-all', undefined, { env: 1 });
    expect(result.content[0].text).toContain('scanned');
  });
});

describe('registerVulnerabilityTools — readonly=true', () => {
  it('does not register scan_all_vulnerabilities but keeps list_vulnerabilities', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerVulnerabilityTools(server, makeClient(), true);
    expect(hasTool(server, 'scan_all_vulnerabilities')).toBe(false);
    expect(hasTool(server, 'list_vulnerabilities')).toBe(true);
  });
});

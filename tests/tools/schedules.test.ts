// tests/tools/schedules.test.ts
import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { registerScheduleTools } from '../../src/tools/schedules.js';
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

describe('registerScheduleTools — read-only tool', () => {
  it('list_schedules calls /api/schedules with no params', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ id: 1, type: 'git_stack_sync' }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerScheduleTools(server, client, false);

    await callTool(server, 'list_schedules', {});
    expect(client.get).toHaveBeenCalledWith('/api/schedules');
  });
});

describe('registerScheduleTools — mutating tools when readonly=false', () => {
  it('registers run_schedule and toggle_schedule', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerScheduleTools(server, makeClient(), false);
    expect(hasTool(server, 'run_schedule')).toBe(true);
    expect(hasTool(server, 'toggle_schedule')).toBe(true);
  });

  it('run_schedule posts to the run endpoint by type and id', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ status: 'ok' }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerScheduleTools(server, client, false);

    await callTool(server, 'run_schedule', { scheduleType: 'git_stack_sync', scheduleId: 3 });
    expect(client.post).toHaveBeenCalledWith('/api/schedules/git_stack_sync/3/run');
  });

  it('toggle_schedule posts to the toggle endpoint by type and id', async () => {
    const client = makeClient({ post: vi.fn().mockResolvedValue({ success: true, enabled: false }) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerScheduleTools(server, client, false);

    const result = await callTool(server, 'toggle_schedule', { scheduleType: 'image_prune', scheduleId: 4 });
    expect(client.post).toHaveBeenCalledWith('/api/schedules/image_prune/4/toggle');
    expect(result.content[0].text).toContain('enabled');
  });
});

describe('registerScheduleTools — readonly=true', () => {
  it('does not register mutating tools but keeps list_schedules', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerScheduleTools(server, makeClient(), true);
    expect(hasTool(server, 'run_schedule')).toBe(false);
    expect(hasTool(server, 'toggle_schedule')).toBe(false);
    expect(hasTool(server, 'list_schedules')).toBe(true);
  });
});

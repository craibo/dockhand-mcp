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
  it('list_schedules strips execution details and logs by default', async () => {
    const execution = { id: 1, status: 'success', details: { big: 'x'.repeat(100) }, logs: 'noisy' };
    const client = makeClient({
      get: vi.fn().mockResolvedValue({
        schedules: [{ id: 1, type: 'image_prune', lastExecution: execution, recentExecutions: [execution] }]
      })
    });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerScheduleTools(server, client, false);

    const result = await callTool(server, 'list_schedules', {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.schedules[0].lastExecution).toEqual({ id: 1, status: 'success' });
    expect(parsed.schedules[0].recentExecutions).toEqual([{ id: 1, status: 'success' }]);
  });

  it('list_schedules keeps execution details when includeExecutionDetails is true', async () => {
    const execution = { id: 1, status: 'success', details: { a: 1 }, logs: 'noisy' };
    const client = makeClient({
      get: vi.fn().mockResolvedValue({ schedules: [{ id: 1, lastExecution: execution, recentExecutions: [] }] })
    });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerScheduleTools(server, client, false);

    const result = await callTool(server, 'list_schedules', { includeExecutionDetails: true });
    expect(JSON.parse(result.content[0].text).schedules[0].lastExecution).toEqual(execution);
  });

  it('list_schedules passes through unexpected response shapes untouched', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ id: 1 }]) });
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerScheduleTools(server, client, false);

    const result = await callTool(server, 'list_schedules', {});
    expect(JSON.parse(result.content[0].text)).toEqual([{ id: 1 }]);
  });

  it('toggle_schedule accepts the deploy_log_reconcile schedule type', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerScheduleTools(server, makeClient(), false);
    // @ts-expect-error accessing internal registry for direct unit testing
    const schema = server._registeredTools['toggle_schedule'].inputSchema;
    for (const scheduleType of ['deploy_log_reconcile', 'repo_prune', 'repo_check', 'repo_verify']) {
      expect(schema.safeParse({ scheduleType, scheduleId: 1 }).success).toBe(true);
    }
    expect(schema.safeParse({ scheduleType: 'bogus', scheduleId: 1 }).success).toBe(false);
  });

  it('does not register mutating tools but keeps list_schedules', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerScheduleTools(server, makeClient(), true);
    expect(hasTool(server, 'run_schedule')).toBe(false);
    expect(hasTool(server, 'toggle_schedule')).toBe(false);
    expect(hasTool(server, 'list_schedules')).toBe(true);
  });
});

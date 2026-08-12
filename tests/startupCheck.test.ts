// tests/startupCheck.test.ts
import { describe, it, expect, vi } from 'vitest';
import { checkDockhandConnectivity, MIN_DOCKHAND_VERSION } from '../src/startupCheck.js';
import { DockhandError, type DockhandClient } from '../src/dockhandClient.js';

function makeClient(overrides: Partial<DockhandClient> = {}): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn(), ...overrides };
}

describe('checkDockhandConnectivity', () => {
  it('logs success with the environment count when /api/environments responds', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) });
    const log = vi.fn();
    const error = vi.fn();

    const result = await checkDockhandConnectivity(client, { log, error });

    expect(client.get).toHaveBeenCalledWith('/api/environments');
    expect(result.ok).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Connected to Dockhand successfully'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('2 environment'));
    expect(error).not.toHaveBeenCalled();
  });

  it('handles a single environment without pluralizing', async () => {
    const client = makeClient({ get: vi.fn().mockResolvedValue([{ id: 1 }]) });
    const log = vi.fn();
    const error = vi.fn();

    await checkDockhandConnectivity(client, { log, error });

    expect(log).toHaveBeenCalledWith(expect.stringContaining('1 environment)'));
  });

  it('returns ok=false and logs an error when the request fails', async () => {
    const client = makeClient({ get: vi.fn().mockRejectedValue(new DockhandError(401, 'Invalid API token')) });
    const log = vi.fn();
    const error = vi.fn();

    const result = await checkDockhandConnectivity(client, { log, error });

    expect(result.ok).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to connect to Dockhand'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Invalid API token'));
  });

  it('returns ok=false and logs an error for a non-DockhandError failure (e.g. network error)', async () => {
    const client = makeClient({ get: vi.fn().mockRejectedValue(new Error('fetch failed')) });
    const log = vi.fn();
    const error = vi.fn();

    const result = await checkDockhandConnectivity(client, { log, error });

    expect(result.ok).toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('fetch failed'));
  });

  it('always logs the minimum supported Dockhand version notice, on success or failure', async () => {
    const okClient = makeClient({ get: vi.fn().mockResolvedValue([]) });
    const okLog = vi.fn();
    await checkDockhandConnectivity(okClient, { log: okLog, error: vi.fn() });
    expect(okLog).toHaveBeenCalledWith(expect.stringContaining(`Requires Dockhand >= ${MIN_DOCKHAND_VERSION}`));

    const failClient = makeClient({ get: vi.fn().mockRejectedValue(new Error('down')) });
    const failLog = vi.fn();
    await checkDockhandConnectivity(failClient, { log: failLog, error: vi.fn() });
    expect(failLog).toHaveBeenCalledWith(expect.stringContaining(`Requires Dockhand >= ${MIN_DOCKHAND_VERSION}`));
  });
});

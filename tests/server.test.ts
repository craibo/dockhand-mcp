// tests/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildServer } from '../src/server.js';
import type { DockhandClient } from '../src/dockhandClient.js';

function makeClient(): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn() };
}

function toolNames(server: ReturnType<typeof buildServer>): string[] {
  // @ts-expect-error accessing internal registry for direct unit testing
  return Object.keys(server._registeredTools);
}

describe('buildServer', () => {
  it('registers every read-only tool plus every mutating tool when readonly=false', () => {
    const server = buildServer(makeClient(), false);
    const names = toolNames(server);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_environments',
        'list_containers',
        'get_container',
        'get_container_logs',
        'start_container',
        'stop_container',
        'restart_container',
        'remove_container',
        'list_images',
        'pull_image',
        'remove_image',
        'list_volumes',
        'remove_volume',
        'list_networks',
        'list_stacks',
        'deploy_stack',
        'stop_stack'
      ])
    );
    expect(names).toHaveLength(17);
  });

  it('omits mutating tools when readonly=true', () => {
    const server = buildServer(makeClient(), true);
    const names = toolNames(server);
    expect(names).toEqual(
      expect.arrayContaining([
        'list_environments',
        'list_containers',
        'get_container',
        'get_container_logs',
        'list_images',
        'list_volumes',
        'list_networks',
        'list_stacks'
      ])
    );
    expect(names).toHaveLength(8);
  });
});

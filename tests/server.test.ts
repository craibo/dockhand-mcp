// tests/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildServer } from '../src/server.js';
import type { DockhandClient } from '../src/dockhandClient.js';
import type { Config } from '../src/config.js';

function makeClient(): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), del: vi.fn() };
}

function toolNames(server: ReturnType<typeof buildServer>): string[] {
  // @ts-expect-error accessing internal registry for direct unit testing
  return Object.keys(server._registeredTools);
}

function hasTool(server: ReturnType<typeof buildServer>, name: string): boolean {
  // @ts-expect-error accessing internal registry for direct unit testing
  return name in server._registeredTools;
}

const baseConfig: Config = {
  dockhandUrl: 'http://dockhand:3000',
  dockhandApiToken: 'dh_test',
  mcpAuthToken: 'secret',
  readonly: false,
  port: 8787,
  enableBackups: false,
  enableUsers: false,
  enableRegistries: false,
  enableVulnerabilities: false,
  enableGit: false,
  enableSchedules: false
};

describe('buildServer — core v1 tools', () => {
  it('registers every read-only tool plus every mutating tool when readonly=false', () => {
    const server = buildServer(makeClient(), baseConfig);
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
        'get_stack_deploy_status',
        'cancel_stack_deploy',
        'stop_stack',
        'get_stack_stop_status',
        'cancel_stack_stop'
      ])
    );
    expect(names).toHaveLength(21);
  });

  it('omits mutating tools when readonly=true', () => {
    const server = buildServer(makeClient(), { ...baseConfig, readonly: true });
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

const newDomainTools = [
  'list_backup_configs',
  'run_backup_config',
  'list_users',
  'list_roles',
  'list_registries',
  'list_vulnerabilities',
  'scan_all_vulnerabilities',
  'list_git_stacks',
  'deploy_git_stack',
  'list_schedules',
  'run_schedule'
];

describe('buildServer — default config', () => {
  it('registers none of the new domain tools when every toggle is false', () => {
    const server = buildServer(makeClient(), baseConfig);
    for (const name of newDomainTools) {
      expect(hasTool(server, name)).toBe(false);
    }
  });

  it('still registers the pre-existing v1 tools unaffected by new toggles', () => {
    const server = buildServer(makeClient(), baseConfig);
    expect(hasTool(server, 'list_environments')).toBe(true);
    expect(hasTool(server, 'list_containers')).toBe(true);
    expect(hasTool(server, 'list_stacks')).toBe(true);
  });
});

describe('buildServer — all toggles enabled', () => {
  it('registers every new domain tool when every toggle is true', () => {
    const server = buildServer(makeClient(), {
      ...baseConfig,
      enableBackups: true,
      enableUsers: true,
      enableRegistries: true,
      enableVulnerabilities: true,
      enableGit: true,
      enableSchedules: true
    });
    for (const name of newDomainTools) {
      expect(hasTool(server, name)).toBe(true);
    }
  });
});

describe('buildServer — per-domain toggle independence', () => {
  it('enabling only backups does not expose other new domains', () => {
    const server = buildServer(makeClient(), { ...baseConfig, enableBackups: true });
    expect(hasTool(server, 'list_backup_configs')).toBe(true);
    expect(hasTool(server, 'list_users')).toBe(false);
    expect(hasTool(server, 'list_registries')).toBe(false);
  });
});

describe('buildServer — readonly still gates mutating tools within an enabled domain', () => {
  it('readonly=true drops run_backup_config even when enableBackups=true', () => {
    const server = buildServer(makeClient(), { ...baseConfig, enableBackups: true, readonly: true });
    expect(hasTool(server, 'list_backup_configs')).toBe(true);
    expect(hasTool(server, 'run_backup_config')).toBe(false);
  });
});

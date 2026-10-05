// tests/server.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildServer } from '../src/server.js';
import type { DockhandClient } from '../src/dockhandClient.js';
import type { Config } from '../src/config.js';

function makeClient(): DockhandClient {
  return { get: vi.fn(), post: vi.fn(), postJob: vi.fn(), put: vi.fn(), del: vi.fn() };
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
  enableSchedules: false,
  enableExec: false
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
        'get_container_stats',
        'get_container_top',
        'start_container',
        'stop_container',
        'restart_container',
        'pause_container',
        'unpause_container',
        'rename_container',
        'remove_container',
        'list_images',
        'pull_image',
        'get_image_pull_status',
        'cancel_image_pull',
        'remove_image',
        'list_volumes',
        'remove_volume',
        'list_networks',
        'list_stacks',
        'list_pending_updates',
        'check_container_updates',
        'get_container_update_check_status',
        'cancel_container_update_check',
        'update_container',
        'batch_update_containers',
        'deploy_stack',
        'get_stack_deploy_status',
        'cancel_stack_deploy',
        'down_stack',
        'get_stack_down_status',
        'cancel_stack_down',
        'start_stack',
        'stop_stack',
        'restart_stack',
        'get_stack_lifecycle_status',
        'cancel_stack_lifecycle',
        'get_stack_env',
        'set_stack_secret',
        'get_stack_env_file',
        'set_stack_env_file'
      ])
    );
    expect(names).toHaveLength(43);
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
        'get_container_stats',
        'get_container_top',
        'list_images',
        'get_image_pull_status',
        'list_volumes',
        'list_networks',
        'list_stacks',
        'list_pending_updates',
        'get_container_update_check_status',
        'get_stack_deploy_status',
        'get_stack_down_status',
        'get_stack_lifecycle_status',
        'get_stack_env',
        'get_stack_env_file'
      ])
    );
    expect(names).toHaveLength(18);
  });
});

const newDomainTools = [
  'list_backup_configs',
  'run_backup_config',
  'get_backup_run_status',
  'cancel_backup_run',
  'list_users',
  'list_roles',
  'list_registries',
  'list_vulnerabilities',
  'scan_all_vulnerabilities',
  'get_vulnerability_scan_status',
  'cancel_vulnerability_scan',
  'list_git_stacks',
  'deploy_git_stack',
  'get_git_deploy_status',
  'cancel_git_deploy',
  'list_schedules',
  'run_schedule',
  'exec_container'
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
      enableSchedules: true,
      enableExec: true
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

describe('buildServer — exec toggle', () => {
  it('registers exec_container only when enableExec=true and not readonly', () => {
    expect(hasTool(buildServer(makeClient(), baseConfig), 'exec_container')).toBe(false);
    expect(hasTool(buildServer(makeClient(), { ...baseConfig, enableExec: true }), 'exec_container')).toBe(true);
    expect(
      hasTool(buildServer(makeClient(), { ...baseConfig, enableExec: true, readonly: true }), 'exec_container')
    ).toBe(false);
  });
});

describe('buildServer — readonly still gates mutating tools within an enabled domain', () => {
  it('readonly=true drops run_backup_config even when enableBackups=true', () => {
    const server = buildServer(makeClient(), { ...baseConfig, enableBackups: true, readonly: true });
    expect(hasTool(server, 'list_backup_configs')).toBe(true);
    expect(hasTool(server, 'run_backup_config')).toBe(false);
    expect(hasTool(server, 'get_backup_run_status')).toBe(true);
    expect(hasTool(server, 'cancel_backup_run')).toBe(false);
  });
});

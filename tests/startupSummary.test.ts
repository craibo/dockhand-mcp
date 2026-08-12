// tests/startupSummary.test.ts
import { describe, it, expect, vi } from 'vitest';
import { logStartupSummary } from '../src/startupSummary.js';
import type { Config } from '../src/config.js';

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

describe('logStartupSummary', () => {
  it('logs status and readonly as the first two lines', () => {
    const log = vi.fn();
    logStartupSummary(baseConfig, true, { log });

    expect(log.mock.calls[1][0]).toContain('Status:');
    expect(log.mock.calls[1][0]).toContain('connected');
    expect(log.mock.calls[2][0]).toContain('Readonly:');
    expect(log.mock.calls[2][0]).toContain('disabled');
  });

  it('reports status as not connected when connectivity failed', () => {
    const log = vi.fn();
    logStartupSummary(baseConfig, false, { log });

    expect(log.mock.calls[1][0]).toContain('not connected');
  });

  it('reports readonly as enabled when true', () => {
    const log = vi.fn();
    logStartupSummary({ ...baseConfig, readonly: true }, true, { log });

    expect(log.mock.calls[2][0]).toContain('enabled');
  });

  it('lists all 6 domain categories with disabled status by default', () => {
    const log = vi.fn();
    logStartupSummary(baseConfig, true, { log });

    const output = log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Backups: disabled');
    expect(output).toContain('Users/Roles: disabled');
    expect(output).toContain('Registries: disabled');
    expect(output).toContain('Vulnerabilities: disabled');
    expect(output).toContain('Git deploy: disabled');
    expect(output).toContain('Schedules: disabled');
  });

  it('reflects enabled domains individually', () => {
    const log = vi.fn();
    logStartupSummary(
      { ...baseConfig, enableBackups: true, enableGit: true },
      true,
      { log }
    );

    const output = log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Backups: enabled');
    expect(output).toContain('Git deploy: enabled');
    expect(output).toContain('Users/Roles: disabled');
    expect(output).toContain('Registries: disabled');
    expect(output).toContain('Vulnerabilities: disabled');
    expect(output).toContain('Schedules: disabled');
  });

  it('reflects all domains enabled', () => {
    const log = vi.fn();
    logStartupSummary(
      {
        ...baseConfig,
        enableBackups: true,
        enableUsers: true,
        enableRegistries: true,
        enableVulnerabilities: true,
        enableGit: true,
        enableSchedules: true
      },
      true,
      { log }
    );

    const categoryLines = log.mock.calls.slice(3).map((c) => c[0]);
    expect(categoryLines.some((line) => line.includes('disabled'))).toBe(false);
  });
});

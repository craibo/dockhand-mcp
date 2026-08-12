import { describe, it, expect, vi } from 'vitest';
import { loadConfig, ConfigError } from '../src/config.js';

const baseEnv = {
  DOCKHAND_URL: 'http://dockhand:3000',
  DOCKHAND_API_TOKEN: 'dh_testtoken',
  MCP_AUTH_TOKEN: 'secret123'
};

describe('loadConfig', () => {
  it('loads a valid config with defaults', () => {
    const config = loadConfig(baseEnv as NodeJS.ProcessEnv);
    expect(config).toEqual({
      dockhandUrl: 'http://dockhand:3000',
      dockhandApiToken: 'dh_testtoken',
      mcpAuthToken: 'secret123',
      readonly: false,
      port: 8787,
      enableBackups: false,
      enableUsers: false,
      enableRegistries: false,
      enableVulnerabilities: false,
      enableGit: false,
      enableSchedules: false
    });
  });

  it('defaults all domain toggles to false when unset', () => {
    const config = loadConfig(baseEnv as NodeJS.ProcessEnv);
    expect(config.enableBackups).toBe(false);
    expect(config.enableUsers).toBe(false);
    expect(config.enableRegistries).toBe(false);
    expect(config.enableVulnerabilities).toBe(false);
    expect(config.enableGit).toBe(false);
    expect(config.enableSchedules).toBe(false);
  });

  it('parses each DOCKHAND_MCP_ENABLE_* toggle independently', () => {
    const config = loadConfig({
      ...baseEnv,
      DOCKHAND_MCP_ENABLE_BACKUPS: 'true',
      DOCKHAND_MCP_ENABLE_VULNERABILITIES: 'true'
    } as NodeJS.ProcessEnv);
    expect(config.enableBackups).toBe(true);
    expect(config.enableVulnerabilities).toBe(true);
    expect(config.enableUsers).toBe(false);
    expect(config.enableRegistries).toBe(false);
    expect(config.enableGit).toBe(false);
    expect(config.enableSchedules).toBe(false);
  });

  it('parses DOCKHAND_MCP_READONLY=true', () => {
    const config = loadConfig({ ...baseEnv, DOCKHAND_MCP_READONLY: 'true' } as NodeJS.ProcessEnv);
    expect(config.readonly).toBe(true);
  });

  it('parses a custom PORT', () => {
    const config = loadConfig({ ...baseEnv, PORT: '9000' } as NodeJS.ProcessEnv);
    expect(config.port).toBe(9000);
  });

  it('reads the token from DOCKHAND_API_TOKEN_FILE when set', () => {
    const readFileSync = vi.fn().mockReturnValue('dh_fromfile\n');
    const env = { ...baseEnv, DOCKHAND_API_TOKEN: undefined, DOCKHAND_API_TOKEN_FILE: '/run/secrets/token' };
    const config = loadConfig(env as unknown as NodeJS.ProcessEnv, readFileSync);
    expect(config.dockhandApiToken).toBe('dh_fromfile');
    expect(readFileSync).toHaveBeenCalledWith('/run/secrets/token', 'utf-8');
  });

  it('throws ConfigError when DOCKHAND_URL is missing', () => {
    const { DOCKHAND_URL, ...rest } = baseEnv;
    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('throws ConfigError when MCP_AUTH_TOKEN is missing', () => {
    const { MCP_AUTH_TOKEN, ...rest } = baseEnv;
    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('throws ConfigError when neither DOCKHAND_API_TOKEN nor DOCKHAND_API_TOKEN_FILE is set', () => {
    const { DOCKHAND_API_TOKEN, ...rest } = baseEnv;
    expect(() => loadConfig(rest as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('throws ConfigError when both DOCKHAND_API_TOKEN and DOCKHAND_API_TOKEN_FILE are set', () => {
    const env = { ...baseEnv, DOCKHAND_API_TOKEN_FILE: '/run/secrets/token' };
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('throws ConfigError when PORT is non-numeric', () => {
    const env = { ...baseEnv, PORT: 'abc' };
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('throws ConfigError when PORT has trailing non-numeric content', () => {
    const env = { ...baseEnv, PORT: '80abc' };
    expect(() => loadConfig(env as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it('accepts a valid numeric PORT', () => {
    const config = loadConfig({ ...baseEnv, PORT: '9000' } as NodeJS.ProcessEnv);
    expect(config.port).toBe(9000);
  });

  it('throws ConfigError (not the raw error) when DOCKHAND_API_TOKEN_FILE cannot be read', () => {
    const readFileSync = vi.fn().mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    const env = { ...baseEnv, DOCKHAND_API_TOKEN: undefined, DOCKHAND_API_TOKEN_FILE: '/run/secrets/missing' };
    expect(() => loadConfig(env as unknown as NodeJS.ProcessEnv, readFileSync)).toThrow(ConfigError);
  });

  it('treats an empty MCP_ALLOWED_HOSTS as unset', () => {
    const config = loadConfig({ ...baseEnv, MCP_ALLOWED_HOSTS: '' } as NodeJS.ProcessEnv);
    expect(config.allowedHosts).toBeUndefined();
  });

  it('treats a whitespace-only MCP_ALLOWED_HOSTS as unset', () => {
    const config = loadConfig({ ...baseEnv, MCP_ALLOWED_HOSTS: '   ' } as NodeJS.ProcessEnv);
    expect(config.allowedHosts).toBeUndefined();
  });

  it('filters out empty entries from MCP_ALLOWED_HOSTS', () => {
    const config = loadConfig({ ...baseEnv, MCP_ALLOWED_HOSTS: 'host1,,host2' } as NodeJS.ProcessEnv);
    expect(config.allowedHosts).toEqual(['host1', 'host2']);
  });

  it('parses a normal MCP_ALLOWED_HOSTS list', () => {
    const config = loadConfig({ ...baseEnv, MCP_ALLOWED_HOSTS: 'host1,host2' } as NodeJS.ProcessEnv);
    expect(config.allowedHosts).toEqual(['host1', 'host2']);
  });
});

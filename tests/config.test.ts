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
      port: 8787
    });
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
});

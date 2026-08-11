import fs from 'node:fs';

export interface Config {
  dockhandUrl: string;
  dockhandApiToken: string;
  mcpAuthToken: string;
  readonly: boolean;
  port: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(
  env: NodeJS.ProcessEnv,
  readFileSync: (path: string, encoding: 'utf-8') => string = fs.readFileSync as typeof fs.readFileSync
): Config {
  const dockhandUrl = env.DOCKHAND_URL;
  if (!dockhandUrl) {
    throw new ConfigError('DOCKHAND_URL is required');
  }

  const mcpAuthToken = env.MCP_AUTH_TOKEN;
  if (!mcpAuthToken) {
    throw new ConfigError('MCP_AUTH_TOKEN is required');
  }

  const hasToken = Boolean(env.DOCKHAND_API_TOKEN);
  const hasTokenFile = Boolean(env.DOCKHAND_API_TOKEN_FILE);
  if (hasToken === hasTokenFile) {
    throw new ConfigError(
      'Exactly one of DOCKHAND_API_TOKEN or DOCKHAND_API_TOKEN_FILE must be set'
    );
  }

  const dockhandApiToken = hasToken
    ? (env.DOCKHAND_API_TOKEN as string)
    : readFileSync(env.DOCKHAND_API_TOKEN_FILE as string, 'utf-8').trim();

  return {
    dockhandUrl,
    dockhandApiToken,
    mcpAuthToken,
    readonly: env.DOCKHAND_MCP_READONLY === 'true',
    port: env.PORT ? parseInt(env.PORT, 10) : 8787
  };
}

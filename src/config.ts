import fs from 'node:fs';

export interface Config {
  dockhandUrl: string;
  dockhandApiToken: string;
  mcpAuthToken: string;
  readonly: boolean;
  port: number;
  allowedHosts?: string[];
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

  let dockhandApiToken: string;
  if (hasToken) {
    dockhandApiToken = env.DOCKHAND_API_TOKEN as string;
  } else {
    const tokenFilePath = env.DOCKHAND_API_TOKEN_FILE as string;
    try {
      dockhandApiToken = readFileSync(tokenFilePath, 'utf-8').trim();
    } catch (err) {
      const originalMessage = err instanceof Error ? err.message : String(err);
      throw new ConfigError(
        `Could not read DOCKHAND_API_TOKEN_FILE at "${tokenFilePath}": ${originalMessage}`
      );
    }
  }

  let port = 8787;
  if (env.PORT) {
    const parsedPort = Number(env.PORT);
    if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      throw new ConfigError(`PORT must be a positive integer between 1 and 65535, got "${env.PORT}"`);
    }
    port = parsedPort;
  }

  const allowedHosts = env.MCP_ALLOWED_HOSTS
    ?.split(',')
    .map((h) => h.trim())
    .filter((h) => h.length > 0);
  const resolvedAllowedHosts = allowedHosts && allowedHosts.length > 0 ? allowedHosts : undefined;

  return {
    dockhandUrl,
    dockhandApiToken,
    mcpAuthToken,
    readonly: env.DOCKHAND_MCP_READONLY === 'true',
    port,
    allowedHosts: resolvedAllowedHosts
  };
}

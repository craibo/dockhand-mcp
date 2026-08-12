// src/app.ts
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Express } from 'express';
import type { Config } from './config.js';
import { createDockhandClient } from './dockhandClient.js';
import { buildServer } from './server.js';
import { requireMcpAuthToken } from './auth.js';

export function createApp(config: Config): Express {
  const client = createDockhandClient(config);
  const app = createMcpExpressApp({ host: '0.0.0.0', allowedHosts: config.allowedHosts });

  const node = toNodeHandler(createMcpHandler(() => buildServer(client, config)));

  app.all('/mcp', requireMcpAuthToken(config.mcpAuthToken), (req, res) => void node(req, res, req.body));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

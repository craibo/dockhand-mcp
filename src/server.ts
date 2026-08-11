// src/server.ts
import { McpServer } from '@modelcontextprotocol/server';
import type { DockhandClient } from './dockhandClient.js';
import { registerEnvironmentTools } from './tools/environments.js';
import { registerContainerTools } from './tools/containers.js';
import { registerImageTools } from './tools/images.js';
import { registerVolumeTools } from './tools/volumes.js';
import { registerNetworkTools } from './tools/networks.js';
import { registerStackTools } from './tools/stacks.js';

export function buildServer(client: DockhandClient, readonly: boolean): McpServer {
  const server = new McpServer({ name: 'dockhand-mcp', version: '0.1.0' });

  registerEnvironmentTools(server, client);
  registerContainerTools(server, client, readonly);
  registerImageTools(server, client, readonly);
  registerVolumeTools(server, client, readonly);
  registerNetworkTools(server, client);
  registerStackTools(server, client, readonly);

  return server;
}

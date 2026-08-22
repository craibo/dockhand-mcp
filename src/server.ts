// src/server.ts
import { McpServer } from '@modelcontextprotocol/server';
import type { Config } from './config.js';
import type { DockhandClient } from './dockhandClient.js';
import { registerEnvironmentTools } from './tools/environments.js';
import { registerContainerTools } from './tools/containers.js';
import { registerImageTools } from './tools/images.js';
import { registerVolumeTools } from './tools/volumes.js';
import { registerNetworkTools } from './tools/networks.js';
import { registerStackTools } from './tools/stacks.js';
import { registerBackupTools } from './tools/backups.js';
import { registerUserTools } from './tools/users.js';
import { registerRegistryTools } from './tools/registries.js';
import { registerVulnerabilityTools } from './tools/vulnerabilities.js';
import { registerGitTools } from './tools/git.js';
import { registerScheduleTools } from './tools/schedules.js';

export function buildServer(client: DockhandClient, config: Config): McpServer {
  const server = new McpServer({ name: 'dockhand-mcp', version: '0.4.0' });

  registerEnvironmentTools(server, client);
  registerContainerTools(server, client, config.readonly);
  registerImageTools(server, client, config.readonly);
  registerVolumeTools(server, client, config.readonly);
  registerNetworkTools(server, client);
  registerStackTools(server, client, config.readonly);

  if (config.enableBackups) {
    registerBackupTools(server, client, config.readonly);
  }
  if (config.enableUsers) {
    registerUserTools(server, client);
  }
  if (config.enableRegistries) {
    registerRegistryTools(server, client);
  }
  if (config.enableVulnerabilities) {
    registerVulnerabilityTools(server, client, config.readonly);
  }
  if (config.enableGit) {
    registerGitTools(server, client, config.readonly);
  }
  if (config.enableSchedules) {
    registerScheduleTools(server, client, config.readonly);
  }

  return server;
}

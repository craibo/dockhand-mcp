// src/startupSummary.ts
import type { Config } from './config.js';

export interface StartupSummaryLogger {
  log: (message: string) => void;
}

interface DomainCategory {
  label: string;
  enabled: boolean;
}

export function logStartupSummary(
  config: Config,
  connected: boolean,
  logger: StartupSummaryLogger
): void {
  const categories: DomainCategory[] = [
    { label: 'Backups', enabled: config.enableBackups },
    { label: 'Users/Roles', enabled: config.enableUsers },
    { label: 'Registries', enabled: config.enableRegistries },
    { label: 'Vulnerabilities', enabled: config.enableVulnerabilities },
    { label: 'Git deploy', enabled: config.enableGit },
    { label: 'Schedules', enabled: config.enableSchedules }
  ];

  logger.log('dockhand-mcp startup summary:');
  logger.log(`  Status:   ${connected ? 'connected' : 'not connected'}`);
  logger.log(`  Readonly: ${config.readonly ? 'enabled' : 'disabled'}`);
  logger.log('  Tool categories:');
  for (const category of categories) {
    logger.log(`    - ${category.label}: ${category.enabled ? 'enabled' : 'disabled'}`);
  }
}

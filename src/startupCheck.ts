// src/startupCheck.ts
import { DockhandError, type DockhandClient } from './dockhandClient.js';

// Dockhand does not expose its own app version through a public REST endpoint
// (only per-environment Docker daemon version, and an opt-in Prometheus
// /metrics endpoint) — this is a documented minimum, not something callable
// at runtime. It reflects the oldest Dockhand release confirmed to expose
// every REST route this sidecar's tools depend on, including the extended
// (backups/users/registries/vulnerabilities/git/schedules) domains.
export const MIN_DOCKHAND_VERSION = '1.0.41';

export interface StartupLogger {
  log: (message: string) => void;
  error: (message: string) => void;
}

export interface ConnectivityResult {
  ok: boolean;
}

export async function checkDockhandConnectivity(
  client: DockhandClient,
  logger: StartupLogger
): Promise<ConnectivityResult> {
  let result: ConnectivityResult;

  try {
    const environments = await client.get<unknown[]>('/api/environments');
    const count = environments.length;
    const noun = count === 1 ? 'environment' : 'environments';
    logger.log(`Connected to Dockhand successfully (${count} ${noun})`);
    result = { ok: true };
  } catch (error) {
    const message = error instanceof DockhandError ? `${error.message} (status ${error.status})` : String(error instanceof Error ? error.message : error);
    logger.error(`Failed to connect to Dockhand: ${message}`);
    result = { ok: false };
  }

  logger.log(`Requires Dockhand >= ${MIN_DOCKHAND_VERSION} — version not verifiable via API, upgrade Dockhand if tools fail unexpectedly`);

  return result;
}

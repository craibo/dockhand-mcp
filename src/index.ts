// src/index.ts
import { loadConfig, ConfigError } from './config.js';
import { createApp } from './app.js';
import { createDockhandClient } from './dockhandClient.js';
import { checkDockhandConnectivity } from './startupCheck.js';

try {
  const config = loadConfig(process.env);

  console.log(`Connecting to Dockhand at ${config.dockhandUrl} ...`);
  const client = createDockhandClient(config);
  await checkDockhandConnectivity(client, { log: console.log, error: console.error });

  const app = createApp(config);
  app.listen(config.port, () => {
    console.log(`dockhand-mcp listening on :${config.port} (readonly=${config.readonly})`);
  });
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`Configuration error: ${error.message}`);
  } else {
    console.error('Failed to start dockhand-mcp:', error);
  }
  process.exit(1);
}

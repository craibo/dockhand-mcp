// src/index.ts
import { loadConfig, ConfigError } from './config.js';
import { createApp } from './app.js';

try {
  const config = loadConfig(process.env);
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

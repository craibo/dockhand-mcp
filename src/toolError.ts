import type { CallToolResult } from '@modelcontextprotocol/server';
import { DockhandError } from './dockhandClient.js';

export type McpToolResult = CallToolResult;

const REDACTED_KEYS = new Set(['resolvedSecrets']);
const REDACTED_PLACEHOLDER = '[REDACTED]';

// Container inspect output carries env as ["KEY=value", ...]. Key names alone can't tell
// which values are sensitive (e.g. DATABASE_URL embeds a password), so every value is masked.
const ENV_ARRAY_KEYS = new Set(['Env']);

function maskEnvEntry(entry: unknown): unknown {
  if (typeof entry !== 'string') return redactSecrets(entry);
  const eq = entry.indexOf('=');
  return eq === -1 ? entry : `${entry.slice(0, eq)}=${REDACTED_PLACEHOLDER}`;
}

export function redactSecrets(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => redactSecrets(item));
  }
  if (data !== null && typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (REDACTED_KEYS.has(key)) {
        result[key] = REDACTED_PLACEHOLDER;
      } else if (ENV_ARRAY_KEYS.has(key) && Array.isArray(value)) {
        result[key] = value.map(maskEnvEntry);
      } else {
        result[key] = redactSecrets(value);
      }
    }
    return result;
  }
  return data;
}

export function toErrorResult(error: unknown): McpToolResult {
  let text: string;
  if (error instanceof DockhandError) {
    text = `Dockhand API error (${error.status}): ${error.message}`;
    if (error.details) {
      text += ` — ${error.details}`;
    }
  } else if (error instanceof Error) {
    text = error.message;
  } else {
    text = String(error);
  }
  return { content: [{ type: 'text', text }], isError: true };
}

export function toTextResult(data: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(redactSecrets(data), null, 2) }] };
}

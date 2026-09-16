import type { CallToolResult } from '@modelcontextprotocol/server';
import { DockhandError } from './dockhandClient.js';

export type McpToolResult = CallToolResult;

const REDACTED_KEYS = new Set(['resolvedSecrets']);
const REDACTED_PLACEHOLDER = '[REDACTED]';

export function redactSecrets(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => redactSecrets(item));
  }
  if (data !== null && typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = REDACTED_KEYS.has(key) ? REDACTED_PLACEHOLDER : redactSecrets(value);
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
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

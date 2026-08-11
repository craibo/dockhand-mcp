import { DockhandError } from './dockhandClient.js';

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
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

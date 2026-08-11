import { describe, it, expect } from 'vitest';
import { toErrorResult, toTextResult } from '../src/toolError.js';
import { DockhandError } from '../src/dockhandClient.js';

describe('toErrorResult', () => {
  it('formats a DockhandError with details', () => {
    const result = toErrorResult(new DockhandError(403, 'Permission denied', 'missing containers:start'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Dockhand API error (403): Permission denied — missing containers:start');
  });

  it('formats a DockhandError without details', () => {
    const result = toErrorResult(new DockhandError(404, 'Container not found'));
    expect(result.content[0].text).toBe('Dockhand API error (404): Container not found');
  });

  it('formats a generic Error', () => {
    const result = toErrorResult(new Error('boom'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('boom');
  });

  it('formats a non-Error thrown value', () => {
    const result = toErrorResult('plain string failure');
    expect(result.content[0].text).toBe('plain string failure');
  });
});

describe('toTextResult', () => {
  it('JSON-stringifies the payload', () => {
    const result = toTextResult({ success: true, id: 'abc' });
    expect(result.isError).toBeUndefined();
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ success: true, id: 'abc' }, null, 2) }]);
  });
});

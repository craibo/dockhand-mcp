import { describe, it, expect } from 'vitest';
import { toErrorResult, toTextResult, redactSecrets } from '../src/toolError.js';
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

describe('redactSecrets', () => {
  it('replaces a top-level resolvedSecrets array with a placeholder', () => {
    const input = { success: true, resolvedSecrets: ['sk-abc123', 'db-pass'] };
    expect(redactSecrets(input)).toEqual({ success: true, resolvedSecrets: '[REDACTED]' });
  });

  it('replaces a nested resolvedSecrets field regardless of depth', () => {
    const input = {
      id: 'job-1',
      result: {
        success: true,
        output: 'deploy log',
        resolvedSecrets: ['sk-abc123']
      }
    };
    expect(redactSecrets(input)).toEqual({
      id: 'job-1',
      result: {
        success: true,
        output: 'deploy log',
        resolvedSecrets: '[REDACTED]'
      }
    });
  });

  it('redacts resolvedSecrets inside array elements', () => {
    const input = {
      jobs: [
        { id: 1, resolvedSecrets: ['a'] },
        { id: 2, resolvedSecrets: ['b'] }
      ]
    };
    expect(redactSecrets(input)).toEqual({
      jobs: [
        { id: 1, resolvedSecrets: '[REDACTED]' },
        { id: 2, resolvedSecrets: '[REDACTED]' }
      ]
    });
  });

  it('leaves payloads with no denylisted keys unchanged', () => {
    const input = { success: true, id: 'abc', nested: { count: 3 } };
    expect(redactSecrets(input)).toEqual({ success: true, id: 'abc', nested: { count: 3 } });
  });

  it('does not redact keys that merely contain "secret" but are not denylisted', () => {
    const input = { secretCount: 3, hasSecretConfig: true };
    expect(redactSecrets(input)).toEqual({ secretCount: 3, hasSecretConfig: true });
  });

  it('handles primitives and null without throwing', () => {
    expect(redactSecrets('a string')).toBe('a string');
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(null)).toBe(null);
    expect(redactSecrets(undefined)).toBe(undefined);
  });
});

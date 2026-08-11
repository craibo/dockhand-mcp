import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireMcpAuthToken } from '../src/auth.js';

function makeReqRes(authHeader?: string) {
  const req = { headers: authHeader ? { authorization: authHeader } : {} } as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as unknown as Response;
  const next = vi.fn();
  return { req, res, next };
}

describe('requireMcpAuthToken', () => {
  it('calls next() when the bearer token matches', () => {
    const middleware = requireMcpAuthToken('secret123');
    const { req, res, next } = makeReqRes('Bearer secret123');
    middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 401 when the header is missing', () => {
    const middleware = requireMcpAuthToken('secret123');
    const { req, res, next } = makeReqRes(undefined);
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('responds 401 when the token does not match', () => {
    const middleware = requireMcpAuthToken('secret123');
    const { req, res, next } = makeReqRes('Bearer wrong');
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('responds 401 when the scheme is not Bearer', () => {
    const middleware = requireMcpAuthToken('secret123');
    const { req, res, next } = makeReqRes('Basic secret123');
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

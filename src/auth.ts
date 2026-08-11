import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function requireMcpAuthToken(expectedToken: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || token !== expectedToken) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}

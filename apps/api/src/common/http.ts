import type { Request } from 'express';

/** IP do cliente (Express resolve X-Forwarded-For quando `trust proxy` está ligado). */
export const clientIp = (req: Request): string | null => {
  const ip = req.ip ?? req.socket.remoteAddress ?? null;
  return ip ? ip.replace(/^::ffff:/, '') : null;
};

export const userAgent = (req: Request): string | null => {
  const ua = req.headers['user-agent'];
  return ua ? ua.slice(0, 300) : null;
};

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export const requestMeta = (req: Request): RequestMeta => ({ ip: clientIp(req), userAgent: userAgent(req) });

export const SESSION_COOKIE = 'pn_session';
export const CSRF_COOKIE = 'pn_csrf';
export const CSRF_HEADER = 'x-csrf-token';

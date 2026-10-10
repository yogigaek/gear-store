import type { Request } from 'express';

/**
 * The visitor's address for rate limits. Behind Vercel → Cloudflare → Render no fixed proxy count is right for
 * every path (X-Forwarded-For also carries whatever the visitor sent), so in production the address is read
 * from headers the infrastructure itself sets, in the configured order: Vercel's x-vercel-forwarded-for for
 * traffic through the web app, Cloudflare's true-client-ip for calls straight to Render. Without configured
 * headers (local, CI) Express's req.ip is used.
 */
export function clientIp(req: Request, headers: readonly string[]): string {
  for (const name of headers) {
    const raw = req.headers[name];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
    if (value) return value;
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

import { createHash, timingSafeEqual } from 'node:crypto';
import { isIPv6 } from 'node:net';
import type { Request } from 'express';

/** Set by the web app's proxy (apps/web/vercel.json) on every /api request it forwards. */
export const PROXY_SECRET_HEADER = 'x-rakit-proxy';
/** Vercel's visitor address: true only for requests that came through the web app's proxy. */
const PROXY_CLIENT_IP_HEADER = 'x-vercel-forwarded-for';

/**
 * The visitor's address for rate limits, an IPv6 one as its /64. Behind Vercel → Cloudflare → Render no fixed
 * proxy count is right for every path (X-Forwarded-For also carries whatever the visitor sent), so in production
 * the address is read from headers the infrastructure itself sets, in the configured order: Vercel's
 * x-vercel-forwarded-for for traffic through the web app, Cloudflare's true-client-ip for calls straight to
 * Render. Without configured headers (local, CI) Express's req.ip is used.
 * With `proxySecret` set, x-vercel-forwarded-for counts only on requests carrying it: direct callers can write it.
 */
export function clientIp(req: Request, headers: readonly string[], proxySecret?: string): string {
  const viaProxy = proxySecret === undefined || sameSecret(req.headers[PROXY_SECRET_HEADER], proxySecret);
  for (const name of headers) {
    if (name === PROXY_CLIENT_IP_HEADER && !viaProxy) continue;
    const raw = req.headers[name];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
    if (value) return networkOf(value);
  }
  return networkOf(req.ip ?? req.socket.remoteAddress ?? 'unknown');
}

/** One key per network: IPv4 written as IPv6 becomes IPv4, and IPv6 its /64, which one subscriber gets whole. */
function networkOf(address: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return mapped[1]!;
  if (!isIPv6(address)) return address;
  const [head = '', tail] = address.split('%')[0]!.split('::');
  const groups = head ? head.split(':') : [];
  if (tail !== undefined) {
    const rest = tail ? tail.split(':') : [];
    // an IPv4 tail (::ffff:… aside, e.g. 64:ff9b::1.2.3.4) fills two groups
    const width = rest.reduce((n, g) => n + (g.includes('.') ? 2 : 1), 0);
    groups.push(...Array<string>(8 - groups.length - width).fill('0'), ...rest);
  }
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')}::/64`;
}

/** Constant time, whatever was sent: both sides are hashed to one length first. */
function sameSecret(sent: string | string[] | undefined, secret: string): boolean {
  if (typeof sent !== 'string') return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(sent), digest(secret));
}

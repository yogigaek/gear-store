import { MAX_CART_LINES, MAX_LINE_QUANTITY, type CartLineInput } from '@gear-store/shared';

// A small stand-in for apps/api, following its rules where the app depends on them: refresh tokens rotate (one
// presented again within two minutes gets a fresh pair, later it is refused), a merge key counts once, carts hold
// 50 lines of up to 10, and unknown parts or finishes are resolved as CartService.resolve does.

export const BASE = 'http://api.test/api';

export const USERS = {
  a: { id: '11111111-1111-4111-8111-111111111111', email: 'a@rakit.test' },
  b: { id: '22222222-2222-4222-8222-222222222222', email: 'b@rakit.test' },
} as const;

interface Product {
  slug: string;
  colors: string[];
}

export const PRODUCTS: Product[] = [
  { slug: 'e1-frame-m', colors: ['signal', 'graphite', 'ember'] },
  { slug: 'e1-fork-160', colors: [] },
  { slug: 'folding-lock', colors: [] },
  ...Array.from({ length: 60 }, (_, i) => ({ slug: `part-${i}`, colors: [] })),
];

export interface Logged {
  method: string;
  path: string;
  userId: string | null;
  body: unknown;
}

type Reply = { status: number; body?: unknown };

interface Gate {
  /** held until this settles; `after`: the server has applied the request, only the reply is held */
  wait: Promise<void>;
  after: boolean;
  /** the reply never arrives (connection lost) */
  drop?: boolean;
  /** replaces the server's answer */
  reply?: Reply;
}

export function deferred() {
  let resolve!: () => void;
  const wait = new Promise<void>((r) => (resolve = r));
  return { wait, resolve };
}

export function createServer() {
  let counter = 0;
  const token = (prefix: string) => `${prefix}${++counter}`.padEnd(43, 'x');
  const refreshTokens = new Map<string, { userId: string; family: number; usedAt: number | null }>();
  const revokedFamilies = new Set<number>();
  const accessTokens = new Map<string, string>();
  const expired = new Set<string>();
  const carts = new Map<string, CartLineInput[]>();
  const mergeKeys = new Set<string>();
  const gates = new Map<string, Gate[]>();
  const log: Logged[] = [];
  let families = 0;
  let now = 0;

  const product = (slug: string) => PRODUCTS.find((p) => p.slug === slug);
  const finish = (p: Product, colorKey: string) =>
    p.colors.length === 0 ? '' : p.colors.includes(colorKey) ? colorKey : p.colors[0]!;

  function issue(userId: string, family = ++families) {
    const refreshToken = token('r');
    const accessToken = token('a');
    refreshTokens.set(refreshToken, { userId, family, usedAt: null });
    accessTokens.set(accessToken, userId);
    const user = Object.values(USERS).find((u) => u.id === userId)!;
    return {
      accessToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        name: 'Rider',
        role: 'CUSTOMER',
        emailVerified: true,
        isDemo: false,
      },
      refreshToken,
      refreshExpiresAt: new Date(Date.UTC(2030, 0, 1)).toISOString(),
    };
  }

  function resolve(lines: CartLineInput[]) {
    const joined = new Map<string, CartLineInput>();
    for (const l of lines) {
      const p = product(l.slug);
      if (!p || l.quantity <= 0) continue;
      const colorKey = finish(p, l.colorKey);
      const id = `${p.slug}:${colorKey}`;
      const quantity = Math.min(MAX_LINE_QUANTITY, (joined.get(id)?.quantity ?? 0) + l.quantity);
      joined.set(id, { slug: p.slug, colorKey, quantity });
    }
    return [...joined.values()].slice(0, MAX_CART_LINES);
  }

  function priced(lines: CartLineInput[]) {
    const items = lines.map((l) => ({
      product: {
        slug: l.slug,
        name: l.slug,
        model: l.slug.toUpperCase(),
        category: 'parts',
        module: 'ACCESSORY',
        price: 100_000,
        stock: 99,
        plate: [],
      },
      colorKey: l.colorKey,
      colorLabel: l.colorKey || null,
      quantity: l.quantity,
      lineTotal: 100_000 * l.quantity,
      problem: null,
    }));
    return {
      items,
      builds: [],
      subtotal: items.reduce((sum, l) => sum + l.lineTotal, 0),
      itemCount: items.reduce((sum, l) => sum + l.quantity, 0),
      canCheckout: items.length > 0,
    };
  }

  function handle(method: string, path: string, userId: string | null, body: any): Reply {
    if (path === '/auth/native/login') {
      const user = Object.values(USERS).find((u) => u.email === body.email);
      return user
        ? { status: 200, body: issue(user.id) }
        : { status: 401, body: { message: 'Wrong email or password' } };
    }
    if (path === '/auth/native/refresh') {
      if (typeof body.refreshToken !== 'string' || body.refreshToken.length !== 43) {
        return { status: 400, body: { message: 'Sign in again' } };
      }
      const held = refreshTokens.get(body.refreshToken);
      if (!held || revokedFamilies.has(held.family))
        return { status: 401, body: { message: 'Session expired' } };
      if (held.usedAt !== null && now - held.usedAt > 120_000) {
        revokedFamilies.add(held.family);
        return { status: 401, body: { message: 'Session expired' } };
      }
      held.usedAt ??= now;
      return { status: 200, body: issue(held.userId, held.family) };
    }
    if (path === '/auth/native/logout') {
      const held = refreshTokens.get(body.refreshToken);
      if (held) revokedFamilies.add(held.family);
      return { status: 204 };
    }
    if (path === '/cart/quote') return { status: 200, body: priced(resolve(body.items)) };
    if (method === 'GET' && path.startsWith('/products/')) {
      const p = product(decodeURIComponent(path.slice('/products/'.length)));
      if (!p) return { status: 404, body: { message: 'Part not found' } };
      return {
        status: 200,
        body: {
          ...priced([{ slug: p.slug, colorKey: '', quantity: 1 }]).items[0]!.product,
          description: '',
          specs: [],
          colors: p.colors.map((key) => ({ key, label: key, hex: '#123456' })),
        },
      };
    }
    if (!path.startsWith('/me/')) return { status: 404, body: { message: 'Not found' } };
    if (!userId) return { status: 401, body: { message: 'Unauthorized' } };
    const lines = carts.get(userId) ?? [];
    if (path === '/me/cart' && method === 'GET') return { status: 200, body: priced(lines) };
    if (path === '/me/cart/items' && method === 'PUT') {
      const p = product(body.slug);
      if (!p) return { status: 404, body: { message: 'Part not found' } };
      const colorKey = finish(p, body.colorKey);
      const at = lines.findIndex((l) => l.slug === p.slug && l.colorKey === colorKey);
      if (body.quantity === 0) {
        if (at >= 0) lines.splice(at, 1);
      } else if (at >= 0) {
        lines[at] = { ...lines[at]!, quantity: body.quantity };
      } else if (lines.length >= MAX_CART_LINES) {
        return { status: 409, body: { message: 'A cart holds up to 50 different parts' } };
      } else {
        lines.push({ slug: p.slug, colorKey, quantity: body.quantity });
      }
      carts.set(userId, lines);
      return { status: 200, body: priced(lines) };
    }
    if (path === '/me/cart/merge' && method === 'POST') {
      if (body.mergeKey && mergeKeys.has(body.mergeKey)) {
        return { status: 200, body: { ...priced(lines), notMerged: [] } };
      }
      if (body.mergeKey) mergeKeys.add(body.mergeKey);
      const notMerged: CartLineInput[] = [];
      for (const l of resolve(body.items)) {
        const existing = lines.find((x) => x.slug === l.slug && x.colorKey === l.colorKey);
        if (!existing && lines.length >= MAX_CART_LINES) {
          notMerged.push(l);
          continue;
        }
        const total = (existing?.quantity ?? 0) + l.quantity;
        if (total > MAX_LINE_QUANTITY) notMerged.push({ ...l, quantity: total - MAX_LINE_QUANTITY });
        if (existing) existing.quantity = Math.min(MAX_LINE_QUANTITY, total);
        else lines.push({ ...l, quantity: Math.min(MAX_LINE_QUANTITY, total) });
      }
      carts.set(userId, lines);
      return { status: 200, body: { ...priced(lines), notMerged } };
    }
    return { status: 404, body: { message: 'Not found' } };
  }

  const toResponse = ({ status, body }: Reply) =>
    new Response(body === undefined || status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  return {
    log,
    carts,
    mergeKeys,
    refreshTokens,
    revokedFamilies,
    /** every access token issued to `userId` so far now answers 401, as after 15 minutes */
    expireAccess(userId: string) {
      for (const [t, u] of accessTokens) if (u === userId) expired.add(t);
    },
    /** moves the server's clock, for the refresh grace period */
    advance(ms: number) {
      now += ms;
    },
    /** the next request to `path` waits for `gate.wait` (see Gate) */
    gate(path: string, gate: Partial<Gate> & { wait?: Promise<void> }) {
      gates.set(path, [
        ...(gates.get(path) ?? []),
        {
          wait: gate.wait ?? Promise.resolve(),
          after: gate.after ?? false,
          drop: gate.drop,
          reply: gate.reply,
        },
      ]);
    },
    calls: (path: string) => log.filter((l) => l.path === path),
    fetch: async (url: string, init: RequestInit = {}): Promise<Response> => {
      const path = url.slice(BASE.length);
      const method = init.method ?? 'GET';
      const auth = (init.headers as Record<string, string> | undefined)?.Authorization?.replace(
        'Bearer ',
        '',
      );
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      const gate = gates.get(path)?.shift();
      if (gate && !gate.after) await gate.wait;
      const userId = auth && !expired.has(auth) ? (accessTokens.get(auth) ?? null) : null;
      log.push({ method, path, userId, body });
      const reply = gate?.reply ?? handle(method, path, userId, body);
      if (gate?.after) await gate.wait;
      if (gate?.drop) throw new TypeError('Network request failed');
      return toResponse(reply);
    },
  };
}

export type FakeServer = ReturnType<typeof createServer>;

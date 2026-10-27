import type { INestApplication } from '@nestjs/common';
import { authResponseSchema, nativeAuthResponseSchema, userSchema } from '@gear-store/shared';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DEMO_SESSIONS_KEPT, REFRESH_REUSE_GRACE_MS } from '../src/auth/auth.service.js';
import { sha256 } from '../src/common/tokens.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { loadEnv } from '../src/config/env.js';
import { createTestApp, FakeMail, nextIp, deleteTestUsers } from './setup.js';

const PASSWORD = 'correct horse battery';
// through loadEnv, so the value comes from the same place the app reads it (.env locally, CI settings in CI)
const WEB_ORIGIN = loadEnv().WEB_ORIGIN;

function refreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('rakit_rt='));
  if (!cookie) throw new Error('no refresh cookie set');
  return cookie;
}
const cookieValue = (setCookie: string) => setCookie.split(';')[0]!;

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const mail = new FakeMail();
  let ip: string;

  const post = (url: string, body?: object) =>
    request(app.getHttpServer()).post(url).set('X-Forwarded-For', ip).send(body);
  const me = (accessToken: string) =>
    request(app.getHttpServer())
      .get('/api/me')
      .set('X-Forwarded-For', ip)
      .set('Authorization', `Bearer ${accessToken}`);
  const refresh = (cookie: string) =>
    request(app.getHttpServer()).post('/api/auth/refresh').set('X-Forwarded-For', ip).set('Cookie', cookie);

  async function verifiedUser() {
    const email = `user-${randomUUID()}@test.example`;
    await post('/api/auth/register', { name: 'Test User', email, password: PASSWORD }).expect(202);
    await post('/api/auth/verify-email', { token: mail.lastToken(email) }).expect(200);
    return email;
  }

  async function login(email: string, password = PASSWORD) {
    const res = await post('/api/auth/login', { email, password }).expect(200);
    return { body: authResponseSchema.parse(res.body), cookie: cookieValue(refreshCookie(res)) };
  }

  const prisma = () => app.get(PrismaService);
  const tokenRow = (raw: string) =>
    prisma().refreshToken.findUniqueOrThrow({ where: { tokenHash: sha256(raw) } });
  /** makes a used token's first use older than the reuse window, as if presented again much later */
  async function outsideWindow(raw: string) {
    const row = await tokenRow(raw);
    await prisma().refreshToken.update({
      where: { id: row.id },
      data: { usedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000) },
    });
  }
  const unusedTokens = async (raw: string) =>
    prisma().refreshToken.findMany({ where: { sessionId: (await tokenRow(raw)).sessionId, usedAt: null } });

  beforeAll(async () => {
    app = await createTestApp({ mail });
  });

  beforeEach(() => {
    ip = nextIp();
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await app.close();
  });

  describe('registration', () => {
    it('gives the same reply for a new and an existing address, and emails both cases', async () => {
      const email = `User-${randomUUID()}@Test.Example`;
      const first = await post('/api/auth/register', { name: 'Ana', email, password: PASSWORD }).expect(202);
      const again = await post('/api/auth/register', { name: 'Ana', email, password: PASSWORD }).expect(202);
      expect(again.body).toEqual(first.body);
      const normalised = email.toLowerCase();
      expect(mail.sent.filter((m) => m.to === normalised)).toHaveLength(2);
    });

    it('lets the inbox owner, not the first sign-up, set the password of an unconfirmed account', async () => {
      const email = `user-${randomUUID()}@test.example`;
      // someone signs up first (perhaps not the owner of the inbox) and never confirms
      await post('/api/auth/register', { name: 'Ana', email, password: PASSWORD }).expect(202);
      const firstConfirm = mail.lastToken(email);
      const owners = 'the owner password';
      await post('/api/auth/register', { name: 'Ana', email, password: owners }).expect(202);
      const finish = mail.sent.findLast((m) => m.to === email)!;
      expect(finish.subject).toBe('Finish creating your Rakit account');
      // the only link sets a password, which also confirms the address; the first one never works
      expect(finish.text).not.toContain('/verify-email');
      // the confirm link from the first sign-up is cancelled, and asking again sends the same kind of link
      await post('/api/auth/verify-email', { token: firstConfirm }).expect(400);
      await post('/api/auth/resend-verification', { email }).expect(202);
      expect(mail.sent.findLast((m) => m.to === email)!.text).toContain('/reset-password?token=');
      await post('/api/auth/reset-password', { token: mail.lastToken(email), password: owners }).expect(200);
      await post('/api/auth/login', { email, password: PASSWORD }).expect(401);
      await post('/api/auth/login', { email, password: owners }).expect(200);
    });

    it('rejects a short password with a field-level issue', async () => {
      const res = await post('/api/auth/register', {
        name: 'Ana',
        email: 'a@test.example',
        password: 'short',
      }).expect(400);
      expect(res.body.issues[0].path).toBe('password');
    });

    it('requires a confirmed email before signing in', async () => {
      const email = `user-${randomUUID()}@test.example`;
      await post('/api/auth/register', { name: 'Ana', email, password: PASSWORD }).expect(202);
      const res = await post('/api/auth/login', { email, password: PASSWORD }).expect(403);
      expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('accepts a confirmation link once', async () => {
      const email = `user-${randomUUID()}@test.example`;
      await post('/api/auth/register', { name: 'Ana', email, password: PASSWORD }).expect(202);
      const token = mail.lastToken(email);
      await post('/api/auth/verify-email', { token }).expect(200);
      await post('/api/auth/verify-email', { token }).expect(400);
    });
  });

  describe('sign in', () => {
    it('answers a wrong password and an unknown email identically', async () => {
      const email = await verifiedUser();
      const wrong = await post('/api/auth/login', { email, password: 'wrong password!' }).expect(401);
      const unknown = await post('/api/auth/login', {
        email: 'nobody@test.example',
        password: PASSWORD,
      }).expect(401);
      expect(wrong.body).toEqual(unknown.body);
    });

    it('sets a locked-down refresh cookie and returns a working access token', async () => {
      const email = await verifiedUser();
      const res = await post('/api/auth/login', { email, password: PASSWORD }).expect(200);
      const cookie = refreshCookie(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/auth/);
      const user = userSchema.parse((await me(res.body.accessToken).expect(200)).body);
      expect(user).toMatchObject({ email, role: 'CUSTOMER', emailVerified: true });
    });

    it('refuses forged and tampered access tokens', async () => {
      const email = await verifiedUser();
      const { body } = await login(email);
      const [header, payload] = body.accessToken.split('.');
      const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`;
      await me(none).expect(401);
      await me(`${header}.${payload}.invalidsignature`).expect(401);
      await me('').expect(401);
    });

    it('slows down repeated attempts from one address', async () => {
      const email = `nobody-${randomUUID()}@test.example`;
      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        statuses.push((await post('/api/auth/login', { email, password: 'x' })).status);
      }
      // four mistakes are answered as such; the fifth starts a pause
      expect(statuses.slice(0, 4).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(4).every((s) => s === 429)).toBe(true);
    });
  });

  describe('per-address limits (independent of the client IP)', () => {
    it('pauses an address for a minute after 5 failed sign-ins, however many IPs they come from', async () => {
      const email = await verifiedUser();
      const messages = [];
      for (let i = 0; i < 4; i += 1) {
        ip = nextIp();
        messages.push(
          (await post('/api/auth/login', { email, password: 'not the password' }).expect(401)).body.message,
        );
      }
      // the last attempts before the pause say so
      expect(messages.slice(0, 2)).toEqual([
        'Email or password is incorrect',
        'Email or password is incorrect',
      ]);
      expect(messages[2]).toMatch(/2 attempts left before sign-in pauses for a minute/);
      expect(messages[3]).toMatch(/1 attempt left/);
      ip = nextIp();
      const fifth = await post('/api/auth/login', { email, password: 'not the password' }).expect(429);
      expect(fifth.body).toMatchObject({ code: 'SIGN_IN_PAUSED', retryAfter: 60 });
      // the right password does not get through during the pause either
      ip = nextIp();
      const locked = await post('/api/auth/login', { email, password: PASSWORD }).expect(429);
      expect(locked.body.message).toMatch(/Too many failed sign-ins. Try again in \d+ seconds/);
      // another account is not affected
      await login(await verifiedUser());
    });

    it('treats unknown addresses the same way, so the lock reveals nothing', async () => {
      const email = `nobody-${randomUUID()}@test.example`;
      for (let i = 0; i < 4; i += 1) {
        ip = nextIp();
        await post('/api/auth/login', { email, password: 'whatever' }).expect(401);
      }
      ip = nextIp();
      await post('/api/auth/login', { email, password: 'whatever' }).expect(429);
    });

    it('sends at most 3 account emails an hour to one address, with the same reply each time', async () => {
      const email = await verifiedUser(); // the confirmation email is the first of the 3
      const replies = [];
      for (let i = 0; i < 5; i += 1) {
        ip = nextIp();
        replies.push((await post('/api/auth/forgot-password', { email }).expect(202)).body);
      }
      expect(new Set(replies.map((r) => JSON.stringify(r))).size).toBe(1);
      expect(mail.sent.filter((m) => m.to === email)).toHaveLength(3);
      // the requests over the cap issued no new link, so the last one emailed still works
      await post('/api/auth/reset-password', {
        token: mail.lastToken(email),
        password: 'a brand new password',
      }).expect(200);
    });
  });

  describe('sessions', () => {
    it('rotates the refresh token on every use', async () => {
      const { cookie } = await login(await verifiedUser());
      const res = await refresh(cookie).expect(200);
      const next = cookieValue(refreshCookie(res));
      expect(next).not.toBe(cookie);
      await refresh(next).expect(200);
    });

    it('revokes the whole session when a used refresh token comes back after the reuse window', async () => {
      const { cookie, body } = await login(await verifiedUser());
      const rotated = cookieValue(refreshCookie(await refresh(cookie).expect(200)));
      await outsideWindow(cookie.slice('rakit_rt='.length));
      await refresh(cookie).expect(401); // stolen copy replayed
      await refresh(rotated).expect(401); // the legitimate holder is signed out too
      await me(body.accessToken).expect(401); // and the access token dies with the session
    });

    it('answers a cookie sent again within the reuse window with a fresh cookie', async () => {
      const { cookie } = await login(await verifiedUser());
      const lost = cookieValue(refreshCookie(await refresh(cookie).expect(200)));
      const again = cookieValue(refreshCookie(await refresh(cookie).expect(200)));
      expect(again).not.toBe(lost);
      await refresh(again).expect(200);
    });

    it('refuses a refresh from another site', async () => {
      const { cookie } = await login(await verifiedUser());
      await refresh(cookie).set('Origin', 'https://evil.example').expect(403);
      await refresh(cookie).set('Origin', WEB_ORIGIN).expect(200);
    });

    it('clears sessions that ended over a week ago when the account signs in again', async () => {
      const email = await verifiedUser();
      const first = await login(email);
      const prisma = app.get(PrismaService);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      await prisma.session.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
      });
      await login(email);
      const sessions = await prisma.session.findMany({ where: { userId: user.id } });
      expect(sessions).toHaveLength(1);
      await refresh(first.cookie).expect(401);
    });

    it('signs out: the cookie is cleared and the session is dead', async () => {
      const { cookie, body } = await login(await verifiedUser());
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('X-Forwarded-For', ip)
        .set('Cookie', cookie)
        .expect(204);
      expect(refreshCookie(res)).toMatch(/rakit_rt=;/);
      await refresh(cookie).expect(401);
      await me(body.accessToken).expect(401);
    });
  });

  describe('caching', () => {
    it('marks every auth reply no-store, errors included', async () => {
      const email = await verifiedUser();
      const res = await post('/api/auth/login', { email, password: PASSWORD }).expect(200);
      const cookie = cookieValue(refreshCookie(res));
      const replies = [
        res,
        await refresh(cookie).expect(200),
        await refresh('rakit_rt=nonsense').expect(401),
        await post('/api/auth/login', { email, password: 'wrong password!' }).expect(401),
        await post('/api/auth/native/refresh', { refreshToken: 'short' }).expect(400),
        await post('/api/auth/forgot-password', { email }).expect(202),
        await post('/api/auth/demo', { role: 'shopper' }).expect(200),
      ];
      for (const r of replies) expect(r.headers['cache-control']).toBe('no-store');
    });
  });

  describe('passwords', () => {
    it('resets through the emailed link and signs out every device', async () => {
      const email = await verifiedUser();
      const old = await login(email);
      await post('/api/auth/forgot-password', { email }).expect(202);
      const token = mail.lastToken(email);
      await post('/api/auth/reset-password', { token, password: 'a brand new passphrase' }).expect(200);
      await post('/api/auth/reset-password', { token, password: 'another new passphrase' }).expect(400);
      await me(old.body.accessToken).expect(401);
      await post('/api/auth/login', { email, password: PASSWORD }).expect(401);
      await login(email, 'a brand new passphrase');
    });

    it('does not reveal whether an address has an account', async () => {
      const before = mail.sent.length;
      const unknown = await post('/api/auth/forgot-password', { email: 'nobody@test.example' }).expect(202);
      const known = await post('/api/auth/forgot-password', { email: await verifiedUser() }).expect(202);
      expect(unknown.body).toEqual(known.body);
      expect(mail.sent.length).toBe(before + 2); // the verification mail and the reset mail, none for nobody
    });

    it('changes the password, keeping this device and signing out the others', async () => {
      const email = await verifiedUser();
      const here = await login(email);
      const elsewhere = await login(email);
      const change = (currentPassword: string) =>
        request(app.getHttpServer())
          .post('/api/me/password')
          .set('X-Forwarded-For', ip)
          .set('Authorization', `Bearer ${here.body.accessToken}`)
          .send({ currentPassword, newPassword: 'a changed passphrase' });
      await change('not my password').expect(400);
      await change(PASSWORD).expect(200);
      await me(here.body.accessToken).expect(200);
      await me(elsewhere.body.accessToken).expect(401);
    });
  });

  describe('native apps (refresh token in the body)', () => {
    const nativeLogin = async (email: string) =>
      nativeAuthResponseSchema.parse(
        (await post('/api/auth/native/login', { email, password: PASSWORD }).expect(200)).body,
      );
    const nativeRefresh = (refreshToken: string) => post('/api/auth/native/refresh', { refreshToken });

    it('hands the refresh token over in the body and sets no cookie', async () => {
      const res = await post('/api/auth/native/login', {
        email: await verifiedUser(),
        password: PASSWORD,
      }).expect(200);
      const body = nativeAuthResponseSchema.parse(res.body);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(new Date(body.refreshExpiresAt).getTime()).toBeGreaterThan(Date.now());
      await me(body.accessToken).expect(200);
    });

    it('rotates the token, and one replayed after the reuse window ends the session', async () => {
      const first = await nativeLogin(await verifiedUser());
      const second = nativeAuthResponseSchema.parse(
        (await nativeRefresh(first.refreshToken).expect(200)).body,
      );
      expect(second.refreshToken).not.toBe(first.refreshToken);
      await outsideWindow(first.refreshToken);
      await nativeRefresh(first.refreshToken).expect(401); // replayed copy
      await nativeRefresh(second.refreshToken).expect(401); // the holder is signed out too
      await me(second.accessToken).expect(401);
    });

    it('never reads the cookie, so a page script cannot turn it into a readable token', async () => {
      const { cookie } = await login(await verifiedUser());
      const withCookie = (url: string, body: object) =>
        request(app.getHttpServer()).post(url).set('X-Forwarded-For', ip).set('Cookie', cookie).send(body);
      // a well-formed token that is not the cookie's: the cookie must not be used in its place
      await withCookie('/api/auth/native/refresh', { refreshToken: 'A'.repeat(43) }).expect(401);
      await withCookie('/api/auth/native/logout', { refreshToken: 'A'.repeat(43) }).expect(204);
      await refresh(cookie).expect(200); // the cookie session is untouched by both
    });

    it('signs out: the session is dead', async () => {
      const session = await nativeLogin(await verifiedUser());
      await post('/api/auth/native/logout', { refreshToken: session.refreshToken }).expect(204);
      await nativeRefresh(session.refreshToken).expect(401);
      await me(session.accessToken).expect(401);
    });

    it('applies the same sign-in checks as the web', async () => {
      const email = await verifiedUser();
      await post('/api/auth/native/login', { email, password: 'wrong password' }).expect(401);
      // an unconfirmed address cannot sign in
      const unconfirmed = `user-${randomUUID()}@test.example`;
      await post('/api/auth/register', { name: 'Test User', email: unconfirmed, password: PASSWORD }).expect(
        202,
      );
      await post('/api/auth/native/login', { email: unconfirmed, password: PASSWORD }).expect(403);
    });

    it('shares the per-address pause with web sign-in', async () => {
      const email = await verifiedUser();
      for (let i = 0; i < 5; i += 1) {
        ip = nextIp();
        await post('/api/auth/login', { email, password: 'not the password' });
      }
      ip = nextIp();
      const res = await post('/api/auth/native/login', { email, password: PASSWORD }).expect(429);
      expect(res.body).toMatchObject({ code: 'SIGN_IN_PAUSED' });
    });

    it('signs in to the demo shopper', async () => {
      const res = await post('/api/auth/native/demo', { role: 'shopper' }).expect(200);
      expect(nativeAuthResponseSchema.parse(res.body).user).toMatchObject({ role: 'CUSTOMER', isDemo: true });
    });

    it('signs in to the demo admin, who can look but not change anything', async () => {
      const res = await post('/api/auth/native/demo', { role: 'admin' }).expect(200);
      const body = nativeAuthResponseSchema.parse(res.body);
      expect(body.user).toMatchObject({ role: 'ADMIN', isDemo: true });
      const admin = (method: 'get' | 'post') =>
        request(app.getHttpServer())
          [method](method === 'get' ? '/api/admin/stats' : '/api/admin/products')
          .set('X-Forwarded-For', ip)
          .set('Authorization', `Bearer ${body.accessToken}`);
      await admin('get').expect(200);
      await admin('post').send({}).expect(403);
    });

    it('replies with exactly the five native fields, sets no cookie and forbids caching', async () => {
      const email = await verifiedUser();
      const replies = [
        await post('/api/auth/native/login', { email, password: PASSWORD }).expect(200),
        await post('/api/auth/native/demo', { role: 'shopper' }).expect(200),
      ];
      replies.push(
        await nativeRefresh((replies[0]!.body as { refreshToken: string }).refreshToken).expect(200),
      );
      for (const res of replies) {
        nativeAuthResponseSchema.parse(res.body);
        expect(Object.keys(res.body).sort()).toEqual(
          ['accessToken', 'expiresIn', 'refreshExpiresAt', 'refreshToken', 'user'].sort(),
        );
        expect(res.headers['set-cookie']).toBeUndefined();
        expect(res.headers['cache-control']).toBe('no-store');
      }
    });

    it('keeps the session end date when the token rotates', async () => {
      const first = await nativeLogin(await verifiedUser());
      const second = nativeAuthResponseSchema.parse(
        (await nativeRefresh(first.refreshToken).expect(200)).body,
      );
      // a reply within the reuse window, too
      const replayed = nativeAuthResponseSchema.parse(
        (await nativeRefresh(first.refreshToken).expect(200)).body,
      );
      expect(second.refreshExpiresAt).toBe(first.refreshExpiresAt);
      expect(replayed.refreshExpiresAt).toBe(first.refreshExpiresAt);
    });

    it('answers a token sent again after a lost reply, and revokes once the window has passed', async () => {
      const first = await nativeLogin(await verifiedUser());
      await nativeRefresh(first.refreshToken).expect(200); // the reply never reached the phone
      const retried = nativeAuthResponseSchema.parse(
        (await nativeRefresh(first.refreshToken).expect(200)).body,
      );
      expect((await unusedTokens(first.refreshToken)).map((t) => t.tokenHash)).toEqual([
        sha256(retried.refreshToken),
      ]);
      await me(retried.accessToken).expect(200);
      const next = nativeAuthResponseSchema.parse(
        (await nativeRefresh(retried.refreshToken).expect(200)).body,
      );

      const warn = vi.spyOn(Logger.prototype, 'warn');
      try {
        await outsideWindow(first.refreshToken);
        await nativeRefresh(first.refreshToken).expect(401);
        const { sessionId } = await tokenRow(first.refreshToken);
        expect(warn).toHaveBeenCalledWith(`Refresh token reuse on session ${sessionId}; session revoked`);
        expect(JSON.stringify(warn.mock.calls)).not.toContain(first.refreshToken);
      } finally {
        warn.mockRestore();
      }
      await nativeRefresh(next.refreshToken).expect(401);
      await me(next.accessToken).expect(401);
    });

    it('answers two refreshes with one token at once, leaving one live token', async () => {
      const first = await nativeLogin(await verifiedUser());
      const [a, b] = await Promise.all([
        nativeRefresh(first.refreshToken),
        nativeRefresh(first.refreshToken),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      const pairs = [a, b].map((r) => nativeAuthResponseSchema.parse(r.body));
      expect(pairs[0]!.refreshToken).not.toBe(pairs[1]!.refreshToken);
      // the refresh that ran second retired the first one's token: exactly one of the two is live
      const live = await unusedTokens(first.refreshToken);
      expect(live).toHaveLength(1);
      const winner = pairs.find((p) => sha256(p.refreshToken) === live[0]!.tokenHash)!;
      const retired = pairs.find((p) => p !== winner)!;
      for (const p of pairs) await me(p.accessToken).expect(200);
      // the retired one still counts as a lost reply within the window, so a phone that kept it stays signed in
      const fromRetired = nativeAuthResponseSchema.parse(
        (await nativeRefresh(retired.refreshToken).expect(200)).body,
      );
      expect((await unusedTokens(first.refreshToken)).map((t) => t.tokenHash)).toEqual([
        sha256(fromRetired.refreshToken),
      ]);
    });

    it('refuses a refresh on an expired session', async () => {
      const session = await nativeLogin(await verifiedUser());
      const { sessionId } = await tokenRow(session.refreshToken);
      await prisma().session.update({
        where: { id: sessionId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await nativeRefresh(session.refreshToken).expect(401);
    });

    it('refuses a refresh after a password reset and after the account is deleted', async () => {
      const email = await verifiedUser();
      const beforeReset = await nativeLogin(email);
      await post('/api/auth/forgot-password', { email }).expect(202);
      await post('/api/auth/reset-password', {
        token: mail.lastToken(email),
        password: 'a brand new passphrase',
      }).expect(200);
      await nativeRefresh(beforeReset.refreshToken).expect(401);

      const doomed = await nativeLogin(await verifiedUser());
      await prisma().user.delete({ where: { email: doomed.user.email } });
      await nativeRefresh(doomed.refreshToken).expect(401);
      await me(doomed.accessToken).expect(401);
    });

    it('signs out twice without complaint, and an unknown token too', async () => {
      const session = await nativeLogin(await verifiedUser());
      const logout = (refreshToken: string) => post('/api/auth/native/logout', { refreshToken });
      await logout(session.refreshToken).expect(204);
      await logout(session.refreshToken).expect(204);
      await logout('B'.repeat(43)).expect(204);
    });

    it('accepts a request from any origin, while the cookie routes refuse another site', async () => {
      const { cookie } = await login(await verifiedUser());
      const session = await nativeLogin(await verifiedUser());
      const foreign = (url: string) =>
        request(app.getHttpServer())
          .post(url)
          .set('X-Forwarded-For', ip)
          .set('Origin', 'https://evil.example');
      const next = nativeAuthResponseSchema.parse(
        (await foreign('/api/auth/native/refresh').send({ refreshToken: session.refreshToken }).expect(200))
          .body,
      );
      await foreign('/api/auth/native/logout').send({ refreshToken: next.refreshToken }).expect(204);
      await foreign('/api/auth/refresh').set('Cookie', cookie).expect(403);
      await foreign('/api/auth/logout').set('Cookie', cookie).expect(403);
    });

    describe('malformed input is a 400, never a 500', () => {
      const send = (url: string, type: string, payload?: string) => {
        ip = nextIp();
        const req = request(app.getHttpServer()).post(url).set('X-Forwarded-For', ip);
        return payload === undefined ? req : req.set('Content-Type', type).send(payload);
      };
      const json = 'application/json';
      const cases: [string, string, string | undefined][] = [
        ['42 characters', json, JSON.stringify({ refreshToken: 'A'.repeat(42) })],
        ['44 characters', json, JSON.stringify({ refreshToken: 'A'.repeat(44) })],
        ['a "+"', json, JSON.stringify({ refreshToken: `${'A'.repeat(42)}+` })],
        ['a "/"', json, JSON.stringify({ refreshToken: `${'A'.repeat(42)}/` })],
        ['a "="', json, JSON.stringify({ refreshToken: `${'A'.repeat(42)}=` })],
        ['a number', json, JSON.stringify({ refreshToken: 12345 })],
        ['null', json, JSON.stringify({ refreshToken: null })],
        ['a null body', json, 'null'],
        ['no body', json, undefined],
        ['invalid JSON', json, '{"refreshToken": "AAAA'],
        ['text/plain', 'text/plain', JSON.stringify({ refreshToken: 'A'.repeat(43) })],
      ];
      for (const route of ['refresh', 'logout']) {
        it.each(cases)(`native/${route} with %s`, async (_, type, payload) => {
          const res = await send(`/api/auth/native/${route}`, type, payload);
          expect(res.status).toBe(400);
        });
      }
    });

    it('keeps tokens and passwords out of the logs on validation, parse and size errors', async () => {
      const secret = `${'S'.repeat(20)}secretmarker${'S'.repeat(11)}`; // 43 characters
      const password = 'password-marker-never-logged';
      const written: string[] = [];
      const capture = (stream: NodeJS.WriteStream) =>
        vi.spyOn(stream, 'write').mockImplementation((chunk: unknown) => {
          written.push(String(chunk));
          return true;
        });
      const spies = [
        capture(process.stdout),
        capture(process.stderr),
        ...(['log', 'error', 'warn', 'info', 'debug'] as const).map((m) =>
          vi
            .spyOn(console, m)
            .mockImplementation((...args: unknown[]) => written.push(args.map(String).join(' '))),
        ),
      ];
      // express prints unhandled errors only outside the test environment: behave as production does
      const express = app.getHttpAdapter().getInstance() as {
        get(k: string): unknown;
        set(k: string, v: unknown): void;
      };
      const env = express.get('env');
      express.set('env', 'production');
      const statuses: number[] = [];
      try {
        const raw = (url: string, body: string) =>
          request(app.getHttpServer())
            .post(url)
            .set('X-Forwarded-For', nextIp())
            .set('Content-Type', 'application/json')
            .send(body);
        statuses.push((await raw('/api/auth/native/refresh', `{"refreshToken":"${secret}x"}`)).status);
        statuses.push((await raw('/api/auth/native/refresh', `{"refreshToken":"${secret}`)).status);
        statuses.push(
          (await raw('/api/auth/native/login', `{"email":"a@test.example","password":"${password}`)).status,
        );
        statuses.push(
          (
            await raw(
              '/api/auth/native/refresh',
              `{"refreshToken":"${secret}","pad":"${'x'.repeat(40_000)}"}`,
            )
          ).status,
        );
        statuses.push(
          (
            await raw(
              '/api/auth/native/login',
              `{"email":"a@test.example","password":"${password}","pad":"${'x'.repeat(40_000)}"}`,
            )
          ).status,
        );
      } finally {
        express.set('env', env);
        for (const spy of spies) spy.mockRestore();
      }
      expect(statuses).toEqual([400, 400, 400, 413, 413]);
      const log = written.join('\n');
      expect(log).not.toContain('secretmarker');
      expect(log).not.toContain(password);
    });

    it('limits refreshes to 20 a minute per client', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 21; i += 1) statuses.push((await nativeRefresh('C'.repeat(43))).status);
      expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
      expect(statuses[20]).toBe(429);
    });

    it('limits demo sign-ins to 10 a minute per client', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1)
        statuses.push((await post('/api/auth/native/demo', { role: 'shopper' })).status);
      expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });

  describe('demo accounts', () => {
    it(`keeps only the newest ${DEMO_SESSIONS_KEPT} sessions of a demo account, with their tokens`, async () => {
      const demo = await prisma().user.findUniqueOrThrow({ where: { email: 'shopper@rakit.example' } });
      const marker = `e2e-demo-cap-${randomUUID()}`;
      const longAgo = Date.now() - 24 * 60 * 60 * 1000;
      // enough old sessions to pass the cap however many the account already has
      await prisma().session.createMany({
        data: Array.from({ length: DEMO_SESSIONS_KEPT + 5 }, (_, i) => ({
          userId: demo.id,
          userAgent: marker,
          createdAt: new Date(longAgo - i * 1000),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })),
      });
      const oldest = await prisma().session.findFirstOrThrow({
        where: { userAgent: marker },
        orderBy: { createdAt: 'asc' },
      });
      const oldToken = await prisma().refreshToken.create({
        data: { sessionId: oldest.id, tokenHash: sha256(randomUUID()) },
      });
      try {
        const res = await post('/api/auth/demo', { role: 'shopper' }).expect(200);
        const { accessToken } = authResponseSchema.parse(res.body);
        expect(await prisma().session.count({ where: { userId: demo.id } })).toBe(DEMO_SESSIONS_KEPT);
        await me(accessToken).expect(200); // the new session is among the newest
        expect(await prisma().session.findUnique({ where: { id: oldest.id } })).toBeNull();
        expect(await prisma().refreshToken.findUnique({ where: { id: oldToken.id } })).toBeNull();
      } finally {
        await prisma().session.deleteMany({ where: { userAgent: marker } });
      }
    });

    it.each([
      ['shopper', 'CUSTOMER'],
      ['admin', 'ADMIN'],
    ])('signs in as the demo %s in one step', async (role, expected) => {
      const res = await post('/api/auth/demo', { role }).expect(200);
      expect(authResponseSchema.parse(res.body).user).toMatchObject({ role: expected, isDemo: true });
    });

    it('cannot be renamed, re-passworded or signed into with a password', async () => {
      const body = authResponseSchema.parse(
        (await post('/api/auth/demo', { role: 'shopper' }).expect(200)).body,
      );
      await request(app.getHttpServer())
        .patch('/api/me')
        .set('X-Forwarded-For', ip)
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ name: 'Hacked' })
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/me/password')
        .set('X-Forwarded-For', ip)
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ currentPassword: 'anything', newPassword: 'a long new password' })
        .expect(403);
      await post('/api/auth/login', { email: 'shopper@rakit.example', password: 'anything' }).expect(401);
    });
  });
});

import type { INestApplication } from '@nestjs/common';
import { authResponseSchema, userSchema } from '@gear-store/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, FakeMail, nextIp } from './setup.js';

const PASSWORD = 'correct horse battery';
const WEB_ORIGIN = process.env['WEB_ORIGIN'];

function refreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('rakit_rt='));
  if (!cookie) throw new Error('no refresh cookie set');
  return cookie;
}
const cookieValue = (setCookie: string) => setCookie.split(';')[0]!;

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
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

  beforeAll(async () => {
    app = await createTestApp({ mail });
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    ip = nextIp();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { endsWith: '@test.example' } } });
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
      const statuses: number[] = [];
      for (let i = 0; i < 7; i += 1) {
        statuses.push(
          (await post('/api/auth/login', { email: 'nobody@test.example', password: 'x' })).status,
        );
      }
      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
      expect(statuses.at(-1)).toBe(429);
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

    it('revokes the whole session when a used refresh token comes back', async () => {
      const { cookie, body } = await login(await verifiedUser());
      const rotated = cookieValue(refreshCookie(await refresh(cookie).expect(200)));
      await refresh(cookie).expect(401); // stolen copy replayed
      await refresh(rotated).expect(401); // the legitimate holder is signed out too
      await me(body.accessToken).expect(401); // and the access token dies with the session
    });

    it('refuses a refresh from another site', async () => {
      const { cookie } = await login(await verifiedUser());
      await refresh(cookie).set('Origin', 'https://evil.example').expect(403);
      await refresh(cookie).set('Origin', WEB_ORIGIN!).expect(200);
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

  describe('demo accounts', () => {
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

import type { INestApplication } from '@nestjs/common';
import { addressSchema, authResponseSchema, MAX_ADDRESSES } from '@gear-store/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, deleteTestUsers, FakeMail, nextIp, signedInCustomer } from './setup.js';

const ADDRESS = {
  recipient: 'Ana Putri',
  phone: '0812 3456 7890',
  line1: 'Jl. Sudirman No. 1',
  city: 'Pekanbaru',
  province: 'Riau',
  postalCode: '28111',
};

describe('Addresses (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const mail = new FakeMail();

  function as(token?: string) {
    const server = () => app.getHttpServer();
    const auth = () => ({
      'X-Forwarded-For': nextIp(),
      ...(token && { Authorization: `Bearer ${token}` }),
    });
    return {
      add: (body: object = ADDRESS) => request(server()).post('/api/me/addresses').set(auth()).send(body),
      list: () => request(server()).get('/api/me/addresses').set(auth()),
      update: (id: string, body: object) =>
        request(server()).put(`/api/me/addresses/${id}`).set(auth()).send(body),
      del: (id: string) => request(server()).delete(`/api/me/addresses/${id}`).set(auth()),
    };
  }
  const customer = async () => as(await signedInCustomer(app, mail, nextIp()));
  const listOf = async (me: ReturnType<typeof as>) =>
    z.array(addressSchema).parse((await me.list().expect(200)).body);
  const added = async (me: ReturnType<typeof as>, body: object = ADDRESS) =>
    addressSchema.parse((await me.add(body).expect(201)).body);

  beforeAll(async () => {
    app = await createTestApp({ mail });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await deleteTestUsers(app);
    await app.close();
  });

  describe('access', () => {
    it('refuses every route without a token', async () => {
      const guest = as();
      const id = crypto.randomUUID();
      for (const res of [
        await guest.list(),
        await guest.add(),
        await guest.update(id, ADDRESS),
        await guest.del(id),
      ])
        expect(res.status).toBe(401);
    });

    it('will not change another account’s address, and leaves it as it was', async () => {
      const owner = await customer();
      const address = await added(owner);
      const other = await customer();
      const res = await other.update(address.id, { ...ADDRESS, city: 'Hijacked' }).expect(404);
      expect(res.body.message).toBe('Address not found');
      expect((await listOf(owner))[0]).toMatchObject({ id: address.id, city: 'Pekanbaru' });
    });

    it('answers a malformed or unknown address id with 400 and 404', async () => {
      const me = await customer();
      await me.update('not-a-uuid', ADDRESS).expect(400);
      await me.del('not-a-uuid').expect(400);
      await me.update(crypto.randomUUID(), ADDRESS).expect(404);
      await me.del(crypto.randomUUID()).expect(404);
    });

    it('lets the shared demo shopper keep addresses like any account', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/demo')
        .set('X-Forwarded-For', nextIp())
        .send({ role: 'shopper' })
        .expect(200);
      const demo = as(authResponseSchema.parse(res.body).accessToken);
      const address = await added(demo, { ...ADDRESS, recipient: 'Demo e2e' });
      await demo.del(address.id).expect(204);
    });
  });

  describe('editing', () => {
    it('replaces every field and prices shipping for the new province', async () => {
      const me = await customer();
      const address = await added(me);
      const updated = addressSchema.parse(
        (
          await me
            .update(address.id, {
              ...ADDRESS,
              label: 'Office',
              recipient: 'Budi',
              line2: 'Lantai 3',
              province: 'DKI Jakarta',
              phone: '+62 811 0000 1111',
            })
            .expect(200)
        ).body,
      );
      expect(updated).toMatchObject({
        id: address.id,
        label: 'Office',
        recipient: 'Budi',
        line2: 'Lantai 3',
        province: 'DKI Jakarta',
        phone: '+6281100001111',
        isDefault: true,
      });
      expect(updated.shippingFee).not.toBe(address.shippingFee);
    });

    it('moves the default to an edited address, and never switches the only default off', async () => {
      const me = await customer();
      const first = await added(me);
      const second = await added(me);
      expect(second.isDefault).toBe(false);
      // asking to drop the default flag from the default leaves it the default
      await me.update(first.id, { ...ADDRESS, isDefault: false }).expect(200);
      expect((await listOf(me)).map((a) => [a.id, a.isDefault])).toEqual([
        [first.id, true],
        [second.id, false],
      ]);
      await me.update(second.id, { ...ADDRESS, isDefault: true }).expect(200);
      expect((await listOf(me)).filter((a) => a.isDefault).map((a) => a.id)).toEqual([second.id]);
      // editing an address that is not the default, without asking, keeps it that way
      await me.update(first.id, { ...ADDRESS, city: 'Dumai' }).expect(200);
      expect((await listOf(me)).filter((a) => a.isDefault).map((a) => a.id)).toEqual([second.id]);
    });

    it('ignores fields it does not know, such as another account’s id', async () => {
      const me = await customer();
      const other = await prisma.user.findFirstOrThrow({ where: { email: 'shopper@rakit.example' } });
      const address = await added(me, {
        ...ADDRESS,
        userId: other.id,
        id: crypto.randomUUID(),
        shippingFee: 0,
      });
      const row = await prisma.address.findUniqueOrThrow({ where: { id: address.id } });
      expect(row.userId).not.toBe(other.id);
      expect(address.shippingFee).toBeGreaterThan(0);
    });
  });

  describe('deleting', () => {
    it('keeps the default where it is when another address goes, and leaves none after the last', async () => {
      const me = await customer();
      const first = await added(me);
      const second = await added(me);
      await me.del(second.id).expect(204);
      expect((await listOf(me)).map((a) => [a.id, a.isDefault])).toEqual([[first.id, true]]);
      await me.del(first.id).expect(204);
      expect(await listOf(me)).toEqual([]);
      await me.del(first.id).expect(404);
    });

    it('hands the default to the oldest remaining address', async () => {
      const me = await customer();
      const first = await added(me);
      const second = await added(me);
      const third = await added(me, { ...ADDRESS, isDefault: true });
      await me.del(third.id).expect(204);
      expect((await listOf(me)).map((a) => [a.id, a.isDefault])).toEqual([
        [first.id, true],
        [second.id, false],
      ]);
    });
  });

  describe('limits', () => {
    it(`takes a ${MAX_ADDRESSES}th address and refuses the next, until one is deleted`, async () => {
      const me = await customer();
      const saved = [];
      for (let i = 0; i < MAX_ADDRESSES; i += 1) saved.push(await added(me, { ...ADDRESS, label: `#${i}` }));
      const refused = await me.add().expect(409);
      expect(refused.body.message).toBe(`Save up to ${MAX_ADDRESSES} addresses`);
      expect(await listOf(me)).toHaveLength(MAX_ADDRESSES);
      await me.del(saved[3]!.id).expect(204);
      await me.add().expect(201);
    });

    it.each([
      ['recipient', 'x'.repeat(80), 'x'.repeat(81)],
      ['line1', 'Jl. 1', 'Jl. '],
      ['line1', 'x'.repeat(200), 'x'.repeat(201)],
      ['line2', 'x'.repeat(200), 'x'.repeat(201)],
      ['city', 'Ab', 'A'],
      ['city', 'x'.repeat(80), 'x'.repeat(81)],
      ['label', 'x'.repeat(30), 'x'.repeat(31)],
    ])('takes %s at its limit and refuses it one past', async (field, fits, tooLong) => {
      const me = await customer();
      const ok = await added(me, { ...ADDRESS, [field]: fits });
      expect(ok).toMatchObject({ [field]: fits });
      const res = await me.add({ ...ADDRESS, [field]: tooLong }).expect(400);
      expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual([field]);
    });

    it('refuses fields of the wrong type and a missing body with field issues, never a 500', async () => {
      const me = await customer();
      const res = await me
        .add({ ...ADDRESS, recipient: 42, isDefault: 'yes', postalCode: 28111 })
        .expect(400);
      expect(res.body.issues.map((i: { path: string }) => i.path).sort()).toEqual([
        'isDefault',
        'postalCode',
        'recipient',
      ]);
      await me.add({}).expect(400);
    });

    it('stores markup and SQL-like text as typed, and returns it unchanged', async () => {
      const me = await customer();
      const hostile = {
        ...ADDRESS,
        recipient: `<script>alert(1)</script>`,
        line1: `'; DROP TABLE "Address"; --`,
      };
      const address = await added(me, hostile);
      expect(address).toMatchObject({ recipient: hostile.recipient, line1: hostile.line1 });
      expect(await listOf(me)).toHaveLength(1);
    });
  });
});

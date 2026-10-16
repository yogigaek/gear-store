import { hash } from '@node-rs/argon2';
import { shippingFor, type Province } from '@gear-store/shared';
import { randomBytes } from 'node:crypto';
import { carriesColour, checkBuild } from '../build/build-rules.js';
import { BUILD_NAME, loadRulebook } from '../build/build.service.js';
import { OrderStatus, type Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { newOrderNumber } from '../orders/order-number.js';

// A few months of past orders for the demo accounts, so the shared demo admin opens on a dashboard with
// revenue, best sellers and orders to ship, and the demo shopper has an order history. Every order is
// marked with an idempotency key starting `demo-history-`; the set is written once and never repeated.

const KEY = 'demo-history-';

/** demo customers besides the demo shopper; like it, they cannot be signed in to with a password */
const customers = [
  {
    email: 'shopper@rakit.example',
    name: 'Demo Shopper',
    city: 'Pekanbaru',
    province: 'Riau',
    postal: '28111',
  },
  {
    email: 'budi@rakit.example',
    name: 'Budi Santoso',
    city: 'Bandung',
    province: 'Jawa Barat',
    postal: '40115',
  },
  {
    email: 'citra@rakit.example',
    name: 'Citra Lestari',
    city: 'Denpasar',
    province: 'Bali',
    postal: '80234',
  },
  {
    email: 'dewi@rakit.example',
    name: 'Dewi Anggraini',
    city: 'Jakarta Selatan',
    province: 'DKI Jakarta',
    postal: '12190',
  },
] as const;

/** the starting E-1; a bike below changes only what differs from it */
const START = {
  frames: 'e1-frame-m',
  batteries: 'e1-battery-625',
  shocks: 'e1-shock-air',
  forks: 'e1-fork-160',
  wheelsets: 'e1-wheelset-alloy',
  drivetrains: 'e1-drivetrain-12',
  cockpits: 'e1-cockpit-alloy',
  seats: 'e1-seat-150',
};

type Status = 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
interface PastOrder {
  daysAgo: number;
  customer: number;
  status: Status;
  bike?: { parts?: Partial<typeof START>; color: string; quantity?: number };
  parts?: [slug: string, quantity: number][];
}

// every bike here is buildable: the S frame keeps to the 625 Wh battery, the 160 mm fork and the 150 mm post
const history: PastOrder[] = [
  { daysAgo: 84, customer: 1, status: 'DELIVERED', bike: { color: 'graphite' } },
  {
    daysAgo: 76,
    customer: 2,
    status: 'DELIVERED',
    parts: [
      ['battery-charger-4a', 1],
      ['lights-front-rear', 1],
    ],
  },
  {
    daysAgo: 69,
    customer: 0,
    status: 'DELIVERED',
    bike: {
      parts: { frames: 'e1-frame-l', wheelsets: 'e1-wheelset-carbon', shocks: 'e1-shock-coil' },
      color: 'signal',
    },
  },
  { daysAgo: 61, customer: 3, status: 'DELIVERED', parts: [['e1-battery-750', 1]] },
  {
    daysAgo: 54,
    customer: 1,
    status: 'DELIVERED',
    parts: [
      ['workshop-hex-set', 1],
      ['e1-cockpit-carbon', 1],
    ],
  },
  { daysAgo: 47, customer: 2, status: 'DELIVERED', bike: { parts: { frames: 'e1-frame-s' }, color: 'moss' } },
  { daysAgo: 39, customer: 0, status: 'CANCELLED', parts: [['e1-wheelset-carbon', 1]] },
  {
    daysAgo: 31,
    customer: 3,
    status: 'DELIVERED',
    bike: { parts: { drivetrains: 'e1-drivetrain-12-wireless' }, color: 'glacier' },
  },
  { daysAgo: 24, customer: 1, status: 'DELIVERED', parts: [['lights-front-rear', 2]] },
  {
    daysAgo: 17,
    customer: 0,
    status: 'DELIVERED',
    bike: {
      parts: {
        frames: 'e1-frame-l',
        batteries: 'e1-battery-750',
        forks: 'e1-fork-170',
        seats: 'e1-seat-200',
      },
      color: 'ember',
    },
  },
  {
    daysAgo: 11,
    customer: 2,
    status: 'SHIPPED',
    parts: [
      ['e1-seat-200', 1],
      ['e1-shock-coil', 1],
    ],
  },
  { daysAgo: 6, customer: 3, status: 'SHIPPED', bike: { color: 'signal', quantity: 2 } },
  { daysAgo: 3, customer: 1, status: 'PAID', parts: [['battery-charger-4a', 2]] },
  {
    daysAgo: 1,
    customer: 0,
    status: 'PAID',
    bike: { parts: { cockpits: 'e1-cockpit-carbon' }, color: 'graphite' },
  },
];

const COURIERS = ['JNE', 'SiCepat', 'J&T Express', 'AnterAja'] as const;
const PAYMENT_TYPES = ['qris', 'bank_transfer', 'gopay', 'credit_card'] as const;
const minutes = (n: number) => n * 60_000;

/** Writes the past orders once; later runs find them and leave everything as it is. */
export async function seedDemoOrders(prisma: PrismaClient): Promise<number> {
  if (await prisma.order.count({ where: { idempotencyKey: { startsWith: KEY } } })) return 0;
  // hashed before the transaction: argon2 is slow on purpose, and the transaction should stay short
  const hashes = await Promise.all(customers.map(() => hash(randomBytes(32).toString('base64url'))));
  // all or nothing: a history half written would never be finished, as any demo order stops a second run
  return prisma.$transaction((tx) => writeHistory(tx, hashes), { timeout: 60_000 });
}

async function writeHistory(tx: Prisma.TransactionClient, hashes: string[]): Promise<number> {
  const users = [];
  for (const [n, c] of customers.entries()) {
    const passwordHash = hashes[n]!;
    users.push(
      await tx.user.upsert({
        where: { email: c.email },
        create: {
          email: c.email,
          name: c.name,
          role: 'CUSTOMER',
          isDemo: true,
          passwordHash,
          emailVerifiedAt: new Date(),
        },
        update: {},
        select: { id: true },
      }),
    );
  }
  const products = new Map(
    (
      await tx.product.findMany({
        select: {
          id: true,
          slug: true,
          name: true,
          model: true,
          price: true,
          colors: { select: { key: true, label: true } },
        },
      })
    ).map((p) => [p.slug, p]),
  );
  const part = (slug: string) => {
    const p = products.get(slug);
    if (!p) throw new Error(`Demo order names an unknown part: ${slug}`);
    return p;
  };

  const book = await loadRulebook(tx);
  const now = Date.now();
  for (const [i, o] of history.entries()) {
    const who = customers[o.customer]!;
    const shipping = shippingFor(who.province as Province);
    // spread over the working day, so the daily chart is not one spike per order
    const placed = new Date(now - o.daysAgo * 86_400_000 - minutes(60 * ((i * 5) % 9)));
    const singles = (o.parts ?? []).map(([slug, quantity]) => {
      const p = part(slug);
      return {
        productId: p.id,
        slug,
        name: p.name,
        model: p.model,
        colorKey: '',
        colorLabel: null,
        unitPrice: p.price,
        quantity,
        lineTotal: p.price * quantity,
      };
    });
    // a bike is checked by the store's own rules, so the history holds only bikes that could be bought;
    // today's stock does not matter for an order in the past
    const bike =
      o.bike &&
      (() => {
        const quantity = o.bike.quantity ?? 1;
        const checked = checkBuild(
          book,
          { parts: { ...START, ...o.bike.parts }, colorKey: o.bike.color },
          quantity,
        );
        const problem = checked.problems.find((p) => p.kind !== 'OUT_OF_STOCK');
        if (problem) throw new Error(`Demo order ${i} is not a buildable bike: ${problem.message}`);
        return { ...checked, quantity };
      })();
    const subtotal =
      singles.reduce((s, l) => s + l.lineTotal, 0) + (bike ? bike.unitPrice * bike.quantity : 0);

    const paid = o.status !== 'CANCELLED';
    const paidAt = new Date(placed.getTime() + minutes(7));
    const shippedAt = new Date(placed.getTime() + minutes(60 * 22));
    const deliveredAt = new Date(shippedAt.getTime() + minutes(60 * 24 * 3));
    const courier = COURIERS[i % COURIERS.length]!;
    const tracking = `${courier
      .slice(0, 2)
      .toUpperCase()
      .replace(/[^A-Z]/g, 'X')}${String(880_000_000_000 + i * 7919)}`;

    const events: { status: OrderStatus; note: string; createdAt: Date }[] = [
      {
        status: OrderStatus.PENDING_PAYMENT,
        note: 'Order placed. Pay within 60 minutes.',
        createdAt: placed,
      },
    ];
    if (!paid) {
      events.push({
        status: OrderStatus.CANCELLED,
        note: 'Cancelled by you. The items went back on sale.',
        createdAt: new Date(placed.getTime() + minutes(12)),
      });
    } else {
      events.push({ status: OrderStatus.PAID, note: 'Payment received.', createdAt: paidAt });
      if (o.status !== 'PAID')
        events.push({
          status: OrderStatus.SHIPPED,
          note: `Shipped with ${courier}. Tracking number ${tracking}.`,
          createdAt: shippedAt,
        });
      if (o.status === 'DELIVERED')
        events.push({ status: OrderStatus.DELIVERED, note: 'Delivered.', createdAt: deliveredAt });
    }

    const order = await tx.order.create({
      data: {
        number: newOrderNumber(placed),
        userId: users[o.customer]!.id,
        status: o.status,
        subtotal,
        shippingFee: shipping.fee,
        total: subtotal + shipping.fee,
        shippingZone: shipping.zone,
        shipRecipient: who.name,
        shipPhone: '+6281234567890',
        shipLine1: 'Jl. Contoh No. 1',
        shipLine2: '',
        shipCity: who.city,
        shipProvince: who.province,
        shipPostalCode: who.postal,
        idempotencyKey: `${KEY}${i}`,
        paymentExpiresAt: new Date(placed.getTime() + minutes(60)),
        paidAt: paid ? paidAt : null,
        closedAt: paid ? null : events.at(-1)!.createdAt,
        shippedAt: o.status === 'SHIPPED' || o.status === 'DELIVERED' ? shippedAt : null,
        deliveredAt: o.status === 'DELIVERED' ? deliveredAt : null,
        courier: o.status === 'SHIPPED' || o.status === 'DELIVERED' ? courier : null,
        trackingNumber: o.status === 'SHIPPED' || o.status === 'DELIVERED' ? tracking : null,
        createdAt: placed,
        items: { create: singles },
        events: { create: events },
        ...(paid && {
          payment: {
            create: {
              transactionId: `demo-${i}-${placed.getTime()}`,
              transactionStatus: 'settlement',
              paymentType: PAYMENT_TYPES[i % PAYMENT_TYPES.length],
              grossAmount: subtotal + shipping.fee,
              createdAt: placed,
            },
          },
        }),
      },
      select: { id: true },
    });
    if (bike) {
      await tx.orderBuild.create({
        data: {
          orderId: order.id,
          label: BUILD_NAME,
          colorKey: bike.colorKey,
          colorLabel: bike.colorLabel,
          quantity: bike.quantity,
          unitPrice: bike.unitPrice,
          lineTotal: bike.unitPrice * bike.quantity,
          items: {
            create: bike.parts.map(({ part: p }) => ({
              orderId: order.id,
              productId: p.id,
              slug: p.summary.slug,
              name: p.summary.name,
              model: p.summary.model,
              colorKey: carriesColour(p) ? bike.colorKey : '',
              colorLabel: carriesColour(p) ? bike.colorLabel : null,
              unitPrice: p.summary.price,
              quantity: bike.quantity,
              lineTotal: p.summary.price * bike.quantity,
            })),
          },
        },
      });
    }
  }
  return history.length;
}

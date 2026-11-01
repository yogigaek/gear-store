import type { Address, Cart, CartBuild, OrderDetail, ProductSummary } from '@gear-store/shared';

// Replies shaped as the API sends them, for tests that run them through the shared schemas.

export const product = (slug = 'fender-set', change: Partial<ProductSummary> = {}): ProductSummary => ({
  slug,
  name: 'Fender set',
  model: 'FS-1',
  category: 'accessories',
  module: 'ACCESSORY',
  price: 150_000,
  stock: 5,
  plate: [],
  ...change,
});

export const cart = (change: Partial<Cart> = {}): Cart => ({
  items: [],
  builds: [],
  subtotal: 0,
  itemCount: 0,
  canCheckout: false,
  ...change,
});

export const cartLine = (slug: string, quantity: number, colorKey = '') => ({
  product: product(slug),
  colorKey,
  colorLabel: colorKey || null,
  quantity,
  lineTotal: 150_000 * quantity,
  problem: null,
});

export const bike = (change: Partial<CartBuild> = {}): CartBuild => ({
  id: 'b1',
  quote: {
    label: 'E-1 trail',
    colorKey: 'signal',
    colorLabel: 'Signal yellow',
    parts: [
      { slot: 'frames', slotName: 'Frame', product: product('e1-frame-m', { module: 'FRAME' }) },
      { slot: 'forks', slotName: 'Fork', product: product('e1-fork-160', { module: 'FORK' }) },
    ],
    unitPrice: 30_000_000,
    problems: [],
  },
  quantity: 1,
  lineTotal: 30_000_000,
  problem: null,
  ...change,
});

export const address = (change: Partial<Address> = {}): Address => ({
  id: crypto.randomUUID(),
  label: '',
  recipient: 'Ana',
  phone: '+6281234567890',
  line1: 'Jl. Sudirman 1',
  line2: '',
  city: 'Jakarta',
  province: 'DKI Jakarta',
  postalCode: '10110',
  isDefault: true,
  shippingFee: 15_000,
  shippingEta: '1–2 days',
  ...change,
});

export const order = (change: Partial<OrderDetail> = {}): OrderDetail => ({
  number: 'RKT-261031-ABCD29',
  status: 'PENDING_PAYMENT',
  subtotal: 150_000,
  shippingFee: 15_000,
  total: 165_000,
  shipping: {
    recipient: 'Ana',
    phone: '+6281234567890',
    line1: 'Jl. Sudirman 1',
    line2: '',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    postalCode: '10110',
    zone: 'A',
  },
  items: [],
  builds: [],
  events: [],
  createdAt: '2026-10-31T03:00:00.000Z',
  paymentExpiresAt: '2026-10-31T04:00:00.000Z',
  paidAt: null,
  payment: null,
  canPay: true,
  canCancel: true,
  fulfilment: { courier: null, trackingNumber: null, shippedAt: null, deliveredAt: null },
  refundStatus: 'NONE',
  ...change,
});

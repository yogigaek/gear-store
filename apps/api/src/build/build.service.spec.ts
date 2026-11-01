import type { PrismaService } from '../prisma/prisma.service.js';
import { BuildService } from './build.service.js';

type Row = { slug: string; module: string; price: number; stock: number; colors?: string[] };

const product = ({ slug, module, price, stock, colors = [] }: Row, category: string) => ({
  id: `id-${slug}`,
  isActive: true,
  slug,
  name: slug,
  model: slug.toUpperCase(),
  module,
  price,
  stock,
  category: { slug: category },
  specs: [],
  colors: colors.map((key) => ({ key, label: key, hex: '#000000' })),
});

/** A catalogue with the given slots, read the way loadRulebook reads it. */
function serviceWith(slots: Record<string, Row[]>) {
  const categories = Object.entries(slots).map(([slug, rows]) => ({
    slug,
    name: slug,
    description: `About ${slug}`,
    products: rows.map((r) => product(r, slug)),
  }));
  const prisma = {
    category: { findMany: vi.fn().mockResolvedValue(categories) },
    partConflict: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return new BuildService(prisma as unknown as PrismaService);
}

describe('BuildService.catalog', () => {
  it('starts every slot from its cheapest part in stock, the best-stocked among equals, and prices that bike', async () => {
    const catalog = await serviceWith({
      frames: [{ slug: 'frame-m', module: 'FRAME', price: 5_000, stock: 2, colors: ['signal', 'moss'] }],
      batteries: [
        { slug: 'battery-a', module: 'BATTERY', price: 1_000, stock: 1 },
        { slug: 'battery-b', module: 'BATTERY', price: 1_000, stock: 9 },
        { slug: 'battery-c', module: 'BATTERY', price: 500, stock: 0 },
      ],
    }).catalog();
    expect(catalog.slots.map((s) => [s.category, s.defaultSlug, s.description])).toEqual([
      ['frames', 'frame-m', 'About frames'],
      ['batteries', 'battery-b', 'About batteries'],
    ]);
    expect(catalog.slots[1]!.options.map((o) => o.slug)).toEqual(['battery-c', 'battery-a', 'battery-b']);
    expect(catalog.fromPrice).toBe(6_000);
  });

  it('offers no starting part for a sold-out slot, and no from-price', async () => {
    const catalog = await serviceWith({
      frames: [{ slug: 'frame-m', module: 'FRAME', price: 5_000, stock: 2, colors: ['signal'] }],
      batteries: [{ slug: 'battery-a', module: 'BATTERY', price: 1_000, stock: 0 }],
    }).catalog();
    expect(catalog.slots.map((s) => s.defaultSlug)).toEqual(['frame-m', null]);
    expect(catalog.fromPrice).toBeNull();
  });

  it('prices the start without a colour when no frame carries finishes', async () => {
    const catalog = await serviceWith({
      frames: [{ slug: 'frame-raw', module: 'FRAME', price: 5_000, stock: 2 }],
    }).catalog();
    expect(catalog.fromPrice).toBe(5_000);
  });

  it('has no from-price for an empty catalogue', async () => {
    const catalog = await serviceWith({}).catalog();
    expect(catalog).toMatchObject({ slots: [], conflicts: [], fromPrice: null });
  });
});

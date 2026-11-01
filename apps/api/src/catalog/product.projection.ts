import type { ProductSummary } from '@gear-store/shared';
import type { Prisma } from '../generated/prisma/client.js';

export const summarySelect = {
  slug: true,
  name: true,
  model: true,
  module: true,
  price: true,
  stock: true,
  category: { select: { slug: true } },
  specs: { where: { onPlate: true }, orderBy: { position: 'asc' }, select: { label: true, value: true } },
} satisfies Prisma.ProductSelect;

type SummaryRow = Prisma.ProductGetPayload<{ select: typeof summarySelect }>;

export function toSummary(row: SummaryRow): ProductSummary {
  const { category, specs, ...rest } = row;
  return { ...rest, category: category.slug, plate: specs };
}

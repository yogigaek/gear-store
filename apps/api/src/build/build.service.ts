import { Injectable } from '@nestjs/common';
import type { BuildCatalog, BuildQuote, BuildSelection, Color } from '@gear-store/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { summarySelect, toSummary } from '../catalog/product.projection.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  carriesColour,
  checkBuild,
  conflictKey,
  type CheckedBuild,
  type RulePart,
  type Rulebook,
} from './build-rules.js';

export const BUILD_NAME = 'Rakit E-1';

const partSelect = {
  ...summarySelect,
  id: true,
  isActive: true,
  colors: { orderBy: { position: 'asc' }, select: { key: true, label: true, hex: true } },
} satisfies Prisma.ProductSelect;

/** what a rulebook reads; a transaction client fits, so a checkout checks what it then charges for */
type Db = Pick<PrismaService, 'category' | 'partConflict'>;

/** the rules plus what only the configurator needs: slot descriptions, swatches, conflicts as pairs */
export interface BuildBook extends Rulebook {
  descriptions: Map<string, string>;
  swatches: Map<string, Color[]>;
  pairs: { a: string; b: string; reason: string }[];
}

/**
 * The E-1 build: which parts go in which slot, which pairs cannot be combined, and what a chosen build
 * costs. Every check runs on the server against today's catalogue; the browser only says what it chose.
 */
@Injectable()
export class BuildService {
  constructor(private readonly prisma: PrismaService) {}

  /** Slots in build order, each with its active parts, plus the conflicts between them. */
  async catalog(): Promise<BuildCatalog> {
    const book = await this.book();
    const active = [...book.parts.values()].filter((p) => p.isActive);
    const slots = book.slots.map((slot) => {
      const options = active
        .filter((p) => p.summary.category === slot.category)
        .sort((a, b) => a.summary.price - b.summary.price || a.id.localeCompare(b.id));
      return {
        category: slot.category,
        name: slot.name,
        description: book.descriptions.get(slot.category) ?? '',
        options: options.map((p) => ({ ...p.summary, colors: book.swatches.get(p.summary.slug) ?? [] })),
        defaultSlug: startingPart(options)?.summary.slug ?? null,
      };
    });
    // the starting build is every slot's cheapest part in stock, so when it can be made it is the cheapest bike
    const start = slots.flatMap((s) => (s.defaultSlug ? [[s.category, s.defaultSlug] as const] : []));
    const frame = start.map(([, slug]) => book.parts.get(slug)).find((p) => p && carriesColour(p));
    const starting = checkBuild(book, {
      parts: Object.fromEntries(start),
      colorKey: frame?.colors.keys().next().value ?? '',
    });
    return {
      name: BUILD_NAME,
      slots,
      conflicts: book.pairs,
      fromPrice: slots.length > 0 && starting.problems.length === 0 ? starting.unitPrice : null,
    };
  }

  async quote(selection: BuildSelection, quantity = 1): Promise<BuildQuote> {
    return toQuote(checkBuild(await this.book(), selection, quantity));
  }

  /** The rulebook only when there are builds to check; carts of single parts skip the queries. */
  bookFor(builds: number, db: Db = this.prisma): Promise<BuildBook> {
    return builds > 0 ? this.book(db) : Promise.resolve(emptyBook());
  }

  /** The catalogue the rules run against: every part in a slot category, active or not, and the conflicts. */
  book(db: Db = this.prisma): Promise<BuildBook> {
    return loadRulebook(db);
  }
}

function emptyBook(): BuildBook {
  return {
    slots: [],
    parts: new Map(),
    conflicts: new Map(),
    descriptions: new Map(),
    swatches: new Map(),
    pairs: [],
  };
}

/** {@link BuildService.book}, for code outside Nest such as the seed */
export async function loadRulebook(db: Db): Promise<BuildBook> {
  // one after the other: `db` may be a transaction, whose single connection takes one query at a time
  const categories = await db.category.findMany({
    where: { slot: { not: null } },
    orderBy: { slot: 'asc' },
    select: { slug: true, name: true, description: true, products: { select: partSelect } },
  });
  const conflicts = await db.partConflict.findMany({
    select: { reason: true, a: { select: { slug: true } }, b: { select: { slug: true } } },
  });
  const parts = new Map<string, RulePart>();
  const swatches = new Map<string, Color[]>();
  for (const category of categories) {
    for (const { id, isActive, colors, ...summary } of category.products) {
      parts.set(summary.slug, {
        id,
        isActive,
        colors: new Map(colors.map((c) => [c.key, c.label])),
        summary: toSummary(summary),
      });
      swatches.set(summary.slug, colors);
    }
  }
  const pairs = conflicts.map((c) => ({ a: c.a.slug, b: c.b.slug, reason: c.reason }));
  return {
    slots: categories.map((c) => ({ category: c.slug, name: c.name })),
    parts,
    conflicts: new Map(pairs.map((p) => [conflictKey(p.a, p.b), p.reason])),
    descriptions: new Map(categories.map((c) => [c.slug, c.description])),
    swatches,
    pairs,
  };
}

/** the part a first visit starts from: the cheapest in stock, the best-stocked one among equals */
function startingPart(options: RulePart[]): RulePart | undefined {
  const inStock = options.filter((p) => p.summary.stock > 0);
  const cheapest = inStock[0]?.summary.price;
  return inStock
    .filter((p) => p.summary.price === cheapest)
    .sort((a, b) => b.summary.stock - a.summary.stock)[0];
}

export function toQuote(checked: CheckedBuild): BuildQuote {
  return {
    label: BUILD_NAME,
    colorKey: checked.colorKey,
    colorLabel: checked.colorLabel,
    parts: checked.parts.map(({ slot, part }) => ({
      slot: slot.category,
      slotName: slot.name,
      product: part.summary,
    })),
    unitPrice: checked.unitPrice,
    problems: checked.problems,
  };
}

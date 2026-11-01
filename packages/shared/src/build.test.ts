import { describe, expect, it } from 'vitest';
import {
  buildCatalogSchema,
  buildProblemSchema,
  buildQuoteInputSchema,
  buildSelectionSchema,
  MAX_LINE_QUANTITY,
} from './build.js';
import { guestCartSchema } from './cart.js';

describe('build schemas', () => {
  it('takes a part per slot and a frame colour', () => {
    const selection = { parts: { frames: 'e1-frame-m', batteries: 'e1-battery-750' }, colorKey: 'signal' };
    expect(buildSelectionSchema.parse(selection)).toEqual(selection);
  });

  it.each([
    [{ parts: { frames: 'Frame M' }, colorKey: 'signal' }, 'a slug with spaces'],
    [{ parts: { 'frames; DROP': 'e1-frame-m' }, colorKey: 'signal' }, 'a slot key that is not a slug'],
    [
      { parts: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`slot-${i}`, 'x'])), colorKey: '' },
      'more slots than a bike has',
    ],
  ])('rejects %o (%s)', (input) => {
    expect(buildSelectionSchema.safeParse(input).success).toBe(false);
  });

  it('defaults a guest cart without builds to none, and needs a key on each build', () => {
    expect(guestCartSchema.parse({ items: [] })).toEqual({ items: [], builds: [] });
    const build = { parts: { frames: 'e1-frame-m' }, colorKey: 'signal', quantity: 1 };
    expect(guestCartSchema.safeParse({ items: [], builds: [build] }).success).toBe(false);
    expect(
      guestCartSchema.safeParse({ items: [], builds: [{ ...build, key: crypto.randomUUID() }] }).success,
    ).toBe(true);
  });
});

describe('build boundaries', () => {
  const slots = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`slot-${i}`, 'x']));

  it('takes up to 12 slots, and none', () => {
    expect(buildSelectionSchema.safeParse({ parts: slots(12), colorKey: '' }).success).toBe(true);
    expect(buildSelectionSchema.safeParse({ parts: {}, colorKey: '' }).success).toBe(true);
    expect(buildSelectionSchema.safeParse({ parts: slots(13), colorKey: '' }).error?.issues[0]?.message).toBe(
      'Too many slots',
    );
  });

  it('caps the colour key at 40 characters', () => {
    expect(buildSelectionSchema.safeParse({ parts: {}, colorKey: 'x'.repeat(40) }).success).toBe(true);
    expect(buildSelectionSchema.safeParse({ parts: {}, colorKey: 'x'.repeat(41) }).success).toBe(false);
  });

  it('quotes 1 bike by default and up to 10', () => {
    expect(buildQuoteInputSchema.parse({ parts: {}, colorKey: '' }).quantity).toBe(1);
    expect(
      buildQuoteInputSchema.parse({ parts: {}, colorKey: '', quantity: MAX_LINE_QUANTITY }).quantity,
    ).toBe(10);
    for (const quantity of [0, 11, 1.5])
      expect(buildQuoteInputSchema.safeParse({ parts: {}, colorKey: '', quantity }).success).toBe(false);
  });

  it('names a build problem by a known kind only', () => {
    expect(buildProblemSchema.safeParse({ kind: 'CONFLICT', message: 'x', slots: ['forks'] }).success).toBe(
      true,
    );
    expect(buildProblemSchema.safeParse({ kind: 'TOO_HEAVY', message: 'x', slots: [] }).success).toBe(false);
  });

  it('gives no starting price when the starting build cannot be made', () => {
    const catalog = { name: 'E-1', slots: [], conflicts: [], fromPrice: null };
    expect(buildCatalogSchema.safeParse(catalog).success).toBe(true);
    expect(buildCatalogSchema.safeParse({ ...catalog, fromPrice: -1 }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { buildSelectionSchema } from './build.js';
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

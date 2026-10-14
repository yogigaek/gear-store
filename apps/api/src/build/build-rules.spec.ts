import type { ProductSummary } from '@gear-store/shared';
import { describe, expect, it } from 'vitest';
import { checkBuild, conflictKey, type RulePart, type Rulebook } from './build-rules.js';

function part(slug: string, category: string, price: number, extra: Partial<RulePart> = {}): RulePart {
  const summary: ProductSummary = {
    slug,
    name: slug,
    model: slug.toUpperCase(),
    category,
    module: 'FRAME',
    price,
    stock: 5,
    plate: [],
  };
  return { id: slug, isActive: true, colors: new Map(), summary, ...extra };
}

const frameS = part('frame-s', 'frames', 10_000, {
  colors: new Map([
    ['signal', 'Signal yellow'],
    ['moss', 'Moss green'],
  ]),
});
const frameM = part('frame-m', 'frames', 10_000, { colors: frameS.colors });
const battery625 = part('battery-625', 'batteries', 4_000);
const battery750 = part('battery-750', 'batteries', 6_000);

const book: Rulebook = {
  slots: [
    { category: 'frames', name: 'Frames' },
    { category: 'batteries', name: 'Batteries' },
  ],
  parts: new Map([frameS, frameM, battery625, battery750].map((p) => [p.summary.slug, p])),
  conflicts: new Map([[conflictKey('frame-s', 'battery-750'), 'Too long for the S frame.']]),
};

const kinds = (selection: Parameters<typeof checkBuild>[1], quantity?: number) =>
  checkBuild(book, selection, quantity).problems.map((p) => p.kind);

describe('checkBuild', () => {
  it('takes the colour from the frame, not from another part that has finishes', () => {
    const anodised = part('battery-anodised', 'batteries', 5_000, {
      colors: new Map([['raw', 'Raw alloy']]),
    });
    anodised.summary.module = 'BATTERY';
    // the battery's slot comes first, so "the first part with finishes" would be the battery
    const withAnodised: Rulebook = {
      ...book,
      slots: [...book.slots].reverse(),
      parts: new Map([...book.parts, ['battery-anodised', anodised]]),
    };
    const result = checkBuild(withAnodised, {
      parts: { frames: 'frame-m', batteries: 'battery-anodised' },
      colorKey: 'moss',
    });
    expect(result.problems).toEqual([]);
    expect(result.colorLabel).toBe('Moss green');
  });

  it('prices a complete, compatible build as the sum of its parts', () => {
    const result = checkBuild(book, {
      parts: { frames: 'frame-m', batteries: 'battery-750' },
      colorKey: 'moss',
    });
    expect(result.problems).toEqual([]);
    expect(result.unitPrice).toBe(16_000);
    expect(result.colorLabel).toBe('Moss green');
    expect(result.parts.map((p) => p.slot.category)).toEqual(['frames', 'batteries']);
  });

  it('names the slot that is still empty', () => {
    const [problem] = checkBuild(book, { parts: { frames: 'frame-m' }, colorKey: 'signal' }).problems;
    expect(problem).toEqual({ kind: 'MISSING_PART', message: 'Choose a battery.', slots: ['batteries'] });
  });

  it('refuses parts that conflict, with the reason, in either order', () => {
    const forward = checkBuild(book, {
      parts: { frames: 'frame-s', batteries: 'battery-750' },
      colorKey: 'signal',
    });
    expect(forward.problems).toEqual([
      { kind: 'CONFLICT', message: 'Too long for the S frame.', slots: ['frames', 'batteries'] },
    ]);
    expect(conflictKey('battery-750', 'frame-s')).toBe(conflictKey('frame-s', 'battery-750'));
  });

  it('refuses a part in the wrong slot, an unknown slot, and a part no longer sold', () => {
    expect(kinds({ parts: { frames: 'battery-625', batteries: 'battery-625' }, colorKey: '' })).toContain(
      'WRONG_SLOT',
    );
    expect(
      kinds({ parts: { frames: 'frame-m', batteries: 'battery-625', bell: 'x' }, colorKey: 'signal' }),
    ).toEqual(['WRONG_SLOT']);
    const retired: Rulebook = {
      ...book,
      parts: new Map([...book.parts, ['battery-625', { ...battery625, isActive: false }]]),
    };
    expect(
      checkBuild(retired, { parts: { frames: 'frame-m', batteries: 'battery-625' }, colorKey: 'signal' })
        .problems,
    ).toMatchObject([{ kind: 'UNKNOWN_PART', slots: ['batteries'] }]);
  });

  it('needs a colour the frame comes in', () => {
    expect(kinds({ parts: { frames: 'frame-m', batteries: 'battery-625' }, colorKey: 'pink' })).toEqual([
      'UNKNOWN_COLOR',
    ]);
  });

  it('checks stock against the number of bikes', () => {
    const selection = { parts: { frames: 'frame-m', batteries: 'battery-625' }, colorKey: 'signal' };
    expect(kinds(selection, 5)).toEqual([]);
    expect(checkBuild(book, selection, 6).problems).toMatchObject([
      { kind: 'OUT_OF_STOCK', message: 'Only 5 of frame-m left.' },
      { kind: 'OUT_OF_STOCK', message: 'Only 5 of battery-625 left.' },
    ]);
  });
});

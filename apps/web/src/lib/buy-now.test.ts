import { describe, expect, it } from 'vitest';
import { buyNowPath, finishSwapNote, parseBuyLine } from './buy-now';

const read = (query: string) => parseBuyLine(new URLSearchParams(query));

describe('parseBuyLine', () => {
  it('reads a part, its finish and a quantity', () => {
    expect(read('buy=e1-frame-m&finish=signal&qty=1')).toEqual({
      slug: 'e1-frame-m',
      colorKey: 'signal',
      quantity: 1,
    });
    expect(read('buy=folding-lock&qty=10')).toEqual({ slug: 'folding-lock', colorKey: '', quantity: 10 });
    expect(read('buy=folding-lock&finish=')).toEqual({ slug: 'folding-lock', colorKey: '', quantity: 1 });
  });

  it('refuses anything a link could slip in', () => {
    for (const query of [
      '',
      'buy=',
      'buy=Folding-Lock',
      'buy=..%2Forders',
      'buy=folding-lock&buy=rear-rack',
      'buy=folding-lock&finish=Signal+yellow',
      `buy=folding-lock&finish=${'a'.repeat(41)}`,
      'buy=folding-lock&finish=signal&finish=moss',
      'buy=folding-lock&qty=0',
      'buy=folding-lock&qty=11',
      'buy=folding-lock&qty=1.5',
      'buy=folding-lock&qty=-1',
      'buy=folding-lock&qty=',
      'buy=folding-lock&qty=1&qty=2',
    ]) {
      expect(read(query), query).toBeNull();
    }
  });

  it('round-trips through buyNowPath', () => {
    for (const line of [
      { slug: 'e1-frame-m', colorKey: 'moss', quantity: 2 },
      { slug: 'folding-lock', colorKey: '', quantity: 1 },
    ]) {
      const path = buyNowPath(line);
      expect(path.startsWith('/checkout?')).toBe(true);
      expect(read(path.slice('/checkout?'.length))).toEqual(line);
    }
    expect(buyNowPath({ slug: 'folding-lock', colorKey: '', quantity: 1 })).toBe(
      '/checkout?buy=folding-lock&qty=1',
    );
  });
});

describe('finishSwapNote', () => {
  const moss = { colorKey: 'moss', colorLabel: 'Moss green' };

  it('says nothing when the quote keeps the finish, or the link named none', () => {
    expect(finishSwapNote('moss', moss)).toBeNull();
    expect(finishSwapNote('', moss)).toBeNull();
  });

  it('names the swap, with the asked finish when it is known', () => {
    expect(finishSwapNote('signal', moss, 'Signal yellow')).toBe(
      'Signal yellow is no longer offered; this is Moss green.',
    );
    expect(finishSwapNote('signal', moss)).toBe(
      'The finish you picked is no longer offered; this is Moss green.',
    );
    expect(finishSwapNote('signal', { colorKey: '', colorLabel: null })).toBe(
      'The finish you picked is not offered for this part.',
    );
  });
});

describe('parseBuyLine boundaries', () => {
  it('reads 1 and 10, leading zeros included, and the longest finish and slug', () => {
    expect(read('buy=folding-lock&qty=01')?.quantity).toBe(1);
    expect(read('buy=folding-lock&qty=10')?.quantity).toBe(10);
    expect(read(`buy=folding-lock&finish=${'a'.repeat(40)}`)?.colorKey).toBe('a'.repeat(40));
    expect(read(`buy=${'a'.repeat(80)}`)?.slug).toBe('a'.repeat(80));
    expect(read('buy=folding-lock&utm_source=x&next=//evil.example')).toEqual({
      slug: 'folding-lock',
      colorKey: '',
      quantity: 1,
    });
  });

  it.each([
    'buy=folding-lock&qty=00',
    'buy=folding-lock&qty=010',
    'buy=folding-lock&qty=%201',
    'buy=folding-lock&qty=1e1',
    'buy=folding-lock&qty=%EF%BC%91',
    `buy=${'a'.repeat(81)}`,
    'buy=folding-lock%00',
    'buy=folding-lock&finish=-signal',
    'buy=folding-lock&finish=signal-',
    'buy=folding-lock&finish=sig--nal',
    'buy=folding-lock&finish=%3Cscript%3E',
    'buy=%2F%2Fevil.example',
    'qty=1&finish=signal',
  ])('refuses %j', (query) => {
    expect(read(query)).toBeNull();
  });
});

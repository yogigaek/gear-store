import { describe, expect, it } from 'vitest';
import { buyParams, parseBuyLine } from './buy-now';

describe('parseBuyLine', () => {
  it('reads a part, its finish and a quantity', () => {
    expect(parseBuyLine({ buy: 'e1-frame-m', finish: 'signal', qty: '1' })).toEqual({
      slug: 'e1-frame-m',
      colorKey: 'signal',
      quantity: 1,
    });
    expect(parseBuyLine({ buy: 'folding-lock', qty: '10' })).toEqual({
      slug: 'folding-lock',
      colorKey: '',
      quantity: 10,
    });
    expect(parseBuyLine({ buy: 'folding-lock', finish: '' })).toEqual({
      slug: 'folding-lock',
      colorKey: '',
      quantity: 1,
    });
  });

  it('refuses anything a link could slip in', () => {
    for (const params of [
      {},
      { buy: '' },
      { buy: 'Folding-Lock' },
      { buy: '../orders' },
      { buy: ['folding-lock'] },
      { buy: 'folding-lock', finish: 'Signal yellow' },
      { buy: 'folding-lock', finish: 'a'.repeat(41) },
      { buy: 'folding-lock', finish: ['signal'] },
      { buy: 'folding-lock', qty: '0' },
      { buy: 'folding-lock', qty: '11' },
      { buy: 'folding-lock', qty: '1.5' },
      { buy: 'folding-lock', qty: '-1' },
      { buy: 'folding-lock', qty: '' },
    ]) {
      expect(parseBuyLine(params)).toBeNull();
    }
  });

  it('round-trips through buyParams', () => {
    for (const line of [
      { slug: 'e1-frame-m', colorKey: 'moss', quantity: 2 },
      { slug: 'folding-lock', colorKey: '', quantity: 1 },
    ]) {
      expect(parseBuyLine(buyParams(line))).toEqual(line);
    }
    expect(buyParams({ slug: 'folding-lock', colorKey: '', quantity: 1 })).toEqual({
      buy: 'folding-lock',
      qty: '1',
    });
  });
});

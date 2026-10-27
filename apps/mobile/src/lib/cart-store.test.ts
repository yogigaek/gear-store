import { describe, expect, it } from 'vitest';
import { parseStored, subtract } from './cart-store';

const line = (slug: string, quantity: number, colorKey = '') => ({ slug, colorKey, quantity });

describe('subtract', () => {
  it('takes merged quantities off, part by part and finish by finish', () => {
    expect(subtract([line('stem-a', 3), line('bar-b', 1, 'ember')], [line('stem-a', 2)])).toEqual([
      line('stem-a', 1),
      line('bar-b', 1, 'ember'),
    ]);
  });

  it('drops a line once all of it was merged, or more', () => {
    expect(subtract([line('stem-a', 2)], [line('stem-a', 2)])).toEqual([]);
    expect(subtract([line('stem-a', 2)], [line('stem-a', 5)])).toEqual([]);
  });

  it('keeps what was added after the merge started', () => {
    // merged 2, the phone has 3 by the time the reply arrives: one is new
    expect(subtract([line('stem-a', 3), line('new-c', 1)], [line('stem-a', 2)])).toEqual([
      line('stem-a', 1),
      line('new-c', 1),
    ]);
  });

  it('treats the same part in another finish as another line', () => {
    expect(subtract([line('frame-m', 1, 'ember')], [line('frame-m', 1, 'moss')])).toEqual([
      line('frame-m', 1, 'ember'),
    ]);
  });
});

describe('parseStored', () => {
  const key = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff';

  it('reads what the app writes', () => {
    const stored = {
      items: [line('stem-a', 2)],
      pending: { key, cart: { items: [line('bar-b', 1)], builds: [] } },
    };
    expect(parseStored(JSON.stringify(stored))).toEqual(stored);
  });

  it('starts empty when there is nothing, or nothing readable', () => {
    for (const raw of [null, '', 'not json', '"a string"', '[1,2]']) {
      expect(parseStored(raw)).toEqual({ items: [], pending: null });
    }
  });

  it('drops only the lines it cannot read, and caps an over-limit quantity at 10', () => {
    const raw = JSON.stringify({
      items: [line('BAD SLUG', 1), 'junk', line('bar-b', 3), line('stem-a', 11), line('x-y', -2)],
    });
    expect(parseStored(raw).items).toEqual([line('bar-b', 3), line('stem-a', 10)]);
  });

  it('keeps at most 50 lines', () => {
    const items = Array.from({ length: 60 }, (_, i) => line(`part-${i}`, 1));
    expect(parseStored(JSON.stringify({ items })).items).toHaveLength(50);
  });

  it('keeps a valid pending merge when the stored lines are unreadable', () => {
    const pending = { key, cart: { items: [line('bar-b', 1)], builds: [] } };
    expect(parseStored(JSON.stringify({ items: 'not a list', pending }))).toEqual({ items: [], pending });
  });

  it('ignores a malformed pending merge but keeps the lines', () => {
    const raw = JSON.stringify({ items: [line('stem-a', 1)], pending: { key: 'not-a-uuid', cart: {} } });
    expect(parseStored(raw)).toEqual({ items: [line('stem-a', 1)], pending: null });
  });
});

import { describe, expect, it } from 'vitest';
import { groupOrderLines } from './order-lines';
import { statusLabels } from './order-status';
import { orderStatuses } from '@gear-store/shared';

const item = (slug: string, buildId: string | null) => ({
  slug,
  name: slug,
  model: slug,
  category: null,
  module: null,
  colorKey: '',
  colorLabel: null,
  unitPrice: 1,
  quantity: 1,
  lineTotal: 1,
  buildId,
});
const build = (id: string) => ({
  id,
  label: id,
  colorKey: '',
  colorLabel: null,
  quantity: 1,
  unitPrice: 1,
  lineTotal: 1,
});

describe('groupOrderLines', () => {
  it('lists each bike with its own parts, then the parts bought alone', () => {
    const order = {
      builds: [build('b1'), build('b2')],
      items: [item('frame', 'b1'), item('lock', null), item('fork', 'b2'), item('seat', 'b1')],
    };
    const { bikes, singles } = groupOrderLines(order);
    expect(bikes.map((b) => [b.build.id, b.parts.map((p) => p.slug)])).toEqual([
      ['b1', ['frame', 'seat']],
      ['b2', ['fork']],
    ]);
    expect(singles.map((s) => s.slug)).toEqual(['lock']);
  });

  it('reads an order of parts only, and an empty one', () => {
    expect(groupOrderLines({ builds: [], items: [item('lock', null)] }).bikes).toEqual([]);
    expect(groupOrderLines({ builds: [], items: [] })).toEqual({ bikes: [], singles: [] });
  });

  it('shows a bike with no parts listed as a bike, not as nothing', () => {
    expect(groupOrderLines({ builds: [build('b1')], items: [] }).bikes).toEqual([
      { build: build('b1'), parts: [] },
    ]);
  });
});

describe('statusLabels', () => {
  it('names every order status', () => {
    for (const status of orderStatuses) expect(statusLabels[status]).toMatch(/^[A-Z]/);
    expect(Object.keys(statusLabels)).toHaveLength(orderStatuses.length);
  });
});

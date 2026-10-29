import { describe, expect, it } from 'vitest';
import { ORDERS_PAGE, shownOrders } from './order-list';

describe('shownOrders', () => {
  it('reads the count the list was left at', () => {
    expect(shownOrders('20')).toBe(20);
    expect(shownOrders('50')).toBe(50);
  });

  it('starts at the first page for a missing, short or odd value', () => {
    for (const value of [null, '', '0', '3', '-10', '1e3', '20.5', ' 20', '1000', 'abc']) {
      expect(shownOrders(value), String(value)).toBe(ORDERS_PAGE);
    }
  });
});

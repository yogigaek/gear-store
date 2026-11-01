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

describe('shownOrders boundaries', () => {
  it('shows at least one page, and up to 999 rows from a three-digit value', () => {
    expect(shownOrders('9')).toBe(ORDERS_PAGE);
    expect(shownOrders('10')).toBe(10);
    expect(shownOrders('11')).toBe(11);
    expect(shownOrders('010')).toBe(10);
    expect(shownOrders('999')).toBe(999);
    expect(shownOrders('20\n')).toBe(ORDERS_PAGE);
  });
});

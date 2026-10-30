/** how many orders the list shows at first, and adds with each "Show older" */
export const ORDERS_PAGE = 10;

/** `?show=` as a row count, so Back from an older order shows the same rows; anything odd is the first page */
export function shownOrders(param: string | null): number {
  if (!param || !/^\d{1,3}$/.test(param)) return ORDERS_PAGE;
  return Math.max(ORDERS_PAGE, Number(param));
}

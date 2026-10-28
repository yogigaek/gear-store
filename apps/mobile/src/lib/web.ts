import { orderNumberSchema } from '@gear-store/shared';
import * as WebBrowser from 'expo-web-browser';
import { buyParams, parseBuyLine, type BuyParams } from './buy-now';

/** the Rakit website, where the 3D configurator and the admin live */
export const WEB_URL = 'https://yogi-store.vercel.app';

export const openWeb = (path: string) => WebBrowser.openBrowserAsync(`${WEB_URL}${path}`);

type Param = string | string[] | undefined;

/** where a sign-in goes next: a screen that sent the shopper to sign in */
export type AfterSignIn =
  | '/checkout'
  | { pathname: '/checkout'; params: BuyParams }
  | '/orders'
  | { pathname: '/orders/[number]'; params: { number: string } };

/**
 * Where a sign-in goes next, from `next` and its params, which can arrive from outside the app (rakit:// links):
 * checkout, carrying a Buy now's part when its params are valid (parseBuyLine); the orders list; or one order whose
 * number reads as an order number. Anything else is ignored.
 */
export function afterSignIn(params: {
  next?: Param;
  buy?: Param;
  finish?: Param;
  qty?: Param;
  number?: Param;
}): AfterSignIn | null {
  if (params.next === 'orders') return '/orders';
  if (params.next === 'order') {
    const { number } = params;
    return typeof number === 'string' && orderNumberSchema.safeParse(number).success
      ? { pathname: '/orders/[number]', params: { number } }
      : null;
  }
  if (params.next !== 'checkout') return null;
  const line = parseBuyLine(params);
  return line ? { pathname: '/checkout', params: buyParams(line) } : '/checkout';
}

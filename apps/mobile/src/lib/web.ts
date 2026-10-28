import * as WebBrowser from 'expo-web-browser';
import { buyParams, parseBuyLine, type BuyParams } from './buy-now';

/** the Rakit website, where the 3D configurator and the admin live */
export const WEB_URL = 'https://yogi-store.vercel.app';

export const openWeb = (path: string) => WebBrowser.openBrowserAsync(`${WEB_URL}${path}`);

type Param = string | string[] | undefined;

/**
 * Where a sign-in started from checking out goes next: checkout, carrying a Buy now's part when its params are
 * valid (parseBuyLine). Any other `next` is ignored, and so are buy params that do not read as one line.
 */
export function afterSignIn(params: {
  next?: Param;
  buy?: Param;
  finish?: Param;
  qty?: Param;
}): '/checkout' | { pathname: '/checkout'; params: BuyParams } | null {
  if (params.next !== 'checkout') return null;
  const line = parseBuyLine(params);
  return line ? { pathname: '/checkout', params: buyParams(line) } : '/checkout';
}

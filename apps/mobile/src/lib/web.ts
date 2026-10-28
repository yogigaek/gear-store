import * as WebBrowser from 'expo-web-browser';

/** the Rakit website, where the 3D configurator and the admin live */
export const WEB_URL = 'https://yogi-store.vercel.app';

export const openWeb = (path: string) => WebBrowser.openBrowserAsync(`${WEB_URL}${path}`);

/** where a sign-in started from "Buy now" goes next; any other value is ignored */
export function afterSignIn(next: string | string[] | undefined): '/checkout' | null {
  return next === 'checkout' ? '/checkout' : null;
}

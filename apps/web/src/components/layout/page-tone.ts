import { useMatches } from 'react-router';

export type PageTone = 'light' | 'dark';

/**
 * Route handles set a page's tone:
 *  - no tone: a store page, dark; its content uses the light-ground tokens, turned over by `.surface-dark`;
 *  - `stage`: the home and account pages, drawn dark by hand around the 3D (no turning over);
 *  - `light`: the bench tokens as they are, on the light ground (no page is drawn this way today).
 */
type Handle = { tone?: 'stage' | 'light' } | undefined;

function useTones() {
  return useMatches().map((m) => (m.handle as Handle)?.tone);
}

/** the header, footer, document and cart drawer follow this */
export function usePageTone(): PageTone {
  return useTones().includes('light') ? 'light' : 'dark';
}

/** a store page whose content is turned over onto the dark ground */
export function useTurnedOver(): boolean {
  const tones = useTones();
  return !tones.includes('light') && !tones.includes('stage');
}

import { useMatches } from 'react-router';

export type PageTone = 'light' | 'dark';

/** a page on a dark stage asks for a dark header, footer and document through its route handle */
export function usePageTone(): PageTone {
  const dark = useMatches().some((m) => (m.handle as { tone?: string } | undefined)?.tone === 'dark');
  return dark ? 'dark' : 'light';
}

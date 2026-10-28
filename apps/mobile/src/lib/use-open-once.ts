import { router, type Href } from 'expo-router';
import { useCallback, useRef } from 'react';

/** router.push for a tap: a quick second tap would push the same screen twice */
export function useOpenOnce(): (to: Href) => void {
  const opening = useRef(false);
  return useCallback((to: Href) => {
    if (opening.current) return;
    opening.current = true;
    router.push(to);
    setTimeout(() => (opening.current = false), 600);
  }, []);
}

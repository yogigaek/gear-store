import { useSyncExternalStore } from 'react';

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

let cached: boolean | undefined;
const support = () => (cached ??= hasWebGL());

/** false on the server render path and on devices without WebGL, where the 2D drawing is shown instead */
export function useCanRender3D(): boolean {
  return useSyncExternalStore(
    () => () => {},
    support,
    () => false,
  );
}

const motionQuery = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(motionQuery, true);
}

function useMediaQuery(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** touch-first devices, where a one-finger drag must scroll the page, not spin the model */
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)', false);
}

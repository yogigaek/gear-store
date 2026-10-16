import { useSyncExternalStore } from 'react';

/**
 * WebGL drawn in software (no GPU, or a blocked driver: SwiftShader, llvmpipe) runs a frame in seconds and
 * starves the page, so a click takes a minute. Such a device gets the still instead. Rendering stills on
 * purpose (`?still=1`, scripts/render-parts.mjs) is the one place software rendering is wanted.
 */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software/i;

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    if (new URLSearchParams(window.location.search).has('still')) {
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    }
    const options: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    const gl = canvas.getContext('webgl2', options) ?? canvas.getContext('webgl', options);
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !SOFTWARE_RENDERER.test(renderer);
  } catch {
    return false;
  }
}

let cached: boolean | undefined;
const support = () => (cached ??= hasWebGL());

/** false on the server render path and on devices without WebGL, where the 2D drawing is shown instead */
/**
 * Probing WebGL creates a GL context, which costs a few hundred ms on a slow phone: pass `when = false` until
 * the 3D is actually about to show, and nothing is probed.
 */
export function useCanRender3D(when = true): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => when && support(),
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

/** a wide screen with a mouse or trackpad: where the hero can afford to load 3D on its own */
export function useWideFinePointer(): boolean {
  return useMediaQuery('(min-width: 1024px) and (pointer: fine)', false);
}

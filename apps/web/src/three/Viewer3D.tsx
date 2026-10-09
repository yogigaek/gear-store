import { lazy, Suspense, useEffect, useState } from 'react';
import { ProductArt } from '../components/product/ProductArt';
import type { ProductViewerProps } from './ProductViewer';
import { useCanRender3D } from './useCanRender3D';

const ProductViewer = lazy(() => import('./ProductViewer'));

type Load =
  /** after the page has painted and the main thread is free: the 3D never delays the first view */
  | 'idle'
  /** only when the visitor asks for it: three.js is not even downloaded until then */
  | 'on-request';

/** 3D when the device can draw it, otherwise the line drawing; the drawing also stands in while it loads. */
export function Viewer3D({
  category,
  load = 'idle',
  ...props
}: ProductViewerProps & { category: string; load?: Load }) {
  const [ready, setReady] = useState(false);
  // probed only once the 3D is about to show; an on-request viewer never probes until it is asked
  const can3D = useCanRender3D(load === 'idle' || ready);

  useEffect(() => {
    if (load !== 'idle' || !can3D) return;
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(() => setReady(true), { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(t);
  }, [load, can3D]);

  const drawing = (
    <div className="grid h-full place-items-center">
      <ProductArt category={category} className="w-2/5 opacity-60" />
    </div>
  );
  if (ready && !can3D) {
    return (
      <div className="relative h-full">
        {drawing}
        <p className="absolute inset-x-3 bottom-3 text-center font-mono text-xs text-ink-2">
          This browser cannot show 3D (WebGL is off or missing).
        </p>
      </div>
    );
  }
  if (load === 'idle' && !can3D) return drawing;
  if (!ready) {
    return (
      <div className="relative h-full">
        {drawing}
        {load === 'on-request' && (
          <button
            type="button"
            onClick={() => setReady(true)}
            className="absolute bottom-3 left-1/2 min-h-11 -translate-x-1/2 border border-ink bg-alu-50 px-4 font-mono text-xs uppercase tracking-[0.08em] hover:bg-ink hover:text-alu-50"
          >
            View in 3D
          </button>
        )}
      </div>
    );
  }
  return (
    <Suspense fallback={drawing}>
      <ProductViewer {...props} />
    </Suspense>
  );
}

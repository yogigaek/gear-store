import { lazy, Suspense } from 'react';
import type { CategoryId } from '../data/catalog';
import { ProductArt } from '../components/product/ProductArt';
import type { ProductViewerProps } from './ProductViewer';
import { useCanRender3D } from './useCanRender3D';

const ProductViewer = lazy(() => import('./ProductViewer'));

/** 3D when the device can draw it, otherwise the line drawing; the drawing also covers loading. */
export function Viewer3D({ category, ...props }: ProductViewerProps & { category: CategoryId }) {
  const can3D = useCanRender3D();
  const fallback = (
    <div className="grid h-full place-items-center">
      <ProductArt category={category} className="w-2/5 opacity-60" />
    </div>
  );
  if (!can3D) return fallback;
  return (
    <Suspense fallback={fallback}>
      <ProductViewer {...props} />
    </Suspense>
  );
}

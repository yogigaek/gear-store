import { lazy, Suspense, type ReactNode } from 'react';
import { Label } from '../../components/ui/Label';
import { E1_FRAME } from '../../three/bike/layout';
import { useCanRender3D, useCoarsePointer, usePrefersReducedMotion } from '../../three/useCanRender3D';

const AuthScene = lazy(() => import('../../three/bike/AuthScene'));

/**
 * Account pages: the form on the left, the E-1 on a showroom turntable on the right. `aside` sits on that
 * dark panel, below the scene.
 */
export function AuthShell({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="grid lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="px-4 py-10 sm:px-6 sm:py-16 lg:flex lg:items-center lg:py-20">
        <div className="mx-auto w-full max-w-md space-y-6 lg:mr-16 lg:ml-auto">
          <div className="space-y-2">
            <Label>{eyebrow}</Label>
            <h1 className="font-expanded text-3xl font-extrabold uppercase">{title}</h1>
          </div>
          {children}
        </div>
      </div>
      <ScenePanel aside={aside} />
    </div>
  );
}

function ScenePanel({ aside }: { aside?: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  // phones keep the scene still: a turntable redraws every frame and costs battery on a form page
  const coarse = useCoarsePointer();
  const can3D = useCanRender3D();

  return (
    <section
      aria-label="Rakit E-1"
      className="flex flex-col border-t border-ink bg-ink text-alu-50 lg:border-t-0 lg:border-l"
    >
      {/* the scene keeps its own height on phones and takes what the aside leaves on wide screens */}
      <div className="relative h-80 overflow-hidden sm:h-96 lg:h-auto lg:flex-1">
        <div className="absolute inset-0">
          {can3D && (
            <Suspense fallback={null}>
              <AuthScene
                frame={E1_FRAME}
                reducedMotion={reducedMotion || coarse}
                label="The Rakit E-1 electric mountain bike turning on a showroom floor"
              />
            </Suspense>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-6 pb-5 font-mono text-xs tracking-[0.08em] text-bench uppercase sm:px-10">
          <span>Rakit · E-1</span>
          <span>8 modules · one hex key</span>
        </div>
      </div>
      {aside && <div className="border-t border-ink-2 px-6 py-6 sm:px-10">{aside}</div>}
    </section>
  );
}

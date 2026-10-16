import { lazy, Suspense, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { Motion } from '../three/bike/Drivetrain';
import { EBike } from '../three/bike/EBike';
import { E1_COLOURS } from '../three/bike/layout';

const PartStage = lazy(() => import('../three/parts/PartStage'));

/**
 * Development only: the whole E-1 in the parts' photo studio, for scripts/render-parts.mjs to photograph the
 * bike in each frame colour (the cart and order pages show it for a bike). `?colour=<key>`.
 */
export function StudioBikePage() {
  const [params] = useSearchParams();
  const colour = E1_COLOURS.find((c) => c.key === params.get('colour')) ?? E1_COLOURS[0];
  const motion = useMemo<Motion>(() => ({ angle: 0, explode: 0, intro: 1 }), []);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="relative aspect-[4/3] border border-ink bg-stage">
        <Suspense fallback={null}>
          <PartStage
            module="FRAME"
            slug="e1-bike"
            plate={[]}
            name="Rakit E-1"
            frame={colour.hex}
            spin={false}
            still
            label={`The Rakit E-1 in ${colour.name}`}
          >
            <EBike frame={colour.hex} motion={motion} light={false} />
          </PartStage>
        </Suspense>
      </div>
    </div>
  );
}

import { Bounds, Center, ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { PartModule, Spec } from '@gear-store/shared';
import { Suspense, type ReactNode } from 'react';
import { PartModel } from './PartModel';

export interface PartStageProps {
  module: PartModule;
  slug: string;
  plate: readonly Spec[];
  name: string;
  /** the frame's colour; only the frame part shows it */
  frame: string;
  /** a slow turntable; off for reduced motion and for the still renders of the catalogue */
  spin: boolean;
  label: string;
  /** drawn instead of the part, e.g. the whole bike for its studio stills */
  children?: ReactNode;
  /** a still for the catalogue: framed tighter, since nothing will turn it */
  still?: boolean;
}

/** the photo studio's light, the same as the bike's stage, without its scrolling and post-processing */
function StudioLight() {
  const strips = (
    <>
      <Lightformer
        form="rect"
        intensity={2.2}
        position={[0, 4, 0]}
        rotation-x={Math.PI / 2}
        scale={[4, 1.6, 1]}
      />
      <Lightformer
        form="rect"
        intensity={3}
        position={[-3, 1.2, 2]}
        rotation-y={Math.PI / 3}
        scale={[0.4, 3, 1]}
      />
      <Lightformer
        form="rect"
        intensity={2.4}
        position={[3, 1.2, 2]}
        rotation-y={-Math.PI / 3}
        scale={[0.4, 3, 1]}
      />
    </>
  );
  return (
    <>
      <Suspense fallback={<Environment resolution={128}>{strips}</Environment>}>
        <Environment files="/hdri/studio_small_09_1k.hdr" resolution={128} environmentIntensity={1.35}>
          {strips}
        </Environment>
      </Suspense>
      <directionalLight position={[2, 4, 3]} intensity={2.4} color="#fff6ea" />
      <directionalLight position={[-3, 2, -2.5]} intensity={1.2} color="#ffe9c4" />
    </>
  );
}

// Default export so the product page can lazy-load it: three.js stays out of its chunk.
export default function PartStage({
  module,
  slug,
  plate,
  name,
  frame,
  spin,
  label,
  children,
  still = false,
}: PartStageProps) {
  // a part that turns needs room to swing; a bar is long and thin, so it is framed closer either way
  const margin = (module === 'COCKPIT' ? 0.85 : 1) * (still ? 1.0 : 1.2);
  return (
    <Canvas
      // a turntable needs every frame; a still part only redraws when it is turned by hand
      frameloop={spin ? 'always' : 'demand'}
      dpr={[1, 2]}
      camera={{ position: [0.9, 0.55, 1.4], fov: 30, near: 0.01, far: 20 }}
      gl={{ preserveDrawingBuffer: true }}
      role="img"
      aria-label={label}
      data-part-canvas
    >
      <color attach="background" args={['#1b1e20']} />
      <StudioLight />
      <Bounds fit clip observe margin={margin}>
        {/* standing on the floor, centred over the origin */}
        <Center top>
          {children ?? <PartModel module={module} slug={slug} plate={plate} name={name} frame={frame} />}
        </Center>
      </Bounds>
      <ContactShadows position={[0, 0.001, 0]} scale={3} blur={2.6} far={1} opacity={0.6} resolution={512} />
      <OrbitControls
        makeDefault
        autoRotate={spin}
        autoRotateSpeed={0.8}
        enablePan={false}
        enableDamping
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 + 0.1}
      />
    </Canvas>
  );
}

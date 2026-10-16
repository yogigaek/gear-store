import { Environment, Lightformer } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Group } from 'three';
import type { Motion } from './Drivetrain';
import { EBike } from './EBike';

// The account pages' panel: the E-1 on a dark floor, turning slowly like a bike on a showroom turntable.
// No post pass and no reflections: it shares the screen with a form and must stay light.

// aimed above the bike's middle, so it stands in the lower part of the frame, clear of the headline
const TARGET: [number, number, number] = [0, 0.68, 0];

export interface AuthSceneProps {
  frame: string;
  reducedMotion: boolean;
  label: string;
  /** called once the first frame is on screen, so the page can fade the canvas in */
  onDrawn?: () => void;
}

// Default export so the auth pages can lazy-load it: three.js stays out of their chunks.
export default function AuthScene({ frame, reducedMotion, label, onDrawn }: AuthSceneProps) {
  const motion = useMemo<Motion>(() => ({ angle: 0, explode: 0, intro: 1 }), []);
  return (
    <Canvas
      // it shares the screen with a form: no shadow maps, and a modest resolution, so the page stays quick
      // on a weak device
      // a turntable needs every frame; without motion one drawn frame is enough
      frameloop={reducedMotion ? 'demand' : 'always'}
      dpr={[1, 1.25]}
      camera={{ position: [2.9, 1.25, 3.3], fov: 32, near: 0.05, far: 30 }}
      role="img"
      aria-label={label}
    >
      <color attach="background" args={['#15181a']} />
      <Aim />
      <FirstFrame onDrawn={onDrawn} />
      <Environment resolution={128} frames={1}>
        <Lightformer
          form="rect"
          intensity={1.6}
          position={[0, 4, 0]}
          rotation-x={Math.PI / 2}
          scale={[4, 1.6, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2.2}
          position={[-3, 1.2, 2]}
          rotation-y={Math.PI / 3}
          scale={[0.4, 3, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.8}
          position={[3, 1.2, 2]}
          rotation-y={-Math.PI / 3}
          scale={[0.4, 3, 1]}
        />
      </Environment>
      <spotLight position={[1, 4, 2]} angle={0.5} penumbra={0.9} intensity={45} decay={2} color="#fff6ea" />
      <directionalLight position={[-3, 2.6, -2.5]} intensity={1.4} color="#ffe9c4" />
      <directionalLight position={[3, 1.4, -2.5]} intensity={1.2} color="#9fc4ff" />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[7, 96]} />
        <meshStandardMaterial color="#1d2124" roughness={0.85} />
      </mesh>

      <Turntable spin={!reducedMotion}>
        <EBike frame={frame} motion={motion} />
      </Turntable>
    </Canvas>
  );
}

/** two animation frames after mounting, the scene's first frame has been drawn */
function FirstFrame({ onDrawn }: { onDrawn?: () => void }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!onDrawn) return;
    invalidate();
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(onDrawn);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [invalidate, onDrawn]);
  return null;
}

function Aim() {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    camera.lookAt(...TARGET);
    invalidate();
  }, [camera, invalidate]);
  return null;
}

/** one turn every 40 seconds: slow enough to read as a bike on display, not a spinner */
function Turntable({ spin, children }: { spin: boolean; children: ReactNode }) {
  const group = useRef<Group>(null);
  useFrame((_, delta) => {
    if (spin && group.current) group.current.rotation.y += (delta * Math.PI * 2) / 40;
  });
  return (
    <group ref={group} rotation-y={-0.5}>
      {children}
    </group>
  );
}

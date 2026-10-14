import { AdaptiveDpr, Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { easing } from 'maath';
import { ToneMappingMode } from 'postprocessing';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  BufferAttribute,
  CanvasTexture,
  Color,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  Vector3,
  type DirectionalLight,
  type MeshBasicMaterial,
  type SpotLight,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Motion } from './Drivetrain';
import { EBike } from './EBike';
import { ASSEMBLY, type PartCallout } from './parts';

// The E-1's stage: a photo studio's cyclorama, the floor curving up into the back wall without a seam, lit
// like a product shoot. The page's scroll position (0 → 1) rides the bike forward and moves the camera round
// it; in inspect mode the visitor turns the bike by hand instead.

export interface ScrollSource {
  /** 0 at the top of the story, 1 at its end; written by the page, read every frame here */
  progress: number;
}

/** the fixed views offered in inspect mode */
export type View = 'right' | 'left' | 'front' | 'rear' | 'top' | 'below';

export interface Inspect {
  active: boolean;
  /** a requested view; the camera flies there, then the visitor can turn it again */
  view: { name: View; at: number } | null;
  /** the bike pulled apart into its modules */
  apart: boolean;
}

export interface BikeStageProps {
  scroll: ScrollSource;
  inspect: Inspect;
  /** run the opening assembly: the parts fly in and click together */
  assemble: boolean;
  /** called once the first frame is on screen, so the page can drop its poster */
  onReady: () => void;
  onPick: (part: PartCallout) => void;
  frame: string;
  reducedMotion: boolean;
  /** narrow screens frame the bike from further back */
  tall: boolean;
  label: string;
}

const BG = '#0b0d0e';
/** the cyclorama's paint: a dark grey that the key light lifts into a soft pool */
const CYC = '#1b1e20';

/** softbox overhead, two long strips for the highlights along the tubes, a warm kicker behind */
const STRIPS = (
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
    <Lightformer form="ring" color="#ffe6b0" intensity={0.8} position={[0, 1.5, -4]} scale={2.4} />
  </>
);

export default function BikeStage({
  scroll,
  inspect,
  assemble,
  onReady,
  onPick,
  frame,
  reducedMotion,
  tall,
  label,
}: BikeStageProps) {
  // the frame loop's own state, made once; `assemble` is read once: the opening plays from the start or not at all
  const [motion] = useState<Motion>(() => ({ angle: 0, explode: 0, intro: assemble ? 0 : 1 }));
  const [mood] = useState<Mood>(() => ({ blueprint: 0, dark: 0 }));
  const [timeline] = useState<Timeline>(() => ({ start: -1, hdri: false }));
  // the frame-rate watchdog waits until the opening is over: shader compiles there are not a slow device
  const [watchdog, setWatchdog] = useState(false);
  const ready = () => {
    onReady();
    setTimeout(() => setWatchdog(true), 3000);
  };
  // full Retina resolution costs four times the pixels for little visible gain under the post pass; drop
  // further when the frame rate does
  const [dpr, setDpr] = useState(tall ? 1.5 : 1.25);
  // fast-moving parts do not need full resolution: the opening renders light, and sharpens once they land
  const [flying, setFlying] = useState(assemble);
  return (
    <Canvas
      shadows
      dpr={flying ? dpr * 0.6 : dpr}
      // while the page scrolls the canvas renders at 60 % resolution and sharpens again once it stops
      performance={{ min: 0.6, debounce: 250 }}
      // a frame is drawn only when something moves: scrolling, the pointer, an animation still settling
      frameloop="demand"
      camera={{ position: [2, 0.9, 3], fov: tall ? 38 : 30, near: 0.05, far: 30 }}
      role="img"
      aria-label={label}
    >
      {watchdog && <PerformanceMonitor onDecline={() => setDpr(1)} />}
      <AdaptiveDpr />
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 7, 16]} />

      {/* a real photographed studio (Poly Haven, CC0) for believable reflections; the strips add the long
          highlights a product shoot uses along a frame's tubes */}
      {/* the strips light the bike from the first frame; the photographed studio replaces them once its
          file has loaded, so the page never waits on it */}
      <Suspense
        fallback={
          <Environment resolution={256} frames={1}>
            {STRIPS}
          </Environment>
        }
      >
        <Environment files="/hdri/studio_small_09_1k.hdr" resolution={256} frames={1}>
          {STRIPS}
        </Environment>
        <Loaded onLoad={() => (timeline.hdri = true)} />
      </Suspense>

      <Lights reducedMotion={reducedMotion} mood={mood} timeline={timeline} />
      <WallWash frame={frame} mood={mood} />
      <Warmup timeline={timeline} onReady={ready} />
      <Wake frame={frame} inspect={inspect} />
      <ambientLight intensity={0.08} />

      <Cyclorama mood={mood} />

      <group position={[0, 0, 0]}>
        <EBike
          frame={frame}
          motion={motion}
          tags={tall ? 'dots' : 'full'}
          hotspots={inspect.active}
          onPick={onPick}
        />
      </group>

      <Rig
        scroll={scroll}
        inspect={inspect}
        motion={motion}
        mood={mood}
        timeline={timeline}
        onLanded={() => setFlying(false)}
        tall={tall}
        reducedMotion={reducedMotion}
      />

      {/* phones skip the post pass: ambient occlusion and bloom cost more than they show on a small screen */}
      {!tall && (
        <EffectComposer multisampling={4}>
          <N8AO aoRadius={0.18} distanceFalloff={0.6} intensity={2.2} quality="performance" halfRes />
          <Bloom mipmapBlur luminanceThreshold={1.6} luminanceSmoothing={0.2} intensity={0.9} />
          <Vignette offset={0.28} darkness={0.72} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

/**
 * The studio's infinite cove: a floor running back, a quarter-circle sweep, and the wall rising behind,
 * built as one bent plane so light falls off across it with no horizon line.
 */
/**
 * The studio's lighting mood along the story, 0–1 each: `blueprint` lays an engineering grid over the cove
 * during the teardown; `dark` dims the room for the drivetrain close-up.
 */
interface Mood {
  blueprint: number;
  dark: number;
}

/** engineering-paper grid, one metre a tile: fine lines every 12.5 cm, a stronger one every 50 cm */
function gridTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i <= 8; i++) {
    const at = Math.round((i / 8) * size);
    ctx.fillStyle = i % 4 === 0 ? 'rgba(150, 196, 240, 0.9)' : 'rgba(150, 196, 240, 0.4)';
    const w = i % 4 === 0 ? 3 : 1.5;
    ctx.fillRect(at - w / 2, 0, w, size);
    ctx.fillRect(0, at - w / 2, size, w);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function Cyclorama({ mood }: { mood: Mood }) {
  const grid = useMemo(() => gridTexture(), []);
  useEffect(() => () => grid.dispose(), [grid]);
  const overlay = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    if (overlay.current) overlay.current.opacity = mood.blueprint * 0.32;
  });
  const geometry = useMemo(() => {
    const floor = 7;
    const radius = 1.8;
    const wall = 6;
    const sweep = (Math.PI / 2) * radius;
    const length = floor + sweep + wall;
    const g = new PlaneGeometry(40, length, 1, 96);
    const pos = g.attributes.position as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      // the plane's y runs along the profile: 0 at the front edge of the floor
      const s = pos.getY(i) + length / 2;
      let y: number;
      let z: number;
      if (s <= floor) {
        y = 0;
        z = 4.5 - s;
      } else if (s <= floor + sweep) {
        const a = (s - floor) / radius;
        y = radius - Math.cos(a) * radius;
        z = 4.5 - floor - Math.sin(a) * radius;
      } else {
        y = radius + (s - floor - sweep);
        z = 4.5 - floor - radius;
      }
      pos.setXYZ(i, pos.getX(i), y, z);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    // one grid tile per metre along both of the plane's axes
    const { width, height } = geometry.parameters;
    grid.repeat.set(width, height);
  }, [geometry, grid]);
  return (
    <>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial color={CYC} roughness={0.82} metalness={0} />
      </mesh>
      <mesh geometry={geometry} renderOrder={1}>
        <meshBasicMaterial
          ref={overlay}
          map={grid}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
    </>
  );
}

/**
 * A soft pool of light on the wall behind the bike, thrown from behind it so none of it lands on the bike,
 * tinted with a little of the frame's colour, the way a
 * launch stage picks up the product's paint. It sinks for the drivetrain close-up.
 */
function WallWash({ frame, mood }: { frame: string; mood: Mood }) {
  const light = useRef<SpotLight>(null);
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(-0.2, 1.6, -4.3);
    return o;
  }, []);
  const tint = useMemo(() => new Color(), []);
  const warm = useMemo(() => new Color('#fff1dc'), []);
  useFrame(({ invalidate }, delta) => {
    const l = light.current;
    if (!l) return;
    tint.copy(warm).lerp(new Color(frame), 0.45);
    easing.dampC(l.color, tint, 0.4, step(delta));
    if (differs(l.color, tint)) invalidate();
    l.intensity = 22 * (1 - mood.dark * 0.75) * (1 - mood.blueprint * 0.5);
  });
  return (
    <>
      <primitive object={target} />
      <spotLight
        ref={light}
        position={[0, 0.35, -1.7]}
        target={target}
        angle={0.55}
        penumbra={1}
        decay={1.6}
      />
    </>
  );
}

/** asks for a frame on scroll, pointer movement and resize, and when the colour or inspect mode changes */
function Wake({ frame, inspect }: { frame: string; inspect: Inspect }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const wake = () => invalidate();
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('resize', wake);
    return () => {
      window.removeEventListener('scroll', wake);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('resize', wake);
    };
  }, [invalidate]);
  useEffect(() => invalidate(), [invalidate, frame, inspect]);
  return null;
}

/** colours still easing towards each other */
const differs = (a: Color, b: Color) =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 0.002;
/** after an idle spell the first frame's delta is the whole pause: cap it so easing does not jump */
const step = (delta: number) => Math.min(delta, 1 / 20);

/**
 * When the opening starts, in clock seconds (-1 until then), and whether the photographed studio has loaded.
 * The opening waits for both the shaders and the studio, so neither lands in the middle of it as a stall.
 */
interface Timeline {
  start: number;
  hdri: boolean;
}

/** longest the opening waits for the studio file before it starts with the strip lights alone */
const HDRI_WAIT = 1.5;

/** reports, once mounted, that a suspended sibling has finished loading */
function Loaded({ onLoad }: { onLoad: () => void }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    onLoad();
    invalidate();
  }, [onLoad, invalidate]);
  return null;
}

/**
 * Compiles every shader before anything moves, renders a couple of frames behind the page's still, then
 * starts the clock and tells the page to reveal the canvas.
 */
function Warmup({ timeline, onReady }: { timeline: Timeline; onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const state = useRef<'idle' | 'compiling' | 'compiled'>('idle');
  const quiet = useRef(0);

  useFrame(({ clock, invalidate }) => {
    if (timeline.start >= 0) return;
    invalidate();
    if (state.current === 'idle') {
      state.current = 'compiling';
      void gl
        .compileAsync(scene, camera)
        .catch(() => undefined)
        .then(() => (state.current = 'compiled'));
      return;
    }
    if (state.current !== 'compiled') return;
    if (!timeline.hdri && clock.elapsedTime < HDRI_WAIT) return;
    // two more frames so the post pass and the environment are built before the reveal
    if (++quiet.current < 3) return;
    timeline.start = clock.elapsedTime;
    requestAnimationFrame(() => onReady());
  });
  return null;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Key, rim and fill lights. On arrival the studio comes up one light at a time: the rims trace the bike's
 * outline first, then the key light lands, then the room fills in.
 */
function Lights({
  reducedMotion,
  mood,
  timeline,
}: {
  reducedMotion: boolean;
  mood: Mood;
  timeline: Timeline;
}) {
  const warmKey = useMemo(() => new Color('#fff6ea'), []);
  const coolKey = useMemo(() => new Color('#dbe9ff'), []);
  const key = useRef<SpotLight>(null);
  const warm = useRef<DirectionalLight>(null);
  const cool = useRef<DirectionalLight>(null);
  const scene = useThree((s) => s.scene);

  useFrame(({ clock, invalidate }) => {
    // fully lit while warming up (the canvas is still hidden), then the lights come up with the opening
    const t = reducedMotion || timeline.start < 0 ? 10 : clock.elapsedTime - timeline.start;
    if (t < 1) invalidate();
    const ramp = (from: number, to: number) => smooth(clamp01((t - from) / (to - from)));
    // short: the bike is visible from the first frame and fully lit within a second
    if (warm.current) warm.current.intensity = 1.6 * ramp(0, 0.45);
    if (cool.current) cool.current.intensity = 1.4 * ramp(0.1, 0.55);
    if (key.current) {
      key.current.intensity = 70 * ramp(0.2, 0.8) * (1 - mood.dark * 0.35);
      // the teardown is lit like a drawing office: cooler, flatter light
      key.current.color.copy(warmKey).lerp(coolKey, mood.blueprint);
    }
    scene.environmentIntensity = 0.45 + 0.75 * ramp(0, 0.9);
  });

  return (
    <>
      <spotLight
        ref={key}
        position={[1.4, 4.4, 2.6]}
        angle={0.62}
        penumbra={1}
        intensity={0}
        decay={2}
        color="#fff6ea"
        castShadow
        // a large softbox casts a blurred shadow, not a hard-edged one
        shadow-mapSize={[1024, 1024]}
        shadow-radius={9}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
      />
      {/* rim lights: warm from behind left, cool from behind right */}
      <directionalLight ref={warm} position={[-3, 2.6, -2.5]} intensity={0} color="#ffe9c4" />
      <directionalLight ref={cool} position={[3, 1.4, -2.5]} intensity={0} color="#9fc4ff" />
    </>
  );
}

/** camera framings along the story: hero, full profile, the bike apart, the drivetrain, the configurator */
const SHOTS = {
  wide: [
    { pos: [1.3, 0.8, 3.75], look: [-0.62, 0.62, 0] },
    { pos: [0.05, 0.66, 3.3], look: [0.05, 0.56, 0] },
    { pos: [1.55, 1.55, 4.4], look: [-0.28, 0.62, 0.12] },
    { pos: [-0.55, 0.62, 1.15], look: [-0.38, 0.38, 0.05] },
    // the configurator: the bike whole again, on the left of the screen, the panel on the right
    { pos: [2.2, 0.95, 4.1], look: [0.85, 0.58, 0] },
  ],
  tall: [
    { pos: [2.4, 1.55, 4.4], look: [0.1, 1.68, 0] },
    { pos: [0.05, 0.75, 5.2], look: [0.05, 0.72, 0] },
    { pos: [2.6, 2.2, 5.6], look: [0.0, 1.55, 0.12] },
    { pos: [-0.6, 0.8, 1.7], look: [-0.38, 0.66, 0.05] },
    // phones: the bike small in the strip above the configurator sheet
    { pos: [2.4, 1.3, 6.4], look: [0.05, -0.55, 0] },
  ],
} as const;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** the point inspect mode turns about: the middle of the bike */
const CENTRE = new Vector3(0, 0.55, 0);
/** camera positions for the fixed views, about the centre */
const VIEWS: Record<View, [number, number, number]> = {
  right: [0, 0.62, 3.4],
  left: [0, 0.62, -3.4],
  front: [3.3, 0.75, 0.25],
  rear: [-3.3, 0.75, 0.25],
  top: [0.05, 3.9, 0.35],
  below: [0.4, -2.3, 1.4],
};

function Rig({
  scroll,
  inspect,
  motion,
  mood,
  timeline,
  tall,
  reducedMotion,
  onLanded,
}: {
  scroll: ScrollSource;
  inspect: Inspect;
  motion: Motion;
  mood: Mood;
  timeline: Timeline;
  tall: boolean;
  reducedMotion: boolean;
  /** the last part of the opening has landed */
  onLanded: () => void;
}) {
  const ride = useRef(0);
  const landed = useRef(false);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const pointer = useThree((s) => s.pointer);
  const regress = useThree((s) => s.performance.regress);
  const controls = useRef<OrbitControlsImpl>(null);
  const lastProgress = useRef(scroll.progress);
  const look = useRef(new Vector3());
  const goal = useMemo(() => ({ pos: new Vector3(), look: new Vector3() }), []);
  const flight = useRef<Vector3 | null>(null);
  const first = useRef(true);

  // a requested view starts a flight there; the controls hand over again once the camera arrives
  useEffect(() => {
    if (inspect.active && inspect.view) flight.current = new Vector3(...VIEWS[inspect.view.name]);
  }, [inspect.active, inspect.view]);

  // the controls claim every touch on the canvas; outside inspect mode a swipe must still scroll the page
  useEffect(() => {
    gl.domElement.style.touchAction = inspect.active ? 'none' : 'pan-y';
  }, [gl, inspect.active]);

  // entering inspect mode turns about the bike's middle, wherever the story had the camera
  useEffect(() => {
    const c = controls.current;
    if (!c || !inspect.active) return;
    c.target.copy(look.current);
    flight.current ??= camera.position.clone().sub(look.current).setLength(3.4).add(CENTRE);
  }, [inspect.active, camera]);

  useFrame(({ invalidate }, rawDelta) => {
    const delta = step(rawDelta);
    // the opening assembly runs on its own clock; scrolling away hurries it along
    if (motion.intro < 1 && timeline.start >= 0) {
      const speed = scroll.progress > 0.02 || inspect.active ? 4 : 1;
      motion.intro = Math.min(1, motion.intro + (delta * speed) / ASSEMBLY.seconds);
    }
    // the wheels arrive spinning and roll to a stop as the bike comes together
    const spin = -Math.pow(1 - motion.intro, 2) * 14;

    if (inspect.active) {
      const c = controls.current;
      easing.damp3(look.current, CENTRE, 0.3, delta);
      if (c) c.target.copy(look.current);
      if (flight.current) {
        easing.damp3(camera.position, flight.current, 0.35, delta);
        if (camera.position.distanceTo(flight.current) < 0.01) flight.current = null;
      }
      easing.damp(motion, 'explode', inspect.apart ? 1 : 0, 0.3, delta);
      easing.damp(mood, 'blueprint', motion.explode, 0.3, delta);
      easing.damp(mood, 'dark', 0, 0.3, delta);
      motion.angle = ride.current + spin;
      if (!c) camera.lookAt(look.current);
      if (motion.intro === 1 && !landed.current) {
        landed.current = true;
        onLanded();
      }
      const target = inspect.apart ? 1 : 0;
      if (
        motion.intro < 1 ||
        flight.current ||
        look.current.distanceToSquared(CENTRE) > 1e-8 ||
        Math.abs(motion.explode - target) > 1e-4 ||
        Math.abs(mood.blueprint - motion.explode) > 1e-4 ||
        mood.dark > 1e-4
      )
        invalidate();
      return;
    }

    if (scroll.progress !== lastProgress.current) {
      lastProgress.current = scroll.progress;
      regress();
    }
    const shots = tall ? SHOTS.tall : SHOTS.wide;
    const p = Math.min(1, Math.max(0, scroll.progress)) * (shots.length - 1);
    const i = Math.min(shots.length - 2, Math.floor(p));
    const t = smooth(p - i);
    const a = shots[i];
    const b = shots[i + 1];
    goal.pos.set(...(a.pos as [number, number, number])).lerp(new Vector3(...b.pos), t);
    goal.look.set(...(a.look as [number, number, number])).lerp(new Vector3(...b.look), t);
    if (!tall && !reducedMotion) {
      goal.pos.x += pointer.x * 0.12;
      goal.pos.y += pointer.y * 0.06;
    }
    // the ride: roughly two wheel turns per screen of scroll
    const angle = scroll.progress * Math.PI * 12;
    // apart around the third framing, back together before the drivetrain close-up
    const explode = smooth(clamp01((p - 1.25) / 0.6)) * (1 - smooth(clamp01((p - 2.35) / 0.5)));
    // dim for the drivetrain close-up, lit again for the configurator
    const dark = smooth(clamp01((p - 2.3) / 0.6)) * (1 - smooth(clamp01((p - 3.2) / 0.5)));
    // the camera starts a little further back and settles in as the bike assembles
    goal.pos
      .sub(goal.look)
      .multiplyScalar(1 + Math.pow(1 - motion.intro, 2) * 0.35)
      .add(goal.look);

    if (first.current || reducedMotion) {
      camera.position.copy(goal.pos);
      look.current.copy(goal.look);
      ride.current = angle;
      motion.explode = explode;
      mood.blueprint = explode;
      mood.dark = dark;
      first.current = false;
    } else {
      easing.damp3(camera.position, goal.pos, 0.35, delta);
      easing.damp3(look.current, goal.look, 0.35, delta);
      easing.damp(ride, 'current', angle, 0.25, delta);
      easing.damp(motion, 'explode', explode, 0.3, delta);
      easing.damp(mood, 'blueprint', explode, 0.4, delta);
      easing.damp(mood, 'dark', dark, 0.4, delta);
    }
    motion.angle = ride.current + spin;
    camera.lookAt(look.current);
    // keep drawing until every eased value has arrived
    const busy =
      motion.intro < 1 ||
      camera.position.distanceToSquared(goal.pos) > 1e-8 ||
      look.current.distanceToSquared(goal.look) > 1e-8 ||
      Math.abs(ride.current - angle) > 1e-4 ||
      Math.abs(motion.explode - explode) > 1e-4 ||
      Math.abs(mood.blueprint - explode) > 1e-4 ||
      Math.abs(mood.dark - dark) > 1e-4;
    if (busy) invalidate();
    // the opening is over once everything has come to rest: only then sharpen to full resolution
    else if (motion.intro === 1 && !landed.current) {
      landed.current = true;
      onLanded();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      enabled={inspect.active}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={1.2}
      maxDistance={6}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI - 0.05}
      // a drag cancels a flight in progress: the hand wins
      onStart={() => (flight.current = null)}
    />
  );
}

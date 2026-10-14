import { RoundedBox } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { easing } from 'maath';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  Curve,
  Object3D,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type Group,
} from 'three';
import { Cassette, Chain, Crankset, Derailleur, type Motion } from './Drivetrain';
import {
  BB,
  FORK_ANGLE,
  FORK_LENGTH,
  FRONT_AXLE,
  HEAD_BOTTOM,
  HEAD_TOP,
  MAIN_PIVOT,
  REAR_AXLE,
  ROCKER_FRONT,
  ROCKER_PIVOT,
  ROCKER_REAR,
  SEAT_TOP,
  SHOCK_MOUNT,
  type P2,
  type P3,
} from './layout';
import { ForkDecals, HeadBadge } from './details';
import { ASSEMBLY, PARTS, type PartCallout, type TagMode } from './parts';
import { brandFont, lightness, usePaintedTexture } from './canvas';
import { span } from './geometry';
import { disposeMaterials, makeMaterials, type Materials } from './materials';
import { Beam, Taper, Tube } from './primitives';
import { Wheel } from './Wheel';

const at = (p: P2, z = 0): P3 => [p[0], p[1], z];
const lerp = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** onto the top face of the chainstay */
const raise = (p: P2): P2 => [p[0], p[1] + 0.019];

/** the fork axis, pointing up the head tube */
const HEAD_UP: P2 = [Math.sin(FORK_ANGLE) * -1, Math.cos(FORK_ANGLE)];
/** a point given in the fork's own frame (y up the steerer, x forward) in bike coordinates */
function forkPoint(x: number, y: number, z: number): P3 {
  const c = Math.cos(FORK_ANGLE);
  const s = Math.sin(FORK_ANGLE);
  return [HEAD_BOTTOM[0] + x * c - y * s, HEAD_BOTTOM[1] + x * s + y * c, z];
}

const SEAT_AXIS: P2 = (() => {
  const dx = SEAT_TOP[0] - BB[0];
  const dy = SEAT_TOP[1] - BB[1];
  const l = Math.hypot(dx, dy);
  return [dx / l, dy / l];
})();
const POST_TOP: P2 = [SEAT_TOP[0] + SEAT_AXIS[0] * 0.2, SEAT_TOP[1] + SEAT_AXIS[1] * 0.2];
const STEERER_TOP: P2 = [HEAD_TOP[0] + HEAD_UP[0] * 0.04, HEAD_TOP[1] + HEAD_UP[1] * 0.04];
const BAR: P2 = [STEERER_TOP[0] + 0.05, STEERER_TOP[1] + 0.008];
const DOWN_TUBE = {
  from: [BB[0] + 0.05, BB[1] + 0.04] as P2,
  to: [HEAD_BOTTOM[0] - 0.025, HEAD_BOTTOM[1] + 0.03] as P2,
};

export interface EBikeProps {
  frame: string;
  motion: Motion;
  /** headlight on: a real spot plus a faint beam in the haze */
  light?: boolean;
  /** part callouts during the teardown: labelled on wide screens, numbered dots on narrow ones */
  tags?: TagMode;
  /** inspect mode: the numbered dots stay up and can be picked */
  hotspots?: boolean;
  onPick?: (part: PartCallout) => void;
}

interface Callouts {
  tags: TagMode;
  hotspots: boolean;
  onPick?: (part: PartCallout) => void;
}
const CalloutContext = createContext<Callouts>({ tags: 'off', hotspots: false });

/** The Rakit E-1: a 29-inch full-suspension trail e-bike with a mid-drive motor. Every part is its own mesh. */
export function EBike({ frame, motion, light = true, tags = 'off', hotspots = false, onPick }: EBikeProps) {
  const callouts = useMemo(() => ({ tags, hotspots, onPick }), [tags, hotspots, onPick]);
  // made once: a new colour is eased into the paint rather than swapping materials, which would recompile
  // their shaders and flash the bike
  const [m] = useState(() => makeMaterials(frame));
  useEffect(() => () => disposeMaterials(m), [m]);
  const rear = useRef<Group>(null);
  const front = useRef<Group>(null);

  const target = useMemo(() => new Color(frame), [frame]);
  useFrame(({ invalidate }, delta) => {
    easing.dampC(m.paint.color, target, 0.25, Math.min(delta, 1 / 20));
    const c = m.paint.color;
    if (Math.abs(c.r - target.r) + Math.abs(c.g - target.g) + Math.abs(c.b - target.b) > 0.002) invalidate();
    // the headlight comes on as the last part clicks home
    m.lamp.emissiveIntensity = 6 * Math.min(1, Math.max(0, (motion.intro - 0.85) / 0.15));
    if (rear.current) rear.current.rotation.z = -motion.angle;
    if (front.current) front.current.rotation.z = -motion.angle;
  });

  return (
    <CalloutContext value={callouts}>
      <Part motion={motion} offset={[-0.46, 0, 0]} order={5} callout={PARTS.rearWheel}>
        <group position={at(REAR_AXLE)}>
          <Wheel ref={rear} m={m}>
            <Cassette m={m} />
          </Wheel>
        </group>
      </Part>
      <Part motion={motion} offset={[0.46, 0, 0]} order={5} callout={PARTS.frontWheel}>
        <group position={at(FRONT_AXLE)}>
          <Wheel ref={front} m={m} />
        </group>
      </Part>
      <Frame m={m} motion={motion} frame={frame} />
      <Part motion={motion} offset={[-0.22, -0.05, 0]} order={0}>
        <RearEnd m={m} />
      </Part>
      <Part motion={motion} offset={[0, 0.08, 0.32]} order={1} callout={PARTS.shock}>
        <Shock m={m} />
      </Part>
      <Part motion={motion} offset={[0.22, 0.16, 0]} order={6} callout={PARTS.fork}>
        <Fork m={m} light={light} />
        <Cockpit m={m} />
        <Hoses m={m} />
      </Part>
      <Part motion={motion} offset={[-0.05, 0.22, 0]} order={7} callout={PARTS.seat}>
        <Seat m={m} />
      </Part>
      <Part motion={motion} offset={[0, -0.05, 0.46]} order={4} callout={PARTS.drivetrain}>
        <Crankset m={m} motion={motion} />
        <Chain m={m} motion={motion} />
        <Derailleur m={m} motion={motion} />
      </Part>
    </CalloutContext>
  );
}

/** how much further out than the teardown a part starts its flight */
const FLY_IN = 1.9;

/** 0 → 1, fast off the mark and settling without overshoot: a part glides home rather than bouncing */
function easeOutQuart(t: number) {
  return 1 - Math.pow(1 - t, 4);
}

/**
 * A part of the bike that moves out along `offset` as the bike comes apart, and flies in along it when the
 * page opens. Its callout is plain DOM over the canvas, placed by projecting the part's anchor each frame: a
 * numbered dot on the part (a button in inspect mode) and, on wide screens, a leader line to a priced label.
 */
function Part({
  motion,
  offset,
  order = 0,
  callout,
  children,
}: {
  motion: Motion;
  offset: P3;
  /** its turn in the opening assembly */
  order?: number;
  callout?: PartCallout;
  children: ReactNode;
}) {
  const { tags, hotspots, onPick } = use(CalloutContext);
  const group = useRef<Group>(null);
  const tag = useRef<{ root: HTMLDivElement; label: HTMLSpanElement | null; dot: HTMLButtonElement } | null>(
    null,
  );
  const gl = useThree((s) => s.gl);
  const point = useMemo(() => new Vector3(), []);
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const host = gl.domElement.parentElement;
    if (!callout || tags === 'off' || !host) return;
    const root = document.createElement('div');
    root.className = 'pointer-events-none absolute left-0 top-0';
    root.style.visibility = 'hidden';
    let label: HTMLSpanElement | null = null;
    if (tags === 'full') {
      const [dx, dy] = callout.to;
      label = document.createElement('span');
      label.setAttribute('aria-hidden', 'true');
      const line = document.createElement('span');
      line.className = 'absolute left-0 top-0 h-px origin-left bg-signal/80';
      line.style.width = `${Math.hypot(dx, dy)}px`;
      line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      const box = document.createElement('span');
      box.className =
        'absolute whitespace-nowrap border border-signal bg-ink/90 px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-alu-50';
      box.style.left = `${dx}px`;
      box.style.top = `${dy}px`;
      box.style.transform = 'translate(-50%, -50%)';
      box.textContent = callout.name;
      const price = document.createElement('span');
      price.className = 'ml-2 text-signal';
      price.textContent = callout.price;
      box.append(price);
      label.append(line, box);
      root.append(label);
    }
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className =
      'absolute grid size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-signal font-mono text-[11px] font-bold text-ink ring-4 ring-signal/25 hover:ring-8 focus-visible:outline-3 focus-visible:outline-alu-50';
    dot.textContent = String(callout.n);
    dot.setAttribute('aria-label', `${callout.name}, ${callout.price}: details`);
    dot.addEventListener('click', () => pick.current?.(callout));
    root.append(dot);
    host.append(root);
    tag.current = { root, label, dot };
    return () => {
      root.remove();
      tag.current = null;
    };
  }, [gl, callout, tags]);

  useFrame(({ camera, size }) => {
    const intro = Math.min(
      1,
      Math.max(0, (motion.intro * ASSEMBLY.seconds - order * ASSEMBLY.stagger) / ASSEMBLY.flight),
    );
    const out = motion.explode + (1 - easeOutQuart(intro)) * FLY_IN;
    group.current?.position.set(offset[0] * out, offset[1] * out, offset[2] * out);

    const t = tag.current;
    if (!t || !callout) return;
    const e = motion.explode;
    const apart = Math.min(1, Math.max(0, (e - 0.65) / 0.3));
    // in inspect mode the dots stay up once the bike has assembled, ready to be picked
    const dots = hotspots && motion.intro >= 1 ? 1 : apart;
    t.root.style.visibility = dots > 0 ? 'visible' : 'hidden';
    t.dot.tabIndex = hotspots ? 0 : -1;
    t.dot.style.pointerEvents = hotspots ? 'auto' : 'none';
    if (hotspots) t.dot.removeAttribute('aria-hidden');
    else t.dot.setAttribute('aria-hidden', 'true');
    if (dots === 0) return;
    point.set(callout.at[0] + offset[0] * e, callout.at[1] + offset[1] * e, callout.at[2] + offset[2] * e);
    point.project(camera);
    const x = ((point.x + 1) / 2) * size.width;
    const y = ((1 - point.y) / 2) * size.height;
    t.root.style.transform = `translate(${x}px, ${y}px)`;
    t.dot.style.opacity = String(dots);
    if (t.label) t.label.style.opacity = String(apart);
  });

  return <group ref={group}>{children}</group>;
}

function paintDecal(ctx: CanvasRenderingContext2D, w: number, h: number, ink: string) {
  brandFont(ctx, h * 0.78);
  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  ctx.fillText('RAKIT', w * 0.02, h * 0.54);
  brandFont(ctx, h * 0.3, 600);
  ctx.textAlign = 'right';
  ctx.fillText('E-1 · 85 Nm', w * 0.98, h * 0.54);
}

/** the front triangle, decals, motor and (unless `battery` is false) the battery in the down tube */
export function Frame({
  m,
  motion,
  frame,
  battery = true,
}: {
  m: Materials;
  motion: Motion;
  frame: string;
  battery?: boolean;
}) {
  // lettering in ink on light paint, in aluminium on dark
  const ink = lightness(frame) > 0.45 ? '#15181a' : '#e4e6e6';
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => paintDecal(ctx, w, h, ink),
    [ink],
  );
  const decal = usePaintedTexture(1024, 160, paint);
  const down = useMemo(() => span(at(DOWN_TUBE.from), at(DOWN_TUBE.to), 'x'), []);
  const topFrom = lerp(HEAD_TOP, HEAD_BOTTOM, 0.25);
  const topTo: P2 = [SEAT_TOP[0] + 0.004, SEAT_TOP[1] - 0.012];
  const DT = { h: 0.088, w: 0.072 };

  return (
    <group>
      {/* head tube, tapered, on the fork axis */}
      <group position={at(HEAD_BOTTOM)} rotation-z={FORK_ANGLE}>
        <mesh material={m.paint} position-y={0.075} castShadow>
          <cylinderGeometry args={[0.029, 0.034, 0.165, 40]} />
        </mesh>
        <HeadBadge />
      </group>
      {/* top tube: deep at the head tube, slimming and flattening towards the seat cluster */}
      <Taper from={at(topFrom)} to={at(topTo)} rFrom={0.027} rTo={0.019} flat={0.78} material={m.paint} />
      <Taper
        from={at([BB[0] - 0.005, BB[1] + 0.06])}
        to={at(SEAT_TOP)}
        rFrom={0.024}
        rTo={0.0185}
        material={m.paint}
      />
      {/* smoothed joints where the tubes meet */}
      {[topFrom, topTo].map((p, i) => (
        <mesh key={i} material={m.paint} position={at(p)} scale={[1, 1, i === 0 ? 0.85 : 0.9]} castShadow>
          <sphereGeometry args={[i === 0 ? 0.029 : 0.022, 32, 20]} />
        </mesh>
      ))}
      {/* seat collar */}
      <mesh
        material={m.anodised}
        position={at(SEAT_TOP)}
        rotation-z={Math.atan2(-SEAT_AXIS[0], SEAT_AXIS[1])}
        castShadow
      >
        <cylinderGeometry args={[0.022, 0.022, 0.018, 28]} />
      </mesh>

      {/* down tube with the battery: x runs from the motor to the head tube, local -y is the underside */}
      <Beam from={at(DOWN_TUBE.from)} to={at(DOWN_TUBE.to)} h={DT.h} w={DT.w} material={m.paint}>
        {/* the battery drops out of the underside */}
        {battery && (
          <Part motion={motion} offset={[0, -0.24, 0]} order={3}>
            <group position={[-down.length * 0.04, -DT.h / 2 - 0.006, 0]}>
              <BatteryPack m={m} length={down.length * 0.72} width={DT.w * 0.86} />
            </group>
          </Part>
        )}
        {/* charge level, five cells, on the top of the tube */}
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            material={i < 4 ? m.led : m.shell}
            position={[down.length * 0.18 + i * 0.016, DT.h / 2 + 0.0005, 0]}
          >
            <boxGeometry args={[0.01, 0.002, 0.005]} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[down.length * 0.1, 0.004, side * (DT.w / 2 + 0.0008)]}
            rotation-y={side > 0 ? 0 : Math.PI}
          >
            <planeGeometry args={[down.length * 0.6, down.length * 0.6 * (160 / 1024)]} />
            <meshStandardMaterial
              map={decal}
              transparent
              roughness={0.3}
              metalness={0.2}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        ))}
      </Beam>

      <Part motion={motion} offset={[0.12, -0.26, 0.12]} order={2} callout={PARTS.motor}>
        <Motor m={m} />
      </Part>
      {/* the battery's tag, kept in bike coordinates so it reads level */}
      <Part motion={motion} offset={[0.16, -0.18, 0]} order={3} callout={PARTS.battery}>
        {null}
      </Part>
    </group>
  );
}

/** the battery's shell, centred on its own middle: in the down tube or on its own on a product page */
export function BatteryPack({
  m,
  length = 0.42,
  width = 0.062,
}: {
  m: Materials;
  length?: number;
  width?: number;
}) {
  return (
    <group>
      <RoundedBox args={[length, 0.034, width]} radius={0.014} smoothness={4} material={m.shell} castShadow />
      {/* the key lock and charge port at the motor end */}
      <mesh material={m.anodised} position={[-length / 2 + 0.03, 0, width / 2 + 0.001]}>
        <cylinderGeometry args={[0.007, 0.007, 0.004, 20]} />
      </mesh>
      <mesh
        material={m.steel}
        position={[-length / 2 + 0.055, 0, width / 2 + 0.001]}
        rotation-x={Math.PI / 2}
      >
        <cylinderGeometry args={[0.004, 0.004, 0.003, 16]} />
      </mesh>
    </group>
  );
}

/** mid-drive motor around the bottom bracket, finned, with a skid plate under it */
function Motor({ m }: { m: Materials }) {
  const centre: P3 = [BB[0] + 0.045, BB[1] + 0.025, 0];
  return (
    <group position={centre} rotation-z={0.5}>
      <RoundedBox
        args={[0.2, 0.13, 0.1]}
        radius={0.04}
        smoothness={5}
        material={m.shell}
        castShadow
        receiveShadow
      />
      {[-1, 1].flatMap((side) =>
        Array.from({ length: 6 }, (_, i) => (
          <mesh key={`${side}${i}`} material={m.anodised} position={[-0.04 + i * 0.016, 0.01, side * 0.0505]}>
            <boxGeometry args={[0.006, 0.07, 0.003]} />
          </mesh>
        )),
      )}
      <mesh material={m.anodised} position={[0.01, -0.07, 0]} castShadow>
        <boxGeometry args={[0.17, 0.008, 0.085]} />
      </mesh>
    </group>
  );
}

/** the gear housing leaving the frame above the motor and running along the chainstay to the derailleur */
const derailleurHousing = new TubeGeometry(
  new CatmullRomCurve3([
    new Vector3(BB[0] + 0.02, BB[1] + 0.1, 0.04),
    new Vector3(MAIN_PIVOT[0] - 0.04, MAIN_PIVOT[1] + 0.035, 0.07),
    new Vector3(REAR_AXLE[0] + 0.12, REAR_AXLE[1] + 0.04, 0.082),
    new Vector3(REAR_AXLE[0] + 0.02, REAR_AXLE[1] - 0.01, 0.09),
  ]),
  60,
  0.0022,
  8,
);

export function RearEnd({ m }: { m: Materials }) {
  const brace = lerp(REAR_AXLE, ROCKER_REAR, 0.55);
  const caliper: P2 = [REAR_AXLE[0] + Math.cos(2.2) * 0.1, REAR_AXLE[1] + Math.sin(2.2) * 0.1];
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Beam
            from={at(MAIN_PIVOT, side * 0.05)}
            to={at(REAR_AXLE, side * 0.064)}
            h={0.032}
            w={0.022}
            material={m.paint}
          />
          <Taper
            from={at(REAR_AXLE, side * 0.062)}
            to={at(ROCKER_REAR, side * 0.04)}
            rFrom={0.0105}
            rTo={0.0135}
            flat={0.8}
            material={m.paint}
          />
          <mesh material={m.anodised} position={at(REAR_AXLE, side * 0.07)} castShadow>
            <boxGeometry args={[0.05, 0.04, 0.008]} />
          </mesh>
          {/* rocker plates and bolts */}
          <Beam
            from={at(ROCKER_REAR, side * 0.032)}
            to={at(ROCKER_FRONT, side * 0.032)}
            h={0.034}
            w={0.01}
            material={m.anodised}
          />
        </group>
      ))}
      <Tube from={at(brace, -0.045)} to={at(brace, 0.045)} r={0.009} material={m.paint} />
      {/* rubber guard on the drive-side chainstay, where the chain slaps */}
      <Beam
        from={at(raise(lerp(MAIN_PIVOT, REAR_AXLE, 0.12)), 0.052)}
        to={at(raise(lerp(MAIN_PIVOT, REAR_AXLE, 0.78)), 0.062)}
        h={0.01}
        w={0.026}
        material={m.rubber}
      />
      <Tube from={at(MAIN_PIVOT, -0.06)} to={at(MAIN_PIVOT, 0.06)} r={0.012} material={m.anodised} />
      {[ROCKER_REAR, ROCKER_PIVOT, ROCKER_FRONT, REAR_AXLE].map((p, i) => (
        <mesh key={i} material={m.steel} position={at(p)} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.0065, 0.0065, i === 3 ? 0.16 : 0.08, 20]} />
        </mesh>
      ))}
      <Caliper m={m} at={caliper} angle={2.2} />
      <mesh geometry={derailleurHousing} material={m.rubber} castShadow />
    </group>
  );
}

/** a four-piston calliper straddling the rotor (rotor plane z = -0.05) */
function Caliper({ m, at: p, angle }: { m: Materials; at: P2; angle: number }) {
  return (
    <group position={[p[0], p[1], -0.05]} rotation-z={angle + Math.PI / 2}>
      {[-1, 1].map((side) => (
        <RoundedBox
          key={side}
          args={[0.05, 0.022, 0.012]}
          radius={0.004}
          smoothness={3}
          position-z={side * 0.009}
          material={m.anodised}
          castShadow
        />
      ))}
      <mesh material={m.spring} position={[0, 0, -0.0155]}>
        <boxGeometry args={[0.028, 0.008, 0.001]} />
      </mesh>
    </group>
  );
}

class Helix extends Curve<Vector3> {
  readonly radius: number;
  readonly length: number;
  readonly turns: number;
  constructor(radius: number, length: number, turns: number) {
    super();
    this.radius = radius;
    this.length = length;
    this.turns = turns;
  }
  override getPoint(t: number, target = new Vector3()) {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, t * this.length, Math.sin(a) * this.radius);
  }
}

/** coil shock: body at the down tube, gold shaft, a yellow spring, piggyback reservoir */
export function Shock({ m }: { m: Materials }) {
  const { position, quaternion, length } = useMemo(() => span(at(SHOCK_MOUNT), at(ROCKER_FRONT)), []);
  const coil = useMemo(
    () => new TubeGeometry(new Helix(0.026, length * 0.62, 8.5), 600, 0.0042, 8),
    [length],
  );
  useEffect(() => () => coil.dispose(), [coil]);
  const base = -length / 2;
  return (
    <group position={position} quaternion={quaternion}>
      <mesh material={m.anodised} position-y={base + 0.07} castShadow>
        <cylinderGeometry args={[0.019, 0.019, 0.12, 32]} />
      </mesh>
      <mesh material={m.kashima} position-y={base + 0.17} castShadow>
        <cylinderGeometry args={[0.0085, 0.0085, 0.12, 20]} />
      </mesh>
      <mesh geometry={coil} material={m.spring} position-y={base + 0.035} castShadow />
      {[base + 0.03, base + length * 0.66].map((y) => (
        <mesh key={y} material={m.anodised} position-y={y}>
          <cylinderGeometry args={[0.032, 0.032, 0.008, 32]} />
        </mesh>
      ))}
      <mesh material={m.anodised} position={[0.032, base + 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.09, 24]} />
      </mesh>
      {[base, -base].map((y) => (
        <mesh key={y} material={m.steel} position-y={y} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.009, 0.004, 10, 20]} />
        </mesh>
      ))}
    </group>
  );
}

/** 160 mm fork: crown, gold stanchions, lowers with the arch in front, and the headlight on the crown */
export function Fork({ m, light }: { m: Materials; light: boolean }) {
  const arch = useMemo(
    () =>
      new TubeGeometry(
        new CatmullRomCurve3([
          new Vector3(0.012, -0.215, -0.058),
          new Vector3(0.045, -0.175, -0.02),
          new Vector3(0.045, -0.175, 0.02),
          new Vector3(0.012, -0.215, 0.058),
        ]),
        40,
        0.009,
        12,
      ),
    [],
  );
  useEffect(() => () => arch.dispose(), [arch]);
  const target = useMemo(() => new Object3D(), []);
  const axle = -FORK_LENGTH;

  return (
    <group position={at(HEAD_BOTTOM)} rotation-z={FORK_ANGLE}>
      <RoundedBox
        args={[0.06, 0.032, 0.16]}
        radius={0.012}
        smoothness={4}
        position-y={-0.02}
        material={m.anodised}
        castShadow
      />
      {[-1, 1].map((side) => (
        <group key={side} position-z={side * 0.058}>
          <mesh material={m.kashima} position-y={-0.135} castShadow>
            <cylinderGeometry args={[0.0175, 0.0175, 0.21, 32]} />
          </mesh>
          <mesh material={m.anodised} position-y={(axle - 0.19) / 2} castShadow>
            <cylinderGeometry args={[0.023, 0.021, -axle - 0.19, 32]} />
          </mesh>
          <mesh material={m.rubber} position-y={-0.192}>
            <torusGeometry args={[0.0205, 0.0035, 10, 32]} />
          </mesh>
          <mesh material={m.anodised} position={[0.004, axle, 0]} castShadow>
            <boxGeometry args={[0.04, 0.03, 0.02]} />
          </mesh>
        </group>
      ))}
      <mesh geometry={arch} material={m.anodised} castShadow />
      <ForkDecals axle={axle} />
      <Caliper m={m} at={[-0.055, axle + 0.075]} angle={2.2} />

      {/* headlight on the crown, pointing along the trail */}
      <group position={[0.05, -0.012, 0]} rotation-z={-FORK_ANGLE - 0.12}>
        <mesh material={m.anodised} rotation-z={-Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.018, 0.022, 0.04, 32]} />
        </mesh>
        <mesh material={m.lamp} position-x={0.0205} rotation-y={Math.PI / 2}>
          <circleGeometry args={[0.016, 32]} />
        </mesh>
        {light && (
          <>
            <primitive object={target} position={[1, 0, 0]} />
            <spotLight
              position={[0.03, 0, 0]}
              target={target}
              angle={0.38}
              penumbra={0.7}
              intensity={6}
              distance={4}
              decay={1.4}
              color="#fff3dc"
            />
          </>
        )}
      </group>
    </group>
  );
}

function paintDisplay(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#07090a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#b8f2c8';
  brandFont(ctx, h * 0.5);
  ctx.textBaseline = 'middle';
  ctx.fillText('86', w * 0.08, h * 0.5);
  brandFont(ctx, h * 0.16, 600);
  ctx.fillText('% · TRAIL', w * 0.5, h * 0.36);
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = i < 4 ? 1 : 0.25;
    ctx.fillRect(w * 0.5 + i * w * 0.085, h * 0.58, w * 0.065, h * 0.14);
  }
  ctx.globalAlpha = 1;
}

export function Cockpit({ m }: { m: Materials }) {
  const bar = useMemo(() => {
    const pts = [-0.39, -0.3, -0.18, -0.07, 0, 0.07, 0.18, 0.3, 0.39].map((z) => {
      const t = Math.max(0, (Math.abs(z) - 0.07) / 0.32);
      return new Vector3(BAR[0] - 0.024 * t * t, BAR[1] + 0.03 * Math.sin((t * Math.PI) / 2), z);
    });
    return new TubeGeometry(new CatmullRomCurve3(pts), 80, 0.011, 16);
  }, []);
  useEffect(() => () => bar.dispose(), [bar]);
  const screen = usePaintedTexture(256, 128, paintDisplay);

  return (
    <group>
      {/* spacers and top cap above the head tube */}
      <group position={at(HEAD_TOP)} rotation-z={FORK_ANGLE}>
        <mesh material={m.anodised} position-y={0.02}>
          <cylinderGeometry args={[0.019, 0.019, 0.04, 28]} />
        </mesh>
      </group>
      <Beam from={at(STEERER_TOP)} to={at(BAR)} h={0.036} w={0.034} material={m.anodised}>
        {/* display on the stem */}
        <group position={[0, 0.026, 0]} rotation-z={0.35}>
          <RoundedBox args={[0.062, 0.012, 0.042]} radius={0.004} smoothness={3} material={m.shell} />
          <mesh position-y={0.0062} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.054, 0.034]} />
            <meshBasicMaterial map={screen} toneMapped={false} />
          </mesh>
        </group>
      </Beam>
      <mesh geometry={bar} material={m.anodised} castShadow />
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            material={m.rubber}
            position={[BAR[0] - 0.022, BAR[1] + 0.029, side * 0.345]}
            rotation-x={Math.PI / 2}
            castShadow
          >
            <cylinderGeometry args={[0.0165, 0.0165, 0.085, 24]} />
          </mesh>
          <mesh
            material={m.anodised}
            position={[BAR[0] - 0.021, BAR[1] + 0.028, side * 0.298]}
            rotation-x={Math.PI / 2}
          >
            <cylinderGeometry args={[0.0175, 0.0175, 0.01, 24]} />
          </mesh>
          {/* brake lever: clamp body and blade */}
          <mesh material={m.anodised} position={[BAR[0] - 0.014, BAR[1] + 0.028, side * 0.262]} castShadow>
            <boxGeometry args={[0.03, 0.03, 0.022]} />
          </mesh>
          <mesh
            material={m.anodised}
            position={[BAR[0] + 0.035, BAR[1] + 0.012, side * 0.29]}
            rotation={[side * 0.25, 0, -0.35]}
            castShadow
          >
            <boxGeometry args={[0.012, 0.006, 0.09]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Seat({ m }: { m: Materials }) {
  // a sphere pressed into a saddle: narrow nose, wide rear, domed on top and nearly flat underneath
  const saddle = useMemo(() => {
    const g = new SphereGeometry(1, 64, 32);
    const pos = g.attributes.position as BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const length = x * 0.135;
      // half-width: 22 mm at the nose widening to 72 mm over the rear third
      const rear = Math.min(1, Math.max(0, (0.05 - length) / 0.16));
      const width = 0.022 + 0.05 * Math.sin((rear * Math.PI) / 2);
      // a slight dip in the middle and a kick up at the tail
      const lift = 0.006 * Math.pow(Math.max(0, -length - 0.06) / 0.08, 2);
      pos.setXYZ(i, length, (y > 0 ? y * 0.024 : y * 0.009) + lift, z * width);
    }
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => saddle.dispose(), [saddle]);
  const tilt = Math.atan2(-SEAT_AXIS[0], SEAT_AXIS[1]);
  const lower = lerp(SEAT_TOP, POST_TOP, 0.25);
  return (
    <group>
      <mesh material={m.anodised} position={at(lower)} rotation-z={tilt} castShadow>
        <cylinderGeometry args={[0.0165, 0.0165, 0.1, 28]} />
      </mesh>
      <mesh material={m.anodised} position={at(lerp(SEAT_TOP, POST_TOP, 0.72))} rotation-z={tilt} castShadow>
        <cylinderGeometry args={[0.0152, 0.0152, 0.1, 28]} />
      </mesh>
      <mesh material={m.anodised} position={at(lerp(SEAT_TOP, POST_TOP, 0.5))} rotation-z={tilt}>
        <cylinderGeometry args={[0.019, 0.019, 0.012, 28]} />
      </mesh>
      <group position={[POST_TOP[0] + 0.01, POST_TOP[1] + 0.026, 0]}>
        <mesh material={m.anodised}>
          <boxGeometry args={[0.04, 0.016, 0.03]} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} material={m.steel} position={[0, 0.012, side * 0.018]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.0035, 0.0035, 0.15, 12]} />
          </mesh>
        ))}
        <mesh geometry={saddle} material={m.leather} position={[0, 0.03, 0]} castShadow />
      </group>
    </group>
  );
}

/** brake hoses from the levers: the front one down the fork, the rear into the head tube port */
export function Hoses({ m }: { m: Materials }) {
  const geometries = useMemo(() => {
    const lever = new Vector3(BAR[0] - 0.01, BAR[1] + 0.02, -0.26);
    const front = new TubeGeometry(
      new CatmullRomCurve3([
        lever,
        new Vector3(BAR[0] + 0.06, BAR[1] - 0.06, -0.16),
        new Vector3(...forkPoint(0.06, -0.08, -0.09)),
        new Vector3(...forkPoint(0.035, -0.3, -0.085)),
        new Vector3(...forkPoint(-0.03, axleY(0.12), -0.07)),
      ]),
      80,
      0.0026,
      8,
    );
    const rear = new TubeGeometry(
      new CatmullRomCurve3([
        new Vector3(BAR[0] - 0.01, BAR[1] + 0.02, 0.26),
        new Vector3(BAR[0] + 0.07, BAR[1] - 0.05, 0.15),
        new Vector3(...forkPoint(0.03, 0.06, 0.05)),
        new Vector3(...forkPoint(0.0, 0.11, 0.032)),
      ]),
      60,
      0.0026,
      8,
    );
    // gear and dropper housings: right and left of the bar into the head tube's ports
    const housing = (from: Vector3, mid: Vector3, port: P3) =>
      new TubeGeometry(new CatmullRomCurve3([from, mid, new Vector3(...port)]), 50, 0.0022, 8);
    const shifter = housing(
      new Vector3(BAR[0] - 0.015, BAR[1] + 0.015, 0.21),
      new Vector3(BAR[0] + 0.08, BAR[1] - 0.07, 0.1),
      forkPoint(0.012, 0.1, 0.034),
    );
    const dropper = housing(
      new Vector3(BAR[0] - 0.015, BAR[1] + 0.015, -0.21),
      new Vector3(BAR[0] + 0.08, BAR[1] - 0.07, -0.1),
      forkPoint(0.012, 0.1, -0.034),
    );
    return [front, rear, shifter, dropper];
  }, []);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  return (
    <>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={m.rubber} castShadow />
      ))}
    </>
  );
}

/** a height on the fork, measured from the axle */
function axleY(above: number) {
  return -FORK_LENGTH + above;
}

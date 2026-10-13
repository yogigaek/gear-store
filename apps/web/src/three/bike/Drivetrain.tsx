import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CatmullRomCurve3, Matrix4, Quaternion, Vector3, type Group, type InstancedMesh } from 'three';
import { BB, DRIVE, REAR_AXLE, type P2 } from './layout';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gearShape } from './geometry';
import type { Materials } from './materials';

/** shared between the wheels, cranks and chain: how far the rear wheel has turned, radians */
export interface Motion {
  angle: number;
  /** 0 assembled, 1 fully apart: the teardown */
  explode: number;
  /** the opening assembly: 0 with every part still flying in, 1 once the bike is together */
  intro: number;
}

/** 10–52 cassette, the largest cog nearest the spokes */
const COGS = [52, 45, 39, 34, 30, 26, 23, 20, 17, 15, 12, 10];
const COG_PITCH = 0.0036;
const PULLEY_UPPER: P2 = [REAR_AXLE[0] + 0.012, REAR_AXLE[1] - 0.075];
const PULLEY_LOWER: P2 = [REAR_AXLE[0] + 0.05, REAR_AXLE[1] - 0.145];
const PULLEY_R = 0.02;
const LINK = 0.0127; // half-inch pitch

const cogRadius = (teeth: number) => (teeth * LINK) / (2 * Math.PI);

/** cogs ride on the rear wheel, so they turn with it: place inside the rear `Wheel` */
export function Cassette({ m }: { m: Materials }) {
  const shapes = useMemo(() => COGS.map((t) => gearShape(t, cogRadius(t), null)), []);
  return (
    <group position-z={DRIVE.z - 0.00085}>
      {shapes.map((shape, i) => (
        <mesh
          key={COGS[i]}
          material={i % 3 === 0 ? m.anodised : m.steel}
          position-z={(i - DRIVE.cog.index) * COG_PITCH}
          castShadow
        >
          <extrudeGeometry args={[shape, { depth: 0.0017, bevelEnabled: false, curveSegments: 4 }]} />
        </mesh>
      ))}
    </group>
  );
}

/** the closed path the chain follows, in the chainline plane */
function chainPath() {
  const pts: Vector3[] = [];
  const arc = (c: P2, r: number, from: number, to: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = from + ((to - from) * i) / n;
      pts.push(new Vector3(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, DRIVE.z));
    }
  };
  const rr = DRIVE.ring.r;
  const cr = DRIVE.cog.r;
  // around the front of the chainring, bottom to top
  arc(BB, rr, -Math.PI * 0.55, Math.PI * 0.5, 14);
  // top run to the cog, round its back, down to the derailleur
  arc(REAR_AXLE, cr, Math.PI * 0.5, Math.PI * 1.45, 10);
  arc(PULLEY_UPPER, PULLEY_R, Math.PI * 0.9, Math.PI * 1.6, 4);
  arc(PULLEY_LOWER, PULLEY_R, Math.PI * 0.6, Math.PI * 1.55, 6);
  return new CatmullRomCurve3(pts, true, 'centripetal');
}

const SAMPLES = 2048;

/** every link is an instance, moved along the path as the cranks turn */
export function Chain({ m, motion }: { m: Materials; motion: Motion }) {
  const plates = useRef<InstancedMesh>(null);
  const rollers = useRef<InstancedMesh>(null);
  // side plates with rounded ends, and the rollers between them
  const plate = useMemo(() => new RoundedBoxGeometry(LINK * 1.2, 0.0072, 0.0011, 2, 0.0028), []);
  useEffect(() => () => plate.dispose(), [plate]);
  const { points, angles, links, length } = useMemo(() => {
    const curve = chainPath();
    const length = curve.getLength();
    const points = curve.getSpacedPoints(SAMPLES);
    const angles = points.map((_, i) => {
      const a = points[i];
      const b = points[(i + 1) % SAMPLES];
      return Math.atan2(b.y - a.y, b.x - a.x);
    });
    return { points, angles, links: Math.round(length / LINK), length };
  }, []);

  const scratch = useMemo(
    () => ({
      m: new Matrix4(),
      q: new Quaternion(),
      p: new Vector3(),
      s: new Vector3(1, 1, 1),
      z: new Vector3(0, 0, 1),
      across: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2),
    }),
    [],
  );
  const last = useRef(Number.NaN);

  useFrame(() => {
    const mesh = plates.current;
    const pins = rollers.current;
    if (!mesh || !pins || last.current === motion.angle) return;
    last.current = motion.angle;
    // the cog's rim travels angle × r; the chain moves forward along the top run, i.e. against the path order
    const shift = -(motion.angle * DRIVE.cog.r) / length;
    for (let i = 0; i < links; i++) {
      for (const side of [-1, 1]) {
        const t = (((i / links + shift) % 1) + 1) % 1;
        const k = Math.floor(t * SAMPLES) % SAMPLES;
        const { p, q, m: mx, s, z } = scratch;
        p.copy(points[k]);
        p.z += side * (i % 2 === 0 ? 0.0042 : 0.0031);
        q.setFromAxisAngle(z, angles[k]);
        mx.compose(p, q, s);
        mesh.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), mx);
      }
      // a roller at the joint between this link and the next, its axis across the chain
      const t = (((i / links + 0.5 / links + shift) % 1) + 1) % 1;
      const k = Math.floor(t * SAMPLES) % SAMPLES;
      const { p, m: mx, s, across } = scratch;
      p.copy(points[k]);
      mx.compose(p, across, s);
      pins.setMatrixAt(i, mx);
    }
    mesh.instanceMatrix.needsUpdate = true;
    pins.instanceMatrix.needsUpdate = true;
  });

  useLayoutEffect(() => {
    plates.current?.computeBoundingSphere();
  });

  return (
    <>
      <instancedMesh ref={plates} args={[plate, m.steel, links * 2]} castShadow frustumCulled={false} />
      <instancedMesh ref={rollers} args={[undefined, m.anodised, links]} frustumCulled={false}>
        <cylinderGeometry args={[0.0036, 0.0036, 0.0074, 10]} />
      </instancedMesh>
    </>
  );
}

/** chainring, crank arms and flat pedals, turning about the bottom bracket */
export function Crankset({ m, motion }: { m: Materials; motion: Motion }) {
  const spin = useRef<Group>(null);
  const pedals = useRef<Group[]>([]);
  const ring = useMemo(
    () => gearShape(DRIVE.ring.teeth, DRIVE.ring.r, { r: 0.016, at: 0.043, count: 4 }),
    [],
  );

  useFrame(() => {
    // the chain drives the cog and the ring by the same length: angle × cog r = crank angle × ring r
    const crank = -(motion.angle * DRIVE.cog.r) / DRIVE.ring.r;
    if (spin.current) spin.current.rotation.z = crank;
    // pedals stay level under the rider's feet: undo the crank's turn and the arm's own quarter turn
    pedals.current.forEach((p, i) => {
      if (p) p.rotation.z = -crank + (i === 0 ? Math.PI / 2 : -Math.PI / 2);
    });
  });

  return (
    <group position={[BB[0], BB[1], 0]}>
      <group ref={spin}>
        <mesh material={m.anodised} position-z={DRIVE.z - 0.001} castShadow>
          <extrudeGeometry args={[ring, { depth: 0.004, bevelEnabled: false, curveSegments: 4 }]} />
        </mesh>
        <mesh material={m.anodised} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[0.012, 0.012, 0.17, 24]} />
        </mesh>
        {[1, -1].map((side, i) => (
          <group key={side} position-z={side * 0.078} rotation-z={side > 0 ? -Math.PI / 2 : Math.PI / 2}>
            <mesh material={m.anodised} position-x={DRIVE.crank / 2} castShadow>
              <boxGeometry args={[DRIVE.crank + 0.03, 0.026, 0.014]} />
            </mesh>
            <group
              position={[DRIVE.crank, 0, side * 0.055]}
              ref={(g) => {
                if (g) pedals.current[i] = g;
              }}
            >
              <Pedal m={m} />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

function Pedal({ m }: { m: Materials }) {
  return (
    <group>
      <mesh material={m.anodised} castShadow>
        <boxGeometry args={[0.1, 0.014, 0.095]} />
      </mesh>
      {/* traction pins, top and bottom */}
      {Array.from({ length: 10 }).flatMap((_, k) => {
        const x = -0.042 + (k % 5) * 0.021;
        const z = k < 5 ? -0.04 : 0.04;
        return [-1, 1].map((y) => (
          <mesh key={`${k}${y}`} material={m.steel} position={[x, y * 0.009, z]}>
            <cylinderGeometry args={[0.0018, 0.0018, 0.005, 8]} />
          </mesh>
        ));
      })}
    </group>
  );
}

/** rear derailleur: knuckle on the hanger, parallelogram, cage with two jockey wheels */
export function Derailleur({ m, motion }: { m: Materials; motion: Motion }) {
  const wheels = useRef<Group[]>([]);
  useFrame(() => {
    const a = -(motion.angle * DRIVE.cog.r) / PULLEY_R;
    for (const w of wheels.current) if (w) w.rotation.z = a;
  });
  const pulleys = [PULLEY_UPPER, PULLEY_LOWER];
  return (
    <group>
      <mesh
        material={m.anodised}
        position={[REAR_AXLE[0] + 0.01, REAR_AXLE[1] - 0.03, DRIVE.z + 0.025]}
        castShadow
      >
        <boxGeometry args={[0.03, 0.05, 0.022]} />
      </mesh>
      <mesh
        material={m.anodised}
        position={[
          (PULLEY_UPPER[0] + PULLEY_LOWER[0]) / 2,
          (PULLEY_UPPER[1] + PULLEY_LOWER[1]) / 2,
          DRIVE.z + 0.009,
        ]}
        rotation-z={Math.atan2(PULLEY_LOWER[1] - PULLEY_UPPER[1], PULLEY_LOWER[0] - PULLEY_UPPER[0])}
        castShadow
      >
        <boxGeometry args={[0.11, 0.035, 0.003]} />
      </mesh>
      {pulleys.map((p, i) => (
        <group
          key={i}
          position={[p[0], p[1], DRIVE.z]}
          ref={(g) => {
            if (g) wheels.current[i] = g;
          }}
        >
          <mesh material={m.shell} position-z={-0.002}>
            <extrudeGeometry
              args={[gearShape(12, PULLEY_R - 0.004, null), { depth: 0.004, bevelEnabled: false }]}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

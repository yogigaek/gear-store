import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode, type Ref } from 'react';
import {
  LatheGeometry,
  Matrix4,
  Path,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { WHEEL } from './layout';
import { WheelLettering } from './details';
import type { Materials } from './materials';

const HUB_FLANGE = { r: 0.029, z: 0.032 };
const KNOBS_AROUND = 60;

/**
 * Cross-sections, as (distance from the axle, offset along it) pairs, from one side to the other. Turned
 * about the axle they give a tyre with a flat-ish tread and bulging sidewalls, a rim with its bead hooks,
 * and a hub with flanges, instead of the doughnuts a torus makes.
 */
const TYRE_SECTION = [
  [0.3, -0.0215],
  [0.312, -0.0275],
  [0.326, -0.0303],
  [0.341, -0.0298],
  [0.353, -0.0268],
  [0.3615, -0.0205],
  [0.3655, -0.011],
  [0.3665, 0],
  [0.3655, 0.011],
  [0.3615, 0.0205],
  [0.353, 0.0268],
  [0.341, 0.0298],
  [0.326, 0.0303],
  [0.312, 0.0275],
  [0.3, 0.0215],
] as const;
const RIM_SECTION = [
  [0.3035, 0.0118],
  [0.3075, 0.0142],
  [0.3062, 0.0152],
  [0.2985, 0.0152],
  [0.288, 0.0138],
  [0.2815, 0.0085],
  [0.2805, 0],
  [0.2815, -0.0085],
  [0.288, -0.0138],
  [0.2985, -0.0152],
  [0.3062, -0.0152],
  [0.3075, -0.0142],
  [0.3035, -0.0118],
] as const;
const HUB_SECTION = [
  [0.006, -0.058],
  [0.012, -0.058],
  [0.013, -0.046],
  [0.018, -0.042],
  [0.018, -0.036],
  [0.033, -0.035],
  [0.033, -0.03],
  [0.02, -0.028],
  [0.017, -0.01],
  [0.017, 0.01],
  [0.02, 0.028],
  [0.033, 0.03],
  [0.033, 0.035],
  [0.018, 0.036],
  [0.018, 0.042],
  [0.013, 0.046],
  [0.012, 0.058],
  [0.006, 0.058],
] as const;

/** a section turned about the wheel's axle (z) */
function turned(section: readonly (readonly [number, number])[], segments: number) {
  // LatheGeometry turns about y; the section's offset runs along y, then y is laid onto z
  const geometry = new LatheGeometry(
    section.map(([r, z]) => new Vector2(r, z)),
    segments,
  );
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** tread rows: where on the section each sits, which way it faces (radial, axial), and its size */
const KNOB_ROWS = [
  { r: 0.3585, z: -0.0245, n: [0.62, -0.78], size: 1.15, stagger: 0 },
  { r: 0.3655, z: -0.0105, n: [0.96, -0.27], size: 1, stagger: 0.5 },
  { r: 0.3668, z: 0, n: [1, 0], size: 0.9, stagger: 0 },
  { r: 0.3655, z: 0.0105, n: [0.96, 0.27], size: 1, stagger: 0.5 },
  { r: 0.3585, z: 0.0245, n: [0.62, 0.78], size: 1.15, stagger: 0 },
] as const;
const ROTOR = { r: 0.1, ring: 0.079, z: -0.05 };

const Y = new Vector3(0, 1, 0);

/**
 * A 29-inch wheel turning about its own z axis: knobbed tyre, rim, 32 spokes laced two-cross, hub, and a
 * drilled 203 mm rotor on the left. The rear wheel takes the cassette as `children`.
 */
export function Wheel({ m, ref, children }: { m: Materials; ref?: Ref<Group>; children?: ReactNode }) {
  return (
    <group ref={ref}>
      <Turned m={m} />
      <Knobs m={m} />
      <Spokes m={m} />
      <Rotor m={m} />
      <WheelLettering />
      {children}
    </group>
  );
}

function Turned({ m }: { m: Materials }) {
  const geometry = useMemo(
    () => ({ tyre: turned(TYRE_SECTION, 160), rim: turned(RIM_SECTION, 160), hub: turned(HUB_SECTION, 48) }),
    [],
  );
  useEffect(() => () => Object.values(geometry).forEach((g) => g.dispose()), [geometry]);
  return (
    <>
      <mesh geometry={geometry.tyre} material={m.tyre} castShadow receiveShadow />
      <mesh geometry={geometry.rim} material={m.anodised} castShadow receiveShadow />
      <mesh geometry={geometry.hub} material={m.anodised} castShadow />
    </>
  );
}

function Knobs({ m }: { m: Materials }) {
  const ref = useRef<InstancedMesh>(null);
  const count = KNOB_ROWS.length * KNOBS_AROUND;
  const geometry = useMemo(() => new RoundedBoxGeometry(0.0125, 0.006, 0.0105, 2, 0.0022), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const t = new Vector3();
    const n = new Vector3();
    const b = new Vector3();
    const p = new Vector3();
    const q = new Quaternion();
    const scale = new Vector3();
    let i = 0;
    for (const row of KNOB_ROWS) {
      for (let k = 0; k < KNOBS_AROUND; k++) {
        const theta = ((k + row.stagger) / KNOBS_AROUND) * Math.PI * 2;
        const c = Math.cos(theta);
        const s = Math.sin(theta);
        // each knob stands on the casing: y along the surface normal, x along the direction of roll
        n.set(row.n[0] * c, row.n[0] * s, row.n[1]).normalize();
        t.set(-s, c, 0);
        b.crossVectors(t, n);
        q.setFromRotationMatrix(matrix.makeBasis(t, n, b));
        p.set(c * row.r, s * row.r, row.z).addScaledVector(n, 0.0026);
        scale.setScalar(row.size);
        matrix.compose(p, q, scale);
        mesh.setMatrixAt(i++, matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);
  return <instancedMesh ref={ref} args={[geometry, m.tyre, count]} castShadow />;
}

/** where spokes meet the rim bed, and the nipples that hold them there */
const SPOKE_END = 0.2835;
const NIPPLE = 0.012;

function Spokes({ m }: { m: Materials }) {
  const spokes = useRef<InstancedMesh>(null);
  const nipples = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!spokes.current || !nipples.current) return;
    const matrix = new Matrix4();
    const q = new Quaternion();
    for (let i = 0; i < WHEEL.spokes; i++) {
      const rimAngle = (i / WHEEL.spokes) * Math.PI * 2;
      const side = i % 2 === 0 ? 1 : -1;
      // two-cross: each spoke leaves the flange well ahead of or behind the point it reaches on the rim
      const lead = (Math.floor(i / 2) % 2 === 0 ? 1 : -1) * 0.62;
      const a = new Vector3(
        Math.cos(rimAngle + lead) * HUB_FLANGE.r,
        Math.sin(rimAngle + lead) * HUB_FLANGE.r,
        side * HUB_FLANGE.z,
      );
      const b = new Vector3(Math.cos(rimAngle) * SPOKE_END, Math.sin(rimAngle) * SPOKE_END, 0);
      const d = b.clone().sub(a);
      const dir = d.clone().normalize();
      q.setFromUnitVectors(Y, dir);
      matrix.compose(a.clone().addScaledVector(d, 0.5), q, new Vector3(1, d.length(), 1));
      spokes.current.setMatrixAt(i, matrix);
      matrix.compose(b.clone().addScaledVector(dir, -NIPPLE / 2), q, new Vector3(1, 1, 1));
      nipples.current.setMatrixAt(i, matrix);
    }
    for (const mesh of [spokes.current, nipples.current]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, []);
  return (
    <>
      <instancedMesh ref={spokes} args={[undefined, m.steel, WHEEL.spokes]} castShadow>
        <cylinderGeometry args={[0.001, 0.001, 1, 6]} />
      </instancedMesh>
      <instancedMesh ref={nipples} args={[undefined, m.steel, WHEEL.spokes]}>
        <cylinderGeometry args={[0.0019, 0.0016, NIPPLE, 8]} />
      </instancedMesh>
    </>
  );
}

/** the braking ring is one drilled piece; five arms carry it to the hub */
function Rotor({ m }: { m: Materials }) {
  const ring = useMemo(() => {
    const shape = new Shape();
    shape.absarc(0, 0, ROTOR.r, 0, Math.PI * 2, false);
    const inner = new Path();
    inner.absarc(0, 0, ROTOR.ring, 0, Math.PI * 2, true);
    shape.holes.push(inner);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const r = i % 2 === 0 ? 0.0865 : 0.0925;
      const hole = new Path();
      hole.absarc(Math.cos(a) * r, Math.sin(a) * r, 0.0026, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    return shape;
  }, []);
  return (
    <group position-z={ROTOR.z}>
      <mesh material={m.rotor} position-z={-0.001} castShadow>
        <extrudeGeometry args={[ring, { depth: 0.002, bevelEnabled: false, curveSegments: 48 }]} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        const r = (ROTOR.ring + 0.016) / 2;
        return (
          <mesh key={i} material={m.anodised} position={[Math.cos(a) * r, Math.sin(a) * r, 0]} rotation-z={a}>
            <boxGeometry args={[ROTOR.ring - 0.012, 0.011, 0.003]} />
          </mesh>
        );
      })}
      <mesh material={m.anodised} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.022, 0.022, 0.006, 32]} />
      </mesh>
    </group>
  );
}

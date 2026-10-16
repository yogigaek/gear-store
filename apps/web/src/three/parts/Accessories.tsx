import { RoundedBox } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, Color, MeshStandardMaterial, TubeGeometry, Vector3 } from 'three';
import type { Materials } from '../bike/materials';

// The accessories, drawn the way the bike is: procedural, at real size (metres), in the bike's materials.

/** a 1,200-lumen headlight on its bar clamp, and the brake-sensing tail light */
export function Lights({ m }: { m: Materials }) {
  const red = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#ff3b2f',
        emissive: new Color('#ff2a1a'),
        emissiveIntensity: 4,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => red.dispose(), [red]);
  return (
    <group>
      <group position={[-0.06, 0.03, 0]}>
        <mesh material={m.anodised} rotation-z={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.022, 0.026, 0.075, 40]} />
        </mesh>
        <mesh material={m.lamp} position-x={0.0385} rotation-y={Math.PI / 2}>
          <circleGeometry args={[0.019, 40]} />
        </mesh>
        {/* cooling fins along the body */}
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} material={m.anodised} position={[-0.026 + i * 0.011, 0, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.0275, 0.0275, 0.003, 40]} />
          </mesh>
        ))}
        <mesh material={m.rubber} position={[0, -0.032, 0]} castShadow>
          <boxGeometry args={[0.03, 0.014, 0.022]} />
        </mesh>
      </group>
      <group position={[0.07, 0.022, 0.02]}>
        <RoundedBox args={[0.022, 0.05, 0.02]} radius={0.006} smoothness={4} material={m.shell} castShadow />
        <mesh material={red} position={[0, 0, 0.0102]}>
          <planeGeometry args={[0.014, 0.038]} />
        </mesh>
      </group>
    </group>
  );
}

/** six hardened links, folded into a block, with the lock body at one end */
export function FoldingLock({ m }: { m: Materials }) {
  return (
    <group rotation-x={-0.25}>
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i} position={[0, 0.012 + i * 0.0085, 0]} rotation-y={i % 2 === 0 ? 0.04 : -0.04}>
          <RoundedBox
            args={[0.16, 0.007, 0.026]}
            radius={0.003}
            smoothness={3}
            material={m.rubber}
            castShadow
          />
          {[-1, 1].map((end) => (
            <mesh key={end} material={m.steel} position={[end * 0.071, 0.004, 0]}>
              <cylinderGeometry args={[0.0045, 0.0045, 0.002, 20]} />
            </mesh>
          ))}
        </group>
      ))}
      <RoundedBox
        args={[0.04, 0.06, 0.034]}
        radius={0.008}
        smoothness={4}
        position={[0.095, 0.036, 0]}
        material={m.anodised}
        castShadow
      />
      <mesh material={m.steel} position={[0.116, 0.045, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.006, 0.006, 0.003, 24]} />
      </mesh>
    </group>
  );
}

/** a 4 A charger brick, its mains lead and the coiled lead to the battery */
export function Charger({ m }: { m: Materials }) {
  const lead = useMemo(() => {
    const points = Array.from({ length: 120 }, (_, i) => {
      const t = i / 119;
      const a = t * Math.PI * 2 * 7;
      // a coil that relaxes into a straight run at its end
      const r = 0.012 * (1 - Math.max(0, t - 0.75) * 4);
      return new Vector3(0.09 + t * 0.16, 0.014 + Math.sin(a) * r, Math.cos(a) * r);
    });
    return new TubeGeometry(new CatmullRomCurve3(points), 400, 0.0025, 8);
  }, []);
  useEffect(() => () => lead.dispose(), [lead]);
  return (
    <group>
      <RoundedBox
        args={[0.15, 0.045, 0.085]}
        radius={0.012}
        smoothness={4}
        position={[0, 0.0225, 0]}
        material={m.shell}
        castShadow
      />
      {/* charge indicator on the top face */}
      <mesh material={m.led} position={[-0.045, 0.0455, 0]}>
        <boxGeometry args={[0.012, 0.001, 0.004]} />
      </mesh>
      <mesh geometry={lead} material={m.rubber} castShadow />
      <mesh material={m.anodised} position={[0.262, 0.014, 0]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.008, 0.008, 0.03, 24]} />
      </mesh>
    </group>
  );
}

/** nine hex keys, 1.5–10 mm, standing in their holder */
export function HexKeys({ m }: { m: Materials }) {
  const sizes = [1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (
    <group>
      <RoundedBox
        args={[0.15, 0.022, 0.03]}
        radius={0.006}
        smoothness={3}
        position={[0, 0.011, 0]}
        material={m.shell}
        castShadow
      />
      {sizes.map((mm, i) => {
        const r = (mm / 1000) * 0.58;
        const long = 0.05 + mm * 0.006;
        const x = -0.064 + i * 0.016;
        return (
          <group key={mm} position={[x, 0.022, 0]}>
            <mesh material={m.steel} position-y={long / 2} castShadow>
              <cylinderGeometry args={[r, r, long, 6]} />
            </mesh>
            {/* the short arm of the L, at the top */}
            <mesh
              material={m.steel}
              position={[0, long, 0.012 + mm * 0.0009]}
              rotation-x={Math.PI / 2}
              castShadow
            >
              <cylinderGeometry args={[r, r, 0.024 + mm * 0.0018, 6]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** a 250 Wh range extender: a bottle-shaped pack in its cage, with the cable to the frame's port */
export function RangeExtender({ m }: { m: Materials }) {
  return (
    <group rotation-z={0.12}>
      <RoundedBox
        args={[0.075, 0.2, 0.075]}
        radius={0.03}
        smoothness={5}
        position-y={0.1}
        material={m.shell}
        castShadow
      />
      {/* the cage: two rails up the back of the pack */}
      {[-1, 1].map((side) => (
        <mesh key={side} material={m.anodised} position={[-0.04, 0.1, side * 0.022]} castShadow>
          <boxGeometry args={[0.006, 0.18, 0.006]} />
        </mesh>
      ))}
      {/* charge level and release button on the top */}
      <mesh material={m.steel} position={[0, 0.202, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.006, 24]} />
      </mesh>
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} material={m.lamp} position={[0.0381, 0.13 + i * 0.012, 0]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[0.008, 0.006]} />
        </mesh>
      ))}
    </group>
  );
}

/** a straight rod between two points, for racks and stays */
function Rod({
  from,
  to,
  r,
  material,
}: {
  from: Vector3;
  to: Vector3;
  r: number;
  material: Materials['steel'];
}) {
  const geometry = useMemo(() => new TubeGeometry(new CatmullRomCurve3([from, to]), 2, r, 10), [from, to, r]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} castShadow />;
}

/** a rear rack: two side frames from the axle up to a flat deck, cross bars, and struts to the seat stays */
export function RearRack({ m }: { m: Materials }) {
  const rods = useMemo(() => {
    const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const out: [Vector3, Vector3][] = [];
    for (const side of [-1, 1]) {
      const z = side * 0.07;
      // leg from the axle mount up to the deck, then the deck's side rail back
      out.push([v(0, 0, z), v(0.06, 0.3, z)], [v(0.06, 0.3, z), v(-0.32, 0.3, z)]);
      // strut forward to the seat stay
      out.push([v(0.06, 0.3, z), v(0.24, 0.36, z * 0.8)]);
    }
    for (const x of [-0.3, -0.19, -0.08, 0.04]) out.push([v(x, 0.3, -0.07), v(x, 0.3, 0.07)]);
    return out;
  }, []);
  return (
    <group>
      {rods.map(([a, b], i) => (
        <Rod key={i} from={a} to={b} r={0.0055} material={m.anodised} />
      ))}
    </group>
  );
}

/** a clip-on fender set: a long rear blade and a short front one, curved to a 29 × 2.6 tyre, with their stays */
export function Fenders({ m }: { m: Materials }) {
  const plastic = useMemo(
    () => new MeshStandardMaterial({ color: '#3a4045', roughness: 0.5, metalness: 0.1 }),
    [],
  );
  useEffect(() => () => plastic.dispose(), [plastic]);
  const blades = useMemo(() => {
    const blade = (from: number, to: number) => {
      const pts = Array.from({ length: 24 }, (_, i) => {
        const a = from + ((to - from) * i) / 23;
        return new Vector3(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0);
      });
      return new TubeGeometry(new CatmullRomCurve3(pts), 80, 0.009, 12);
    };
    return [blade(Math.PI * 0.3, Math.PI * 0.95), blade(Math.PI * 0.12, Math.PI * 0.55)];
  }, []);
  useEffect(() => () => blades.forEach((g) => g.dispose()), [blades]);
  return (
    <group>
      {/* the blades are flattened tubes: wide across the tyre, thin in section */}
      <group position={[-0.26, 0, 0]}>
        <mesh geometry={blades[0]} material={plastic} scale={[1, 1, 4.5]} castShadow />
        {[-1, 1].map((side) => (
          <Rod
            key={side}
            from={new Vector3(0, 0, side * 0.045)}
            to={new Vector3(Math.cos(Math.PI * 0.6) * 0.4, Math.sin(Math.PI * 0.6) * 0.4, side * 0.045)}
            r={0.0025}
            material={m.steel}
          />
        ))}
      </group>
      <group position={[0.26, 0, 0.14]}>
        <mesh geometry={blades[1]} material={plastic} scale={[1, 1, 4.5]} castShadow />
      </group>
    </group>
  );
}

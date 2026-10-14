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

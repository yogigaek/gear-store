import { RoundedBox } from '@react-three/drei';
import { useMemo, type ReactNode } from 'react';
import type { Material } from 'three';
import { span } from './geometry';
import type { P3 } from './layout';

/** a welded round tube between two points, its ends rounded into the joints */
export function Tube({ from, to, r, material }: { from: P3; to: P3; r: number; material: Material }) {
  const { position, quaternion, length } = useMemo(() => span(from, to), [from, to]);
  return (
    <mesh position={position} quaternion={quaternion} material={material} castShadow receiveShadow>
      <capsuleGeometry args={[r, length, 6, 20]} />
    </mesh>
  );
}

/** a hydroformed tube: a rounded box from one point to another, `h` tall in the side view and `w` wide */
export function Beam({
  from,
  to,
  h,
  w,
  material,
  children,
}: {
  from: P3;
  to: P3;
  h: number;
  w: number;
  material: Material;
  children?: ReactNode;
}) {
  const { position, quaternion, length } = useMemo(() => span(from, to, 'x'), [from, to]);
  return (
    <group position={position} quaternion={quaternion}>
      <RoundedBox
        args={[length, h, w]}
        radius={Math.min(h, w) * 0.42}
        smoothness={4}
        material={material}
        castShadow
        receiveShadow
      />
      {children}
    </group>
  );
}

/**
 * A hydroformed tube: tapers from `rFrom` to `rTo` along the segment and is squashed sideways by `flat`
 * (lateral width ÷ height), the way modern frames shape a tube for stiffness one way and comfort the other.
 */
export function Taper({
  from,
  to,
  rFrom,
  rTo,
  flat = 1,
  material,
}: {
  from: P3;
  to: P3;
  rFrom: number;
  rTo: number;
  flat?: number;
  material: Material;
}) {
  const { position, quaternion, length } = useMemo(() => span(from, to), [from, to]);
  return (
    <mesh
      position={position}
      quaternion={quaternion}
      scale={[1, 1, flat]}
      material={material}
      castShadow
      receiveShadow
    >
      {/* cylinder y runs bottom → top, i.e. from → to */}
      <cylinderGeometry args={[rTo, rFrom, length, 40, 1]} />
    </mesh>
  );
}

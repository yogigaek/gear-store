import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useState } from 'react';
import type { Group } from 'three';

// The H-40 built from its real parts, so the exploded view separates actual components instead of
// slicing a mesh. Units are roughly decimetres; the cups sit on the x axis.
type Vec = [number, number, number];

interface Part {
  id: string;
  label: string;
  detail: string;
  base: readonly number[];
  /** where the part travels when fully exploded, relative to base */
  offset: readonly number[];
  /** where its label sits, relative to the part */
  labelAt?: readonly number[];
}

const SIDES = [-1, 1] as const;

const parts = {
  headband: { base: [0, 0, 0], offset: [0, 0.32, 0] },
  cushion: (s: number) => ({ base: [s * 0.76, 0, 0], offset: [-s * 0.32, 0, 0] }),
  driver: (s: number) => ({ base: [s * 0.86, 0, 0], offset: [s * 0.12, 0, 0] }),
  housing: (s: number) => ({ base: [s * 0.99, 0, 0], offset: [s * 0.55, 0, 0] }),
  battery: { base: [1.0, -0.06, 0], offset: [0.75, -0.5, 0] },
} as const;

const labels: Part[] = [
  {
    id: 'headband',
    label: 'Headband',
    detail: 'spring-steel core',
    ...parts.headband,
    labelAt: [-1.3, 1.1, 0],
  },
  {
    id: 'cushion',
    label: 'Cushion',
    detail: 'memory foam, clip-on',
    ...parts.cushion(-1),
    labelAt: [0, -0.55, 0],
  },
  { id: 'driver', label: 'Driver', detail: '40 mm dynamic', ...parts.driver(1), labelAt: [0, 0.52, 0] },
  {
    id: 'housing',
    label: 'Housing',
    detail: 'aluminium, screwed',
    ...parts.housing(-1),
    labelAt: [0, 0.6, 0],
  },
  {
    id: 'battery',
    label: 'Battery',
    detail: '60 h, replaceable',
    ...parts.battery,
    labelAt: [-0.55, -0.22, 0],
  },
];

function at(base: readonly number[], offset: readonly number[], t: number): Vec {
  return [base[0] + offset[0] * t, base[1] + offset[1] * t, base[2] + offset[2] * t];
}

interface Props {
  /** 0 = assembled, 1 = fully exploded */
  explode: number;
  shellColor: string;
  showLabels: boolean;
  /** animate from exploded to assembled once on mount */
  assembleOnMount?: boolean;
}

export function HeadphoneModel({ explode, shellColor, showLabels, assembleOnMount = false }: Props) {
  const root = useRef<Group>(null);
  // starting pose for the first render only; afterwards useFrame moves the groups directly
  const [t0] = useState(() => (assembleOnMount ? 1 : explode));
  const current = useRef(t0);
  const pieces = useRef<Record<string, Group | null>>({});
  const invalidate = useThree((s) => s.invalidate);
  // on a phone-sized canvas the labels drop their detail line so five of them still fit
  const compactLabels = useThree((s) => s.size.width < 520);

  // ease toward the requested state; with frameloop="demand" we only ask for frames while moving
  useFrame((_, delta) => {
    const target = explode;
    const diff = target - current.current;
    if (Math.abs(diff) < 0.001) return;
    current.current += diff * Math.min(1, delta * 6);
    const t = current.current;
    for (const [key, group] of Object.entries(pieces.current)) {
      if (!group) continue;
      const def = placement(key);
      group.position.set(...at(def.base, def.offset, t));
    }
    invalidate();
  });

  const register = (key: string) => (g: Group | null) => {
    pieces.current[key] = g;
  };

  const shell = { color: shellColor, metalness: 0.55, roughness: 0.38 };

  return (
    <group ref={root} position={[0, -0.25, 0]} rotation={[0.18, -0.55, 0]}>
      <group ref={register('headband')} position={at(parts.headband.base, parts.headband.offset, t0)}>
        <mesh position={[0, 0.42, 0]}>
          <torusGeometry args={[1.0, 0.055, 16, 64, Math.PI]} />
          <meshStandardMaterial {...shell} />
        </mesh>
        <mesh position={[0, 0.42, 0]} scale={[0.97, 0.97, 1.6]}>
          <torusGeometry args={[1.0, 0.035, 12, 64, Math.PI]} />
          <meshStandardMaterial color="#1f2326" roughness={0.9} />
        </mesh>
        {SIDES.map((s) => (
          <mesh key={s} position={[s * 1.0, 0.33, 0]}>
            <boxGeometry args={[0.05, 0.2, 0.1]} />
            <meshStandardMaterial color="#8d969b" metalness={0.8} roughness={0.25} />
          </mesh>
        ))}
      </group>

      {SIDES.map((s) => (
        <group
          key={`c${s}`}
          ref={register(`cushion${s}`)}
          position={at(parts.cushion(s).base, parts.cushion(s).offset, t0)}
        >
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.3, 0.1, 20, 48]} />
            <meshStandardMaterial color="#1f2326" roughness={0.95} />
          </mesh>
        </group>
      ))}

      {SIDES.map((s) => (
        <group
          key={`d${s}`}
          ref={register(`driver${s}`)}
          position={at(parts.driver(s).base, parts.driver(s).offset, t0)}
        >
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.34, 0.34, 0.04, 48]} />
            <meshStandardMaterial color="#2b3033" metalness={0.3} roughness={0.6} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[-s * 0.025, 0, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.02, 40]} />
            <meshStandardMaterial color="#a7aeb2" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {SIDES.map((s) => (
        <group
          key={`h${s}`}
          ref={register(`housing${s}`)}
          position={at(parts.housing(s).base, parts.housing(s).offset, t0)}
        >
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.42, 0.4, 0.2, 56]} />
            <meshStandardMaterial {...shell} />
          </mesh>
          {/* four screws on the outer face: the housing comes off, the battery is behind it */}
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              rotation={[0, 0, Math.PI / 2]}
              position={[
                s * 0.105,
                Math.sin((i * Math.PI) / 2 + 0.785) * 0.3,
                Math.cos((i * Math.PI) / 2 + 0.785) * 0.3,
              ]}
            >
              <cylinderGeometry args={[0.025, 0.025, 0.012, 12]} />
              <meshStandardMaterial color="#cfd4d6" metalness={0.9} roughness={0.2} />
            </mesh>
          ))}
        </group>
      ))}

      <group ref={register('battery')} position={at(parts.battery.base, parts.battery.offset, t0)}>
        <mesh>
          <boxGeometry args={[0.06, 0.18, 0.34]} />
          <meshStandardMaterial color="#3a4146" roughness={0.5} />
        </mesh>
        <mesh position={[0.031, 0, 0]}>
          <boxGeometry args={[0.002, 0.12, 0.22]} />
          <meshStandardMaterial color="#f2c230" roughness={0.6} />
        </mesh>
      </group>

      {showLabels &&
        labels.map((p) => (
          <Html
            key={p.id}
            position={at(at(p.base, p.offset, explode), p.labelAt ?? [0, 0, 0], 1)}
            center
            zIndexRange={[10, 0]}
          >
            <div className="pointer-events-none whitespace-nowrap border border-ink bg-alu-50 px-2 py-1 font-mono text-[0.68rem] leading-tight text-ink">
              <span className="font-semibold uppercase tracking-[0.06em]">{p.label}</span>
              {!compactLabels && <span className="block text-ink-3">{p.detail}</span>}
            </div>
          </Html>
        ))}
    </group>
  );
}

function placement(key: string): { base: readonly number[]; offset: readonly number[] } {
  if (key === 'headband' || key === 'battery') return parts[key];
  const side = key.endsWith('-1') ? -1 : 1;
  const name = key.replace(/-?1$/, '') as 'cushion' | 'driver' | 'housing';
  return parts[name](side);
}

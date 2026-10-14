import type { PartModule } from '@gear-store/shared';
import { useEffect, useState } from 'react';
import type { Motion } from '../bike/Drivetrain';
import { Cassette, Chain, Crankset, Derailleur } from '../bike/Drivetrain';
import { BatteryPack, Cockpit, Fork, Frame, RearEnd, Seat, Shock } from '../bike/EBike';
import { REAR_AXLE } from '../bike/layout';
import { disposeMaterials, makeMaterials } from '../bike/materials';
import { Wheel } from '../bike/Wheel';
import { Charger, FoldingLock, HexKeys, Lights } from './Accessories';

const STILL: Motion = { angle: 0, explode: 0, intro: 1 };

/** the accessories have no place on the bike: each has its own model, found by slug */
const accessories: Record<string, typeof Lights> = {
  'lights-front-rear': Lights,
  'folding-lock': FoldingLock,
  'battery-charger-4a': Charger,
  'workshop-hex-set': HexKeys,
};

/**
 * One part on its own, drawn by the same code that draws it on the E-1. Positions are the bike's, so callers
 * centre and frame it (drei's Center/Bounds). `frame` paints the frame part.
 */
export function PartModel({ module, slug, frame }: { module: PartModule; slug: string; frame: string }) {
  const [m] = useState(() => makeMaterials(frame));
  useEffect(() => () => disposeMaterials(m), [m]);
  useEffect(() => {
    m.paint.color.set(frame);
  }, [m, frame]);

  switch (module) {
    case 'FRAME':
      return (
        <group>
          <Frame m={m} motion={STILL} frame={frame} battery={false} />
          <RearEnd m={m} />
        </group>
      );
    case 'BATTERY':
      return <BatteryPack m={m} />;
    case 'SHOCK':
      return <Shock m={m} />;
    case 'FORK':
      return <Fork m={m} light={false} />;
    case 'WHEELSET':
      return (
        <group>
          <group position={[-0.39, 0, -0.1]} rotation-y={0.25}>
            <Wheel m={m} />
          </group>
          <group position={[0.39, 0, 0.1]} rotation-y={0.25}>
            <Wheel m={m}>
              <Cassette m={m} />
            </Wheel>
          </group>
        </group>
      );
    case 'DRIVETRAIN':
      return (
        <group>
          <Crankset m={m} motion={STILL} />
          <Chain m={m} motion={STILL} />
          <Derailleur m={m} motion={STILL} />
          <group position={[REAR_AXLE[0], REAR_AXLE[1], 0]}>
            <Cassette m={m} />
          </group>
        </group>
      );
    case 'COCKPIT':
      return <Cockpit m={m} />;
    case 'SEAT':
      return <Seat m={m} />;
    case 'ACCESSORY': {
      const Model = accessories[slug];
      return Model ? <Model m={m} /> : null;
    }
  }
}

import type { PartModule, Spec } from '@gear-store/shared';
import { useEffect, useMemo, useState } from 'react';
import type { Motion } from '../bike/Drivetrain';
import { Belt, BeltSprocket, Cassette, Chain, Crankset, Derailleur } from '../bike/Drivetrain';
import { BatteryPack, Cockpit, Fork, Frame, RearEnd, Seat, Shock } from '../bike/EBike';
import { REAR_AXLE } from '../bike/layout';
import { disposeMaterials, makeMaterials } from '../bike/materials';
import { Wheel } from '../bike/Wheel';
import { Charger, Fenders, FoldingLock, HexKeys, Lights, RangeExtender, RearRack } from './Accessories';
import { variantOf } from './variants';

const STILL: Motion = { angle: 0, explode: 0, intro: 1 };

/** the accessories have no place on the bike: each has its own model, found by slug */
const accessories: Record<string, typeof Lights> = {
  'lights-front-rear': Lights,
  'folding-lock': FoldingLock,
  'battery-charger-4a': Charger,
  'workshop-hex-set': HexKeys,
  'range-extender-250': RangeExtender,
  'rear-rack': RearRack,
  'fender-set': Fenders,
};

/**
 * One part on its own, drawn by the same code that draws it on the E-1. Positions are the bike's, so callers
 * centre and frame it (drei's Center/Bounds). `frame` paints the frame part.
 */
export function PartModel({
  module,
  slug,
  frame,
  plate,
  name,
}: {
  module: PartModule;
  slug: string;
  frame: string;
  /** the part's spec plate, which says which variant of its module to draw */
  plate: readonly Spec[];
  /** the part's name, which says what its plate does not (a carbon bar, a wireless derailleur, a frame size) */
  name: string;
}) {
  const [m] = useState(() => makeMaterials(frame));
  const variant = useMemo(() => variantOf([{ module, name, plate }]), [module, name, plate]);
  useEffect(() => () => disposeMaterials(m), [m]);
  useEffect(() => {
    m.paint.color.set(frame);
  }, [m, frame]);

  switch (module) {
    case 'FRAME':
      return (
        <group>
          <Frame m={m} motion={STILL} frame={frame} battery={false} size={variant.size} />
          <RearEnd m={m} />
        </group>
      );
    case 'BATTERY':
      // on its own the bigger pack shows its size: longer by the extra cells
      return <BatteryPack m={m} capacity={variant.battery} length={variant.battery > 625 ? 0.48 : 0.42} />;
    case 'SHOCK':
      return <Shock m={m} kind={variant.shock} piggyback={variant.piggyback} />;
    case 'FORK':
      return <Fork m={m} light={false} travel={variant.travel} dualCrown={variant.dualCrown} />;
    case 'WHEELSET':
      return (
        <group>
          <group position={[-0.39, 0, -0.1]} rotation-y={0.25}>
            <Wheel m={m} rim={variant.rim} accent={variant.carbonRims} tyre={variant.tyre} />
          </group>
          <group position={[0.39, 0, 0.1]} rotation-y={0.25}>
            <Wheel m={m} rim={variant.rim} accent={variant.carbonRims} tyre={variant.tyre}>
              <Cassette m={m} />
            </Wheel>
          </group>
        </group>
      );
    case 'DRIVETRAIN':
      return (
        <group>
          <Crankset m={m} motion={STILL} />
          {variant.belt ? (
            <>
              <Belt m={m} />
              <group position={[REAR_AXLE[0], REAR_AXLE[1], 0]}>
                <BeltSprocket m={m} />
              </group>
            </>
          ) : (
            <>
              <Chain m={m} motion={STILL} />
              <Derailleur m={m} motion={STILL} wireless={variant.wireless} />
              <group position={[REAR_AXLE[0], REAR_AXLE[1], 0]}>
                <Cassette m={m} />
              </group>
            </>
          )}
        </group>
      );
    case 'COCKPIT':
      // turned to face the camera: the bar across the picture and the display in view, not end-on
      return (
        <group rotation-y={Math.PI / 2}>
          <Cockpit m={m} carbon={variant.carbonBar} integrated={variant.integratedBar} />
        </group>
      );
    case 'SEAT':
      return <Seat m={m} drop={variant.drop} rigid={variant.rigidPost} />;
    case 'ACCESSORY': {
      const Model = accessories[slug];
      return Model ? <Model m={m} /> : null;
    }
  }
}

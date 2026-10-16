import { describe, expect, it } from 'vitest';
import { STARTING_VARIANT, variantOf } from './variants';

const plate = (...specs: [string, string][]) => specs.map(([label, value]) => ({ label, value }));

describe('variantOf', () => {
  it('reads each module from its plate, and from its name where the plate is silent', () => {
    expect(
      variantOf([
        { module: 'FRAME', name: 'E-1 Frame S', plate: plate(['Reach', '430 mm']) },
        { module: 'BATTERY', name: 'Battery 750 Wh', plate: plate(['Capacity', '750 Wh']) },
        {
          module: 'SHOCK',
          name: 'Coil shock',
          plate: plate(['Travel', '150 mm'], ['Spring', 'Coil, 450 lb/in']),
        },
        { module: 'FORK', name: 'Enduro fork', plate: plate(['Travel', '170 mm']) },
        { module: 'WHEELSET', name: 'Carbon wheelset', plate: plate(['Rims', 'C30 carbon, 30 mm inner']) },
        { module: 'COCKPIT', name: 'Carbon cockpit 800 mm', plate: plate(['Bar width', '800 mm']) },
        { module: 'DRIVETRAIN', name: '1 × 12 wireless drivetrain', plate: plate(['Gears', '1 × 12']) },
        { module: 'SEAT', name: 'Dropper 200 mm with saddle', plate: plate(['Drop', '200 mm']) },
      ]),
    ).toEqual({
      ...STARTING_VARIANT,
      size: 'S',
      battery: 750,
      shock: 'coil',
      travel: 170,
      rim: 'C30',
      carbonRims: true,
      carbonBar: true,
      wireless: true,
      drop: 200,
    });
  });

  it('tells the second-wave parts by their shape', () => {
    expect(
      variantOf([
        {
          module: 'SHOCK',
          name: 'Coil shock 150 mm, piggyback',
          plate: plate(['Travel', '150 mm'], ['Spring', 'Coil, 450 lb/in'], ['Reservoir', 'Piggyback']),
        },
        { module: 'FORK', name: 'Dual-crown fork 200 mm', plate: plate(['Travel', '200 mm']) },
        { module: 'WHEELSET', name: 'Plus wheelset', plate: plate(['Rims', 'AL35'], ['Tyres', '29 × 2.6″']) },
        { module: 'DRIVETRAIN', name: 'Belt drive, single speed', plate: plate(['Gears', '1 × 1']) },
        { module: 'COCKPIT', name: 'Integrated carbon bar-stem 780 mm', plate: plate(['Rise', '0 mm']) },
        { module: 'SEAT', name: 'Rigid carbon post, race saddle', plate: plate(['Drop', 'None, rigid']) },
      ]),
    ).toMatchObject({
      shock: 'coil',
      piggyback: true,
      travel: 200,
      dualCrown: true,
      rim: 'AL35',
      tyre: 2.6,
      belt: true,
      carbonBar: true,
      integratedBar: true,
      rigidPost: true,
      // a rigid post rides at the 150 mm dropper's height
      drop: 150,
    });
  });

  it('keeps the starting look for what the parts do not say', () => {
    expect(variantOf([{ module: 'SHOCK', name: 'Shock', plate: plate(['Travel', '150 mm']) }])).toEqual(
      STARTING_VARIANT,
    );
    expect(variantOf([])).toEqual(STARTING_VARIANT);
  });
});

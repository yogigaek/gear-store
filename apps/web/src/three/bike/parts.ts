import type { P3 } from './layout';

/** how part callouts are drawn: dot, leader and label; numbered dots only; or nothing */
export type TagMode = 'full' | 'dots' | 'off';

export interface PartCallout {
  /** the number on the dot, also the order of the list beside the teardown */
  n: number;
  name: string;
  price: string;
  /** the point on the part the dot sits on, bike coordinates before the part moves */
  at: P3;
  /** where the label sits relative to the dot, screen pixels */
  to: readonly [number, number];
  /** what the module is, for the detail panel */
  note: string;
}

/**
 * The E-1's modules, numbered rear to front. Example names and prices for the demo: the configurator
 * will read them from the catalogue.
 */
export const PARTS = {
  rearWheel: {
    n: 1,
    name: 'Rear wheel · 12-sp cassette',
    price: 'Rp 6.400.000',
    at: [-0.81, 0.66, 0.03],
    to: [-110, 150],
    note: '29-inch rim on 32 spokes, a 12-speed 10–52 cassette and a 203 mm rotor.',
  },
  drivetrain: {
    n: 2,
    name: '1 × 12 drivetrain',
    price: 'Rp 5.600.000',
    at: [-0.57, 0.25, 0.08],
    to: [-60, 105],
    note: '34-tooth chainring, 165 mm cranks and flat pedals with replaceable pins.',
  },
  motor: {
    n: 3,
    name: 'Mid-drive 85 Nm',
    price: 'Rp 16.500.000',
    at: [-0.12, 0.33, 0.055],
    to: [80, 120],
    note: 'Mid-drive unit, 85 Nm, in a sealed housing with cooling fins.',
  },
  battery: {
    n: 4,
    name: 'Battery 750 Wh',
    price: 'Rp 11.900.000',
    at: [0.16, 0.5, 0.035],
    to: [150, 60],
    note: '750 Wh pack that drops out of the down tube, with a five-cell charge indicator.',
  },
  shock: {
    n: 5,
    name: 'Coil shock · 150 mm',
    price: 'Rp 7.900.000',
    at: [-0.035, 0.66, 0.03],
    to: [120, -80],
    note: 'Coil-spring rear shock, 150 mm of travel.',
  },
  seat: {
    n: 6,
    name: 'Dropper post · saddle',
    price: 'Rp 4.800.000',
    at: [-0.35, 1.02, 0.03],
    to: [40, -105],
    note: 'Dropper post worked by a remote on the bar, and the saddle.',
  },
  fork: {
    n: 7,
    name: 'Fork 160 mm · cockpit',
    price: 'Rp 13.500.000',
    at: [0.49, 0.66, 0.08],
    to: [130, -110],
    note: '160 mm fork with a 4-piston brake, plus the bar, stem, display and headlight.',
  },
  frontWheel: {
    n: 8,
    name: 'Front wheel · 29 × 2.4',
    price: 'Rp 4.200.000',
    at: [0.81, 0.66, 0.03],
    to: [60, -80],
    note: '29 × 2.4 tubeless-ready tyre on 32 spokes, with a 203 mm rotor.',
  },
} satisfies Record<string, PartCallout>;

export const PART_LIST = Object.values(PARTS).sort((a, b) => a.n - b.n);

/** the opening assembly: when part `order` starts flying home, and how long its flight takes, seconds */
export const ASSEMBLY = { stagger: 0.09, flight: 1.05, seconds: 1.7 };

// The E-1's geometry, side view: x points forward, y up, z to the rider's right (the drive side). Metres,
// ground at y = 0. Numbers follow a 29-inch trail bike with a 65° head angle and a 1.22 m wheelbase.

export type P2 = readonly [number, number];
export type P3 = readonly [number, number, number];

export const WHEEL = {
  /** outer radius of a 29 × 2.4 tyre */
  r: 0.367,
  tyreTube: 0.03,
  rim: 0.305,
  spokes: 32,
} as const;

export const AXLE_Y = WHEEL.r;
export const REAR_AXLE: P2 = [-0.61, AXLE_Y];
export const FRONT_AXLE: P2 = [0.61, AXLE_Y];
export const BB: P2 = [-0.17, 0.33];

/** head tube runs along the fork axis */
export const HEAD_BOTTOM: P2 = [0.44, 0.8];
const forkDx = FRONT_AXLE[0] - HEAD_BOTTOM[0];
const forkDy = FRONT_AXLE[1] - HEAD_BOTTOM[1];
export const FORK_LENGTH = Math.hypot(forkDx, forkDy);
/** turns local -y onto the fork axis */
export const FORK_ANGLE = Math.atan2(forkDx, -forkDy);
const HEAD_LENGTH = 0.15;
export const HEAD_TOP: P2 = [
  HEAD_BOTTOM[0] - (forkDx / FORK_LENGTH) * HEAD_LENGTH,
  HEAD_BOTTOM[1] - (forkDy / FORK_LENGTH) * HEAD_LENGTH,
];

export const SEAT_TOP: P2 = [-0.3, 0.79];
/** rear suspension: main pivot above the bottom bracket, a rocker on the seat tube, the shock to the down tube */
export const MAIN_PIVOT: P2 = [-0.2, 0.42];
export const ROCKER_PIVOT: P2 = [-0.274, 0.7];
export const ROCKER_REAR: P2 = [-0.35, 0.69];
export const ROCKER_FRONT: P2 = [-0.17, 0.72];
export const SHOCK_MOUNT: P2 = [0.1, 0.6];

export const DRIVE = {
  /** chainline: the plane the chain runs in */
  z: 0.052,
  ring: { r: 0.069, teeth: 34 },
  /** the cog the chain sits on, out of a 10–52 cassette: the 23-tooth, seventh from the largest */
  cog: { r: (23 * 0.0127) / (2 * Math.PI), index: 6 },
  crank: 0.165,
} as const;

/** frame colours on offer; the first is the launch colour, the brand's signal yellow */
export const E1_COLOURS = [
  { key: 'signal', name: 'Signal yellow', hex: '#f2c230' },
  { key: 'graphite', name: 'Graphite', hex: '#3a4045' },
  { key: 'glacier', name: 'Glacier white', hex: '#e6e9ea' },
  { key: 'ember', name: 'Ember orange', hex: '#d4541f' },
  { key: 'moss', name: 'Moss green', hex: '#4c6a3f' },
] as const;

export const E1_FRAME = E1_COLOURS[0].hex;

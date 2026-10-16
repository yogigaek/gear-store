import type { PartModule } from '@gear-store/shared';
import type { P3 } from './layout';

/** how part callouts are drawn: dot, leader and label; numbered dots only; or nothing */
export type TagMode = 'full' | 'dots' | 'off';

export interface PartCallout {
  /** the number on the dot, also the order of the list beside the teardown */
  n: number;
  /** the catalogue module this part of the bike is sold as */
  module: PartModule;
  /** the part on the bike as drawn: the starting build's choice, from the catalogue */
  name: string;
  /** its price, from the catalogue; empty until the catalogue answers */
  price: string;
  /** its product page; empty until the catalogue answers */
  slug: string;
  /** the point on the part the dot sits on, bike coordinates before the part moves */
  at: P3;
  /** where the label sits relative to the dot, screen pixels */
  to: readonly [number, number];
  /** what the module is, for the detail panel; the catalogue's description of the part type */
  note: string;
}

/** what the catalogue says about a module: the starting build's part, its price and the part type */
export type ModuleLabels = Partial<Record<PartModule, Pick<PartCallout, 'name' | 'price' | 'note' | 'slug'>>>;

/**
 * The E-1's eight modules as the catalogue sells them, numbered rear to front. The names stand in until the
 * catalogue answers; the price and the description only ever come from it.
 */
export const PARTS = {
  wheelset: { n: 1, module: 'WHEELSET', name: 'Wheelset', at: [-0.81, 0.66, 0.03], to: [-110, 150] },
  drivetrain: { n: 2, module: 'DRIVETRAIN', name: 'Drivetrain', at: [-0.57, 0.25, 0.08], to: [-60, 105] },
  frame: { n: 3, module: 'FRAME', name: 'Frame and motor', at: [0.15, 0.89, 0.03], to: [-30, -150] },
  battery: { n: 4, module: 'BATTERY', name: 'Battery', at: [0.16, 0.5, 0.035], to: [150, 60] },
  shock: { n: 5, module: 'SHOCK', name: 'Rear shock', at: [-0.035, 0.66, 0.03], to: [120, -80] },
  seat: { n: 6, module: 'SEAT', name: 'Seatpost', at: [-0.35, 1.02, 0.03], to: [40, -105] },
  fork: { n: 7, module: 'FORK', name: 'Fork', at: [0.49, 0.66, 0.08], to: [130, 90] },
  cockpit: { n: 8, module: 'COCKPIT', name: 'Cockpit', at: [0.42, 0.99, 0.28], to: [90, -110] },
} satisfies Record<string, Omit<PartCallout, 'price' | 'note' | 'slug'>>;

/** a callout with the catalogue's words in it, where the catalogue has them */
export function labelled(
  part: Omit<PartCallout, 'price' | 'note' | 'slug'>,
  labels: ModuleLabels,
): PartCallout {
  return { price: '', note: '', slug: '', ...part, ...labels[part.module] };
}

export const PART_LIST = Object.values(PARTS).sort((a, b) => a.n - b.n);

/** the opening assembly: when part `order` starts flying home, and how long its flight takes, seconds */
export const ASSEMBLY = { stagger: 0.09, flight: 1.05, seconds: 1.7 };

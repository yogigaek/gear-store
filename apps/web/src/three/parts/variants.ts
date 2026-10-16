import type { PartModule, Spec } from '@gear-store/shared';

/** what tells two parts of one module apart when drawn */
export interface BikeVariant {
  /** frame size, printed in the down tube decal */
  size: string;
  /** battery capacity, Wh, printed on the pack */
  battery: number;
  shock: 'coil' | 'air';
  /** a coil shock with a piggyback reservoir beside the body */
  piggyback: boolean;
  /** printed on the fork lowers, mm */
  travel: number;
  /** a dual-crown fork: the stanchions run up past the head tube to a second crown */
  dualCrown: boolean;
  /** printed on the rims */
  rim: string;
  /** carbon rims carry their lettering in signal yellow */
  carbonRims: boolean;
  /** tyre width, inches: a 2.6 tyre is drawn fatter than the 2.4 */
  tyre: number;
  /** a carbon bar is gloss black instead of anodised */
  carbonBar: boolean;
  /** a one-piece carbon bar and stem, with no rise */
  integratedBar: boolean;
  /** no gear housing from the bar to the derailleur */
  wireless: boolean;
  /** a belt and a single sprocket instead of chain, cassette and derailleur */
  belt: boolean;
  /** dropper travel, mm: a longer post stands the saddle higher */
  drop: number;
  /** a fixed carbon post with a slim race saddle */
  rigidPost: boolean;
}

/** the starting E-1's parts */
export const STARTING_VARIANT: BikeVariant = {
  size: 'M',
  battery: 625,
  shock: 'air',
  piggyback: false,
  travel: 160,
  dualCrown: false,
  rim: 'AL30',
  carbonRims: false,
  tyre: 2.4,
  carbonBar: false,
  integratedBar: false,
  wireless: false,
  belt: false,
  drop: 150,
  rigidPost: false,
};

const value = (plate: readonly Spec[], label: string) => plate.find((s) => s.label === label)?.value;
const leadingNumber = (text: string | undefined) => Number(text?.match(/^\d+/)?.[0]) || undefined;

/**
 * Read from what the catalogue says about each part (its spec plate, and its name where the plate is silent),
 * not from its slug, so a part added in the admin is drawn by what it is. Whatever the parts do not say keeps
 * the starting part's look.
 */
export function variantOf(
  parts: readonly { module: PartModule; name: string; plate: readonly Spec[] }[],
): BikeVariant {
  const out = { ...STARTING_VARIANT };
  for (const { module, name, plate } of parts) {
    switch (module) {
      case 'FRAME':
        out.size = name.match(/\bFrame ([A-Z]{1,3})\b/)?.[1] ?? out.size;
        break;
      case 'BATTERY':
        out.battery = leadingNumber(value(plate, 'Capacity')) ?? out.battery;
        break;
      case 'SHOCK': {
        const spring = value(plate, 'Spring');
        if (spring) out.shock = /^air/i.test(spring) ? 'air' : 'coil';
        out.piggyback = /piggyback/i.test(value(plate, 'Reservoir') ?? name);
        break;
      }
      case 'FORK':
        out.travel = leadingNumber(value(plate, 'Travel')) ?? out.travel;
        out.dualCrown = /dual-crown/i.test(name);
        break;
      case 'WHEELSET': {
        const rims = value(plate, 'Rims');
        out.rim = rims?.match(/^[A-Z0-9]+/)?.[0] ?? out.rim;
        out.carbonRims = /carbon/i.test(rims ?? '');
        out.tyre = Number(value(plate, 'Tyres')?.match(/× ?(\d+(?:\.\d+)?)/)?.[1]) || out.tyre;
        break;
      }
      case 'COCKPIT':
        out.carbonBar = /carbon/i.test(name);
        out.integratedBar = /integrated/i.test(name);
        break;
      case 'DRIVETRAIN':
        out.wireless = /wireless/i.test(name);
        out.belt = /belt/i.test(name);
        break;
      case 'SEAT':
        out.rigidPost = /rigid/i.test(name);
        // a rigid post sits at the ride height of the 150 mm dropper; only a longer dropper stands higher
        out.drop = out.rigidPost ? 150 : (leadingNumber(value(plate, 'Drop')) ?? out.drop);
        break;
      case 'ACCESSORY':
        break;
    }
  }
  return out;
}

import type { PartModule, Spec } from '@gear-store/shared';

/** what tells two parts of one module apart when drawn */
export interface BikeVariant {
  /** frame size, printed in the down tube decal */
  size: string;
  /** battery capacity, Wh, printed on the pack */
  battery: number;
  shock: 'coil' | 'air';
  /** printed on the fork lowers, mm */
  travel: number;
  /** printed on the rims */
  rim: string;
  /** carbon rims carry their lettering in signal yellow */
  carbonRims: boolean;
  /** a carbon bar is gloss black instead of anodised */
  carbonBar: boolean;
  /** no gear housing from the bar to the derailleur */
  wireless: boolean;
  /** dropper travel, mm: a longer post stands the saddle higher */
  drop: number;
}

/** the starting E-1's parts */
export const STARTING_VARIANT: BikeVariant = {
  size: 'M',
  battery: 625,
  shock: 'air',
  travel: 160,
  rim: 'AL30',
  carbonRims: false,
  carbonBar: false,
  wireless: false,
  drop: 150,
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
        break;
      }
      case 'FORK':
        out.travel = leadingNumber(value(plate, 'Travel')) ?? out.travel;
        break;
      case 'WHEELSET': {
        const rims = value(plate, 'Rims');
        out.rim = rims?.match(/^[A-Z0-9]+/)?.[0] ?? out.rim;
        out.carbonRims = /carbon/i.test(rims ?? '');
        break;
      }
      case 'COCKPIT':
        out.carbonBar = /carbon/i.test(name);
        break;
      case 'DRIVETRAIN':
        out.wireless = /wireless/i.test(name);
        break;
      case 'SEAT':
        out.drop = leadingNumber(value(plate, 'Drop')) ?? out.drop;
        break;
      case 'ACCESSORY':
        break;
    }
  }
  return out;
}

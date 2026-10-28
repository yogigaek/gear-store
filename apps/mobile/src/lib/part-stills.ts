import type { ImageSourcePropType } from 'react-native';

// Studio stills of each part, shared with the web app (apps/web/src/assets/parts) rather than copied: `<slug>` is
// the default, `<slug>--<colour>` a finish. Metro only bundles files named in a literal require(), so the list is
// spelled out; a part missing here shows its module name instead, as on the web.
const stills: Record<string, ImageSourcePropType> = {
  'battery-charger-4a': require('../../../web/src/assets/parts/battery-charger-4a.jpg'),
  'e1-battery-625': require('../../../web/src/assets/parts/e1-battery-625.jpg'),
  'e1-battery-750': require('../../../web/src/assets/parts/e1-battery-750.jpg'),
  'e1-cockpit-alloy': require('../../../web/src/assets/parts/e1-cockpit-alloy.jpg'),
  'e1-cockpit-carbon': require('../../../web/src/assets/parts/e1-cockpit-carbon.jpg'),
  'e1-cockpit-integrated': require('../../../web/src/assets/parts/e1-cockpit-integrated.jpg'),
  'e1-drivetrain-12': require('../../../web/src/assets/parts/e1-drivetrain-12.jpg'),
  'e1-drivetrain-12-wireless': require('../../../web/src/assets/parts/e1-drivetrain-12-wireless.jpg'),
  'e1-drivetrain-belt': require('../../../web/src/assets/parts/e1-drivetrain-belt.jpg'),
  'e1-fork-160': require('../../../web/src/assets/parts/e1-fork-160.jpg'),
  'e1-fork-170': require('../../../web/src/assets/parts/e1-fork-170.jpg'),
  'e1-fork-dual-200': require('../../../web/src/assets/parts/e1-fork-dual-200.jpg'),
  'e1-frame-l': require('../../../web/src/assets/parts/e1-frame-l.jpg'),
  'e1-frame-l--ember': require('../../../web/src/assets/parts/e1-frame-l--ember.jpg'),
  'e1-frame-l--glacier': require('../../../web/src/assets/parts/e1-frame-l--glacier.jpg'),
  'e1-frame-l--graphite': require('../../../web/src/assets/parts/e1-frame-l--graphite.jpg'),
  'e1-frame-l--moss': require('../../../web/src/assets/parts/e1-frame-l--moss.jpg'),
  'e1-frame-l--signal': require('../../../web/src/assets/parts/e1-frame-l--signal.jpg'),
  'e1-frame-m': require('../../../web/src/assets/parts/e1-frame-m.jpg'),
  'e1-frame-m--ember': require('../../../web/src/assets/parts/e1-frame-m--ember.jpg'),
  'e1-frame-m--glacier': require('../../../web/src/assets/parts/e1-frame-m--glacier.jpg'),
  'e1-frame-m--graphite': require('../../../web/src/assets/parts/e1-frame-m--graphite.jpg'),
  'e1-frame-m--moss': require('../../../web/src/assets/parts/e1-frame-m--moss.jpg'),
  'e1-frame-m--signal': require('../../../web/src/assets/parts/e1-frame-m--signal.jpg'),
  'e1-frame-s': require('../../../web/src/assets/parts/e1-frame-s.jpg'),
  'e1-frame-s--ember': require('../../../web/src/assets/parts/e1-frame-s--ember.jpg'),
  'e1-frame-s--glacier': require('../../../web/src/assets/parts/e1-frame-s--glacier.jpg'),
  'e1-frame-s--graphite': require('../../../web/src/assets/parts/e1-frame-s--graphite.jpg'),
  'e1-frame-s--moss': require('../../../web/src/assets/parts/e1-frame-s--moss.jpg'),
  'e1-frame-s--signal': require('../../../web/src/assets/parts/e1-frame-s--signal.jpg'),
  'e1-seat-150': require('../../../web/src/assets/parts/e1-seat-150.jpg'),
  'e1-seat-200': require('../../../web/src/assets/parts/e1-seat-200.jpg'),
  'e1-seat-rigid': require('../../../web/src/assets/parts/e1-seat-rigid.jpg'),
  'e1-shock-air': require('../../../web/src/assets/parts/e1-shock-air.jpg'),
  'e1-shock-coil': require('../../../web/src/assets/parts/e1-shock-coil.jpg'),
  'e1-shock-coil-piggyback': require('../../../web/src/assets/parts/e1-shock-coil-piggyback.jpg'),
  'e1-wheelset-alloy': require('../../../web/src/assets/parts/e1-wheelset-alloy.jpg'),
  'e1-wheelset-carbon': require('../../../web/src/assets/parts/e1-wheelset-carbon.jpg'),
  'e1-wheelset-plus': require('../../../web/src/assets/parts/e1-wheelset-plus.jpg'),
  'fender-set': require('../../../web/src/assets/parts/fender-set.jpg'),
  'folding-lock': require('../../../web/src/assets/parts/folding-lock.jpg'),
  'lights-front-rear': require('../../../web/src/assets/parts/lights-front-rear.jpg'),
  'range-extender-250': require('../../../web/src/assets/parts/range-extender-250.jpg'),
  'rear-rack': require('../../../web/src/assets/parts/rear-rack.jpg'),
  'workshop-hex-set': require('../../../web/src/assets/parts/workshop-hex-set.jpg'),
};

/** the still for a finish when one was rendered, else the part's default */
export function partStill(slug: string, colorKey?: string): ImageSourcePropType | undefined {
  return (colorKey && stills[`${slug}--${colorKey}`]) || stills[slug];
}

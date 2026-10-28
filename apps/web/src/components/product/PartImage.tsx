import type { PartModule } from '@gear-store/shared';
import { Label } from '../ui/Label';

// Stills of every part, rendered from its own 3D model by scripts/render-parts.mjs and named by slug.
const stills = import.meta.glob<string>('../../assets/parts/*.jpg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const bySlug = new Map(
  Object.entries(stills).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.jpg'.length), url]),
);

const moduleNames: Record<PartModule, string> = {
  FRAME: 'Frame',
  BATTERY: 'Battery',
  SHOCK: 'Shock',
  FORK: 'Fork',
  WHEELSET: 'Wheelset',
  DRIVETRAIN: 'Drivetrain',
  COCKPIT: 'Cockpit',
  SEAT: 'Seatpost',
  ACCESSORY: 'Accessory',
};

/** A part's studio still; while a part has none yet, its module name on engineering paper. */
export function PartImage({
  slug,
  colorKey,
  module,
  className = '',
  eager = false,
}: {
  slug: string;
  /** the finish chosen: its own still when one was rendered, else the part's default */
  colorKey?: string;
  /** names the part on its placeholder while it has no still */
  module?: PartModule;
  className?: string;
  eager?: boolean;
}) {
  const src = (colorKey && bySlug.get(`${slug}--${colorKey}`)) || bySlug.get(slug);
  if (!src) {
    return (
      <div className={`bg-grid grid place-items-center ${className}`}>
        {module && <Label>{moduleNames[module]}</Label>}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      // a hair larger than its frame (which clips it): the stills carry a light 2 px column on their right edge
      className={`scale-[1.01] bg-stage object-cover ${className}`}
    />
  );
}

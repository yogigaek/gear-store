import type { CategoryId } from '../../data/catalog';

// Line drawings in the style of a technical sheet: one stroke weight, dimension ticks in signal yellow.
// Stand-ins for product renders until Phase 3 brings real images.
const drawings: Record<CategoryId, React.ReactNode> = {
  audio: (
    <>
      <path d="M26 62V50a34 34 0 0 1 68 0v12" />
      <rect x="16" y="58" width="20" height="32" rx="5" />
      <rect x="84" y="58" width="20" height="32" rx="5" />
      <path d="M8 74h8M104 74h8" className="stroke-signal" />
    </>
  ),
  keyboards: (
    <>
      <rect x="14" y="44" width="92" height="36" rx="4" />
      <path d="M22 54h8M34 54h8M46 54h8M58 54h8M70 54h8M82 54h14M22 64h14M40 64h8M52 64h8M64 64h8M76 64h20M22 72h56M82 72h14" />
      <path d="M14 88v6M106 88v6M14 91h92" className="stroke-signal" />
    </>
  ),
  power: (
    <>
      <rect x="38" y="22" width="44" height="76" rx="8" />
      <path d="M52 36h16M54 70l6-12 6 12" />
      <path d="M90 22v76M87 22h6M87 98h6" className="stroke-signal" />
    </>
  ),
  hubs: (
    <>
      <rect x="20" y="48" width="70" height="26" rx="6" />
      <path d="M90 61h18M30 58v6M38 58v6M48 57h8v8h-8zM62 58h10v6H62z" />
      <path d="M20 82v6M90 82v6M20 85h70" className="stroke-signal" />
    </>
  ),
};

export function ProductArt({ category, className = '' }: { category: CategoryId; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`text-ink ${className}`}
      aria-hidden="true"
    >
      {drawings[category]}
    </svg>
  );
}

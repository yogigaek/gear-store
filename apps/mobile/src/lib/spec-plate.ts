import type { Spec } from '@gear-store/shared';
import { keepUnits } from './format';

/** the plate's type, in points: labels 11 with 0.6 tracking, values 12, 8 of padding each side of a column */
export const PLATE_TYPE = { label: 11, tracking: 0.6, value: 12, padding: 8 } as const;

// the plate is set in a monospace face, so a word's width is its length times one advance: Menlo's is 0.602 em,
// Android's monospace 0.6 em
const ADVANCE = 0.61;

/** the longest piece of `text` a line cannot break inside: lines break at spaces and after hyphens, not at NBSP */
export function longestRun(text: string): number {
  return Math.max(
    0,
    ...text
      .replace(/-/g, '- ')
      .split(' ')
      .map((word) => word.length),
  );
}

/**
 * Whether every word on the plate fits its column when the specs stand side by side in a plate `width` points wide
 * (border included) at the phone's `fontScale`. When one does not, the plate lists them as rows instead, so a word
 * such as "polypropylene" never breaks in the middle.
 */
export function plateFitsColumns(specs: readonly Spec[], width: number, fontScale: number): boolean {
  if (specs.length === 0) return true;
  const column = (width - 2 - (specs.length - 1)) / specs.length - 2 * PLATE_TYPE.padding;
  const label =
    Math.max(...specs.map((s) => longestRun(s.label))) * (PLATE_TYPE.label * ADVANCE + PLATE_TYPE.tracking);
  const value = Math.max(...specs.map((s) => longestRun(keepUnits(s.value)))) * PLATE_TYPE.value * ADVANCE;
  return Math.max(label, value) * fontScale <= column;
}

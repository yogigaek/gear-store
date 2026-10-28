/** the gap under the last thing on a screen */
export const BOTTOM_GAP = 16;

/**
 * Padding under a screen's scrolling content. On its own the content must clear the home indicator or gesture
 * bar (`insetBottom`); above a bottom action bar, the bar takes that inset and the content needs only the gap.
 */
export function bottomSpace(insetBottom: number, aboveBar = false): number {
  return aboveBar ? BOTTOM_GAP : BOTTOM_GAP + Math.max(0, insetBottom);
}

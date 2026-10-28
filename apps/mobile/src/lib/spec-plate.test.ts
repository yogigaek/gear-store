import { describe, expect, it } from 'vitest';
import { longestRun, plateFitsColumns } from './spec-plate';

const spec = (label: string, value: string) => ({ label, value });
const frame = [spec('Rider height', '168–182 cm'), spec('Reach', '455 mm'), spec('Motor', '85 Nm mid-drive')];
const shock = [
  spec('Travel', '150 mm'),
  spec('Spring', 'Coil, 450 lb/in'),
  spec('Adjustments', 'Rebound, low-speed compression'),
];
const fender = [
  spec('Fits', 'Up to 29 × 2.6″'),
  spec('Mount', 'Clip-on, no tools'),
  spec('Material', 'Recycled polypropylene'),
];
const cockpit = [spec('Bar width', '780 mm'), spec('Rise', '25 mm'), spec('Stem', '45 mm')];

// a product card's plate: the screen less the list's padding (32), the card's border (2) and the plate's margins (24)
const cardPlate = (screen: number) => screen - 58;
// the product page's plate: the screen less the section's padding
const pagePlate = (screen: number) => screen - 32;

describe('longestRun', () => {
  it('breaks at spaces and after hyphens, never inside a number and its unit', () => {
    expect(longestRun('Recycled polypropylene')).toBe('polypropylene'.length);
    expect(longestRun('Carbon-reinforced')).toBe('reinforced'.length);
    expect(longestRun('168–182\u00a0cm')).toBe('168–182 cm'.length);
    expect(longestRun('168–182 cm')).toBe('168–182'.length);
    expect(longestRun('')).toBe(0);
  });
});

describe('plateFitsColumns', () => {
  it('keeps short specs side by side on the narrowest phones', () => {
    expect(plateFitsColumns(cockpit, cardPlate(320), 1)).toBe(true);
    expect(plateFitsColumns(frame, pagePlate(390), 1)).toBe(true);
  });

  it('lists a plate as rows where a word would break in the middle', () => {
    for (const screen of [320, 360, 390]) {
      expect(plateFitsColumns(fender, cardPlate(screen), 1)).toBe(false);
    }
    expect(plateFitsColumns(fender, pagePlate(360), 1)).toBe(false);
    // "polypropylene" (13 × 0.61 × 12 ≈ 95 points) fits the product page's 102-point columns at 390
    expect(plateFitsColumns(fender, pagePlate(390), 1)).toBe(true);
    expect(plateFitsColumns(shock, cardPlate(320), 1)).toBe(false);
    expect(plateFitsColumns(frame, cardPlate(320), 1)).toBe(false);
  });

  it('counts the text size the phone is set to', () => {
    expect(plateFitsColumns(frame, pagePlate(390), 1)).toBe(true);
    expect(plateFitsColumns(frame, pagePlate(390), 1.5)).toBe(false);
  });

  it('has nothing to fit on an empty plate', () => {
    expect(plateFitsColumns([], 100, 2)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { posterFrame } from './poster';

describe('posterFrame', () => {
  it.each([320, 360, 390, 430])('fills a %d-wide frame and keeps the whole bike in it', (width) => {
    const { height, image } = posterFrame(width);
    expect(height).toBe(width * 0.75);
    expect(image.left).toBeLessThanOrEqual(0);
    expect(image.top).toBeLessThanOrEqual(0);
    expect(image.left + image.width).toBeGreaterThanOrEqual(width);
    expect(image.top + image.height).toBeGreaterThanOrEqual(height);
    const scale = image.width / 1440;
    const at = (x: number, y: number) => ({ x: image.left + x * scale, y: image.top + y * scale });
    const [a, b] = [at(603, 243), at(1355, 690)];
    expect(a.x).toBeGreaterThan(0);
    expect(a.y).toBeGreaterThan(0);
    expect(b.x).toBeLessThan(width);
    expect(b.y).toBeLessThan(height);
    // and near the middle: within 5% of the width
    expect(Math.abs((a.x + b.x) / 2 - width / 2)).toBeLessThan(width * 0.05);
  });
});

describe('posterFrame edges', () => {
  it('keeps the image covering a very narrow and a very wide frame', () => {
    for (const width of [1, 1440, 4000]) {
      const { height, image } = posterFrame(width);
      expect(image.left).toBeLessThanOrEqual(0);
      expect(image.top).toBeLessThanOrEqual(0);
      expect(image.left + image.width).toBeGreaterThanOrEqual(width - 1e-9);
      expect(image.top + image.height).toBeGreaterThanOrEqual(height - 1e-9);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { bottomSpace } from './bottom-space';

describe('bottomSpace', () => {
  it('clears the home indicator under content that ends the screen', () => {
    expect(bottomSpace(34)).toBe(50);
    expect(bottomSpace(0)).toBe(16);
  });

  it('leaves the inset to a bottom bar under the content', () => {
    expect(bottomSpace(34, true)).toBe(16);
  });
});

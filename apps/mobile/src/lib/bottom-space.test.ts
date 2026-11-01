import { describe, expect, it, vi } from 'vitest';
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

describe('bottomSpace edges', () => {
  it('never subtracts a negative inset', () => {
    expect(bottomSpace(-10)).toBe(16);
    expect(bottomSpace(-10, true)).toBe(16);
  });
});

vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));

describe('useBottomSpace', () => {
  it('reads this phone’s inset', async () => {
    const { useBottomSpace: space } = await import('./use-bottom-space');
    expect(space()).toBe(50);
    expect(space(true)).toBe(16);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { usePageTone as pageTone, useTurnedOver as turnedOver } from './page-tone';

const router = vi.hoisted(() => ({ handles: [] as unknown[] }));
vi.mock('react-router', () => ({ useMatches: () => router.handles.map((handle) => ({ handle })) }));

const tones = (...handles: unknown[]) => {
  router.handles = handles;
  return { tone: pageTone(), turnedOver: turnedOver() };
};

describe('page tone', () => {
  it('draws a store page dark, its light content turned over', () => {
    expect(tones(undefined, {})).toEqual({ tone: 'dark', turnedOver: true });
    expect(tones()).toEqual({ tone: 'dark', turnedOver: true });
  });

  it('draws a stage page dark by hand, without turning it over', () => {
    expect(tones(undefined, { tone: 'stage' })).toEqual({ tone: 'dark', turnedOver: false });
  });

  it('draws a light page light, whichever route asks for it', () => {
    expect(tones({ tone: 'light' }, { tone: 'stage' })).toEqual({ tone: 'light', turnedOver: false });
  });
});

import { Platform } from 'react-native';

/** The web app's dark-surface tokens (apps/web/src/index.css, `.surface-dark`): the store is dark. */
export const colors = {
  stage: '#0b0d0e',
  alu: '#15181a',
  alu50: '#1d2124',
  bench: '#2e3438',
  benchStrong: '#4a5359',
  ink: '#f5f6f6',
  ink2: '#c3c8ca',
  ink3: '#9aa2a6',
  signal: '#f2c230',
  danger: '#ff8f80',
  ok: '#7fd49f',
  /** text on signal yellow */
  onSignal: '#15181a',
  /** the web's rule on dark surfaces (.surface-dark .border-ink): a pure-ink line would glare */
  rule: '#545d63',
  /** text field outlines, a step brighter than rule so an empty field reads as one */
  field: '#646d73',
  /** the studio stills' own ground, so a still and its empty frame look the same */
  still: '#1a1e20',
} as const;

export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

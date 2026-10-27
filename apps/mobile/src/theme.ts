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
} as const;

export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

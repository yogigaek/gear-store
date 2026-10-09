import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Loads the nearest `.env`, looking from the working directory up to the repository root (npm runs workspace
 * scripts inside apps/api). Variables already in the environment win, so CI and hosting settings are never
 * overridden by a stray file.
 */
export function loadDotEnv(start = process.cwd()): void {
  let dir = start;
  for (let level = 0; level < 4; level += 1) {
    const file = join(dir, '.env');
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');

function sources(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('<Link asChild>', () => {
  // expo-router's Slot throws at render when the child's style is an array, which no type check catches
  it('never hands its child an array of styles', () => {
    const offenders = [...sources('app'), ...sources('src')].filter((file) =>
      /asChild>\s*<\w+[^>]*?\sstyle=\{\[/.test(readFileSync(join(root, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});

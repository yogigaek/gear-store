/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Read as text: Metro bundles the images through require(), which Node cannot load.
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, 'part-stills.ts'), 'utf8');
const entries = [...source.matchAll(/'([^']+)': require\('([^']+)'\)/g)].map(([, key, path]) => ({
  key: key!,
  file: resolve(here, path!),
}));
const keys = new Set(entries.map((e) => e.key));

const catalogue = readFileSync(resolve(here, '../../../api/src/seed/catalog.data.ts'), 'utf8');
const products = catalogue.slice(catalogue.indexOf('export const seedProducts'));
const frameSizes = [...products.matchAll(/frame\('([SML])'/g)].map(
  ([, size]) => `e1-frame-${size!.toLowerCase()}`,
);
const frameColours = [
  ...catalogue.slice(catalogue.indexOf('const frameColors')).matchAll(/\['([a-z]+)', '[^']+', '#/g),
].map(([, key]) => key!);
const seededParts = [
  ...[...products.matchAll(/^\s+slug: '([a-z0-9-]+)',$/gm)].map(([, slug]) => slug!),
  ...frameSizes,
];

describe('part stills', () => {
  it('lists files that exist', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const { file } of entries) expect(existsSync(file), file).toBe(true);
  });

  it('has a still for every part the seed puts on sale, and for every frame finish', () => {
    expect(seededParts.length).toBeGreaterThan(20);
    expect(frameSizes).toHaveLength(3);
    expect(frameColours.length).toBeGreaterThan(0);
    for (const slug of seededParts) expect(keys.has(slug), slug).toBe(true);
    for (const frame of frameSizes) {
      for (const colour of frameColours)
        expect(keys.has(`${frame}--${colour}`), `${frame}--${colour}`).toBe(true);
    }
  });
});

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

/** the end of the JSX opening tag starting at `from`: the first `>` outside braces and quotes */
function tagEnd(src: string, from: number): number {
  let depth = 0;
  let quote = '';
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return i;
  }
  return -1;
}

/** the expression inside `style={…}` of an opening tag, or null */
function styleOf(tag: string): string | null {
  const at = tag.search(/\sstyle=\{/);
  if (at < 0) return null;
  const start = tag.indexOf('{', at) + 1;
  let depth = 1;
  for (let i = start; i < tag.length; i += 1) {
    if (tag[i] === '{') depth += 1;
    else if (tag[i] === '}' && (depth -= 1) === 0) return tag.slice(start, i).trim();
  }
  return null;
}

/** the style of every element a <Link asChild> wraps, by file */
function linkChildStyles(): { file: string; style: string }[] {
  return [...sources('app'), ...sources('src')].flatMap((file) => {
    const src = readFileSync(join(root, file), 'utf8');
    const found: { file: string; style: string }[] = [];
    for (const match of src.matchAll(/<Link\b/g)) {
      const linkEnd = tagEnd(src, match.index);
      if (!/\basChild\b/.test(src.slice(match.index, linkEnd))) continue;
      const childStart = src.indexOf('<', linkEnd);
      const style = styleOf(src.slice(childStart, tagEnd(src, childStart)));
      if (style !== null) found.push({ file, style });
    }
    return found;
  });
}

describe('<Link asChild>', () => {
  // its Slot merges the child's style as one object: an array or a function is lost in a release build, and an
  // array throws in development, which no type check catches
  it('hands its child one style object', () => {
    const plain = /^(styles\.\w+|StyleSheet\.flatten\([\s\S]*\))$/;
    expect(linkChildStyles().filter(({ style }) => !plain.test(style))).toEqual([]);
  });

  it('finds the children it checks', () => {
    expect(linkChildStyles().length).toBeGreaterThan(5);
  });
});

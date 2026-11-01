import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDotEnv } from './dotenv.js';

describe('loadDotEnv', () => {
  const name = `RAKIT_DOTENV_TEST_${process.pid}`;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rakit-dotenv-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env[name];
  });

  it('loads the nearest .env from a parent directory', () => {
    writeFileSync(join(dir, '.env'), `${name}=from-file\n`);
    const nested = join(dir, 'apps', 'api');
    mkdirSync(nested, { recursive: true });
    loadDotEnv(nested);
    expect(process.env[name]).toBe('from-file');
  });

  it('keeps a variable already set over the file', () => {
    writeFileSync(join(dir, '.env'), `${name}=from-file\n`);
    process.env[name] = 'from-host';
    loadDotEnv(dir);
    expect(process.env[name]).toBe('from-host');
  });

  it('stops at the filesystem root when no .env exists on the way', () => {
    expect(() => loadDotEnv('/')).not.toThrow();
    expect(process.env[name]).toBeUndefined();
  });

  it('looks at most four levels up', () => {
    writeFileSync(join(dir, '.env'), `${name}=too-far\n`);
    const deep = join(dir, 'a', 'b', 'c', 'd');
    mkdirSync(deep, { recursive: true });
    loadDotEnv(deep);
    expect(process.env[name]).toBeUndefined();
  });
});

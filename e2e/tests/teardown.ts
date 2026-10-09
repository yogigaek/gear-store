import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Puts the database back: test accounts (@test.example) go, and the stock their orders held returns. */
export default function teardown(): void {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  execSync('npm run test-data:clean -w @gear-store/api', { cwd: root, stdio: 'inherit' });
}

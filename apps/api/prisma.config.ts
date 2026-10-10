import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

// DATABASE_URL comes from the repository's .env locally and from the host's settings in production; a variable
// that is already set always wins over the file.
const dotEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(dotEnv)) process.loadEnvFile(dotEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // migrations need a direct connection; Neon's pooled URL (used by the app) goes through PgBouncer
    url: process.env['DIRECT_DATABASE_URL'] ?? process.env['DATABASE_URL'],
  },
});

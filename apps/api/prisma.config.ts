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
    url: process.env['DATABASE_URL'],
  },
});

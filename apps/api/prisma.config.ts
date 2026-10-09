import { defineConfig } from 'prisma/config';

// DATABASE_URL comes from the environment (direnv's .envrc locally, the host's settings in production);
// nothing reads a .env file.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});

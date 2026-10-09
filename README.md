# gear-store

A full-stack e-commerce platform for gadgets and tech accessories: a React storefront with interactive 3D
product views, a NestJS API on PostgreSQL, Midtrans (sandbox) payments, and an admin dashboard.

A rebuild of my 2022 bootcamp capstone (MERN), redone with a modern stack. **Work in progress.**

## Stack

| Part                       | Tools                           |
| -------------------------- | ------------------------------- |
| Web (`apps/web`)           | React, Vite, TypeScript         |
| API (`apps/api`)           | NestJS, Prisma, PostgreSQL, zod |
| Shared (`packages/shared`) | zod schemas used by both sides  |

## Run locally

Requirements: Node.js 22+, npm 11+, Docker, and [direnv](https://direnv.net).

```sh
cp .envrc.example .envrc && direnv allow
docker compose up -d --wait       # PostgreSQL on :5436, Mailpit on :8025
npm ci
npm run db:deploy -w @gear-store/api
npm run dev:api                   # http://localhost:3000/api/health
npm run dev:web                   # http://localhost:5173
```

## Checks

```sh
npm run typecheck
npm run lint
npm test                                   # unit tests
npm run test:e2e -w @gear-store/api        # needs the database from docker compose
npm run build
```

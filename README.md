# gear-store

A full-stack e-commerce platform for gadgets and tech accessories: a React storefront with interactive 3D
product views, a NestJS API on PostgreSQL, Midtrans (sandbox) payments, and an admin dashboard.

A rebuild of my 2022 bootcamp capstone (MERN), redone with a modern stack. **Work in progress.**

## Stack

| Part                       | Tools                                                      |
| -------------------------- | ---------------------------------------------------------- |
| Web (`apps/web`)           | React, Vite, TypeScript, TanStack Query, React Three Fiber |
| API (`apps/api`)           | NestJS, Prisma, PostgreSQL, zod                            |
| Shared (`packages/shared`) | zod schemas used by both sides                             |

## Run locally

Requirements: Node.js 22+, npm 11+, Docker, and [direnv](https://direnv.net).

```sh
cp .envrc.example .envrc && direnv allow
docker compose up -d --wait       # PostgreSQL on :5436, Mailpit on :8025
npm ci
npm run db:deploy -w @gear-store/api
npm run db:seed -w @gear-store/api   # demo catalogue + demo shopper/admin accounts
npm run dev:api                   # http://localhost:3000/api/docs (OpenAPI)
npm run dev:web                   # http://localhost:5173
```

## API

Interactive docs at `/api/docs`, the OpenAPI document at `/api/openapi.json`. Request and response shapes are
zod schemas in `packages/shared`, so validation, the docs and the web client use one contract.

- **Catalogue:** categories; products with search, category/brand/price/stock filters, sorting and paging.
- **Accounts:** sign-up with email confirmation, sign-in, password reset and change, one-click demo accounts.
- **Sessions:** 15-minute access tokens (sent as `Authorization: Bearer`) and a refresh token in an
  `HttpOnly`, `SameSite=Strict` cookie scoped to `/api/auth`. The refresh token rotates on every use; replaying
  an old one revokes the session. Signing out or resetting a password takes effect immediately.
- **Hardening:** argon2id password hashing, per-IP rate limits (tighter on sign-in and email routes), the
  same reply whether or not an email has an account, Helmet security headers, CHECK constraints on prices and
  stock, and only SHA-256 hashes of tokens stored.

## Checks

```sh
npm run typecheck
npm run lint
npm test                                   # unit tests
npm run test:e2e -w @gear-store/api        # needs the database from docker compose
npm run build
```

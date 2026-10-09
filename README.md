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
npm run admin:grant -w @gear-store/api -- you@example.com   # make your own account an administrator
npm run dev:api                   # http://localhost:3000/api/docs (OpenAPI)
npm run dev:web                   # http://localhost:5173
```

## API

Interactive docs at `/api/docs`, the OpenAPI document at `/api/openapi.json`. Request and response shapes are
zod schemas in `packages/shared`, so validation, the docs and the web client use one contract.

- **Catalogue:** categories; products with search, category/brand/price/stock filters, sorting and paging.
- **Accounts:** sign-up with email confirmation, sign-in, password reset and change, one-click demo accounts.
- **Shopping:** wishlist; a guest cart kept in the browser and merged into the account cart on sign-in;
  saved addresses with flat shipping by province.
- **Orders:** checkout prices everything on the server and takes stock with a guarded update inside one
  transaction (two buyers can never both get the last unit); an idempotency key makes a retried checkout
  return the same order; unpaid orders expire after 60 minutes and release their stock.
- **Payments:** Midtrans Snap (sandbox). Notifications are accepted only with a valid SHA-512 signature and
  the exact order amount, are idempotent, and are all logged; a payment that arrives after an order closed is
  flagged for refund instead of reopening it.
- **Reviews:** only from customers with a paid order for the product.
- **Admin:** revenue overview with a daily chart and what needs attention, orders (ship with courier and
  tracking, mark delivered, record refunds), products (edits refused if stock changed since the form was
  opened), categories and customer roles. The shared demo administrator can open everything but save nothing.
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

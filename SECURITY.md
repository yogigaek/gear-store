# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/yogigaek/gear-store/security/advisories/new), not in a public
issue or pull request. Include what you found, the steps to reproduce it, and the impact you expect.

This is a personal portfolio project maintained by one person: reports are read and fixed on a best-effort basis, and
there is no bug bounty.

## Scope

- The API (`apps/api`), the web app (`apps/web`) and the mobile app (`apps/mobile`) in this repository.
- The live demo at [yogi-store.vercel.app](https://yogi-store.vercel.app) and the API behind it.

Payments run in the **Midtrans sandbox**: no real money moves, and sandbox payment pages and test cards are
Midtrans's, not part of this project.

## Please do not

- Run tests that degrade the shared demo for others: load or stress tests, denial of service, mass sign-ups or
  automated scanning at volume.
- Access, change or delete data of accounts that are not yours. Use your own test account, or the shared demo
  accounts under "Try the demo": Shopper, and the read-only Admin.
- Use social engineering or attack the hosting providers (Vercel, Render, Neon, Midtrans).

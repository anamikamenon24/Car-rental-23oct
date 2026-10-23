---
name: driveeasy
description: >-
  Workflows, runbooks, and ground rules for developing, maintaining, and testing the DriveEasy UAE car rental application.
  Use this skill when working on DriveEasy features, database schema or migrations, pricing calculations, reservation transactions, test runs, or admin operations.
---

# DriveEasy Development & Operational Workflows

This skill guides development, testing, and operations on the **DriveEasy** UAE car rental platform.

---

## 1. Ground Rules & Domain Conventions

- **Currency & Money**: Always use integer minor units (fils, where 1 AED = 100 fils). Never use floating-point numbers for currency calculations.
- **Time & Time Zones**: Store timestamps in UTC (`timestamptz`). Display times in the branch's local IANA time zone (e.g., `Asia/Dubai`).
- **Local First**: Development and tests run against local PostgreSQL 18 databases (`driveeasy_dev`, `driveeasy_test`, `driveeasy_e2e`). Stand-ins are used for payment and file storage.
- **Server/Client Separation**: Never import server-only modules (`@/db`, `@/server/*`, `@/lib/services/*`) into client components. Put `import "server-only";` at the top of domain service modules.
- **Error Handling**: Use `DomainError` from `@/server/errors` with standard error codes (`VALIDATION`, `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `VEHICLE_UNAVAILABLE`, `HOLD_EXPIRED`, etc.).
- **Server Actions**: Wrap actions with `runAction` from `@/server/action` returning `ActionResult<T>`.

---

## 2. Common Commands

### Database Operations
```bash
# Verify connection to PostgreSQL and confirm btree_gist extension is active
pnpm db:check

# Seed local development database (driveeasy_dev) with branches, categories, fleet, and test logins
pnpm db:seed

# Force clean reset and reseed
pnpm db:seed --reset
```

### Running Locally
```bash
# Start Next.js development server
pnpm dev
```
Accessible at: **http://localhost:3002** (or `http://localhost:3000`).

---

## 3. Verification & Testing Workflows

Always run verification before finalizing code changes:

```bash
# 1. Typecheck (Next.js route types & TypeScript)
pnpm typecheck

# 2. Run unit and integration tests (Vitest)
pnpm test

# 3. Verify production bundle build
pnpm build

# 4. Run end-to-end browser tests (Playwright)
pnpm test:e2e
```

---

## 4. Test Accounts

| Role | Email | Password | Access |
|---|---|---|---|
| **Admin** | `admin@driveeasy.test` | `DegH0ztm5nFw0fC3!7` | Full `/admin/*` operations, fleet, pricing, check-out, check-in |
| **Customer** | `customer@driveeasy.test` | `DexVqkDX3XKdnyxZ!7` | Booking, `/account/rentals`, profile, voucher download |

---

## 5. Overlap & Concurrency Protection

- Vehicle availability is protected by PostgreSQL exclusion constraints (`tstzrange` with `EXCLUDE USING gist`) and cross-table database triggers.
- In `createReservationHold` and `holdDeposit`, always acquire row locks (`FOR UPDATE`) and verify idempotency keys before checking date ranges or inserting records to avoid race conditions.

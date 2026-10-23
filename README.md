# DriveEasy — Car Rental Platform (UAE)

DriveEasy is a full-featured, production-ready car rental web application built with **Next.js 16 (App Router)**, **PostgreSQL 18**, **Drizzle ORM**, **Better Auth**, and **Tailwind CSS**. Designed specifically for the UAE market across Dubai, Abu Dhabi, and Sharjah with branch time zones, AED currency, 5% VAT handling, and exclusion constraints that eliminate double bookings.

---

## Key Highlights

- **Live Fleet & Branch Availability**: Real-time vehicle availability with exclusion constraints (`tstzrange` with `EXCLUDE USING gist`) and cross-table triggers protecting against overlapping reservations or maintenance blocks.
- **Booking Flow**: Multi-step booking (Dates → Extras → Driver Profile & Private Licence Upload → Checkout with countdown hold & test payment retry).
- **Printable Vouchers**: Pick-up vouchers with QR codes.
- **Complete Admin Operations**:
  - **Dashboard**: Live metrics on active rentals, pickups today, overdue returns, and quick voucher/reservation lookup.
  - **Reservations**: List, filter, inspect audit logs, and process operations.
  - **Fleet**: Vehicle inventory management, category settings, and scheduling maintenance blocks.
  - **Branches**: 6 UAE branches (Dubai Airport, Downtown Dubai, Abu Dhabi Airport, Corniche, Sharjah Airport, Al Majaz) with custom operating hours and airport tags.
  - **Pricing & Extras**: Base rates, seasonal rules, priority tiers, and add-on extras (GPS, Child Seat, Full Insurance, Additional Driver).
  - **Operations Check-out & Check-in**: Record mileage, fuel levels (in eighths), compute late fees, handle deposit release or capture, and generate digital rental agreements.
  - **Damage Reports**: File reports with incident descriptions, severity levels, repair costs, and photos.

---

## Tech Stack

- **Framework**: Next.js 16.4 (App Router, Turbopack, Server Actions, Partial Prerendering)
- **Database**: PostgreSQL 18 with `btree_gist` extension
- **ORM & Migrations**: Drizzle ORM & Drizzle Kit
- **Authentication**: Better Auth (Email/Password, roles `ADMIN` & `CUSTOMER`, Next.js cookies)
- **Styling**: Tailwind CSS & Vanilla CSS design system
- **Testing**: Vitest (Unit & Integration) and Playwright (End-to-End)

---

## Local Development Setup

### 1. Prerequisites
- Node.js (v20+ or v24)
- pnpm (`corepack enable pnpm` or `npm install -g pnpm`)
- PostgreSQL 18 running locally

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Verify Database & Seed
```bash
pnpm db:check   # Checks PostgreSQL connection and btree_gist extension
pnpm db:seed    # Seeds UAE branches, categories, vehicles, extras, rules, and test accounts
```

### 4. Run the Development Server
```bash
pnpm dev
```
Open **[http://localhost:3002](http://localhost:3002)** (or `http://localhost:3000`).

---

## Test Accounts

The following test users are seeded into the local database:

| Role | Email | Password | Access |
|---|---|---|---|
| **Admin** | `admin@driveeasy.test` | `DegH0ztm5nFw0fC3!7` | Full `/admin/*` operations, fleet, pricing, check-out, check-in |
| **Customer** | `customer@driveeasy.test` | `DexVqkDX3XKdnyxZ!7` | Booking, `/account/rentals`, profile, voucher download |

*(Generated credentials are also preserved locally in `seed-users.local.md`)*

---

## Testing & Quality Assurance

Run the test suites:

```bash
# Typecheck
pnpm typecheck

# Unit and Integration Tests (Vitest) - 126 tests across 12 suites
pnpm test

# Production Build Verification
pnpm build

# End-to-End Tests (Playwright)
pnpm test:e2e
```

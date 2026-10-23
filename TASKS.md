# DriveEasy team task list

Shared by the three agents (`db`, `app`, `qa`) and the lead. Edit your own lines only:
change `[ ]` to `[~]` when you start, `[x]` when done (with a one-line note), `[!]` when blocked
(say on what). Bugs go in the Bugs section, then message the owner directly with SendMessage.

## Ground rules (all agents)

- **Local first.** Build and test against local PostgreSQL 18 (`.env.local`) and the local stand-ins.
  Never create or log in to cloud accounts (Vercel, Neon, Blob, Stripe). Write the cloud adapters,
  config and docs, but deployment itself is blocked until the user supplies access.
- Next.js 16.4 has breaking changes vs. training data. Read `node_modules/next/dist/docs/` for any
  API you use (route handlers, server actions, `proxy`/middleware, caching, `params` as Promise, etc.).
- Never import server-only modules (`@/db`, `@/server/*`, `@/lib/services/*`, secrets) into client
  components. Put `import "server-only"` at the top of server modules.
- Money: integer minor units (fils, AED). Time: store UTC `timestamptz`; display in the branch's
  `time_zone` (IANA, e.g. `Asia/Dubai`).
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test` before marking a task done.
- Do not `git commit`; the lead commits at milestones. Never print secrets from `.env.local`.
- Don't edit files another agent owns; message the owner instead.

## Ownership

| Agent | Owns |
|---|---|
| `db` (Database Engine) | `src/db/**`, `drizzle/**`, `scripts/**`, `src/server/**` (domain services), `src/lib/services/**`, `src/lib/auth.ts`, `src/app/api/**`, `vercel.json`, `.env.example` |
| `app` (App) | `src/app/**` except `src/app/api/**`, `src/components/**`, `src/lib/ui/**`, `public/**` |
| `qa` (QA) | `tests/**`, `vitest.config.mts`, `playwright.config.ts`, `*.test.ts` next to code it tests |
| lead | `TASKS.md` sections, `README.md`, `package.json` scripts (ask the lead or add yours and note it here) |

## Contract between `db` and `app`

- `app` calls domain code only through `src/server/*` functions (from Server Components and
  `"use server"` actions in `src/app/**/actions.ts`). `db` publishes each function's signature in
  the "Server API" section below as soon as it exists, even as a stub.
- Validation: Zod schemas for inputs live in `src/server/validation.ts` (owned by `db`); `app` reuses them
  in forms.
- Auth: Better Auth with email + password, Drizzle adapter. `db` owns `src/lib/auth.ts`
  (server) and `src/lib/auth-client.ts` (client) and helpers `requireUser()` / `requireAdmin()` in
  `src/server/auth.ts`. Roles: `CUSTOMER`, `ADMIN` (column on `users`). `app` builds login /
  register / logout UI.
- Files: licence and damage images are private (served via an authorised route only to the owner
  and admins); vehicle photos are public. Upload helpers in `src/server/uploads.ts`.

## Server API (filled in by `db`)

Status: signatures are final; bodies land task by task (D-numbers in brackets). All modules are
`import "server-only"` unless marked *client-safe*. Money = integer fils (`*Fils`, AED). Times are
`Date` (UTC); anything with a branch carries `timeZone` (IANA) for display.

**Conventions**
- Functions that act for someone take `actor: Actor` first. Get it from `requireUser()` /
  `requireAdmin()` and pass it through (lets QA call services directly). Admin functions re-check
  `actor.role === "ADMIN"` themselves.
- Errors: `DomainError { code, message, status, fieldErrors?, details? }` from `@/server/errors`.
  Codes: `VALIDATION`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_STATE`,
  `VEHICLE_UNAVAILABLE`, `HOLD_EXPIRED`, `PAYMENT_DECLINED`, `PRICE_UNAVAILABLE`,
  `DRIVER_PROFILE_REQUIRED`, `IDEMPOTENCY_CONFLICT`. Postgres exclusion violations (23P01) map to `VEHICLE_UNAVAILABLE`.
- Server actions: wrap with `runAction(() => ...)` from `@/server/action` →
  `ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code; message; fieldErrors? } }`
  (Next redacts thrown errors in production, so return them; `redirect`/`notFound` are rethrown).
- Inputs: Zod schemas in `@/server/validation` (dates accept ISO strings or `Date`, coerced to `Date`).
  Services validate again internally.
- *Client-safe* constants: `@/lib/constants` → `PAYMENT_TEST_METHODS` (fake tokens + labels),
  `CANCELLATION_POLICY` (text rules), `VAT_RATE_BPS` (500), `FUEL_LEVELS` (0..8 eighths), `formatFils(fils)`.

**Auth** [D3]
- `@/lib/auth`: `auth` (Better Auth server instance; route `/api/auth/[...all]`).
- `@/lib/auth-client` (*client*): `authClient`, `signIn`, `signUp`, `signOut`, `useSession`.
  Use the client lib: `signUp.email({ name, email, password })`, `signIn.email({ email, password })`.
- `@/server/auth`: `getCurrentUser(): Promise<SessionUser | null>`; `requireUser(nextPath?)` (redirects to `/login?next=`);
  `requireAdmin(nextPath?)` (anonymous → login, customer → `notFound()`). `SessionUser = { id, name, email, role: "CUSTOMER"|"ADMIN", image }` (= `Actor`).
  `src/proxy.ts` redirects anonymous requests for `/account/**`, `/admin/**` to `/login?next=`.

**Catalog** `@/server/catalog` [D4]
- `listBranches(): Promise<BranchDto[]>` (active only). `BranchDto { id, code, slug, name, city, address, phone, email, timeZone, openingHours, openingHoursText, latitude, longitude, isAirport, imageUrl }`
- `getBranch(idOrCodeOrSlug): Promise<BranchDto | null>`
- `listCategories(): Promise<CategoryDto[]>` — `{ id, code, slug, name, description, depositFils, fromDailyRateFils }`
- `listExtras(): Promise<ExtraDto[]>` — `{ id, code, name, description, chargeType: "PER_DAY"|"PER_RENTAL", priceFils, maxChargeFils, maxQuantity }`
- `listFeatures(): Promise<{ id, code, name, icon }[]>`
- `searchVehicles(input): Promise<SearchResult[]>` — schema `searchSchema` `{ pickupBranchId, returnBranchId?, pickupAt, returnAt, categoryId?, transmission?, fuelType?, minSeats?, minDailyFils?, maxDailyFils?, featureCodes?, sort?: "price_asc"|"price_desc"|"seats"|"newest" }`.
  Only vehicles based at the pick-up branch and free for the whole period.
  `SearchResult { vehicle: VehicleSummary, dailyRateFils, days, rentalFils, oneWayFeeFils, estimatedTotalFils (incl. VAT, excl. extras), depositFils }`
  `VehicleSummary { id, make, model, year, categoryId, categoryName, categorySlug, transmission, fuelType, seats, doors, luggage, color, imageUrl, photoUrls: string[], features: {code,name,icon}[], branchId, status }`
- `getVehicle(id): Promise<VehicleDetail | null>` — summary + `description, mileageKm, branch: BranchDto, category: CategoryDto, fromDailyRateFils`
- `getVehicleAvailability(vehicleId, fromDate "YYYY-MM-DD", days 1..62): Promise<{ date, status: "AVAILABLE"|"BOOKED"|"MAINTENANCE"|"PARTIAL" }[]>` (branch time zone; PARTIAL = busy for part of the day)

**Pricing** [D5]
- `@/server/pricing` (pure): `calculateQuote`, `rentalDays`, `lateReturnCharge`, `fuelCharge`, `cancellationRefund`, constants.
- `@/server/quotes`: `quoteRental(input): Promise<Quote>` — schema `quoteSchema` `{ vehicleId, pickupBranchId, returnBranchId, pickupAt, returnAt, extras?: { extraId, quantity }[] }`.
  `Quote { currency: "AED", days, dailyRateFils, rentalFils, extras: { extraId, code, name, chargeType, quantity, unitFils, totalFils }[], extrasFils, oneWayFeeFils, subtotalFils, vatRateBps, vatFils, totalFils, depositFils, pricingRuleId, lines: { label, amountFils }[] }`

**Driver profile + uploads** [D6, D9]
- `@/server/profile`: `getDriverProfile(actor): Promise<DriverProfileDto | null>`; `saveDriverProfile(actor, input)` — schema `driverProfileSchema`
  `{ fullName, phone, dateOfBirth "YYYY-MM-DD", nationality?, licenceNumber, licenceCountry (ISO-2), licenceIssuedOn?, licenceExpiresOn, licenceFrontKey?, licenceBackKey? }`; DTO adds `licenceFrontUrl/licenceBackUrl`.
- Upload route handlers (multipart, field `file`, max 8 MB, jpeg/png/webp/pdf; vehicle photos also svg): `POST /api/uploads/licence?side=front|back` (signed in) → `{ key, url }`;
  `POST /api/uploads/damage` (admin) → `{ key, url }`; `POST /api/uploads/vehicle-photo` (admin, public) → `{ url }`. Errors → `{ error: { code, message } }` + HTTP status. (So no server-action body-size change is needed.)
- `GET /api/files/<key>`: licences → owner + admins; damage → admins + that reservation's customer; `vehicles/*` public.
- `@/server/uploads`: `privateFileUrl(key)`, `uploadLicence(actor, file: File, side)`, `uploadDamagePhoto(actor, file)`, `uploadVehiclePhoto(actor, file)`.

**Reservations (customer)** `@/server/reservations` [D6]
- `createReservationHold(actor, input): Promise<{ reservationId, reference, holdExpiresAt: Date, quote: Quote }>` — schema `createReservationSchema` = quote input + `{ idempotencyKey (uuid made by the client once per checkout, reused on retry), driver?: DriverProfileInput, notes? }`.
  No driver profile → `DRIVER_PROFILE_REQUIRED`; unavailable → `VEHICLE_UNAVAILABLE`; same key → same reservation. Hold = `RESERVATION_HOLD_MINUTES` (default 15).
- `payReservation(actor, { reservationId, paymentMethod, idempotencyKey }): Promise<PaymentOutcome>` — charges the total and pre-authorises the deposit; CONFIRMED once both succeed.
  `PaymentOutcome { reservationStatus, paymentStatus, depositStatus, failureReason?, canRetry }`. Retry: call again with a NEW idempotencyKey while the hold is valid (`HOLD_EXPIRED` after).
- `cancelPendingReservation(actor, id): Promise<void>` (abandon checkout; releases hold + any money).
- `listMyReservations(actor): Promise<ReservationSummary[]>` — `{ id, reference, status, pickupAt, returnAt, pickupBranch {id,name,city,timeZone}, returnBranch, vehicle {id, make, model, year, imageUrl, categoryName}, totalFils, holdExpiresAt }`
- `getMyReservation(actor, id): Promise<ReservationDetail>` (owner or admin, else `NOT_FOUND`) — summary + `quote, extras, payments[], deposits[], depositFils, refundFils, cancellationReason, agreement, canCancel, canModify, canPay, voucherAvailable`
- `getVoucher(actor, id): Promise<{ reference, qrDataUrl, reservation: ReservationDetail }>` (CONFIRMED / PICKED_UP only)
- `getCancellationQuote(actor, id): Promise<{ eligible, refundFils, feeFils, refundPercent, reason, policy: string[] }>`
- `cancelReservation(actor, id, { reason? }): Promise<ReservationDetail>`
- `quoteDateChange(actor, id, { pickupAt, returnAt }): Promise<{ available, quote, currentTotalFils, differenceFils }>`
- `modifyReservationDates(actor, id, { pickupAt, returnAt, idempotencyKey, paymentMethod? }): Promise<ReservationDetail>` (paymentMethod needed if the price goes up; refund if down)

**Payments** `@/server/payments` [D7]
- `POST /api/webhooks/payments` (fake: `fake-signature` header; stripe: `stripe-signature`).
- `handlePaymentWebhook(rawBody, signatureHeader): Promise<{ duplicate: boolean; outcome: string }>`.

**Jobs** [D8]
- `@/server/holds`: `releaseExpiredHolds({ now?: Date }): Promise<{ count, reservationIds }>`; `GET /api/cron/release-expired-holds` (`Authorization: Bearer $CRON_SECRET`); `pnpm jobs release-expired-holds`.

**Admin** (all take `actor`, require ADMIN, write an audit row) [D10]
- `@/server/admin/branches`: `adminListBranches(actor)`, `createBranch(actor, input)`, `updateBranch(actor, id, input)` — schema `branchSchema`.
- `@/server/admin/fleet`: `adminListVehicles(actor, { q?, branchId?, categoryId?, status? })`, `adminGetVehicle(actor, id)`, `createVehicle(actor, input)`, `updateVehicle(actor, id, input)` (schema `vehicleSchema`, incl. `featureCodes`), `setVehicleStatus(actor, id, status)`;
  `listCategoriesAdmin(actor)`, `createCategory(actor, input)`, `updateCategory(actor, id, input)` (schema `categorySchema`);
  `listMaintenanceBlocks(actor, { vehicleId?, from?, to? })`, `createMaintenanceBlock(actor, { vehicleId, startsAt, endsAt, reason })` (overlap → `VEHICLE_UNAVAILABLE`), `deleteMaintenanceBlock(actor, id)`.
- `@/server/admin/pricing`: `listPricingRules(actor)`, `createPricingRule`, `updatePricingRule(actor, id, input)`, `deletePricingRule(actor, id)` (schema `pricingRuleSchema`); `adminListExtras(actor)`, `createExtra`, `updateExtra(actor, id, input)` (schema `extraSchema`).
- `@/server/admin/reservations`: `adminListReservations(actor, { q?, status?, branchId?, from?, to?, page?, pageSize? }): Promise<{ items, total }>`; `adminGetReservation(actor, id)` (detail + `customer, driver, auditLog`); `adminCancelReservation(actor, id, { reason, refundFils? })`.
- `@/server/admin/operations`: `checkOut(actor, reservationId, { mileageKm, fuelEighths, notes? })` → agreement (PICKED_UP, vehicle ON_RENT);
  `quoteCheckIn(actor, reservationId, { returnedAt?, mileageKm, fuelEighths, chargeFuel?, damageChargeFils? }): Promise<CheckInQuote { lateMinutes, lateFeeFils, fuelChargeFils, damageChargeFils, vatFils, totalFils, depositFils, depositCaptureFils, depositReleaseFils, balanceDueFils }>`;
  `checkIn(actor, reservationId, { ...same, returnBranchId?, notes?, depositAction?: "AUTO"|"RELEASE"|"CAPTURE", captureFils? })` → agreement (RETURNED, vehicle AVAILABLE at return branch).
- `@/server/admin/damage`: `listDamageReports(actor, { vehicleId?, reservationId?, status? })`, `createDamageReport(actor, input)`, `updateDamageReport(actor, id, input)` (schema `damageReportSchema`).
- `@/server/admin/audit`: `listAuditLogs(actor, { entityType?, entityId?, limit? })`; `@/server/admin/dashboard`: `adminDashboard(actor)`.

**Seed / test support** [D2]: `pnpm db:seed` (idempotent; `pnpm db:seed --reset` wipes and reseeds). `seed(db, { reset? })` exported from `src/db/seed.ts`; `SEED_USERS` from `src/db/seed-users.ts` (emails/passwords read from env `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_CUSTOMER_EMAIL`, `SEED_CUSTOMER_PASSWORD` with fallbacks); values also written to gitignored `seed-users.local.md`. Migrations: everything is in `drizzle/` (incl. `CREATE EXTENSION btree_gist`, EXCLUDE constraints, trigger).

## Tasks

### db: Database Engine
- [x] D1 Schema + migrations for: users (+ Better Auth session/account/verification), driver_profiles, branches, vehicle_categories, vehicles, vehicle_features, vehicle_feature_map, pricing_rules, extras, reservations, reservation_extras, payments, deposits, rental_agreements, damage_reports, maintenance_blocks, audit_logs (+ payment_webhook_events for dedupe). UUID PKs, FKs, checks, indexes, cascades, unique plate/VIN/branch code, enums for vehicle/reservation/payment/deposit status, tstzrange periods with EXCLUDE USING gist on reservations (active statuses) and maintenance_blocks, plus cross-table overlap guard (reservation vs maintenance) via trigger.
- [x] D2 Seed script (`pnpm db:seed`): branches (UAE, Asia/Dubai), categories, vehicles with photos, features, extras (child seat, GPS, additional driver, full insurance), pricing rules, an admin and a customer test user (credentials written to `.env.local` comments / seed file, never printed), future reservations.
- [x] D3 Auth: Better Auth config, roles, `requireUser` / `requireAdmin`, `proxy` protection for `/admin` and `/account`.
- [x] D4 Search + availability services: filters (pick-up/return branch, dates/times, category, transmission, seats, fuel, price), per-vehicle availability calendar.
- [x] D5 Pricing service (server-only): daily rate by rules, days, extras, one-way fee, VAT 5%, deposit, late-return charges.
- [x] D6 Reservation transaction exactly as specified (txn, `FOR UPDATE` lock, overlap check, hold with expiry, server pricing, PENDING, commit; confirm only after verified payment + deposit auth; idempotency keys; reject if unavailable). Modify dates + cancel with cancellation policy and refunds.
- [x] D7 Payments: webhook route (signature verify, dedupe by event id, idempotent state changes), payment retry, refund, deposit release/capture. Stripe test-mode adapter behind `PaymentProvider` (not used locally).
- [x] D8 Expired holds: idempotent `releaseExpiredHolds`, `GET /api/cron/release-expired-holds` protected by `CRON_SECRET`, `vercel.json` cron, update `pnpm jobs`.
- [x] D9 Uploads: Vercel Blob adapter behind `FileStorage`; private licence/damage route with owner/admin checks.
- [x] D10 Admin services: branches, fleet, pricing, reservations, check-out (agreement: mileage + fuel), check-in (late fees, deposit release/capture), damage reports. Audit log on every admin write.
- [x] D11 Structured server logger (JSON) + error handling helpers; deployment: migration script for Vercel build using unpooled URL, pooled `DATABASE_URL` at runtime, `.env.example` updated.

### app: App
- [x] A1 Design system + layout (header, footer, mobile nav), loading/error/empty/not-found states.
- [x] A2 Home with search form (branches, dates/times, return branch).
- [x] A3 Search results with filters + sorting; vehicle details with availability calendar.
- [x] A4 Branch pages.
- [x] A5 Booking flow: dates, extras, price breakdown (daily rate, days, extras, one-way fee, taxes, deposit, total), driver details + licence upload, checkout with test payment, retry on failure.
- [x] A6 Pick-up voucher with reference + QR code (printable).
- [x] A7 My rentals: list, detail, modify dates, cancel (policy shown).
- [x] A8 Profile, login, register, logout.
- [x] A9 Admin: branches, reservations, check-out, check-in, damage reports (with photo upload).
- [x] A10 Responsive pass (mobile + desktop), accessibility basics.

### qa: QA
- [x] Q1 Test harness: tests/helpers (env, db reset/migrate/seed via child process, factory, world), vitest projects unit+integration (integration on driveeasy_test), Playwright own server :3100 on driveeasy_e2e (distDir .next-e2e), auth setup + customerPage/adminPage fixtures.
- [x] Q2 Migrations on a clean database (drop/recreate test DB, migrate, seed).
- [x] Q3 Auth: register, login, logout, authorisation (customer vs admin, cross-user access to reservations, vouchers, licence files).
- [x] Q4 Search, branch selection, date ranges, filters, availability calendar.
- [x] Q5 Concurrency: two simultaneous overlapping reservations for the same vehicle, only one succeeds; back-to-back (end == next start) both succeed.
- [x] Q6 Expired holds release + idempotent cron endpoint (and 401 without secret).
- [x] Q7 Pricing: daily rates, extras, one-way fee, VAT, late-return charges, deposit.
- [x] Q8 Payments: success, failure, cancel, retry, refund, deposit release, duplicate webhook delivery.
- [x] Q9 Full E2E: search → book → pay → voucher → admin check-out → check-in (rental-flow.spec.ts passing with card retry and agreement lifecycle).
- [x] Q10 Admin permissions for fleet, pricing, check-in, damage reports.
- [x] Q11 `next build` (production) passes; desktop + mobile Playwright projects pass.
- [ ] Q12 Report bugs below, message owners, retest fixes.

### Blocked on user (cloud access)
- [!] Provision Neon via Vercel Marketplace, Vercel Blob store, payment provider test keys, deploy preview + production, verify deployed app end to end.

## Bugs

| # | Found by | Owner | Description | Status |
|---|---|---|---|---|

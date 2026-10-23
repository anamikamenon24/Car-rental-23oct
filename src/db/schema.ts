// DriveEasy database schema (Drizzle). Generate migrations with `pnpm db:generate`.
//
// Conventions
// - UUID primary keys (gen_random_uuid()).
// - All instants are `timestamptz` stored in UTC; UI converts to `branches.time_zone` (IANA).
// - Money is integer fils (1 AED = 100 fils), never floats; every amount has CHECK >= 0.
// - Rental / maintenance periods are half-open tstzrange '[)' so a rental ending at 10:00 and the
//   next one starting at 10:00 do not overlap.
//
// Hand-written SQL that Drizzle cannot express lives in drizzle/0001_constraints.sql (custom
// migration): EXCLUDE USING gist constraints, the reservation <-> maintenance overlap trigger.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Postgres tstzrange, read/written as its text form, e.g. ["2026-01-01 10:00:00+00","2026-01-03 10:00:00+00"). */
const tstzrange = customType<{ data: string; driverData: string }>({
  dataType: () => "tstzrange",
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const id = () => uuid("id").primaryKey().defaultRandom();
const fils = (name: string) => integer(name);

// ---------------------------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["CUSTOMER", "ADMIN"]);
export const vehicleStatus = pgEnum("vehicle_status", ["AVAILABLE", "RESERVED", "ON_RENT", "MAINTENANCE", "RETIRED"]);
export const reservationStatus = pgEnum("reservation_status", [
  "PENDING",
  "CONFIRMED",
  "PICKED_UP",
  "RETURNED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
]);
export const paymentStatus = pgEnum("payment_status", [
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
]);
export const paymentKind = pgEnum("payment_kind", ["RENTAL", "ADDITIONAL_CHARGES"]);
export const depositStatus = pgEnum("deposit_status", ["PENDING", "HELD", "RELEASED", "CAPTURED", "FAILED", "CANCELED"]);
export const transmission = pgEnum("transmission", ["AUTOMATIC", "MANUAL"]);
export const fuelType = pgEnum("fuel_type", ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"]);
export const extraChargeType = pgEnum("extra_charge_type", ["PER_DAY", "PER_RENTAL"]);
export const damageSeverity = pgEnum("damage_severity", ["MINOR", "MODERATE", "MAJOR"]);
export const damageStatus = pgEnum("damage_status", ["OPEN", "REPAIRED", "WAIVED"]);
export const damageStage = pgEnum("damage_stage", ["PICKUP", "RETURN", "OTHER"]);

/** Statuses that occupy the vehicle. Kept in sync with the partial EXCLUDE constraint in 0001. */
export const ACTIVE_RESERVATION_STATUSES = ["PENDING", "CONFIRMED", "PICKED_UP"] as const;

// ---------------------------------------------------------------------------------------------
// Users + Better Auth (user model mapped onto `users`)
// ---------------------------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: userRole("role").notNull().default("CUSTOMER"),
    phone: text("phone"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    check("users_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("users_name_not_blank", sql`length(trim(${t.name})) > 0`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("sessions_token_key").on(t.token), index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("accounts_provider_account_key").on(t.providerId, t.accountId),
    index("accounts_user_id_idx").on(t.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const driverProfiles = pgTable(
  "driver_profiles",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
    phone: text("phone").notNull(),
    nationality: text("nationality"),
    licenceNumber: text("licence_number").notNull(),
    licenceCountry: text("licence_country").notNull(),
    licenceIssuedOn: date("licence_issued_on", { mode: "string" }),
    licenceExpiresOn: date("licence_expires_on", { mode: "string" }).notNull(),
    /** Private storage keys (FileStorage), served only via /api/files/private. */
    licenceFrontKey: text("licence_front_key"),
    licenceBackKey: text("licence_back_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("driver_profiles_user_id_key").on(t.userId),
    check("driver_profiles_licence_after_birth", sql`${t.licenceExpiresOn} > ${t.dateOfBirth}`),
    check("driver_profiles_country_code", sql`${t.licenceCountry} ~ '^[A-Z]{2}$'`),
  ],
);

// ---------------------------------------------------------------------------------------------
// Branches, fleet, pricing
// ---------------------------------------------------------------------------------------------

export const branches = pgTable(
  "branches",
  {
    id: id(),
    code: text("code").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    city: text("city").notNull(),
    address: text("address").notNull(),
    phone: text("phone"),
    email: text("email"),
    latitude: numeric("latitude", { precision: 9, scale: 6, mode: "number" }),
    longitude: numeric("longitude", { precision: 9, scale: 6, mode: "number" }),
    /** IANA zone, e.g. Asia/Dubai. Times are stored in UTC and shown in this zone. */
    timeZone: text("time_zone").notNull().default("Asia/Dubai"),
    /** e.g. { "mon": ["08:00","22:00"], ... } or { "24h": true } */
    openingHours: jsonb("opening_hours").$type<Record<string, unknown>>().notNull().default({}),
    isAirport: boolean("is_airport").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    imageUrl: text("image_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("branches_code_key").on(t.code),
    uniqueIndex("branches_slug_key").on(t.slug),
    check("branches_code_format", sql`${t.code} ~ '^[A-Z0-9]{2,10}$'`),
    check("branches_slug_format", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check("branches_time_zone_format", sql`${t.timeZone} ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)+$' or ${t.timeZone} = 'UTC'`),
    check("branches_latitude_range", sql`${t.latitude} between -90 and 90`),
    check("branches_longitude_range", sql`${t.longitude} between -180 and 180`),
  ],
);

export const vehicleCategories = pgTable(
  "vehicle_categories",
  {
    id: id(),
    code: text("code").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Security deposit pre-authorised for every rental in this category. */
    depositFils: fils("deposit_fils").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("vehicle_categories_code_key").on(t.code),
    uniqueIndex("vehicle_categories_slug_key").on(t.slug),
    check("vehicle_categories_deposit_nonneg", sql`${t.depositFils} >= 0`),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => vehicleCategories.id, { onDelete: "restrict" }),
    /** Branch where the car is based / currently parked. */
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: integer("year").notNull(),
    plate: text("plate").notNull(),
    vin: text("vin").notNull(),
    color: text("color").notNull(),
    transmission: transmission("transmission").notNull(),
    fuelType: fuelType("fuel_type").notNull(),
    seats: integer("seats").notNull(),
    doors: integer("doors").notNull().default(4),
    luggage: integer("luggage").notNull().default(2),
    mileageKm: integer("mileage_km").notNull().default(0),
    status: vehicleStatus("status").notNull().default("AVAILABLE"),
    /** Public photo path (e.g. /vehicles/x.svg) or public blob URL. */
    imageUrl: text("image_url"),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("vehicles_plate_key").on(t.plate),
    uniqueIndex("vehicles_vin_key").on(t.vin),
    index("vehicles_category_id_idx").on(t.categoryId),
    index("vehicles_branch_id_idx").on(t.branchId),
    index("vehicles_status_idx").on(t.status),
    check("vehicles_year_range", sql`${t.year} between 1990 and 2100`),
    check("vehicles_vin_format", sql`${t.vin} ~ '^[A-HJ-NPR-Z0-9]{17}$'`),
    check("vehicles_seats_range", sql`${t.seats} between 1 and 15`),
    check("vehicles_doors_range", sql`${t.doors} between 2 and 6`),
    check("vehicles_luggage_range", sql`${t.luggage} between 0 and 10`),
    check("vehicles_mileage_nonneg", sql`${t.mileageKm} >= 0`),
  ],
);

export const vehicleFeatures = pgTable(
  "vehicle_features",
  {
    id: id(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    icon: text("icon"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("vehicle_features_code_key").on(t.code)],
);

export const vehicleFeatureMap = pgTable(
  "vehicle_feature_map",
  {
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => vehicleFeatures.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ name: "vehicle_feature_map_pkey", columns: [t.vehicleId, t.featureId] }),
    index("vehicle_feature_map_feature_id_idx").on(t.featureId),
  ],
);

export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: id(),
    name: text("name").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => vehicleCategories.id, { onDelete: "cascade" }),
    /** Null = applies to every branch. */
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
    dailyRateFils: fils("daily_rate_fils").notNull(),
    /** Rule applies to rentals of at least this many days (weekly/monthly rates). */
    minDays: integer("min_days").notNull().default(1),
    /** Inclusive date window in branch-local dates matched against the pick-up date. Null = open. */
    validFrom: date("valid_from", { mode: "string" }),
    validTo: date("valid_to", { mode: "string" }),
    /** Higher wins when several rules match. */
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("pricing_rules_category_id_idx").on(t.categoryId),
    index("pricing_rules_branch_id_idx").on(t.branchId),
    check("pricing_rules_rate_positive", sql`${t.dailyRateFils} > 0`),
    check("pricing_rules_min_days", sql`${t.minDays} >= 1`),
    check("pricing_rules_dates", sql`${t.validTo} is null or ${t.validFrom} is null or ${t.validTo} >= ${t.validFrom}`),
  ],
);

export const extras = pgTable(
  "extras",
  {
    id: id(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    chargeType: extraChargeType("charge_type").notNull(),
    priceFils: fils("price_fils").notNull(),
    /** Cap per unit for the whole rental (e.g. GPS max AED 150). Null = no cap. */
    maxChargeFils: fils("max_charge_fils"),
    maxQuantity: integer("max_quantity").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("extras_code_key").on(t.code),
    check("extras_price_nonneg", sql`${t.priceFils} >= 0`),
    check("extras_cap_nonneg", sql`${t.maxChargeFils} is null or ${t.maxChargeFils} >= 0`),
    check("extras_max_quantity", sql`${t.maxQuantity} between 1 and 10`),
  ],
);

// ---------------------------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------------------------

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    /** Human-friendly booking reference shown on the voucher, e.g. DE-7KQ4M2XP. */
    reference: text("reference").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    pickupBranchId: uuid("pickup_branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    returnBranchId: uuid("return_branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    pickupAt: ts("pickup_at").notNull(),
    returnAt: ts("return_at").notNull(),
    /** Derived, half-open [pickup_at, return_at). Used by the EXCLUDE constraint. */
    period: tstzrange("period")
      .notNull()
      .generatedAlwaysAs(sql`tstzrange(pickup_at, return_at, '[)')`),
    status: reservationStatus("status").notNull().default("PENDING"),
    /** PENDING reservations block the vehicle only until this instant (then released -> EXPIRED). */
    holdExpiresAt: ts("hold_expires_at"),
    /** Client-supplied key; a retried request returns the same reservation. */
    idempotencyKey: text("idempotency_key").notNull(),

    // Price snapshot computed on the server at booking time (fils, AED).
    currency: text("currency").notNull().default("AED"),
    rentalDays: integer("rental_days").notNull(),
    dailyRateFils: fils("daily_rate_fils").notNull(),
    baseFils: fils("base_fils").notNull(),
    extrasFils: fils("extras_fils").notNull().default(0),
    oneWayFeeFils: fils("one_way_fee_fils").notNull().default(0),
    subtotalFils: fils("subtotal_fils").notNull(),
    vatFils: fils("vat_fils").notNull(),
    totalFils: fils("total_fils").notNull(),
    depositFils: fils("deposit_fils").notNull(),
    pricingRuleId: uuid("pricing_rule_id").references(() => pricingRules.id, { onDelete: "set null" }),
    priceBreakdown: jsonb("price_breakdown").$type<unknown>().notNull(),

    notes: text("notes"),
    confirmedAt: ts("confirmed_at"),
    pickedUpAt: ts("picked_up_at"),
    returnedAt: ts("returned_at"),
    cancelledAt: ts("cancelled_at"),
    expiredAt: ts("expired_at"),
    cancellationReason: text("cancellation_reason"),
    refundFils: fils("refund_fils").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("reservations_reference_key").on(t.reference),
    uniqueIndex("reservations_idempotency_key_key").on(t.idempotencyKey),
    index("reservations_user_id_idx").on(t.userId),
    index("reservations_vehicle_id_idx").on(t.vehicleId),
    index("reservations_status_idx").on(t.status),
    index("reservations_pickup_branch_pickup_at_idx").on(t.pickupBranchId, t.pickupAt),
    index("reservations_return_branch_id_idx").on(t.returnBranchId),
    index("reservations_pending_hold_idx")
      .on(t.holdExpiresAt)
      .where(sql`status = 'PENDING'`),
    check("reservations_period_valid", sql`${t.returnAt} > ${t.pickupAt}`),
    check("reservations_pending_has_hold", sql`${t.status} <> 'PENDING' or ${t.holdExpiresAt} is not null`),
    check("reservations_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check("reservations_days_positive", sql`${t.rentalDays} >= 1`),
    check(
      "reservations_money_nonneg",
      sql`${t.dailyRateFils} >= 0 and ${t.baseFils} >= 0 and ${t.extrasFils} >= 0 and ${t.oneWayFeeFils} >= 0
          and ${t.subtotalFils} >= 0 and ${t.vatFils} >= 0 and ${t.totalFils} >= 0 and ${t.depositFils} >= 0
          and ${t.refundFils} >= 0`,
    ),
    check("reservations_total_consistent", sql`${t.totalFils} = ${t.subtotalFils} + ${t.vatFils}`),
    check("reservations_refund_le_total", sql`${t.refundFils} <= ${t.totalFils}`),
  ],
);

export const reservationExtras = pgTable(
  "reservation_extras",
  {
    id: id(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "cascade" }),
    extraId: uuid("extra_id")
      .notNull()
      .references(() => extras.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    chargeType: extraChargeType("charge_type").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceFils: fils("unit_price_fils").notNull(),
    totalFils: fils("total_fils").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("reservation_extras_reservation_extra_key").on(t.reservationId, t.extraId),
    index("reservation_extras_extra_id_idx").on(t.extraId),
    check("reservation_extras_quantity", sql`${t.quantity} between 1 and 10`),
    check("reservation_extras_money_nonneg", sql`${t.unitPriceFils} >= 0 and ${t.totalFils} >= 0`),
  ],
);

// ---------------------------------------------------------------------------------------------
// Payments, deposits, webhooks
// ---------------------------------------------------------------------------------------------

export const payments = pgTable(
  "payments",
  {
    id: id(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "restrict" }),
    kind: paymentKind("kind").notNull().default("RENTAL"),
    /** 1, 2, 3... A retry after a failure is a new attempt on the same reservation. */
    attempt: integer("attempt").notNull().default(1),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    amountFils: fils("amount_fils").notNull(),
    refundedFils: fils("refunded_fils").notNull().default(0),
    currency: text("currency").notNull().default("AED"),
    status: paymentStatus("status").notNull().default("PENDING"),
    failureReason: text("failure_reason"),
    /** createdAt of the newest provider event applied; older events are ignored (out-of-order). */
    lastEventAt: ts("last_event_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_idempotency_key_key").on(t.idempotencyKey),
    uniqueIndex("payments_provider_payment_id_key").on(t.provider, t.providerPaymentId),
    uniqueIndex("payments_reservation_kind_attempt_key").on(t.reservationId, t.kind, t.attempt),
    index("payments_status_idx").on(t.status),
    check("payments_amount_positive", sql`${t.amountFils} > 0`),
    check("payments_refund_range", sql`${t.refundedFils} >= 0 and ${t.refundedFils} <= ${t.amountFils}`),
    check("payments_attempt_positive", sql`${t.attempt} >= 1`),
    check("payments_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const deposits = pgTable(
  "deposits",
  {
    id: id(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "restrict" }),
    attempt: integer("attempt").notNull().default(1),
    provider: text("provider").notNull(),
    providerDepositId: text("provider_deposit_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    amountFils: fils("amount_fils").notNull(),
    capturedFils: fils("captured_fils").notNull().default(0),
    currency: text("currency").notNull().default("AED"),
    status: depositStatus("status").notNull().default("PENDING"),
    failureReason: text("failure_reason"),
    lastEventAt: ts("last_event_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("deposits_idempotency_key_key").on(t.idempotencyKey),
    uniqueIndex("deposits_provider_deposit_id_key").on(t.provider, t.providerDepositId),
    uniqueIndex("deposits_reservation_attempt_key").on(t.reservationId, t.attempt),
    index("deposits_status_idx").on(t.status),
    check("deposits_amount_positive", sql`${t.amountFils} > 0`),
    check("deposits_capture_range", sql`${t.capturedFils} >= 0 and ${t.capturedFils} <= ${t.amountFils}`),
    check("deposits_attempt_positive", sql`${t.attempt} >= 1`),
    check("deposits_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

/** Every provider webhook we have accepted, keyed by the provider's event id (dedupe). */
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    eventCreatedAt: ts("event_created_at"),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
    outcome: text("outcome"),
  },
  (t) => [
    uniqueIndex("payment_webhook_events_provider_event_key").on(t.provider, t.eventId),
    index("payment_webhook_events_received_at_idx").on(t.receivedAt),
  ],
);

// ---------------------------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------------------------

export const rentalAgreements = pgTable(
  "rental_agreements",
  {
    id: id(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id, { onDelete: "restrict" }),
    agreementNumber: text("agreement_number").notNull(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    // Check-out (pick-up)
    checkedOutAt: ts("checked_out_at").notNull(),
    checkedOutBy: uuid("checked_out_by").references(() => users.id, { onDelete: "set null" }),
    pickupMileageKm: integer("pickup_mileage_km").notNull(),
    /** Fuel in eighths of a tank: 0 = empty, 8 = full. */
    pickupFuelEighths: integer("pickup_fuel_eighths").notNull(),
    pickupNotes: text("pickup_notes"),
    // Check-in (return)
    checkedInAt: ts("checked_in_at"),
    checkedInBy: uuid("checked_in_by").references(() => users.id, { onDelete: "set null" }),
    returnBranchId: uuid("return_branch_id").references(() => branches.id, { onDelete: "restrict" }),
    returnMileageKm: integer("return_mileage_km"),
    returnFuelEighths: integer("return_fuel_eighths"),
    returnNotes: text("return_notes"),
    lateMinutes: integer("late_minutes").notNull().default(0),
    lateFeeFils: fils("late_fee_fils").notNull().default(0),
    fuelChargeFils: fils("fuel_charge_fils").notNull().default(0),
    damageChargeFils: fils("damage_charge_fils").notNull().default(0),
    additionalVatFils: fils("additional_vat_fils").notNull().default(0),
    additionalTotalFils: fils("additional_total_fils").notNull().default(0),
    depositCapturedFils: fils("deposit_captured_fils").notNull().default(0),
    /** Charges above the deposit, to be collected separately. */
    balanceDueFils: fils("balance_due_fils").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("rental_agreements_reservation_id_key").on(t.reservationId),
    uniqueIndex("rental_agreements_agreement_number_key").on(t.agreementNumber),
    index("rental_agreements_vehicle_id_idx").on(t.vehicleId),
    check("rental_agreements_pickup_mileage", sql`${t.pickupMileageKm} >= 0`),
    check("rental_agreements_pickup_fuel", sql`${t.pickupFuelEighths} between 0 and 8`),
    check("rental_agreements_return_fuel", sql`${t.returnFuelEighths} is null or ${t.returnFuelEighths} between 0 and 8`),
    check(
      "rental_agreements_return_mileage",
      sql`${t.returnMileageKm} is null or ${t.returnMileageKm} >= ${t.pickupMileageKm}`,
    ),
    check(
      "rental_agreements_return_complete",
      sql`(${t.checkedInAt} is null) = (${t.returnMileageKm} is null) and (${t.checkedInAt} is null) = (${t.returnFuelEighths} is null)`,
    ),
    check("rental_agreements_return_after_pickup", sql`${t.checkedInAt} is null or ${t.checkedInAt} >= ${t.checkedOutAt}`),
    check(
      "rental_agreements_money_nonneg",
      sql`${t.lateMinutes} >= 0 and ${t.lateFeeFils} >= 0 and ${t.fuelChargeFils} >= 0 and ${t.damageChargeFils} >= 0
          and ${t.additionalVatFils} >= 0 and ${t.additionalTotalFils} >= 0 and ${t.depositCapturedFils} >= 0
          and ${t.balanceDueFils} >= 0`,
    ),
  ],
);

export const damageReports = pgTable(
  "damage_reports",
  {
    id: id(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    reservationId: uuid("reservation_id").references(() => reservations.id, { onDelete: "set null" }),
    reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
    stage: damageStage("stage").notNull().default("OTHER"),
    severity: damageSeverity("severity").notNull(),
    status: damageStatus("status").notNull().default("OPEN"),
    location: text("location").notNull(),
    description: text("description").notNull(),
    estimatedCostFils: fils("estimated_cost_fils").notNull().default(0),
    chargedFils: fils("charged_fils").notNull().default(0),
    /** Private storage keys (FileStorage). */
    imageKeys: text("image_keys").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("damage_reports_vehicle_id_idx").on(t.vehicleId),
    index("damage_reports_reservation_id_idx").on(t.reservationId),
    check("damage_reports_money_nonneg", sql`${t.estimatedCostFils} >= 0 and ${t.chargedFils} >= 0`),
  ],
);

export const maintenanceBlocks = pgTable(
  "maintenance_blocks",
  {
    id: id(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    period: tstzrange("period")
      .notNull()
      .generatedAlwaysAs(sql`tstzrange(starts_at, ends_at, '[)')`),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("maintenance_blocks_vehicle_id_idx").on(t.vehicleId),
    check("maintenance_blocks_period_valid", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** USER (customer/admin), SYSTEM (jobs) or WEBHOOK (payment provider). */
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_actor_idx").on(t.actorUserId),
    index("audit_logs_created_at_idx").on(t.createdAt),
    check("audit_logs_actor_type", sql`${t.actorType} in ('USER', 'SYSTEM', 'WEBHOOK')`),
  ],
);

// Inferred row types
export type User = typeof users.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type VehicleCategory = typeof vehicleCategories.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type VehicleFeature = typeof vehicleFeatures.$inferSelect;
export type PricingRule = typeof pricingRules.$inferSelect;
export type Extra = typeof extras.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type ReservationExtra = typeof reservationExtras.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type DepositRow = typeof deposits.$inferSelect;
export type RentalAgreement = typeof rentalAgreements.$inferSelect;
export type DamageReport = typeof damageReports.$inferSelect;
export type MaintenanceBlock = typeof maintenanceBlocks.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type DriverProfile = typeof driverProfiles.$inferSelect;
export type ReservationStatus = (typeof reservationStatus.enumValues)[number];
export type VehicleStatus = (typeof vehicleStatus.enumValues)[number];
export type PaymentStatusValue = (typeof paymentStatus.enumValues)[number];
export type DepositStatusValue = (typeof depositStatus.enumValues)[number];

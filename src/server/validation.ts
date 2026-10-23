// Zod input schemas. Client-safe (no server-only import): the UI may reuse them for hints,
// but every service validates again on the server.
import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";

const id = z.uuid({ message: "Invalid id" });
const instant = z.coerce.date({ message: "Invalid date/time" });
const day = z.iso.date({ message: "Use YYYY-MM-DD" });
const filsAmount = z.coerce.number().int("Must be whole fils").min(0, "Must be 0 or more").max(1_000_000_000);
const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const transmissionValues = ["AUTOMATIC", "MANUAL"] as const;
export const fuelTypeValues = ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"] as const;
export const vehicleStatusValues = ["AVAILABLE", "RESERVED", "ON_RENT", "MAINTENANCE", "RETIRED"] as const;
export const reservationStatusValues = [
  "PENDING",
  "CONFIRMED",
  "PICKED_UP",
  "RETURNED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
] as const;

const period = <T extends { pickupAt: Date; returnAt: Date }>(s: z.ZodType<T>) =>
  s.refine((v) => v.returnAt.getTime() > v.pickupAt.getTime(), {
    message: "Return must be after pick-up",
    path: ["returnAt"],
  });

// ---------------------------------------------------------------------------------------------
// Catalog / pricing
// ---------------------------------------------------------------------------------------------

export const searchSchema = period(
  z.object({
    pickupBranchId: id,
    returnBranchId: z.preprocess(emptyToUndefined, id.optional()),
    pickupAt: instant,
    returnAt: instant,
    categoryId: z.preprocess(emptyToUndefined, id.optional()),
    transmission: z.preprocess(emptyToUndefined, z.enum(transmissionValues).optional()),
    fuelType: z.preprocess(emptyToUndefined, z.enum(fuelTypeValues).optional()),
    minSeats: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(15).optional()),
    minDailyFils: z.preprocess(emptyToUndefined, filsAmount.optional()),
    maxDailyFils: z.preprocess(emptyToUndefined, filsAmount.optional()),
    featureCodes: z.array(z.string()).optional(),
    sort: z.preprocess(emptyToUndefined, z.enum(["price_asc", "price_desc", "seats", "newest"]).optional()),
  }),
);
export type SearchInput = z.input<typeof searchSchema>;

export const extraSelectionSchema = z.object({
  extraId: id,
  quantity: z.coerce.number().int().min(1).max(10).default(1),
});

export const quoteSchema = period(
  z.object({
    vehicleId: id,
    pickupBranchId: id,
    returnBranchId: id,
    pickupAt: instant,
    returnAt: instant,
    extras: z.array(extraSelectionSchema).max(20).default([]),
  }),
);
export type QuoteInput = z.input<typeof quoteSchema>;

// ---------------------------------------------------------------------------------------------
// Driver profile / reservations
// ---------------------------------------------------------------------------------------------

const storageKey = z.string().regex(/^[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_.-]+)*$/, "Invalid file reference");

export const driverProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter the driver's full name").max(120),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number"),
    dateOfBirth: day,
    nationality: optionalText(60),
    licenceNumber: z.string().trim().min(3, "Enter the licence number").max(40),
    licenceCountry: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use a 2-letter country code"),
    licenceIssuedOn: z.preprocess(emptyToUndefined, day.optional()),
    licenceExpiresOn: day,
    licenceFrontKey: z.preprocess(emptyToUndefined, storageKey.optional()),
    licenceBackKey: z.preprocess(emptyToUndefined, storageKey.optional()),
  })
  .refine((v) => ageOn(v.dateOfBirth, new Date()) >= 21, {
    message: "Drivers must be at least 21 years old",
    path: ["dateOfBirth"],
  })
  .refine((v) => v.licenceExpiresOn > new Date().toISOString().slice(0, 10), {
    message: "The licence has expired",
    path: ["licenceExpiresOn"],
  });
export type DriverProfileInput = z.input<typeof driverProfileSchema>;

export function ageOn(dateOfBirth: string, at: Date): number {
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  let age = at.getUTCFullYear() - y;
  if (at.getUTCMonth() + 1 < m || (at.getUTCMonth() + 1 === m && at.getUTCDate() < d)) age--;
  return age;
}

export const createReservationSchema = period(
  z.object({
    vehicleId: id,
    pickupBranchId: id,
    returnBranchId: id,
    pickupAt: instant,
    returnAt: instant,
    extras: z.array(extraSelectionSchema).max(20).default([]),
    idempotencyKey: z.string().trim().min(8).max(100),
    driver: driverProfileSchema.optional(),
    notes: optionalText(500),
  }),
);
export type CreateReservationInput = z.input<typeof createReservationSchema>;

export const payReservationSchema = z.object({
  reservationId: id,
  paymentMethod: z.string().trim().min(1, "Choose a payment method").max(200),
  idempotencyKey: z.string().trim().min(8).max(100),
});
export type PayReservationInput = z.input<typeof payReservationSchema>;

export const dateChangeSchema = period(z.object({ pickupAt: instant, returnAt: instant }));
export type DateChangeInput = z.input<typeof dateChangeSchema>;

export const modifyDatesSchema = period(
  z.object({
    pickupAt: instant,
    returnAt: instant,
    idempotencyKey: z.string().trim().min(8).max(100),
    paymentMethod: z.preprocess(emptyToUndefined, z.string().trim().max(200).optional()),
  }),
);
export type ModifyDatesInput = z.input<typeof modifyDatesSchema>;

export const cancelSchema = z.object({ reason: optionalText(500) });

// ---------------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const openingHoursSchema = z.union([
  z.object({ "24h": z.literal(true) }),
  z.record(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), z.tuple([hhmm, hhmm])),
]);

export const branchSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, "2-10 letters/digits"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase-words-with-dashes"),
  name: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(60),
  address: z.string().trim().min(5).max(300),
  phone: optionalText(30),
  email: z.preprocess(emptyToUndefined, z.email().optional()),
  latitude: z.preprocess(emptyToUndefined, z.coerce.number().min(-90).max(90).optional()),
  longitude: z.preprocess(emptyToUndefined, z.coerce.number().min(-180).max(180).optional()),
  timeZone: z.string().trim().refine(isValidTimeZone, "Unknown IANA time zone").default("Asia/Dubai"),
  openingHours: openingHoursSchema.default({ "24h": true }),
  isAirport: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
  imageUrl: optionalText(500),
});
export type BranchInput = z.input<typeof branchSchema>;

export const categorySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,20}$/),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().trim().min(2).max(60),
  description: optionalText(1000),
  depositFils: filsAmount,
  sortOrder: z.coerce.number().int().default(0),
});
export type CategoryInput = z.input<typeof categorySchema>;

export const vehicleSchema = z.object({
  categoryId: id,
  branchId: id,
  make: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(60),
  year: z.coerce.number().int().min(1990).max(2100),
  plate: z.string().trim().toUpperCase().min(2).max(20),
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN must be 17 characters (no I, O or Q)"),
  color: z.string().trim().min(2).max(30),
  transmission: z.enum(transmissionValues),
  fuelType: z.enum(fuelTypeValues),
  seats: z.coerce.number().int().min(1).max(15),
  doors: z.coerce.number().int().min(2).max(6).default(4),
  luggage: z.coerce.number().int().min(0).max(10).default(2),
  mileageKm: z.coerce.number().int().min(0).default(0),
  status: z.enum(vehicleStatusValues).default("AVAILABLE"),
  imageUrl: optionalText(500),
  description: optionalText(2000),
  featureCodes: z.array(z.string()).default([]),
});
export type VehicleInput = z.input<typeof vehicleSchema>;

export const maintenanceBlockSchema = z
  .object({ vehicleId: id, startsAt: instant, endsAt: instant, reason: z.string().trim().min(2).max(300) })
  .refine((v) => v.endsAt > v.startsAt, { message: "End must be after start", path: ["endsAt"] });
export type MaintenanceBlockInput = z.input<typeof maintenanceBlockSchema>;

export const pricingRuleSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    categoryId: id,
    branchId: z.preprocess(emptyToUndefined, id.optional()),
    dailyRateFils: filsAmount.refine((v) => v > 0, "Must be more than 0"),
    minDays: z.coerce.number().int().min(1).max(365).default(1),
    validFrom: z.preprocess(emptyToUndefined, day.optional()),
    validTo: z.preprocess(emptyToUndefined, day.optional()),
    priority: z.coerce.number().int().min(-1000).max(1000).default(0),
    isActive: z.coerce.boolean().default(true),
  })
  .refine((v) => !v.validFrom || !v.validTo || v.validTo >= v.validFrom, {
    message: "End date must be on or after start date",
    path: ["validTo"],
  });
export type PricingRuleInput = z.input<typeof pricingRuleSchema>;

export const extraSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{2,30}$/),
  name: z.string().trim().min(2).max(60),
  description: optionalText(500),
  chargeType: z.enum(["PER_DAY", "PER_RENTAL"]),
  priceFils: filsAmount,
  maxChargeFils: z.preprocess(emptyToUndefined, filsAmount.optional()),
  maxQuantity: z.coerce.number().int().min(1).max(10).default(1),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});
export type ExtraInput = z.input<typeof extraSchema>;

export const adminReservationFilterSchema = z.object({
  q: optionalText(100),
  status: z.preprocess(emptyToUndefined, z.enum(reservationStatusValues).optional()),
  branchId: z.preprocess(emptyToUndefined, id.optional()),
  from: z.preprocess(emptyToUndefined, instant.optional()),
  to: z.preprocess(emptyToUndefined, instant.optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type AdminReservationFilter = z.input<typeof adminReservationFilterSchema>;

export const adminCancelSchema = z.object({
  reason: z.string().trim().min(2).max(500),
  refundFils: z.preprocess(emptyToUndefined, filsAmount.optional()),
});

export const checkOutSchema = z.object({
  mileageKm: z.coerce.number().int().min(0).max(2_000_000),
  fuelEighths: z.coerce.number().int().min(0).max(8),
  notes: optionalText(1000),
});
export type CheckOutInput = z.input<typeof checkOutSchema>;

export const checkInQuoteSchema = z.object({
  returnedAt: z.preprocess(emptyToUndefined, instant.optional()),
  mileageKm: z.coerce.number().int().min(0).max(2_000_000),
  fuelEighths: z.coerce.number().int().min(0).max(8),
  chargeFuel: z.coerce.boolean().default(true),
  damageChargeFils: z.preprocess(emptyToUndefined, filsAmount.default(0)),
});
export type CheckInQuoteInput = z.input<typeof checkInQuoteSchema>;

export const checkInSchema = checkInQuoteSchema.extend({
  returnBranchId: z.preprocess(emptyToUndefined, id.optional()),
  notes: optionalText(1000),
  depositAction: z.preprocess(emptyToUndefined, z.enum(["AUTO", "RELEASE", "CAPTURE"]).default("AUTO")),
  captureFils: z.preprocess(emptyToUndefined, filsAmount.optional()),
});
export type CheckInInput = z.input<typeof checkInSchema>;

export const damageReportSchema = z.object({
  vehicleId: id,
  reservationId: z.preprocess(emptyToUndefined, id.optional()),
  stage: z.enum(["PICKUP", "RETURN", "OTHER"]).default("OTHER"),
  severity: z.enum(["MINOR", "MODERATE", "MAJOR"]),
  location: z.string().trim().min(2).max(100),
  description: z.string().trim().min(2).max(2000),
  estimatedCostFils: filsAmount.default(0),
  imageKeys: z.array(storageKey).max(20).default([]),
});
export type DamageReportInput = z.input<typeof damageReportSchema>;

export const damageReportUpdateSchema = z.object({
  status: z.enum(["OPEN", "REPAIRED", "WAIVED"]).optional(),
  severity: z.enum(["MINOR", "MODERATE", "MAJOR"]).optional(),
  description: z.string().trim().min(2).max(2000).optional(),
  estimatedCostFils: filsAmount.optional(),
  chargedFils: filsAmount.optional(),
  imageKeys: z.array(storageKey).max(20).optional(),
});
export type DamageReportUpdateInput = z.input<typeof damageReportUpdateSchema>;

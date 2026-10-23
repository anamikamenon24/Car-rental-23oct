// URL <-> trip/filters mapping shared by search, vehicle and booking pages.
// Times in the URL are branch-local wall clock ("YYYY-MM-DDTHH:mm"); pages convert them
// to UTC with the pick-up / return branch's time zone before calling server services.

import { isLocalDateTime } from "./datetime";

export type RawSearchParams = { [key: string]: string | string[] | undefined };

export type TripParams = {
  pickupBranch: string;
  returnBranch: string;
  pickupAt: string;
  returnAt: string;
};

export type FilterParams = {
  category?: string;
  transmission?: string;
  seats?: number;
  fuel?: string;
  minPrice?: number; // whole AED per day
  maxPrice?: number; // whole AED per day
  sort?: string;
};

export function one(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value === "" ? undefined : value;
}

function int(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** Returns the trip if all four fields are present and well-formed, else null. */
export function parseTrip(sp: RawSearchParams): TripParams | null {
  const pickupBranch = one(sp.pickupBranch);
  const returnBranch = one(sp.returnBranch) ?? pickupBranch;
  const pickupAt = one(sp.pickupAt);
  const returnAt = one(sp.returnAt);
  if (!pickupBranch || !returnBranch || !isLocalDateTime(pickupAt) || !isLocalDateTime(returnAt)) return null;
  return { pickupBranch, returnBranch, pickupAt, returnAt };
}

/** Partial trip for pre-filling forms. */
export function parsePartialTrip(sp: RawSearchParams): Partial<TripParams> {
  return {
    pickupBranch: one(sp.pickupBranch),
    returnBranch: one(sp.returnBranch),
    pickupAt: isLocalDateTime(one(sp.pickupAt)) ? one(sp.pickupAt) : undefined,
    returnAt: isLocalDateTime(one(sp.returnAt)) ? one(sp.returnAt) : undefined,
  };
}

export function parseFilters(sp: RawSearchParams): FilterParams {
  return {
    category: one(sp.category),
    transmission: one(sp.transmission),
    seats: int(one(sp.seats)),
    fuel: one(sp.fuel),
    minPrice: int(one(sp.minPrice)),
    maxPrice: int(one(sp.maxPrice)),
    sort: one(sp.sort),
  };
}

export function tripQuery(trip: Partial<TripParams>, extra?: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...trip, ...extra })) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Extras selection encoded as "extras=<id>:<qty>,<id>:<qty>". */
export function parseExtras(sp: RawSearchParams): { extraId: string; quantity: number }[] {
  const raw = one(sp.extras);
  if (!raw) return [];
  const out: { extraId: string; quantity: number }[] = [];
  for (const part of raw.split(",")) {
    const [extraId, q] = part.split(":");
    const quantity = Number(q ?? "1");
    if (extraId && Number.isInteger(quantity) && quantity > 0 && quantity <= 10) out.push({ extraId, quantity });
  }
  return out;
}

export function serializeExtras(extras: { extraId: string; quantity: number }[]): string | undefined {
  const s = extras
    .filter((e) => e.quantity > 0)
    .map((e) => `${e.extraId}:${e.quantity}`)
    .join(",");
  return s || undefined;
}

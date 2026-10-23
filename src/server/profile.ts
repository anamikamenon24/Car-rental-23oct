import "server-only";
import { eq } from "drizzle-orm";
import { driverProfiles, type DriverProfile } from "@/db/schema";
import { assertActor, type Actor } from "./auth";
import { db, writeAudit, type DbOrTx } from "./db";
import { DomainError, parseInput } from "./errors";
import { privateFileUrl } from "./uploads";
import { driverProfileSchema, type DriverProfileInput } from "./validation";

export interface DriverProfileDto {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  nationality: string | null;
  licenceNumber: string;
  licenceCountry: string;
  licenceIssuedOn: string | null;
  licenceExpiresOn: string;
  licenceFrontKey: string | null;
  licenceBackKey: string | null;
  licenceFrontUrl: string | null;
  licenceBackUrl: string | null;
  updatedAt: Date;
}

export function toDriverProfileDto(p: DriverProfile): DriverProfileDto {
  return {
    id: p.id,
    userId: p.userId,
    fullName: p.fullName,
    phone: p.phone,
    dateOfBirth: p.dateOfBirth,
    nationality: p.nationality,
    licenceNumber: p.licenceNumber,
    licenceCountry: p.licenceCountry,
    licenceIssuedOn: p.licenceIssuedOn,
    licenceExpiresOn: p.licenceExpiresOn,
    licenceFrontKey: p.licenceFrontKey,
    licenceBackKey: p.licenceBackKey,
    licenceFrontUrl: p.licenceFrontKey ? privateFileUrl(p.licenceFrontKey) : null,
    licenceBackUrl: p.licenceBackKey ? privateFileUrl(p.licenceBackKey) : null,
    updatedAt: p.updatedAt,
  };
}

export async function getDriverProfile(actor: Actor): Promise<DriverProfileDto | null> {
  assertActor(actor);
  const [p] = await db.select().from(driverProfiles).where(eq(driverProfiles.userId, actor.id));
  return p ? toDriverProfileDto(p) : null;
}

export async function saveDriverProfile(actor: Actor, input: DriverProfileInput): Promise<DriverProfileDto> {
  assertActor(actor);
  const data = parseInput(driverProfileSchema, input);
  return db.transaction((tx) => upsertDriverProfile(tx, actor, data));
}

export async function upsertDriverProfile(
  tx: DbOrTx,
  actor: Actor,
  data: ReturnType<typeof driverProfileSchema.parse>,
): Promise<DriverProfileDto> {
  for (const key of [data.licenceFrontKey, data.licenceBackKey]) {
    if (key && !key.startsWith(`licences/${actor.id}/`)) {
      throw new DomainError("FORBIDDEN", "Licence files must be uploaded by the same user");
    }
  }
  const [before] = await tx.select().from(driverProfiles).where(eq(driverProfiles.userId, actor.id));
  const values = {
    fullName: data.fullName,
    phone: data.phone,
    dateOfBirth: data.dateOfBirth,
    nationality: data.nationality ?? null,
    licenceNumber: data.licenceNumber,
    licenceCountry: data.licenceCountry,
    licenceIssuedOn: data.licenceIssuedOn ?? null,
    licenceExpiresOn: data.licenceExpiresOn,
    // Keep previously uploaded files when the form does not send new ones.
    licenceFrontKey: data.licenceFrontKey ?? before?.licenceFrontKey ?? null,
    licenceBackKey: data.licenceBackKey ?? before?.licenceBackKey ?? null,
  };
  const [saved] = await tx
    .insert(driverProfiles)
    .values({ userId: actor.id, ...values })
    .onConflictDoUpdate({ target: driverProfiles.userId, set: { ...values, updatedAt: new Date() } })
    .returning();
  await writeAudit(tx, {
    actor,
    action: before ? "driver_profile.updated" : "driver_profile.created",
    entityType: "driver_profile",
    entityId: saved.id,
    // Licence numbers are personal data: audit which fields changed, not their values.
    metadata: {
      changed: before ? Object.keys(values).filter((k) => String(before[k as keyof typeof before] ?? "") !== String(values[k as keyof typeof values] ?? "")) : Object.keys(values),
    },
  });
  return toDriverProfileDto(saved);
}

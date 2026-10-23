import "server-only";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { damageReports, reservations, vehicles, type DamageReport } from "@/db/schema";
import { assertAdmin, type Actor } from "../auth";
import { db, writeAudit } from "../db";
import { DomainError, parseInput, toDomainError } from "../errors";
import { privateFileUrl } from "../uploads";
import { damageReportSchema, damageReportUpdateSchema, type DamageReportInput, type DamageReportUpdateInput } from "../validation";

export interface DamageReportDto extends DamageReport {
  imageUrls: string[];
  vehicle: { make: string; model: string; plate: string };
  reservationReference: string | null;
}

export async function listDamageReports(
  actor: Actor,
  filter: { vehicleId?: string; reservationId?: string; status?: DamageReport["status"] } = {},
): Promise<DamageReportDto[]> {
  assertAdmin(actor);
  const conds: SQL[] = [];
  if (filter.vehicleId) conds.push(eq(damageReports.vehicleId, filter.vehicleId));
  if (filter.reservationId) conds.push(eq(damageReports.reservationId, filter.reservationId));
  if (filter.status) conds.push(eq(damageReports.status, filter.status));
  const rows = await db
    .select({ d: damageReports, make: vehicles.make, model: vehicles.model, plate: vehicles.plate, ref: reservations.reference })
    .from(damageReports)
    .innerJoin(vehicles, eq(vehicles.id, damageReports.vehicleId))
    .leftJoin(reservations, eq(reservations.id, damageReports.reservationId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(damageReports.createdAt));
  return rows.map((r) => ({
    ...r.d,
    imageUrls: r.d.imageKeys.map(privateFileUrl),
    vehicle: { make: r.make, model: r.model, plate: r.plate },
    reservationReference: r.ref,
  }));
}

function checkKeys(keys: string[]) {
  if (keys.some((k) => !k.startsWith("damage/"))) {
    throw new DomainError("VALIDATION", "Damage photos must be uploaded via /api/uploads/damage", { fieldErrors: { imageKeys: ["Invalid file"] } });
  }
}

export async function createDamageReport(actor: Actor, input: DamageReportInput): Promise<DamageReport> {
  assertAdmin(actor);
  const d = parseInput(damageReportSchema, input);
  checkKeys(d.imageKeys);
  try {
    return await db.transaction(async (tx) => {
      if (d.reservationId) {
        const [r] = await tx.select({ vehicleId: reservations.vehicleId }).from(reservations).where(eq(reservations.id, d.reservationId));
        if (!r) throw new DomainError("VALIDATION", "Unknown reservation", { fieldErrors: { reservationId: ["Unknown"] } });
        if (r.vehicleId !== d.vehicleId) throw new DomainError("VALIDATION", "The reservation is for a different vehicle");
      }
      const [row] = await tx
        .insert(damageReports)
        .values({
          vehicleId: d.vehicleId,
          reservationId: d.reservationId ?? null,
          reportedBy: actor.id,
          stage: d.stage,
          severity: d.severity,
          location: d.location,
          description: d.description,
          estimatedCostFils: d.estimatedCostFils,
          imageKeys: d.imageKeys,
        })
        .returning();
      await writeAudit(tx, { actor, action: "damage_report.created", entityType: "damage_report", entityId: row.id, after: row, metadata: { reservationId: d.reservationId } });
      return row;
    });
  } catch (err) {
    throw toDomainError(err);
  }
}

export async function updateDamageReport(actor: Actor, id: string, input: DamageReportUpdateInput): Promise<DamageReport> {
  assertAdmin(actor);
  const d = parseInput(damageReportUpdateSchema, input);
  if (d.imageKeys) checkKeys(d.imageKeys);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(damageReports).where(eq(damageReports.id, id)).for("update");
    if (!before) throw new DomainError("NOT_FOUND", "Damage report not found");
    const [row] = await tx.update(damageReports).set(d).where(eq(damageReports.id, id)).returning();
    await writeAudit(tx, { actor, action: "damage_report.updated", entityType: "damage_report", entityId: id, before, after: row });
    return row;
  });
}

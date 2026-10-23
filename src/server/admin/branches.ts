import "server-only";
import { asc, eq } from "drizzle-orm";
import { branches } from "@/db/schema";
import { assertAdmin, type Actor } from "../auth";
import { toBranchDto, type BranchDto } from "../catalog";
import { db, writeAudit } from "../db";
import { DomainError, parseInput, toDomainError } from "../errors";
import { branchSchema, type BranchInput } from "../validation";

/** All branches including inactive ones. */
export async function adminListBranches(actor: Actor): Promise<BranchDto[]> {
  assertAdmin(actor);
  const rows = await db.select().from(branches).orderBy(asc(branches.city), asc(branches.name));
  return rows.map(toBranchDto);
}

export async function createBranch(actor: Actor, input: BranchInput): Promise<BranchDto> {
  assertAdmin(actor);
  const data = parseInput(branchSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [b] = await tx.insert(branches).values(normalise(data)).returning();
      await writeAudit(tx, { actor, action: "branch.created", entityType: "branch", entityId: b.id, after: b });
      return toBranchDto(b);
    });
  } catch (err) {
    throw toDomainError(err);
  }
}

export async function updateBranch(actor: Actor, id: string, input: BranchInput): Promise<BranchDto> {
  assertAdmin(actor);
  const data = parseInput(branchSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(branches).where(eq(branches.id, id)).for("update");
      if (!before) throw new DomainError("NOT_FOUND", "Branch not found");
      const [b] = await tx.update(branches).set(normalise(data)).where(eq(branches.id, id)).returning();
      await writeAudit(tx, { actor, action: "branch.updated", entityType: "branch", entityId: id, before, after: b });
      return toBranchDto(b);
    });
  } catch (err) {
    throw toDomainError(err);
  }
}

function normalise(d: ReturnType<typeof branchSchema.parse>) {
  return {
    code: d.code,
    slug: d.slug,
    name: d.name,
    city: d.city,
    address: d.address,
    phone: d.phone ?? null,
    email: d.email ?? null,
    latitude: d.latitude ?? null,
    longitude: d.longitude ?? null,
    timeZone: d.timeZone,
    openingHours: d.openingHours as Record<string, unknown>,
    isAirport: d.isAirport,
    isActive: d.isActive,
    imageUrl: d.imageUrl ?? null,
  };
}

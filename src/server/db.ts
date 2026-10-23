import "server-only";
import { db, type Db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { Actor } from "./auth";

export { db };
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export type ActorType = "USER" | "SYSTEM" | "WEBHOOK";

export interface AuditEntry {
  actor?: Actor | null;
  actorType?: ActorType;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

/** Appends an audit row (inside the caller's transaction, so it commits or rolls back with the change). */
export async function writeAudit(tx: DbOrTx, e: AuditEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    actorUserId: e.actor?.id ?? null,
    actorType: e.actorType ?? (e.actor ? "USER" : "SYSTEM"),
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    before: e.before === undefined ? null : toJson(e.before),
    after: e.after === undefined ? null : toJson(e.after),
    metadata: e.metadata ?? null,
  });
}

function toJson(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val)));
}

/** Plain-object copy without undefined values (for audit before/after). */
export function pick<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}

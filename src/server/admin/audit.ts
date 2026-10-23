import "server-only";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { auditLogs, users } from "@/db/schema";
import { assertAdmin, type Actor } from "../auth";
import { db } from "../db";

export async function listAuditLogs(actor: Actor, filter: { entityType?: string; entityId?: string; limit?: number } = {}) {
  assertAdmin(actor);
  const conds: SQL[] = [];
  if (filter.entityType) conds.push(eq(auditLogs.entityType, filter.entityType));
  if (filter.entityId) conds.push(eq(auditLogs.entityId, filter.entityId));
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorType: auditLogs.actorType,
      actorUserId: auditLogs.actorUserId,
      actorEmail: users.email,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      before: auditLogs.before,
      after: auditLogs.after,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(Math.max(filter.limit ?? 100, 1), 500));
}

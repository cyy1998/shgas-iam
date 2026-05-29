import type { DbClient } from "@iam/db";
import type { AuditLogWriteDto } from "@iam/domain/audit";
import type { Json } from "drizzle-orm";
import db from "@iam/db";
import { auditLogs } from "@iam/db/schema";

export async function createAuditLog(input: AuditLogWriteDto, tx: DbClient = db) {
  const values: typeof auditLogs.$inferInsert = {
    action: input.action,
    outcome: input.outcome,
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    actorUsername: input.actorUsername,
    actorClientCode: input.actorClientCode,
    actorSystemKey: input.actorSystemKey,
    targetType: input.targetType,
    targetId: input.targetId,
    targetCode: input.targetCode,
    sourceApp: input.sourceApp,
    requestId: input.requestId,
    traceId: input.traceId,
    ip: input.ip,
    userAgent: input.userAgent,
    route: input.route,
    method: input.method,
    details: (input.details ?? {}) as Json,
  };
  if (input.eventTime !== undefined) {
    values.eventTime = input.eventTime;
  }
  await tx.insert(auditLogs).values(values);
}

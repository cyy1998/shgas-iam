import type { DbClient } from "@iam/db";
import type { AuditLogWriteDto } from "@iam/domain/audit";
import type { Json } from "drizzle-orm";
import type { AuditLogPaginationQueryDto } from "./audit.type";
import { firstRow, ilikeContainsIf } from "@iam/db/query-utils";
import { auditLogs } from "@iam/db/schema";
import { and, count, desc, eq, gte, inArray, lte, or } from "drizzle-orm";

export function createAuditRepository(db: DbClient) {
  return {
    createAuditLog(input: AuditLogWriteDto) {
      return createAuditLog(input, db);
    },
    searchAuditLogsPaged(query: AuditLogPaginationQueryDto) {
      return searchAuditLogsPaged(query, db);
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;

async function createAuditLog(input: AuditLogWriteDto, tx: DbClient) {
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

function auditLogWhere(query: AuditLogPaginationQueryDto) {
  const conditions = query.conditions;
  return and(
    conditions.action === undefined ? undefined : eq(auditLogs.action, conditions.action),
    conditions.actions === undefined ? undefined : inArray(auditLogs.action, conditions.actions),
    conditions.outcome === undefined ? undefined : eq(auditLogs.outcome, conditions.outcome),
    conditions.actorType === undefined ? undefined : eq(auditLogs.actorType, conditions.actorType),
    conditions.actorUserId === undefined ? undefined : eq(auditLogs.actorUserId, conditions.actorUserId),
    conditions.actorUsername === undefined ? undefined : eq(auditLogs.actorUsername, conditions.actorUsername),
    conditions.actorClientCode === undefined ? undefined : eq(auditLogs.actorClientCode, conditions.actorClientCode),
    conditions.actorSystemKey === undefined ? undefined : eq(auditLogs.actorSystemKey, conditions.actorSystemKey),
    conditions.actorKeyword === undefined
      ? undefined
      : or(
          ilikeContainsIf(auditLogs.actorUsername, conditions.actorKeyword),
          ilikeContainsIf(auditLogs.actorClientCode, conditions.actorKeyword),
          ilikeContainsIf(auditLogs.actorSystemKey, conditions.actorKeyword),
        ),
    conditions.targetType === undefined ? undefined : eq(auditLogs.targetType, conditions.targetType),
    conditions.targetId === undefined ? undefined : eq(auditLogs.targetId, conditions.targetId),
    conditions.targetCode === undefined ? undefined : eq(auditLogs.targetCode, conditions.targetCode),
    conditions.targetKeyword === undefined
      ? undefined
      : ilikeContainsIf(auditLogs.targetCode, conditions.targetKeyword),
    conditions.requestId === undefined ? undefined : eq(auditLogs.requestId, conditions.requestId),
    conditions.eventTimeFrom === undefined ? undefined : gte(auditLogs.eventTime, conditions.eventTimeFrom),
    conditions.eventTimeTo === undefined ? undefined : lte(auditLogs.eventTime, conditions.eventTimeTo),
  );
}

async function searchAuditLogsPaged(query: AuditLogPaginationQueryDto, tx: DbClient) {
  const where = auditLogWhere(query);
  const [rows, totalRows] = await Promise.all([
    tx
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.eventTime), desc(auditLogs.id))
      .limit(query.pageSize)
      .offset((query.pageNum - 1) * query.pageSize),
    tx.select({ value: count() }).from(auditLogs).where(where),
  ]);
  return { rows, total: firstRow(totalRows)?.value ?? 0 };
}

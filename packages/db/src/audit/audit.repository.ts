import type { AuditLogWrite } from "@iam/contracts/audit";
import type { Json } from "drizzle-orm";
import type { DbClient } from "../index";
import { auditLogs } from "../schema/log/audit-logs";

export function createAuditRepository(db: DbClient) {
  return {
    async createAuditLog(input: AuditLogWrite) {
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
      await db.insert(auditLogs).values(values);
    },
  };
}

export type AuditRepository = ReturnType<typeof createAuditRepository>;

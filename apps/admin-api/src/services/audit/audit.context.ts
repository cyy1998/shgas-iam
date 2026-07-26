import type { UnitOfWorkTransactionOptions } from "@iam/api-core/uow";
import type { AuditActorType, AuditDetails, AuditOutcome, AuditRequestContext } from "@iam/domain/audit";
import type { Context } from "hono";
import { getRequestId, getRequestIp, getTraceId } from "@iam/api-core/core/request-context";
import { pickObservabilityContext } from "@iam/api-core/observability";
import { normalizeAuditActor } from "@iam/domain/audit";

export type AuditLogInput = {
  eventTime?: Date;
  action: string;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  actorUserId?: number | null;
  actorName?: string | null;
  actorUsername?: string | null;
  actorClientCode?: string | null;
  actorSystemKey?: string | null;
  targetType: string;
  targetId?: number | null;
  targetCode?: string | null;
  targetName?: string | null;
  sourceApp?: string;
  requestId?: string | null;
  traceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  route?: string | null;
  method?: string | null;
  details?: AuditDetails;
};

export type AdminAuditContext = Pick<AuditLogInput, "actorType"> & Partial<AuditLogInput> & {
  principalSessionId?: string | null;
};

export function adminAuditTransactionOptions(auditContext?: AdminAuditContext): UnitOfWorkTransactionOptions {
  return {
    observability: pickObservabilityContext(auditContext),
  };
}

function getContextUserName(c: Context): string | null {
  const user = c.get("userDetailDto") as { name?: unknown } | undefined;
  return typeof user?.name === "string" && user.name.trim() ? user.name.trim() : null;
}

export function getAdminAuditRequestContext(c: Context): AuditRequestContext & Pick<AdminAuditContext, "principalSessionId"> {
  return {
    sourceApp: "iam-admin",
    requestId: getRequestId(c) ?? c.req.header("x-request-id") ?? null,
    traceId: getTraceId(c),
    ip: getRequestIp(c),
    userAgent: c.req.header("user-agent") ?? null,
    route: c.req.path,
    method: c.req.method,
    principalSessionId: c.get("principalSessionId") ?? null,
  };
}

export function getAdminAuditActor(c: Context) {
  return {
    ...normalizeAuditActor({
      actorType: "admin",
      actorUserId: c.get("userId") ?? null,
      actorUsername: c.get("username") ?? null,
      actorClientCode: null,
      actorSystemKey: null,
    }),
    actorName: getContextUserName(c),
  };
}

export function resolveAdminAuditContext(context?: unknown): AdminAuditContext {
  const auditContext = context as AdminAuditContext | undefined;
  if (auditContext?.actorType !== undefined) {
    return auditContext;
  }
  const hono = (context as { hono?: Context } | undefined)?.hono;
  if (!hono) {
    return {
      actorType: "system",
      actorSystemKey: "admin-api",
    };
  }
  return {
    ...getAdminAuditActor(hono),
    ...getAdminAuditRequestContext(hono),
  };
}

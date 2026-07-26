import type { AuditActorType, AuditDetails, AuditOutcome, AuditRequestContext } from "@iam/domain/audit";
import type { Context } from "hono";
import { getRequestId, getRequestIp, getTraceId } from "@iam/api-core/core/request-context";
import { normalizeAuditActor } from "@iam/domain/audit";

export type ApiRequestContext = AuditRequestContext;

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

function getContextUserName(c: Context): string | null {
  const user = c.get("userDetailDto") as { name?: unknown } | undefined;
  return typeof user?.name === "string" && user.name.trim() ? user.name.trim() : null;
}

export function getApiAuditRequestContext(c: Context): AuditRequestContext {
  return {
    sourceApp: "iam",
    requestId: getRequestId(c) ?? c.req.header("x-request-id") ?? null,
    traceId: getTraceId(c),
    ip: getRequestIp(c),
    userAgent: c.req.header("user-agent") ?? null,
    route: c.req.path,
    method: c.req.method,
  };
}

export function withApiRequestContext(
  requestContext: ApiRequestContext | null | undefined,
  input: AuditLogInput,
): AuditLogInput {
  return requestContext
    ? {
        ...requestContext,
        ...input,
      }
    : input;
}

export function getApiUserAuditActor(c: Context) {
  return {
    ...normalizeAuditActor({
      actorType: "user",
      actorUserId: c.get("userId") ?? null,
      actorUsername: c.get("username") ?? null,
      actorClientCode: null,
      actorSystemKey: null,
    }),
    actorName: getContextUserName(c),
  };
}

export function getInternalAuditActor(c: Context) {
  const clientCode = c.req.header("Client");
  return normalizeAuditActor(clientCode
    ? {
        actorType: "client",
        actorUserId: null,
        actorUsername: null,
        actorClientCode: clientCode,
        actorSystemKey: null,
      }
    : {
        actorType: "system",
        actorUserId: null,
        actorUsername: null,
        actorClientCode: null,
        actorSystemKey: "api:internal",
      });
}

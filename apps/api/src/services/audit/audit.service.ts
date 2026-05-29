import type { DbClient } from "@iam/db";
import type { AuditActorType, AuditDetails, AuditOutcome, AuditRequestContext } from "@iam/domain/audit";
import type { Context } from "hono";
import {
  AuditLogWriteDtoSchema,
  normalizeAuditActor,
  redactAuditDetails,
} from "@iam/domain/audit";
import * as auditRepository from "./audit.repository";

export type AuditLogInput = {
  eventTime?: Date;
  action: string;
  outcome: AuditOutcome;
  actorType: AuditActorType;
  actorUserId?: number | null;
  actorUsername?: string | null;
  actorClientCode?: string | null;
  actorSystemKey?: string | null;
  targetType: string;
  targetId?: number | null;
  targetCode?: string | null;
  sourceApp?: string;
  requestId?: string | null;
  traceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  route?: string | null;
  method?: string | null;
  details?: AuditDetails;
};

function getRequestIp(c: Context): string | null {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    ?? c.req.header("x-real-ip")
    ?? c.req.header("cf-connecting-ip")
    ?? null;
}

function getTraceId(c: Context): string | null {
  return c.req.header("x-trace-id")
    ?? c.req.header("x-b3-traceid")
    ?? c.req.header("traceparent")
    ?? null;
}

export function getApiAuditRequestContext(c: Context): AuditRequestContext {
  return {
    sourceApp: "api",
    requestId: c.get("requestId") ?? c.req.header("x-request-id") ?? null,
    traceId: getTraceId(c),
    ip: getRequestIp(c),
    userAgent: c.req.header("user-agent") ?? null,
    route: c.req.path,
    method: c.req.method,
  };
}

export function getApiUserAuditActor(c: Context) {
  return normalizeAuditActor({
    actorType: "user",
    actorUserId: c.get("userId") ?? null,
    actorUsername: c.get("username") ?? null,
    actorClientCode: null,
    actorSystemKey: null,
  });
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

export async function recordAuditLog(input: AuditLogInput, tx?: DbClient) {
  const actor = normalizeAuditActor({
    actorType: input.actorType,
    actorUserId: input.actorUserId ?? null,
    actorUsername: input.actorUsername ?? null,
    actorClientCode: input.actorClientCode ?? null,
    actorSystemKey: input.actorSystemKey ?? null,
  });
  const auditLog = AuditLogWriteDtoSchema.parse({
    ...input,
    ...actor,
    sourceApp: input.sourceApp ?? "api",
    targetId: input.targetId ?? null,
    targetCode: input.targetCode ?? null,
    requestId: input.requestId ?? null,
    traceId: input.traceId ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    route: input.route ?? null,
    method: input.method ?? null,
    details: redactAuditDetails(input.details),
  });
  await auditRepository.createAuditLog(auditLog, tx);
}

export async function recordAuditLogFromContext(c: Context, input: AuditLogInput, tx?: DbClient) {
  await recordAuditLog({
    ...getApiAuditRequestContext(c),
    ...input,
  }, tx);
}

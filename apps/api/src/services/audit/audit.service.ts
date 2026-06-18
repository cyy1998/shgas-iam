import type { AuditActorType, AuditDetails, AuditOutcome, AuditRequestContext } from "@iam/domain/audit";
import type { Context } from "hono";
import type { AuditRepository } from "./audit.repository";
import { getRequestIp, getTraceId } from "@iam/api-core/core/request-context";
import {
  AuditLogWriteDtoSchema,
  normalizeAuditActor,
  redactAuditDetails,
} from "@iam/domain/audit";

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

function enrichAuditDetails(input: AuditLogInput): AuditDetails {
  const details = { ...(input.details ?? {}) };
  const actorName = input.actorName
    ?? (
      input.actorType === "user"
      && input.targetType === "user"
      && input.actorUserId !== undefined
      && input.actorUserId !== null
      && input.actorUserId === input.targetId
        ? input.targetName
        : null
    );
  if (actorName) {
    details.actorName = actorName;
  }
  if (input.targetName) {
    details.targetName = input.targetName;
  }
  return details;
}

export function getApiAuditRequestContext(c: Context): AuditRequestContext {
  return {
    sourceApp: "iam",
    requestId: c.get("requestId") ?? c.req.header("x-request-id") ?? null,
    traceId: getTraceId(c),
    ip: getRequestIp(c),
    userAgent: c.req.header("user-agent") ?? null,
    route: c.req.path,
    method: c.req.method,
  };
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

export interface CreateApiAuditLogWriterDeps {
  auditRepository: Pick<AuditRepository, "createAuditLog">;
}

export function createApiAuditLogWriter(deps: CreateApiAuditLogWriterDeps) {
  async function recordAuditLog(input: AuditLogInput) {
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
      sourceApp: input.sourceApp ?? "iam",
      targetId: input.targetId ?? null,
      targetCode: input.targetCode ?? null,
      requestId: input.requestId ?? null,
      traceId: input.traceId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      route: input.route ?? null,
      method: input.method ?? null,
      details: redactAuditDetails(enrichAuditDetails(input)),
    });
    await deps.auditRepository.createAuditLog(auditLog);
  }

  async function recordAuditLogFromContext(c: Context, input: AuditLogInput) {
    await recordAuditLog({
      ...getApiAuditRequestContext(c),
      ...input,
    });
  }

  return {
    recordAuditLog,
    recordAuditLogFromContext,
  };
}

export type ApiAuditLogWriter = ReturnType<typeof createApiAuditLogWriter>;
export type AuditLogWriterPort = Pick<ApiAuditLogWriter, "recordAuditLog" | "recordAuditLogFromContext">;

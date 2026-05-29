import type { DbClient } from "@iam/db";
import type { AuditActorType, AuditDetails, AuditOutcome, AuditRequestContext } from "@iam/domain/audit";
import type { Context } from "hono";
import type { AuditLogPaginationQueryDto } from "./audit.type";
import { getRequestIp, getTraceId } from "@iam/api-core/core/request-context";
import {
  AuditLogDtoSchema,
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

export type AdminAuditContext = Pick<AuditLogInput, "actorType"> & Partial<AuditLogInput>;

export function getAdminAuditRequestContext(c: Context): AuditRequestContext {
  return {
    sourceApp: "admin-api",
    requestId: c.get("requestId") ?? c.req.header("x-request-id") ?? null,
    traceId: getTraceId(c),
    ip: getRequestIp(c),
    userAgent: c.req.header("user-agent") ?? null,
    route: c.req.path,
    method: c.req.method,
  };
}

export function getAdminAuditActor(c: Context) {
  return normalizeAuditActor({
    actorType: "admin",
    actorUserId: c.get("userId") ?? null,
    actorUsername: c.get("username") ?? null,
    actorClientCode: null,
    actorSystemKey: null,
  });
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
    sourceApp: input.sourceApp ?? "admin-api",
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
    ...getAdminAuditRequestContext(c),
    ...input,
  }, tx);
}

export async function searchAuditLogsForAdmin(query: AuditLogPaginationQueryDto) {
  const { rows, total } = await auditRepository.searchAuditLogsPaged(query);
  return {
    result: rows.map(row => AuditLogDtoSchema.parse(row)),
    total,
    pageNum: query.pageNum,
    pageSize: query.pageSize,
    pages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
}

import type { AuditActorType, AuditDetails, AuditOutcome, AuditRequestContext } from "@iam/domain/audit";
import type { Context } from "hono";
import type { AuditRepository } from "./audit.repository";
import type { AuditLogPaginationQueryDto } from "./audit.type";
import { getRequestId, getRequestIp, getTraceId } from "@iam/api-core/core/request-context";
import { expandAuditActionAliases } from "@iam/contracts";
import {
  AuditLogDtoSchema,
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

export type AdminAuditContext = Pick<AuditLogInput, "actorType"> & Partial<AuditLogInput>;

function getContextUserName(c: Context): string | null {
  const user = c.get("userDetailDto") as { name?: unknown } | undefined;
  return typeof user?.name === "string" && user.name.trim() ? user.name.trim() : null;
}

function enrichAuditDetails(input: AuditLogInput): AuditDetails {
  const details = { ...(input.details ?? {}) };
  const actorName = input.actorName
    ?? (
      input.actorType === "admin"
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

export function getAdminAuditRequestContext(c: Context): AuditRequestContext {
  return {
    sourceApp: "iam-admin",
    requestId: getRequestId(c) ?? c.req.header("x-request-id") ?? null,
    traceId: getTraceId(c),
    ip: getRequestIp(c),
    userAgent: c.req.header("user-agent") ?? null,
    route: c.req.path,
    method: c.req.method,
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

export function normalizeAuditLogQueryActions(query: AuditLogPaginationQueryDto): AuditLogPaginationQueryDto {
  const { action, actions, ...conditions } = query.conditions;
  const requestedActions = [
    action,
    ...(actions ?? []),
  ].filter((value): value is string => value !== undefined);

  if (requestedActions.length === 0) {
    return query;
  }

  return {
    ...query,
    conditions: {
      ...conditions,
      actions: expandAuditActionAliases(requestedActions),
    },
  };
}

export interface CreateAdminAuditServiceDeps {
  auditRepository: AuditRepository;
}

export function createAdminAuditService(deps: CreateAdminAuditServiceDeps) {
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
      sourceApp: input.sourceApp ?? "iam-admin",
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
      ...getAdminAuditRequestContext(c),
      ...input,
    });
  }

  async function searchAuditLogsForAdmin(query: AuditLogPaginationQueryDto) {
    const { rows, total } = await deps.auditRepository.searchAuditLogsPaged(normalizeAuditLogQueryActions(query));
    return {
      result: rows.map(row => AuditLogDtoSchema.parse(row)),
      total,
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      pages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  return {
    recordAuditLog,
    recordAuditLogFromContext,
    searchAuditLogsForAdmin,
  };
}

export type AdminAuditService = ReturnType<typeof createAdminAuditService>;
export type AuditLogWriterPort = Pick<AdminAuditService, "recordAuditLog" | "recordAuditLogFromContext">;

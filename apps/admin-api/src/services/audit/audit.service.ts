import type { AuditDetails } from "@iam/domain/audit";
import type { Context } from "hono";
import type { AuditLogInput } from "./audit.context";
import type { AuditRepository } from "./audit.repository";
import type { AuditLogPaginationQueryDto } from "./audit.type";
import {
  AuditLogDtoSchema,
  AuditLogWriteDtoSchema,
  normalizeAuditActor,
  redactAuditDetails,
} from "@iam/domain/audit";
import { getAdminAuditRequestContext } from "./audit.context";

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

function normalizeAuditLogQueryActions(query: AuditLogPaginationQueryDto): AuditLogPaginationQueryDto {
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
      actions: [...new Set(requestedActions)],
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

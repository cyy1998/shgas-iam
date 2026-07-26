import type { AuditDetails } from "@iam/domain/audit";
import type { Context } from "hono";
import type { AuditLogInput } from "./audit.context";
import type { AuditRepository } from "./audit.repository";
import {
  AuditLogWriteDtoSchema,
  normalizeAuditActor,
  redactAuditDetails,
} from "@iam/domain/audit";
import { getApiAuditRequestContext, withApiRequestContext } from "./audit.context";

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
    await recordAuditLog(withApiRequestContext(getApiAuditRequestContext(c), input));
  }

  return {
    recordAuditLog,
    recordAuditLogFromContext,
  };
}

export type ApiAuditLogWriter = ReturnType<typeof createApiAuditLogWriter>;
export type AuditLogWriterPort = Pick<ApiAuditLogWriter, "recordAuditLog" | "recordAuditLogFromContext">;

import type { AuditDetails, AuditLogInput, AuditLogWrite } from "@iam/contracts/audit";
import { AuditLogWriteSchema, normalizeAuditActor, redactAuditDetails } from "@iam/contracts/audit";

function enrichAuditDetails(input: AuditLogInput): AuditDetails {
  const details = { ...(input.details ?? {}) };
  const actorName =
    input.actorName ??
    (input.actorType === "user" &&
    input.targetType === "user" &&
    input.actorUserId !== undefined &&
    input.actorUserId !== null &&
    input.actorUserId === input.targetId
      ? input.targetName
      : null);
  if (actorName) {
    details.actorName = actorName;
  }
  if (input.targetName) {
    details.targetName = input.targetName;
  }
  return details;
}

export interface CreateAuditLogWriterDeps {
  auditRepository: { createAuditLog: (input: AuditLogWrite) => Promise<void> };
  sourceApp: string;
}

export function createAuditLogWriter(deps: CreateAuditLogWriterDeps) {
  async function recordAuditLog(input: AuditLogInput) {
    const actor = normalizeAuditActor({
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? null,
      actorUsername: input.actorUsername ?? null,
      actorClientCode: input.actorClientCode ?? null,
      actorSystemKey: input.actorSystemKey ?? null,
    });
    const auditLog = AuditLogWriteSchema.parse({
      ...input,
      ...actor,
      sourceApp: input.sourceApp ?? deps.sourceApp,
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

  return { recordAuditLog };
}

export type AuditLogWriter = ReturnType<typeof createAuditLogWriter>;

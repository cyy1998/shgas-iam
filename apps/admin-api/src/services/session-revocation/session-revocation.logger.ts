import type { LoggerPort } from "@admin-api/composition/runtime";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { CleanupFailure, RevokeSummary } from "@iam/api-core/session/kernel";
import type {
  AdminSessionProtocol,
  AdminSessionRevocationReason,
} from "./session-revocation.port";
import { SystemLogEvent } from "@iam/api-core/logger";

type SummaryLogInput = {
  event:
    | typeof SystemLogEvent.AdminSessionRevokeUser
    | typeof SystemLogEvent.AdminSessionRevokeClientProtocol
    | typeof SystemLogEvent.AdminSessionRevokeClientAllProtocols;
  auditContext?: AdminAuditContext;
  targetUserId?: number;
  clientCode?: string;
  protocol?: AdminSessionProtocol;
  reason: AdminSessionRevocationReason;
  summary: RevokeSummary;
};

export interface CreateAdminSessionRevocationLoggerDeps {
  logger: Pick<LoggerPort, "info" | "warn">;
}

export function createAdminSessionRevocationLogger(deps: CreateAdminSessionRevocationLoggerDeps) {
  function logSummary(input: SummaryLogInput) {
    const fields = toSummaryLogFields(input);
    deps.logger.info(fields, "admin session revoke summary");

    if (input.summary.cleanup.failed > 0) {
      deps.logger.warn({
        ...toBaseLogFields(input),
        event: SystemLogEvent.AdminSessionRevokeCleanupFailed,
        cleanup: summaryCounters(input.summary).cleanup,
        cleanupFailures: summarizeCleanupFailures(input.summary.cleanup.failures),
      }, "admin session revoke cleanup failed");
    }
  }

  return {
    logUserRevocation(input: Omit<SummaryLogInput, "event" | "clientCode" | "protocol">) {
      logSummary({
        ...input,
        event: SystemLogEvent.AdminSessionRevokeUser,
      });
    },

    logClientProtocolRevocation(input: Omit<SummaryLogInput, "event" | "targetUserId">) {
      logSummary({
        ...input,
        event: SystemLogEvent.AdminSessionRevokeClientProtocol,
      });
    },

    logClientAllProtocolsRevocation(input: Omit<SummaryLogInput, "event" | "targetUserId" | "protocol">) {
      logSummary({
        ...input,
        event: SystemLogEvent.AdminSessionRevokeClientAllProtocols,
      });
    },
  };
}

function toSummaryLogFields(input: SummaryLogInput) {
  return {
    ...toBaseLogFields(input),
    ...summaryCounters(input.summary),
  };
}

function toBaseLogFields(input: SummaryLogInput) {
  return {
    event: input.event,
    sourceApp: "iam-admin-api",
    requestId: input.auditContext?.requestId ?? null,
    traceId: input.auditContext?.traceId ?? null,
    actorUserId: input.auditContext?.actorUserId ?? null,
    actorUsername: input.auditContext?.actorUsername ?? null,
    targetUserId: input.targetUserId,
    clientCode: input.clientCode,
    protocol: input.protocol,
    reason: input.reason,
  };
}

function summaryCounters(summary: RevokeSummary) {
  return {
    principalSessions: summary.principalSessions,
    bindings: summary.bindings,
    credentials: summary.credentials,
    artifacts: summary.artifacts,
    cleanup: {
      attempted: summary.cleanup.attempted,
      succeeded: summary.cleanup.succeeded,
      failed: summary.cleanup.failed,
    },
  };
}

function summarizeCleanupFailures(failures: CleanupFailure[]) {
  const groups = new Map<string, { protocol: string; kind: string; error: string; count: number }>();
  for (const failure of failures) {
    const error = redactSensitiveText(failure.error);
    const key = `${failure.protocol}:${failure.kind}:${error}`;
    const group = groups.get(key) ?? {
      protocol: failure.protocol,
      kind: failure.kind,
      error,
      count: 0,
    };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

function redactSensitiveText(value: string) {
  return /authorization|cookie|password|client_?secret|secret hash|secret|token|hash/i.test(value)
    ? "[redacted]"
    : value;
}

import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { RevocationReason, RevokeSummary, SessionKernel } from "@iam/session-kernel";

export type AdminSessionProtocol = "custom-sso" | "oidc";

export type AdminSessionRevocationReason = Extract<
  RevocationReason,
  | "user_disabled"
  | "user_deleted"
  | "admin_revoke"
  | "client_disabled"
  | "client_deleted"
  | "client_protocol_disabled"
  | "client_config_changed"
>;

export type AdminSessionRevocationLogger = {
  logUserRevocation: (input: {
    targetUserId: number;
    reason: AdminSessionRevocationReason;
    auditContext?: AdminAuditContext;
    summary: RevokeSummary;
  }) => void;
  logClientProtocolRevocation: (input: {
    clientCode: string;
    protocol: AdminSessionProtocol;
    reason: AdminSessionRevocationReason;
    auditContext?: AdminAuditContext;
    summary: RevokeSummary;
  }) => void;
  logClientAllProtocolsRevocation: (input: {
    clientCode: string;
    reason: AdminSessionRevocationReason;
    auditContext?: AdminAuditContext;
    summary: RevokeSummary;
  }) => void;
};

export interface AdminSessionRevocationPort {
  prepareUserSessionRevocation: (input: {
    userId: number;
    subjectIdentifier: string;
    reason: Extract<AdminSessionRevocationReason, "user_disabled" | "user_deleted" | "admin_revoke">;
    auditContext?: AdminAuditContext;
  }) => Promise<{
    revoke: (options: { onlySubjectAccessTransitionId?: string }) => Promise<RevokeSummary>;
  }>;
  revokeUserSessions: (input: {
    userId: number;
    subjectIdentifier: string;
    reason: Extract<AdminSessionRevocationReason, "user_disabled" | "user_deleted" | "admin_revoke">;
    exceptPrincipalSessionId?: string;
    onlySubjectAccessTransitionId?: string;
    auditContext?: AdminAuditContext;
  }) => Promise<RevokeSummary>;
  revokeClientProtocol: (input: {
    clientCode: string;
    protocol: AdminSessionProtocol;
    reason: Extract<
      AdminSessionRevocationReason,
      "client_disabled" | "client_deleted" | "client_protocol_disabled" | "client_config_changed"
    >;
    auditContext?: AdminAuditContext;
  }) => Promise<RevokeSummary>;
  revokeClientAllProtocols: (input: {
    clientCode: string;
    reason: Extract<AdminSessionRevocationReason, "client_disabled" | "client_deleted" | "client_config_changed">;
    auditContext?: AdminAuditContext;
  }) => Promise<RevokeSummary>;
};

export interface CreateAdminSessionRevocationPortDeps {
  sessionKernel: Pick<SessionKernel, "prepareUserSessionRevocation" | "revokeUserSessions" | "revokeClientProtocol" | "revokeClient">;
  logger: AdminSessionRevocationLogger;
}

export function createAdminSessionRevocationPort(
  deps: CreateAdminSessionRevocationPortDeps,
): AdminSessionRevocationPort {
  return {
    async prepareUserSessionRevocation(input) {
      const plan = await deps.sessionKernel.prepareUserSessionRevocation({
        principalType: "user",
        subjectId: input.subjectIdentifier,
      });
      return {
        async revoke(options) {
          const summary = await plan.revoke(input.reason, options);
          deps.logger.logUserRevocation({
            targetUserId: input.userId,
            reason: input.reason,
            auditContext: input.auditContext,
            summary,
          });
          return summary;
        },
      };
    },
    async revokeUserSessions(input) {
      const summary = await deps.sessionKernel.revokeUserSessions(
        { principalType: "user", subjectId: input.subjectIdentifier },
        input.reason,
        {
          exceptPrincipalSessionId: input.exceptPrincipalSessionId,
          ...(input.onlySubjectAccessTransitionId === undefined
            ? {}
            : {
                onlySubjectAccessTransitionId:
                  input.onlySubjectAccessTransitionId,
              }),
        },
      );
      deps.logger.logUserRevocation({
        targetUserId: input.userId,
        reason: input.reason,
        auditContext: input.auditContext,
        summary,
      });
      return summary;
    },

    async revokeClientProtocol(input) {
      const summary = await deps.sessionKernel.revokeClientProtocol(input.clientCode, input.protocol, input.reason);
      deps.logger.logClientProtocolRevocation({
        clientCode: input.clientCode,
        protocol: input.protocol,
        reason: input.reason,
        auditContext: input.auditContext,
        summary,
      });
      return summary;
    },

    async revokeClientAllProtocols(input) {
      const summary = await deps.sessionKernel.revokeClient(input.clientCode, input.reason);
      deps.logger.logClientAllProtocolsRevocation({
        clientCode: input.clientCode,
        reason: input.reason,
        auditContext: input.auditContext,
        summary,
      });
      return summary;
    },
  };
}

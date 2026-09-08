import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { RevocationReason, RevokeSummary, SessionKernel } from "@iam/session-kernel";
import { createSubjectAccessSessionRevocation } from "@iam/api-core/subject-access";

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
  sessionKernel: Pick<SessionKernel, | "prepareUserSessionRevocationByContext"
  | "revokeUserSessionsByContext"
  | "revokePrincipalSession"
  | "revokeClientProtocol"
  | "revokeClient"
  | "revokeUserSessionRecords">;
  logger: AdminSessionRevocationLogger & {
    logPreparationFailure: (input: { errorName: string }) => void;
  };
}

/** Lifecycle mutations retain their generation boundary outside the neutral Kernel. */
export function createAdminSessionRevocationPort(
  deps: CreateAdminSessionRevocationPortDeps,
): AdminSessionRevocationPort {
  const contextRevocation = createSubjectAccessSessionRevocation(deps.sessionKernel);
  const prepare: ReturnType<typeof createSubjectAccessSessionRevocation>["prepareUserSessionRevocation"] = async (principal) => {
    try {
      return await contextRevocation.prepareUserSessionRevocation(principal);
    }
    catch (error) {
      try {
        deps.logger.logPreparationFailure({ errorName: error instanceof Error ? error.name : "Error" });
      }
      catch {
        // Diagnostics must not prevent the authoritative mutation.
      }
      return {
        async revoke(reason, options = {}) {
          if (options.onlySubjectAccessTransitionId !== undefined)
            return await contextRevocation.revokeUserSessions(principal, reason, { onlySubjectAccessTransitionId: options.onlySubjectAccessTransitionId });
          return await deps.sessionKernel.revokeUserSessionsByContext(principal, reason, []);
        },
      };
    }
  };
  const revoke = async (
    principal: { principalType: "user"; subjectId: string },
    reason: AdminSessionRevocationReason,
    options: { onlySubjectAccessTransitionId?: string; exceptPrincipalSessionId?: string },
  ) => {
    if (options.onlySubjectAccessTransitionId !== undefined)
      return await contextRevocation.revokeUserSessions(principal, reason, { onlySubjectAccessTransitionId: options.onlySubjectAccessTransitionId });
    return await deps.sessionKernel.revokeUserSessionRecords(principal, reason, { exceptPrincipalSessionId: options.exceptPrincipalSessionId });
  };
  return {
    async prepareUserSessionRevocation(input) {
      const plan = await prepare({
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
      const summary = await revoke(
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

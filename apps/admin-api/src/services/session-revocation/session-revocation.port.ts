import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { RevocationReason, RevokeSummary, SessionKernel } from "@iam/api-core/session/kernel";

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

export type OidcRuntimeInvalidationTarget = {
  id: number;
  clientCode: string;
  oidcConfigVersion: number;
};

export interface OidcRuntimeInvalidationPort {
  invalidateClient: (client: OidcRuntimeInvalidationTarget) => Promise<unknown>;
}

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
    oidcInvalidation?: OidcInvalidationSummary;
  }) => void;
  logClientAllProtocolsRevocation: (input: {
    clientCode: string;
    reason: AdminSessionRevocationReason;
    auditContext?: AdminAuditContext;
    summary: RevokeSummary;
    oidcInvalidation?: OidcInvalidationSummary;
  }) => void;
};

export type OidcInvalidationSummary = {
  attempted: boolean;
  succeeded: boolean;
  failed: boolean;
  error?: string;
};

export interface AdminSessionRevocationPort {
  revokeUserSessions: (input: {
    userId: number;
    reason: Extract<AdminSessionRevocationReason, "user_disabled" | "user_deleted" | "admin_revoke">;
    exceptPrincipalSessionId?: string;
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
    oidcInvalidationClient?: OidcRuntimeInvalidationTarget;
  }) => Promise<RevokeSummary>;
  revokeClientAllProtocols: (input: {
    clientCode: string;
    reason: Extract<AdminSessionRevocationReason, "client_disabled" | "client_deleted" | "client_config_changed">;
    auditContext?: AdminAuditContext;
    oidcInvalidationClient?: OidcRuntimeInvalidationTarget;
  }) => Promise<RevokeSummary>;
};

export interface CreateAdminSessionRevocationPortDeps {
  sessionKernel: Pick<SessionKernel, "revokeUserSessions" | "revokeClientProtocol" | "revokeClient">;
  oidcInvalidation: OidcRuntimeInvalidationPort;
  logger: AdminSessionRevocationLogger;
}

export function createAdminSessionRevocationPort(
  deps: CreateAdminSessionRevocationPortDeps,
): AdminSessionRevocationPort {
  async function invalidateOidcRuntime(
    client?: OidcRuntimeInvalidationTarget,
  ): Promise<OidcInvalidationSummary | undefined> {
    if (!client)
      return undefined;

    try {
      await deps.oidcInvalidation.invalidateClient(client);
      return { attempted: true, succeeded: true, failed: false };
    }
    catch (error) {
      return {
        attempted: true,
        succeeded: false,
        failed: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    async revokeUserSessions(input) {
      const summary = await deps.sessionKernel.revokeUserSessions(
        { principalType: "user", subjectId: String(input.userId) },
        input.reason,
        { exceptPrincipalSessionId: input.exceptPrincipalSessionId },
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
      const oidcInvalidation = await invalidateOidcRuntime(input.oidcInvalidationClient);
      const summary = await deps.sessionKernel.revokeClientProtocol(input.clientCode, input.protocol, input.reason);
      deps.logger.logClientProtocolRevocation({
        clientCode: input.clientCode,
        protocol: input.protocol,
        reason: input.reason,
        auditContext: input.auditContext,
        summary,
        oidcInvalidation,
      });
      return summary;
    },

    async revokeClientAllProtocols(input) {
      const oidcInvalidation = await invalidateOidcRuntime(input.oidcInvalidationClient);
      const summary = await deps.sessionKernel.revokeClient(input.clientCode, input.reason);
      deps.logger.logClientAllProtocolsRevocation({
        clientCode: input.clientCode,
        reason: input.reason,
        auditContext: input.auditContext,
        summary,
        oidcInvalidation,
      });
      return summary;
    },
  };
}

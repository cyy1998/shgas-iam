import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type {
  createUnifiedSubjectAccessSessionRevocation,
  UnifiedSessionRevocationSummary,
} from "@iam/api-core/subject-access";
import { AdminLoginStateUnavailableError } from "@admin-api/services/session-management/session-management.error";

/** Lifecycle callbacks must not mistake a fulfilled batch with unknown effects for completion. */
export function createUnifiedAdminLifecycleRevocation(
  revocation: ReturnType<typeof createUnifiedSubjectAccessSessionRevocation>,
  logger: { error: (fields: Record<string, unknown>, message: string) => void },
) {
  function confirmed(summary: UnifiedSessionRevocationSummary) {
    if (summary.unfinished.length > 0) {
      logger.error(
        {
          userSessionsTerminated: summary.userSessionsTerminated,
          clientSessionsTerminated: summary.clientSessionsTerminated,
          failed: summary.results.filter(result => result.status === "failed").length,
          unknown: summary.results.filter(result => result.status === "unknown").length,
        },
        "Session termination requires an explicit retry",
      );
      throw new AdminLoginStateUnavailableError();
    }
    return summary;
  }
  type UserInput = {
    userId: number;
    subjectIdentifier: string;
    reason: "user_disabled" | "user_deleted" | "admin_revoke";
    onlySubjectAccessTransitionId?: string;
    exceptPrincipalSessionId?: string;
    auditContext?: AdminAuditContext;
  };
  return {
    async revokeUserSessions(input: UserInput) {
      return confirmed(
        await revocation.revokeUserSessions({ subjectId: input.subjectIdentifier }, input.reason, input),
      );
    },
    async prepareUserSessionRevocation(input: UserInput) {
      let prepared;
      try {
        prepared = await revocation.prepareUserSessionRevocation({ subjectId: input.subjectIdentifier });
      }
      catch (error) {
        try {
          logger.error(
            { errorName: error instanceof Error ? error.name : "Error" },
            "Session revocation preparation failed; only the callback generation can be selected",
          );
        }
        catch {
          /* Diagnostics cannot prevent the authoritative account mutation. */
        }
      }
      const plan = prepared;
      return {
        async revoke(options: { onlySubjectAccessTransitionId?: string }) {
          if (plan)
            return confirmed(await plan.revoke(input.reason, options));
          if (options.onlySubjectAccessTransitionId !== undefined) {
            return confirmed(
              await revocation.revokeUserSessions(
                { subjectId: input.subjectIdentifier },
                input.reason,
                options,
              ),
            );
          }
          return confirmed(await revocation.executeCapturedSessions([]));
        },
      };
    },
    async revokeClientSessions(clientCode: string) {
      return confirmed(await revocation.revokeClientSessions(clientCode));
    },
  };
}

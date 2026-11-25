import type { SessionOrigin } from "@auth-api/services/session/session-origin";
import type { UnifiedSessionKernel, UserSessionObservation } from "@iam/session-kernel";
import type {
  createSubjectAccessOperations,
  SubjectAccessOperation,
  SubjectAccessPermission,
} from "@iam/subject-access";

type PrincipalSessionOptions = { amr?: readonly string[]; origin?: SessionOrigin };

/** The credential use cases remain the only callers that supply authenticated identity. */
export function createUserSessionAuthenticationAdapter(
  kernel: UnifiedSessionKernel<SubjectAccessOperation>,
  subjectAccess: Pick<ReturnType<typeof createSubjectAccessOperations>, "run">,
) {
  async function issuePrincipalSession(
    operation: SubjectAccessOperation,
    permission: SubjectAccessPermission,
    subjectIdentifier: string,
    options: PrincipalSessionOptions,
  ) {
    const { bearer, observation } = await kernel.forOperation(operation).createUserSession({
      subjectIdentifier,
      subjectContext: operation.getSubjectContext(permission),
      amr: [...(options.amr ?? [])],
      origin: options.origin,
    });
    return { token: bearer, observation };
  }

  return {
    async createPrincipalSession(subjectIdentifier: string, options: PrincipalSessionOptions = {}) {
      return await subjectAccess.run(async (operation) => {
        const permission = await operation.acquireForAuthentication(subjectIdentifier);
        const result = await issuePrincipalSession(operation, permission, subjectIdentifier, options);
        return { token: result.token, remainingSeconds: result.observation.remainingSeconds };
      });
    },
    async createClaimedPrincipalSession(
      subjectIdentifier: string,
      options: PrincipalSessionOptions,
      claim: () => Promise<boolean>,
      beforeDelivery: (observation: UserSessionObservation) => Promise<void>,
    ) {
      return await subjectAccess.run(async (operation) => {
        const permission = await operation.acquireForAuthentication(subjectIdentifier);
        if (!(await claim())) return null;
        const session = await issuePrincipalSession(operation, permission, subjectIdentifier, options);
        try {
          await beforeDelivery(session.observation);
        } catch (error) {
          // The claim stays consumed. A root whose bearer was never sent can be revoked exactly.
          try {
            const result = await kernel.forOperation(operation).revokeObservedUserSession(session.observation);
            if (result.status === "failed" || result.status === "unknown") {
              throw new Error("Undelivered WeChat QR session revocation was not confirmed");
            }
          } catch (cleanupError) {
            throw new AggregateError([error, cleanupError], "WeChat QR completion and session cleanup failed");
          }
          throw error;
        }
        return session;
      });
    },
  };
}

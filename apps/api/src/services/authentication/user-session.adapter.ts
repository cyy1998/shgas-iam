import type { SessionOrigin } from "@api/services/session/session-origin";
import type { createSubjectAccessOperations, SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { UnifiedSessionKernel } from "@iam/session-kernel";

/** The credential use cases remain the only callers that supply authenticated identity. */
export function createUserSessionAuthenticationAdapter(
  kernel: UnifiedSessionKernel<SubjectAccessOperation>,
  subjectAccess: Pick<ReturnType<typeof createSubjectAccessOperations>, "run">,
) {
  return {
    async createPrincipalSession(
      subjectIdentifier: string,
      options: { amr?: readonly string[]; origin?: SessionOrigin } = {},
    ) {
      return await subjectAccess.run(async (operation) => {
        const permission = await operation.acquireForAuthentication(subjectIdentifier);
        const result = await kernel.forOperation(operation).createUserSession({
          subjectIdentifier,
          subjectContext: operation.getSubjectContext(permission),
          amr: [...(options.amr ?? [])],
          origin: options.origin,
        });
        return { token: result.bearer, remainingSeconds: result.observation.remainingSeconds };
      });
    },
  };
}

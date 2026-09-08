import type { PrincipalRef, RevocationReason, SessionKernel } from "@iam/session-kernel";
import type { SubjectAccessOperation, SubjectAccessPermission } from "../operation";
import { requireSubjectAccessOperation } from "../operation";
import { encodeSubjectAccessContext } from "../subject-context";

/** The operation owns the context captured by its permission. */
export function createSubjectAccessSessionContext(
  operation: SubjectAccessOperation,
  permission: SubjectAccessPermission,
) {
  const subjectContext = requireSubjectAccessOperation(operation).getSubjectContext(permission);
  return { subjectContext };
}

/** Account generations remain owned here; Kernel only compares opaque contexts. */
export function createSubjectAccessSessionRevocation(kernel: Pick<SessionKernel, "revokePrincipalSession" | "revokeUserSessionsByContext" | "prepareUserSessionRevocationByContext">) {
  function contextFor(principal: PrincipalRef, transitionId: string) {
    return encodeSubjectAccessContext({ version: 1, subjectIdentifier: principal.subjectId, transitionId });
  }
  return {
    revokePrincipalSession: kernel.revokePrincipalSession,
    async revokeUserSessions(
      principal: PrincipalRef,
      reason: RevocationReason,
      options: { onlySubjectAccessTransitionId: string },
    ) {
      return await kernel.revokeUserSessionsByContext(principal, reason, [
        contextFor(principal, options.onlySubjectAccessTransitionId),
      ]);
    },
    async prepareUserSessionRevocation(principal: PrincipalRef) {
      const target = { ...principal };
      const prepared = await kernel.prepareUserSessionRevocationByContext(target);
      return {
        async revoke(reason: RevocationReason, options: { onlySubjectAccessTransitionId?: string } = {}) {
          return await prepared.revoke(reason, {
            includeSubjectContext: options.onlySubjectAccessTransitionId === undefined
              ? undefined
              : contextFor(target, options.onlySubjectAccessTransitionId),
          });
        },
      };
    },
  };
}

import type { UnifiedSessionKernel } from "@iam/session-kernel";
import type { createSubjectAccessOperations, SubjectAccessOperation } from "@iam/subject-access";

export function createTestUserSession(
  kernel: UnifiedSessionKernel<SubjectAccessOperation>,
  operations: ReturnType<typeof createSubjectAccessOperations>,
  subjectIdentifier: string,
) {
  return operations.run(async (operation) => {
    const permission = await operation.acquireForAuthentication(subjectIdentifier);
    const { bearer } = await kernel.forOperation(operation).createUserSession({
      subjectIdentifier,
      subjectContext: operation.getSubjectContext(permission),
      amr: ["pwd"],
    });
    return bearer;
  });
}

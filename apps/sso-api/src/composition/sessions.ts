import type { UnifiedSessionKernel } from "@iam/session-kernel";
import {
  createSubjectAccessOperations,
  type SubjectAccessOperation,
  type SubjectAccessOperationBarrierPort,
} from "@iam/subject-access";
import { createUnifiedSubjectAccessSessionRevocation } from "@iam/subject-access/session-kernel";

export function createProtocolOperations(
  kernel: UnifiedSessionKernel<SubjectAccessOperation>,
  barrier: SubjectAccessOperationBarrierPort,
) {
  const revocation = createUnifiedSubjectAccessSessionRevocation(kernel, {
    run: (callback) => operations.run(callback),
  });
  const operations: ReturnType<typeof createSubjectAccessOperations> = createSubjectAccessOperations({
    barrier,
    revocation,
  });
  return operations;
}

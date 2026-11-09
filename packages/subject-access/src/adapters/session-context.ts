import type { SubjectAccessOperation, SubjectAccessPermission } from "../operation";
import { requireSubjectAccessOperation } from "../operation";

/** The operation owns the context captured by its permission. */
export function createSubjectAccessSessionContext(
  operation: SubjectAccessOperation,
  permission: SubjectAccessPermission,
) {
  const subjectContext = requireSubjectAccessOperation(operation).getSubjectContext(permission);
  return { subjectContext };
}

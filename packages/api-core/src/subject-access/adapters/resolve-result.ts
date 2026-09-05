import { SubjectAccessDisabledError } from "../errors";

const INVALID_SUBJECT_REASONS = new Set<unknown>([
  "user_disabled",
  "user_deleted",
  "session_generation_stale",
]);

export function translateSubjectAccessResolveResult<
  T extends { readonly status: string; readonly reason?: unknown },
>(result: T): T {
  if (
    result.status === "validation_failed"
    && INVALID_SUBJECT_REASONS.has(result.reason)
  ) {
    throw new SubjectAccessDisabledError();
  }
  return result;
}

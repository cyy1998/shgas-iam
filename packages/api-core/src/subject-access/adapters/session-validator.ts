import type { ValidationResult } from "../../session/kernel";
import type { SubjectAccessBarrier } from "../barrier";
import { SubjectAccessDisabledError } from "../errors";

export interface SubjectAccessPrincipalValidationTarget {
  readonly subjectAccessTransitionId: string;
  readonly principal: {
    readonly principalType?: string;
    readonly subjectId: string;
  };
}

export function createSubjectAccessPrincipalValidator(
  barrier: Pick<
    SubjectAccessBarrier,
    "isCommittedTransitionCurrent" | "readCommittedTransitionId"
  >,
) {
  return {
    capture: async (principal: { readonly subjectId: string }) =>
      await barrier.readCommittedTransitionId(principal.subjectId),
    validate: async (
      target: SubjectAccessPrincipalValidationTarget,
    ): Promise<ValidationResult> => {
      try {
        const current = await barrier.isCommittedTransitionCurrent(
          target.principal.subjectId,
          target.subjectAccessTransitionId,
        );
        if (!current) {
          return {
            ok: false,
            reason: "session_generation_stale",
            message: "Subject session generation is stale",
          };
        }
        return { ok: true };
      }
      catch (error) {
        if (error instanceof SubjectAccessDisabledError) {
          return {
            ok: false,
            reason: "user_disabled",
            message: "Subject access is disabled",
          };
        }
        throw error;
      }
    },
  };
}

import type { RevokeSummary } from "@iam/session-kernel";

export interface SubjectAccessOperationBarrierPort {
  readCommittedTransitionId: (subjectIdentifier: string) => Promise<string>;
}

export interface SubjectAccessOperationRevocationPort {
  revokePrincipalSession: (
    principalSessionId: string,
    reason: "session_generation_stale",
  ) => Promise<RevokeSummary>;
  revokeUserSessions: (
    principal: { readonly principalType: "user"; readonly subjectId: string },
    reason: "user_disabled",
    options: { readonly onlySubjectAccessTransitionId: string },
  ) => Promise<RevokeSummary>;
}

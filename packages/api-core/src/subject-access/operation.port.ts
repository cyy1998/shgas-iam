import type { UnifiedSessionRevocationSummary } from "./adapters/unified-session";

export type SubjectAccessRevocationSummary = UnifiedSessionRevocationSummary;

export interface SubjectAccessOperationBarrierPort {
  readCommittedTransitionId: (subjectIdentifier: string) => Promise<string>;
}

export interface SubjectAccessOperationRevocationPort {
  revokePrincipalSession: (
    principalSessionId: string,
    reason: "session_generation_stale",
  ) => Promise<SubjectAccessRevocationSummary>;
  revokeUserSessions: (
    principal: { readonly principalType: "user"; readonly subjectId: string },
    reason: "user_disabled",
    options: { readonly onlySubjectAccessTransitionId: string },
  ) => Promise<SubjectAccessRevocationSummary>;
}

interface SubjectAccessRevocationTarget {
  kind: "userSession" | "clientSession";
  id: string;
  instance: string;
  userSessionId: string;
  subjectIdentifier: string;
  clientId?: string;
}

interface SubjectAccessRevocationResult {
  target: SubjectAccessRevocationTarget;
  status: "terminated" | "already_terminated" | "missing" | "expired" | "excluded" | "replaced" | "failed" | "unknown";
}

/** Only confirmed terminations count. Unfinished targets retain their original instance identity. */
export interface SubjectAccessRevocationSummary {
  userSessionsTerminated: number;
  clientSessionsTerminated: number;
  results: SubjectAccessRevocationResult[];
  unfinished: SubjectAccessRevocationTarget[];
}

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

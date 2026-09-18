import type { UserType } from "@iam/contracts";
import type { AuditRequestContext } from "@iam/domain/audit";

export interface LoginWithOaInput {
  clientCode: string;
  loginId: string;
  timestamp: string;
  token: string;
  currentSessionToken?: string;
}

export interface LoginWithOaOptions {
  requestContext?: AuditRequestContext;
}

export type LoginWithOaResult
  = | { kind: "reused"; token: string; remainingSeconds: number }
    | { kind: "authenticated"; token: string; remainingSeconds?: number; isMobileSet: boolean };

export interface OaLoginUser {
  id: number;
  subjectIdentifier: string;
  userType: UserType;
}

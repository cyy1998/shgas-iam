import type { UserType } from "@iam/contracts";
import type { AuditRequestContext } from "@iam/domain/audit";

export interface LoginWithOaInput {
  clientCode: string;
  loginId: string;
  timestamp: string;
  token: string;
}

export interface LoginWithOaOptions {
  requestContext?: AuditRequestContext;
}

export interface LoginWithOaResult {
  token: string;
  isMobileSet: boolean;
}

export interface OaLoginUser {
  id: number;
  subjectIdentifier: string;
  userType: UserType;
}

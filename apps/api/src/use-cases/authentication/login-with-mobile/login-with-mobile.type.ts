import type { AuditRequestContext } from "@iam/domain/audit";

export interface LoginWithMobileInput {
  phoneNumber: string;
  code: string;
  capToken?: string;
}

export interface LoginWithMobileOptions {
  requestContext?: AuditRequestContext;
}

export interface LoginWithMobileResult {
  token: string;
  isMobileSet: boolean;
}

export interface MobileLoginUser {
  id: number;
  subjectIdentifier: string;
  name?: string | null;
}

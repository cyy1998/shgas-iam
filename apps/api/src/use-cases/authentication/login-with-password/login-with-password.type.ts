import type { AuditRequestContext } from "@iam/domain/audit";

export interface LoginWithPasswordInput {
  username: string;
  password: string;
  capToken?: string;
}

export interface LoginWithPasswordOptions {
  requestContext?: AuditRequestContext;
}

export interface LoginWithPasswordResult {
  token: string;
  isMobileSet: boolean;
}

export interface PasswordLoginUser {
  id: number;
  subjectIdentifier: string;
  username: string;
  name?: string | null;
}

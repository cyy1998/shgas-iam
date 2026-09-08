import type { AuditRequestContext } from "@iam/domain/audit";

export interface LoginWithWechatInput {
  code: string;
}

export interface LoginWithWechatOptions {
  requestContext?: AuditRequestContext;
}

export interface LoginWithWechatResult {
  token: string;
  isMobileSet: boolean;
}

export interface WechatLoginUser {
  id: number;
  subjectIdentifier: string;
}

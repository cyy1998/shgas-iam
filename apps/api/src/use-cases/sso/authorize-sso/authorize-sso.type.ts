import type { AuditRequestContext } from "@iam/domain/audit";

export type SsoPrincipalTokenSource = "cookie" | "authorization_header" | "query" | "none";

export interface AuthorizeSsoInput {
  clientCode: string;
  globalSessionToken?: string;
  redirectUrl: string;
  tokenSource: SsoPrincipalTokenSource;
}

export interface AuthorizeSsoOptions {
  requestContext?: AuditRequestContext;
}

export type AuthorizeSsoResult
  = | { isLogin: false; code: null }
    | { isLogin: true; code: string };

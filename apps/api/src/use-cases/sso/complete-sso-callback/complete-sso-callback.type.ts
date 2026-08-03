import type { AuditRequestContext } from "@iam/domain/audit";

export interface CompleteSsoCallbackInput {
  clientCode: string;
  code: string;
  redirectUrl: string;
}

export interface CompleteSsoCallbackOptions {
  requestContext?: AuditRequestContext;
}

export interface CompleteSsoCallbackResult {
  orcasSessionId: string | null;
  state?: string;
  token: string;
}

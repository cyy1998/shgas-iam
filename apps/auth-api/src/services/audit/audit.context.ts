import { getAuditRequestContext } from "@iam/api-core/http/audit-request-context";
import type { AuditLogInput, AuditRequestContext } from "@iam/contracts/audit";
import type { Context } from "hono";

export type ApiRequestContext = AuditRequestContext;

export interface AuditLogWriterPort {
  recordAuditLog(input: AuditLogInput): Promise<void>;
}

export function getApiAuditRequestContext(c: Context): AuditRequestContext {
  return getAuditRequestContext(c, "auth-api");
}

export function withApiRequestContext(
  requestContext: ApiRequestContext | null | undefined,
  input: AuditLogInput,
): AuditLogInput {
  return requestContext
    ? {
        ...requestContext,
        ...input,
      }
    : input;
}

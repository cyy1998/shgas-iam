import { getAuditRequestContext } from "@iam/api-core/http/audit-request-context";
import type { AuditLogInput, AuditRequestContext } from "@iam/contracts/audit";
import { normalizeAuditActor } from "@iam/contracts/audit";
import type { Context } from "hono";

export type ApiRequestContext = AuditRequestContext;

export type InternalAuditActor = Pick<
  AuditLogInput,
  "actorType" | "actorUserId" | "actorUsername" | "actorClientCode" | "actorSystemKey"
>;

export interface AuditLogWriterPort {
  recordAuditLog(input: AuditLogInput): Promise<void>;
}

export function getApiAuditRequestContext(c: Context): AuditRequestContext {
  return getAuditRequestContext(c, "iam");
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

export function getInternalAuditActor(c: Context) {
  const clientCode = c.get("clientCode") as string | undefined;
  return normalizeAuditActor(
    clientCode
      ? {
          actorType: "client",
          actorUserId: null,
          actorUsername: null,
          actorClientCode: clientCode,
          actorSystemKey: null,
        }
      : {
          actorType: "system",
          actorUserId: null,
          actorUsername: null,
          actorClientCode: null,
          actorSystemKey: "api:internal",
        },
  );
}

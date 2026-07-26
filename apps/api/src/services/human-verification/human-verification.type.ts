import type { ApiRequestContext } from "@api/services/audit/audit.context";

export type HumanVerificationContext = {
  subject?: string;
  ip?: string;
  requestId?: string | null;
  traceId?: string | null;
};

export function createHumanVerificationContext(
  requestContext: Pick<ApiRequestContext, "ip" | "requestId" | "traceId"> | null | undefined,
  subject?: string,
): HumanVerificationContext {
  return {
    subject,
    ip: requestContext?.ip ?? undefined,
    requestId: requestContext?.requestId ?? null,
    traceId: requestContext?.traceId ?? null,
  };
}

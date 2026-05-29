import type { HumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import type { Context } from "hono";
import { getRequestIp } from "@iam/api-core/core/request-context";

export function getVerificationContext(c: Context, subject?: string): HumanVerificationContext {
  return {
    subject,
    ip: getRequestIp(c) ?? undefined,
  };
}

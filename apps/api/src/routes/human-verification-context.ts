import type { HumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import type { Context } from "hono";

export function getRequestIp(c: Context): string | undefined {
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor
    ?? c.req.header("x-real-ip")
    ?? c.req.header("cf-connecting-ip")
    ?? undefined;
}

export function getVerificationContext(c: Context, subject?: string): HumanVerificationContext {
  return {
    subject,
    ip: getRequestIp(c),
  };
}

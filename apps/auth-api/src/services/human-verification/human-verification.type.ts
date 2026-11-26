import type { VerificationCodeUsage } from "@auth-api/enums/verificationCode.usage";
import type { ApiRequestContext } from "@auth-api/services/audit/audit.context";

export type HumanVerificationContext = {
  subject?: string;
  imageCaptchaProof?: string;
  wechatQrRequestId?: string;
  sms?: { usage: VerificationCodeUsage; username?: string; phoneNumber?: string };
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

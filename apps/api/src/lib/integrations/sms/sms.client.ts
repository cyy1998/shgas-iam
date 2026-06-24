import type { ClockPort, RandomPort } from "@api/composition/runtime";
import { z } from "@hono/zod-openapi";
import { hmacSha256 } from "@iam/api-core/utils";

const SMSServiceResultSchema = z.object({
  resultCode: z.string(),
  resultInfo: z.string(),
  result: z.string(),
});

const SMS_SERVICE_RESULT_FALLBACK = {
  resultCode: "-1",
  resultInfo: "短信服务返回格式异常",
  result: "",
};

export interface CreateSmsClientDeps {
  clock: Pick<ClockPort, "now">;
  random: Pick<RandomPort, "integer">;
  config: {
    smsUrl: string;
    signatureKey: string;
  };
  fetch?: typeof fetch;
}

export function createSmsClient(deps: CreateSmsClientDeps) {
  const fetchFn = deps.fetch ?? fetch;

  function createSignedRequest(phoneNumber: string, message: string) {
    const currentTimestamp = Math.floor(deps.clock.now() / 1000);
    const origin = "SHGAS";
    const data = currentTimestamp.toString() + origin + phoneNumber + message;
    return {
      mobile: phoneNumber,
      message,
      timestamp: currentTimestamp,
      origin,
      signature: hmacSha256(data, deps.config.signatureKey),
    };
  }

  return {
    async sendVerificationCode(phoneNumber: string) {
      const random4Digit = deps.random.integer(1000, 10000);
      const message = `验证码：${random4Digit}`;
      const res = await fetchFn(deps.config.smsUrl, {
        method: "POST",
        body: JSON.stringify(createSignedRequest(phoneNumber, message)),
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
      });
      const smsResult = SMSServiceResultSchema
        .catch(SMS_SERVICE_RESULT_FALLBACK)
        .parse(await res.json().catch(() => null));
      if (smsResult.resultCode !== "0000") {
        return {
          success: false,
          message: smsResult.resultInfo,
          code: -1,
        };
      }
      return {
        success: true,
        message: "success",
        code: random4Digit,
      };
    },

    async sendMessage(phoneNumber: string, message: string) {
      await fetchFn(deps.config.smsUrl, {
        method: "POST",
        body: JSON.stringify(createSignedRequest(phoneNumber, message)),
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
      });
      return true;
    },
  };
}

export type SmsClient = ReturnType<typeof createSmsClient>;

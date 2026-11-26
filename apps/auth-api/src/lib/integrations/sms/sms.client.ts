import type { ClockPort, RandomPort } from "@auth-api/composition/runtime";
import { z } from "@hono/zod-openapi";
import { createSmsTransport } from "@iam/sms";

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
  const transport = createSmsTransport(deps);

  return {
    async sendVerificationCode(phoneNumber: string) {
      const signal = AbortSignal.timeout(10_000);
      const random4Digit = deps.random.integer(1000, 10000);
      const message = `验证码：${random4Digit}`;
      const res = await transport.sendMessage(phoneNumber, message, signal);
      const smsResult = SMSServiceResultSchema.catch(SMS_SERVICE_RESULT_FALLBACK).parse(
        await res.json().catch(() => null),
      );
      signal.throwIfAborted();
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
      await transport.sendMessage(phoneNumber, message);
      return true;
    },
  };
}

export type SmsClient = ReturnType<typeof createSmsClient>;

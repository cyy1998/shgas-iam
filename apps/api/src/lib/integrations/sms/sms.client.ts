import config from "@api/env";
import { z } from "@hono/zod-openapi";
import { createSingleton } from "@iam/api-core/core/singleton";
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

function createSmsClient() {
  return {
    async sendVerificationCode(phoneNumber: string) {
      const random4Digit = Math.floor(1000 + Math.random() * 9000);
      const message = `验证码：${random4Digit}`;
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const origin = "SHGAS";
      const data = currentTimestamp.toString() + origin + phoneNumber + message;
      const request_data = {
        mobile: phoneNumber,
        message,
        timestamp: currentTimestamp,
        origin,
        signature: hmacSha256(data, config.SMS_SIGNATURE_KEY),
      };
      const res = await fetch(config.SMS_URL, {
        method: "POST",
        body: JSON.stringify(request_data),
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
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const origin = "SHGAS";
      const data = currentTimestamp.toString() + origin + phoneNumber + message;
      const request_data = {
        mobile: phoneNumber,
        message,
        timestamp: currentTimestamp,
        origin,
        signature: hmacSha256(data, config.SMS_SIGNATURE_KEY),
      };
      await fetch(config.SMS_URL, {
        method: "POST",
        body: JSON.stringify(request_data),
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
      });
      return true;
    },
  };
}

const smsClient = createSingleton(
  "sms",
  createSmsClient,
);

export default smsClient;

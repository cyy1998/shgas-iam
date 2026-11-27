import { createHmac, timingSafeEqual } from "node:crypto";

export const smsBindingUsername = "e2e-wecom-sms";
export const smsBindingMobile = "13800005558";
export const smsSignatureKey = "e2e-sms";

export function createSmsStub() {
  let latestSmsCode: string | null = null;

  return {
    async handle(request: Request): Promise<Response> {
      const failure = { resultCode: "-1", resultInfo: "unexpected provider request", result: "" };
      const url = new URL(request.url);
      if (url.pathname !== "/test-sms" || request.method !== "POST") {
        return Response.json(failure, { status: 400 });
      }
      const body = await request.json().catch(() => null);
      if (
        !body ||
        typeof body !== "object" ||
        body.mobile !== smsBindingMobile ||
        body.origin !== "SHGAS" ||
        !Number.isSafeInteger(body.timestamp) ||
        typeof body.message !== "string" ||
        typeof body.signature !== "string"
      ) {
        return Response.json(failure, { status: 400 });
      }
      const code = /^验证码：(\d{4})$/u.exec(body.message)?.[1];
      const expected = createHmac("sha256", smsSignatureKey)
        .update(`${body.timestamp}${body.origin}${body.mobile}${body.message}`)
        .digest("hex");
      const actualBytes = Buffer.from(body.signature);
      const expectedBytes = Buffer.from(expected);
      if (!code || actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
        return Response.json(failure, { status: 400 });
      }

      latestSmsCode = code;
      return Response.json({ resultCode: "0000", resultInfo: "ok", result: "" });
    },
    latestCode() {
      return latestSmsCode;
    },
    reset() {
      latestSmsCode = null;
    },
  };
}

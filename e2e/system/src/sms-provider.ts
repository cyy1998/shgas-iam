import { createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";

export const smsBindingUsername = "e2e-wecom-sms";
export const smsBindingMobile = "13800005558";
export const smsDeliveryPath = "/run/iam-e2e/sms-delivery";

export function createSmsProvider(deliveryPath: string): typeof fetch {
  const request = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const candidate = new Request(input, init);
    const failure = { resultCode: "-1", resultInfo: "unexpected provider request", result: "" };
    if (candidate.url !== "http://127.0.0.1:9/test-sms" || candidate.method !== "POST") {
      return Response.json(failure, { status: 400 });
    }
    const body = await candidate.json().catch(() => null);
    if (body?.mobile !== smsBindingMobile || body.origin !== "SHGAS" || !Number.isSafeInteger(body.timestamp)) {
      return Response.json(failure, { status: 400 });
    }
    const code = /^验证码：(\d{4})$/u.exec(body.message)?.[1];
    const signature = createHmac("sha256", "e2e-sms")
      .update(`${body.timestamp}${body.origin}${body.mobile}${body.message}`)
      .digest("hex");
    if (!code || signature !== body.signature) return Response.json(failure, { status: 400 });

    await writeFile(deliveryPath, code, { encoding: "utf8", mode: 0o600 });
    return Response.json({ resultCode: "0000", resultInfo: "ok", result: "" });
  };
  return Object.assign(request, {
    preconnect() {
      throw new Error("E2E SMS provider does not open network connections");
    },
  });
}

import { expect, test } from "bun:test";
import { createSmsTransport, SmsGatewayHttpError } from "../index";

const url = "https://sms.example.test/send";
const mobile = "13800000000";
const message = "测试消息";
const options = { clock: { now: () => 1_700_000_000_987 }, config: { smsUrl: url, signatureKey: "test-key" } };

test("a non-2xx gateway response rejects even when the body reports success", async () => {
  const sms = createSmsTransport({
    ...options,
    fetch: async () => Response.json({ resultCode: "0000" }, { status: 503 }),
  });

  const [result] = await Promise.allSettled([sms.sendMessage(mobile, message)]);

  expect(result.status).toBe("rejected");
  if (result.status !== "rejected") throw new Error("Expected a gateway failure");
  expect(result.reason).toBeInstanceOf(SmsGatewayHttpError);
  expect(result.reason).toMatchObject({ status: 503 });
});

test("posts the established signed gateway request and returns the successful response", async () => {
  const gatewayResponse = Response.json({ resultCode: "0000", resultInfo: "ok", result: "" });
  const sms = createSmsTransport({
    ...options,
    fetch: async (requestUrl, init) => {
      expect(requestUrl).toBe(url);
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({ "Content-Type": "application/json", Accept: "application/json" });
      expect(JSON.parse(String(init.body))).toEqual({
        mobile,
        message,
        timestamp: 1_700_000_000,
        origin: "SHGAS",
        signature: "42b752bdde3877c503fa34b7572a825cf8fb2035f52b7b24ca7651e69f17b725",
      });
      return gatewayResponse;
    },
  });

  const response = await sms.sendMessage(mobile, message);
  expect(response).toBe(gatewayResponse);
});

test("propagates a network failure without retrying a send with an unknown outcome", async () => {
  const unreachable = new TypeError("Network failure");
  let sends = 0;
  const sms = createSmsTransport({
    ...options,
    fetch: async () => {
      sends++;
      throw unreachable;
    },
  });

  const [result] = await Promise.allSettled([sms.sendMessage(mobile, message)]);

  expect(result).toEqual({ status: "rejected", reason: unreachable });
  expect(sends).toBe(1);
});

import { expect, mock, spyOn, test } from "bun:test";
import { createSmsClient } from "./sms.client";

test("verification send aborts after its 10 second deadline and rejects a late response", async () => {
  const controller = new AbortController();
  const timeout = spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  const response = Promise.withResolvers<Response>();
  let requestSignal: AbortSignal | null | undefined;
  const fetchFn = mock(async (_input: string | URL | Request, init?: RequestInit) => {
    requestSignal = init?.signal;
    return response.promise;
  });
  const client = createSmsClient({
    clock: { now: () => 0 },
    random: { integer: () => 1234 },
    config: { smsUrl: "https://sms.example.test", signatureKey: "test" },
    fetch: Object.assign(fetchFn, { preconnect() {} }),
  });
  try {
    const pending = client.sendVerificationCode("13800000000");
    controller.abort(new DOMException("SMS timeout", "TimeoutError"));
    response.resolve(Response.json({ resultCode: "0000", resultInfo: "ok", result: "" }));
    const result = await Promise.allSettled([pending]);
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(requestSignal).toBe(controller.signal);
    expect(result[0]).toMatchObject({ status: "rejected", reason: { name: "TimeoutError" } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  }
  finally {
    timeout.mockRestore();
  }
});

import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createE2EStubsServer } from "../stubs/e2e-stubs-server.ts";
import { smsBindingMobile, smsSignatureKey } from "../stubs/sms-provider.ts";
import { createWecomAuthorizationCode, wecomCorp, wecomSecret } from "../stubs/wecom-provider.ts";

function signSmsRequest(code: string, options: { mobile?: string; origin?: string; timestamp?: number } = {}) {
  const mobile = options.mobile ?? smsBindingMobile;
  const origin = options.origin ?? "SHGAS";
  const timestamp = options.timestamp ?? 1_730_000_000;
  const message = `验证码：${code}`;
  const signature = createHmac("sha256", smsSignatureKey)
    .update(`${timestamp}${origin}${mobile}${message}`)
    .digest("hex");
  return new Request("http://e2e-stubs:8080/test-sms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mobile, origin, timestamp, message, signature }),
  });
}

describe("4-in-1 e2e-stubs server", () => {
  const token = "stubs-test-token";
  const authHeaders = { authorization: `Bearer ${token}` };

  test("serves WeCom access token and enforces single-use authorization code exchange until reset", async () => {
    const stubs = createE2EStubsServer({
      runId: "run-alpha",
      token,
      rpTerminalHtml: "<!doctype html><title>E2E RP</title>",
    });

    const tokenRes = await stubs.handleWecom(
      new Request(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${wecomCorp}&corpsecret=${wecomSecret}`),
    );
    expect(tokenRes.status).toBe(200);
    const tokenBody = (await tokenRes.json()) as { errcode: number; access_token: string };
    expect(tokenBody.errcode).toBe(0);

    const code = createWecomAuthorizationCode("member-one", "state123", "run-alpha");
    const first = await stubs.handleWecom(
      new Request(
        `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${tokenBody.access_token}&code=${encodeURIComponent(code)}`,
      ),
    );
    expect(await first.json()).toEqual({ errcode: 0, errmsg: "ok", userid: "member-one" });

    const replay = await stubs.handleWecom(
      new Request(
        `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${tokenBody.access_token}&code=${encodeURIComponent(code)}`,
      ),
    );
    expect(await replay.json()).toEqual({ errcode: 40029, errmsg: "invalid or consumed authorization code" });

    const wrongOrigin = await stubs.handleWecom(new Request("https://other.example/cgi-bin/gettoken"));
    expect(wrongOrigin.status).toBe(400);

    const resetRes = await stubs.handleHttp(
      new Request("http://127.0.0.1:8080/_stubs/reset", {
        method: "POST",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify({ runId: "run-beta" }),
      }),
    );
    expect(resetRes.status).toBe(204);

    const oldRunCode = await stubs.handleWecom(
      new Request(
        `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${tokenBody.access_token}&code=${encodeURIComponent(code)}`,
      ),
    );
    expect((await oldRunCode.json()).errcode).toBe(40029);

    const nextCode = createWecomAuthorizationCode("member-one", "state123", "run-beta");
    const accepted = await stubs.handleWecom(
      new Request(
        `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${tokenBody.access_token}&code=${encodeURIComponent(nextCode)}`,
      ),
    );
    expect(await accepted.json()).toEqual({ errcode: 0, errmsg: "ok", userid: "member-one" });
  });

  test("validates signed SMS deliveries in memory, serves authenticated readback, and clears on reset", async () => {
    const stubs = createE2EStubsServer({
      runId: "run-alpha",
      token,
      rpTerminalHtml: "<!doctype html><title>E2E RP</title>",
    });

    const unauthRead = await stubs.handleHttp(new Request("http://127.0.0.1:8080/_stubs/sms"));
    expect(unauthRead.status).toBe(401);

    const initialRead = await stubs.handleHttp(
      new Request("http://127.0.0.1:8080/_stubs/sms", { headers: authHeaders }),
    );
    expect(initialRead.status).toBe(200);
    expect(await initialRead.json()).toEqual({ code: null });

    const badSig = await stubs.handleHttp(
      new Request("http://e2e-stubs:8080/test-sms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mobile: smsBindingMobile,
          origin: "SHGAS",
          timestamp: 1_730_000_000,
          message: "验证码：8421",
          signature: "bad",
        }),
      }),
    );
    expect(badSig.status).toBe(400);

    const delivered = await stubs.handleHttp(signSmsRequest("8421"));
    expect(delivered.status).toBe(200);
    expect(await delivered.json()).toEqual({ resultCode: "0000", resultInfo: "ok", result: "" });

    const readAfterSend = await stubs.handleHttp(
      new Request("http://127.0.0.1:8080/_stubs/sms", { headers: authHeaders }),
    );
    expect(readAfterSend.status).toBe(200);
    expect(await readAfterSend.json()).toEqual({ code: "8421" });

    const unauthReset = await stubs.handleHttp(new Request("http://127.0.0.1:8080/_stubs/reset", { method: "POST" }));
    expect(unauthReset.status).toBe(401);

    const badReset = await stubs.handleHttp(
      new Request("http://127.0.0.1:8080/_stubs/reset", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ runId: "" }),
      }),
    );
    expect(badReset.status).toBe(400);

    const reset = await stubs.handleHttp(
      new Request("http://127.0.0.1:8080/_stubs/reset", { method: "POST", headers: authHeaders }),
    );
    expect(reset.status).toBe(204);

    const readAfterReset = await stubs.handleHttp(
      new Request("http://127.0.0.1:8080/_stubs/sms", { headers: authHeaders }),
    );
    expect(await readAfterReset.json()).toEqual({ code: null });
  });

  test("serves RP callback terminal HTML and health probe", async () => {
    const rpHtml = "<!doctype html><title>E2E relying party</title><body>Protocol navigation received.</body>";
    const stubs = createE2EStubsServer({ runId: "run-alpha", token, rpTerminalHtml: rpHtml });

    const health = await stubs.handleHttp(new Request("http://127.0.0.1:8080/health"));
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const rpGet = await stubs.handleHttp(new Request("http://e2e-stubs:8080/portal/e2e-rp.html?code=abc"));
    expect(rpGet.status).toBe(200);
    expect(rpGet.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await rpGet.text()).toBe(rpHtml);

    const rpHead = await stubs.handleHttp(new Request("http://e2e-stubs:8080/portal/e2e-rp.html", { method: "HEAD" }));
    expect(rpHead.status).toBe(200);
    expect(await rpHead.text()).toBe("");
  });
});

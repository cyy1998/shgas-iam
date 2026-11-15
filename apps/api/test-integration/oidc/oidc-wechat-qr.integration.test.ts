import { afterEach, expect, test } from "bun:test";
import { ApiErrorCode, UserType, WechatQrStartResponseSchema } from "@iam/contracts";
import { resetApiRedisTestDatabase } from "../support/fixture-lifecycle";
import { fixture } from "./oidc.fixture";

afterEach(resetApiRedisTestDatabase);

async function setup(parameters: Record<string, string> = { prompt: "login" }) {
  const f = await fixture(undefined, false, undefined, undefined, undefined, true, undefined, true, false, {
    wechatQr: true,
    admission: { evaluate: async () => "no-match" },
  });
  return {
    ...f,
    async start() {
      f.setEntry("internal");
      const authorize = await f.authorize(parameters);
      expect(authorize.status).toBe(302);
      const login = new URL(authorize.headers.get("Location")!, f.issuers.internal);
      const guard = await f.request(`/oidc/login-guard?${login.searchParams}`);
      expect(await guard.json()).toEqual({ decision: "login", wechatQr: true });
      const begin = async () => await f.request(`/oidc/wechat-qr?${login.searchParams}`, { method: "POST" });
      const started = await begin();
      const { data: qr } = WechatQrStartResponseSchema.parse(await started.json());
      if (qr.decision !== "scan") throw new Error("Expected the internal browser to receive a QR request");
      const complete = async (headers?: Record<string, string>) =>
        await f.request(`/oidc/wechat-qr/${qr.requestId}/complete?${login.searchParams}`, { method: "POST", headers });
      const resume = async () => {
        const response = await f.request(`/oidc/resume?${login.searchParams}`);
        expect(response.status).toBe(303);
        return new URL(response.headers.get("Location")!);
      };
      const confirm = async () => {
        const headers = { "X-IAM-Entry-Network": "external", "X-Forwarded-Proto": "https" };
        const mobile = await f.app.request(qr.mobileUrl, { headers });
        const provider = new URL(mobile.headers.get("Location")!);
        const callback = new URL(provider.searchParams.get("redirect_uri")!);
        callback.search = new URLSearchParams({
          code: "wx-code",
          state: provider.searchParams.get("state")!,
        }).toString();
        const returned = await f.app.request(callback, {
          headers: { ...headers, Cookie: mobile.headers.getSetCookie()[0]!.split(";")[0]! },
        });
        expect(returned.status).toBe(303);
        expect(returned.headers.get("set-cookie")).not.toContain("global_session");
        const flow = new URL(returned.headers.get("Location")!, callback).pathname.split("/").at(-1)!;
        const confirmed = await f.app.request(new URL("/sso/wechat-qr/mobile/decision", callback), {
          method: "POST",
          headers: {
            ...headers,
            Cookie: returned.headers
              .getSetCookie()
              .find((cookie) => cookie.startsWith("__Host-wecom_confirm_"))!
              .split(";")[0]!,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ flow, action: "confirm" }),
        });
        expect(confirmed.status).toBe(200);
        expect(confirmed.headers.get("set-cookie")).not.toContain("global_session");
      };
      return { begin, complete, confirm, resume, query: login.searchParams };
    },
  };
}

test("OIDC QR completion requires the original binding and recovers the fresh login using the delivered cookies", async () => {
  const f = await setup();
  try {
    const qr = await f.start();
    const guardProof = f.cookies.get("oidc_login_completion");
    await qr.confirm();
    const external = await qr.complete({ "X-IAM-Entry-Network": "external" });
    expect(external.status).toBe(404);
    const wrongBrowser = await qr.complete({ Cookie: "oidc_interaction_binding=wrong" });
    expect(wrongBrowser.status).toBe(400);
    expect(wrongBrowser.headers.getSetCookie()).toEqual([]);
    const wrongIssuer = await f.request(`/oidc/resume?${qr.query}`, {
      headers: { "X-IAM-Entry-Network": "external" },
    });
    expect(wrongIssuer.status).toBe(400);

    const delivered = await qr.complete();
    expect(delivered.status).toBe(200);
    expect(await delivered.json()).toEqual({ code: 200, message: "success", data: { decision: "continue" } });
    expect(delivered.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^global_session=.+; Max-Age=\d+; Path=\/; HttpOnly; Secure; SameSite=Lax$/u),
    ]);
    expect(f.cookies.get("oidc_login_completion")).toBe(guardProof);

    // The root Cookie alone proves that this exact QR login reached the browser.
    f.cookies.delete("oidc_login_completion");
    const recovered = await qr.complete();
    expect(await recovered.json()).toEqual({ code: 200, message: "success", data: { decision: "continue" } });
    expect(recovered.headers.getSetCookie()).toEqual([]);
    const callback = await qr.resume();
    expect(callback.origin + callback.pathname).toBe("https://rp.example/callback");
    expect(callback.searchParams.get("state")).toBe("rp-state");
    expect(callback.searchParams.get("iss")).toBe(f.issuers.internal);
    expect(callback.searchParams.get("code")).toBeTruthy();
  } finally {
    await f.close();
  }
});

test("OIDC QR completion lost without Set-Cookie requires a new scan and keeps the fresh proof tied to its exact root", async () => {
  const f = await setup({ max_age: "0" });
  try {
    const qr = await f.start();
    await qr.confirm();
    const delivered = await qr.complete();
    expect(delivered.status).toBe(200);
    const exactRoot = f.cookies.get("global_session");
    expect(exactRoot).toBeTruthy();
    f.cookies.delete("global_session");
    const retry = await qr.complete();
    expect(await retry.json()).toMatchObject({ data: { decision: "restart" } });
    expect(retry.headers.getSetCookie()).toEqual([]);

    // The other login establishes a different UserSession for the very same IAM user.
    const otherRoot = await f.login();
    expect(otherRoot).not.toBe(exactRoot);
    const otherRecovery = await qr.complete();
    expect(await otherRecovery.json()).toMatchObject({ data: { decision: "continue" } });
    expect(otherRecovery.headers.getSetCookie()).toEqual([]);
    const rejected = await qr.resume();
    expect(rejected.searchParams.get("error")).toBe("login_required");
    expect(rejected.searchParams.get("code")).toBeNull();
    expect(f.cookies.get("global_session")).toBe(otherRoot);

    f.cookies.set("global_session", exactRoot!);
    const recovered = await qr.resume();
    expect(recovered.searchParams.get("code")).toBeTruthy();
  } finally {
    await f.close();
  }
});

for (const endpoint of ["start", "complete"] as const) {
  test(`OIDC QR ${endpoint} preserves the existing root and retires the old guard proof`, async () => {
    const f = await setup();
    try {
      const qr = await f.start();
      await qr.confirm();
      const otherRoot = await f.login();
      const continued = endpoint === "start" ? await qr.begin() : await qr.complete();
      expect(await continued.json()).toMatchObject({ data: { decision: "continue" } });
      expect(continued.headers.getSetCookie()).toEqual([]);
      const callback = await qr.resume();
      expect(callback.searchParams.get("error")).toBe("login_required");
      expect(callback.searchParams.get("code")).toBeNull();
      expect(f.cookies.get("global_session")).toBe(otherRoot);
    } finally {
      await f.close();
    }
  });
}

for (const method of ["password", "mobile"] as const) {
  test(`OIDC ${method} first login still completes after a QR delivery was lost`, async () => {
    const f = await setup();
    try {
      const qr = await f.start();
      await qr.confirm();
      const delivered = await qr.complete();
      expect(delivered.status).toBe(200);
      f.cookies.delete("global_session");
      const restart = await qr.complete();
      expect(await restart.json()).toMatchObject({ data: { decision: "restart" } });
      if (method === "password") {
        await f.login();
      } else {
        const login = await f.request("/auth/login/mobile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: "17721462865", code: "sms-code" }),
        });
        expect(login.status).toBe(200);
      }
      const callback = await qr.resume();
      expect(callback.searchParams.get("code")).toBeTruthy();
    } finally {
      await f.close();
    }
  });
}

test("OIDC QR preserves temporary login restriction and application admission rejection", async () => {
  const f = await setup({ prompt: "login", response_mode: "fragment" });
  try {
    const qr = await f.start();
    await qr.confirm();
    f.state.restricted = true;
    const restricted = await qr.complete();
    expect(restricted.status).toBe(400);
    expect(await restricted.json()).toMatchObject({
      code: ApiErrorCode.LoginFailed,
      message: expect.stringContaining("账号已被临时限制"),
    });
    expect(restricted.headers.getSetCookie()).toEqual([]);
    f.state.restricted = false;
    await f.setClient((client) => ({
      ...client,
      admissionEnabled: true,
      admissionFilter: { field: "userType", op: "eq", value: UserType.Formal },
    }));
    const completed = await qr.complete();
    expect(completed.status).toBe(200);
    const root = f.cookies.get("global_session");
    expect(root).toBeTruthy();
    const callback = await qr.resume();
    expect(callback.origin + callback.pathname).toBe("https://rp.example/callback");
    expect(Object.fromEntries(new URLSearchParams(callback.hash.slice(1)))).toMatchObject({
      error: "access_denied",
      error_uri: `${new URL(f.issuers.internal).origin}/portal/application-access-denied?client=${f.clientId}`,
      iss: f.issuers.internal,
      state: "rp-state",
    });
    expect(f.cookies.get("global_session")).toBe(root);
  } finally {
    await f.close();
  }
});

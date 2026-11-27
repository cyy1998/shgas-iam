import { ApiErrorCode, IMAGE_CAPTCHA_TICKET_HEADER, LoginPageGuardDecision } from "@iam/contracts";
import { HttpResponse, http } from "msw";

export function ok<T>(data: T) {
  return HttpResponse.json({ code: 200, message: "OK", data });
}

export function serviceFailure(status: number, code: ApiErrorCode, message: string, headers?: HeadersInit) {
  return HttpResponse.json({ code, message, data: null }, { status, headers });
}

export function requireImageCaptcha() {
  return serviceFailure(400, ApiErrorCode.HumanVerificationRequired, "需要人机校验", {
    [IMAGE_CAPTCHA_TICKET_HEADER]: "test-ticket",
  });
}

export function mockImageCaptchaFallback() {
  const capAttempts: { method: string; action: string | null }[] = [];
  const handlers = [
    http.post("*/api/iam/auth/captcha/cap/:site/challenge", ({ request }) => {
      capAttempts.push({ method: request.method, action: request.headers.get("x-cap-action") });
      return HttpResponse.json({}, { status: 503 });
    }),
    http.post("*/api/iam/auth/captcha/image/challenge", () =>
      ok({
        challengeId: "test-challenge",
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
      }),
    ),
    http.post<never, { answer: string }>("*/api/iam/auth/captcha/image/answer", async ({ request }) =>
      ok(
        (await request.json()).answer === "AC9TV3"
          ? { result: "verified", proof: "test-proof" }
          : { result: "incorrect" },
      ),
    ),
  ];
  return { capAttempts, handlers };
}

export function mockLoginGuard(mode: "login" | "continue" | "unavailable-then-login", wechatQr = false) {
  const requests: URL[] = [];
  const handler = http.get("*/sso/login-guard", ({ request }) => {
    requests.push(new URL(request.url));
    if (mode === "unavailable-then-login" && requests.length === 1) {
      return HttpResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
    }
    return ok({
      decision: mode === "continue" ? LoginPageGuardDecision.Continue : LoginPageGuardDecision.Login,
      wechatQr,
    });
  });
  return { requests, handler };
}

export const passwordLoginFailure = http.post("*/api/iam/auth/login/password", () =>
  serviceFailure(400, ApiErrorCode.LoginFailed, "账号或密码错误"),
);

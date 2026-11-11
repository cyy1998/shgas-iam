import { ApiErrorCode, ClientStatus, IMAGE_CAPTCHA_TICKET_HEADER, LoginPageGuardDecision } from "@iam/contracts";
// Mock-backend fixtures owned by the browser Integration collection.
import type { Page, Route } from "@playwright/test";
import { authenticationConfig, resetPasswordMaskedMobile } from "../test/mocks/fixtures";

type SsoMockOptions = {
  loginGuard?: "continue" | "login" | "unavailable-then-login";
  passwordLogin?: "success" | "failure";
};

function ok<T>(data: T) {
  return { code: 200, message: "OK", data };
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    contentType: "application/json",
    json: data,
    status,
  });
}

export function requireImageCaptcha(route: Route) {
  return route.fulfill({
    status: 400,
    headers: { [IMAGE_CAPTCHA_TICKET_HEADER]: "test-ticket" },
    json: { code: ApiErrorCode.HumanVerificationRequired, message: "需要人机校验", data: null },
  });
}

export async function mockImageCaptchaFallback(page: Page) {
  await page.route("**/open/cap/*/challenge", (route) => route.fulfill({ status: 503, json: {} }));
  await page.route("**/open/image-captcha/challenge", (route) =>
    fulfillJson(
      route,
      ok({
        challengeId: "test-challenge",
        imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4AWP4DwQACfsD/c8LaHIAAAAASUVORK5CYII=",
      }),
    ),
  );
  await page.route("**/open/image-captcha/answer", (route) =>
    fulfillJson(
      route,
      ok(
        route.request().postDataJSON().answer === "AC9TV3"
          ? { result: "verified", proof: "test-proof" }
          : { result: "incorrect" },
      ),
    ),
  );
}

export async function mockSsoApi(page: Page, options: SsoMockOptions = {}) {
  const passwordLogin = options.passwordLogin ?? "success";
  const loginGuard = options.loginGuard ?? "login";
  let loginGuardAttempts = 0;

  await page.route("**/sso/login-guard?**", (route) => {
    loginGuardAttempts += 1;
    if (loginGuard === "unavailable-then-login" && loginGuardAttempts === 1) {
      return fulfillJson(route, { error: "temporarily_unavailable" }, 503);
    }
    return fulfillJson(
      route,
      ok({
        decision: loginGuard === "continue" ? LoginPageGuardDecision.Continue : LoginPageGuardDecision.Login,
      }),
    );
  });

  await page.route("**/sso/.well-known/authentication-configuration", (route) =>
    fulfillJson(route, ok(authenticationConfig)),
  );
  await page.route("**/auth/login/password", (route) => {
    if (passwordLogin === "failure") {
      return fulfillJson(
        route,
        {
          code: ApiErrorCode.LoginFailed,
          message: "账号或密码错误",
          data: null,
        },
        400,
      );
    }
    return fulfillJson(route, ok({ isMobileSet: true }));
  });
  await page.route("**/auth/login/mobile", (route) => fulfillJson(route, ok({ isMobileSet: true })));
  await page.route("**/auth/logout", (route) => fulfillJson(route, ok(null)));
  await page.route("**/open/client/status?**", (route) =>
    fulfillJson(
      route,
      ok({
        clientCode: new URL(route.request().url()).searchParams.get("clientCode"),
        clientName: "IAM 管理后台",
        status: ClientStatus.Enable,
        url: null,
      }),
    ),
  );
  await page.route("**/open/code/send", (route) => fulfillJson(route, ok(null)));
  await page.route("**/open/code/verify", (route) => fulfillJson(route, ok({ result: true })));
  await page.route("**/open/password/reset", (route) => fulfillJson(route, ok(null)));
  await page.route("**/open/users/*/masked-mobile**", (route) => fulfillJson(route, ok(resetPasswordMaskedMobile)));
  await page.route("**/public/mobile/set", (route) => fulfillJson(route, ok(null)));
}

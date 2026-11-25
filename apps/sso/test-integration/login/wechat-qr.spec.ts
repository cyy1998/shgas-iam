import { expect, type Request, test } from "@playwright/test";
import { mockSsoApi } from "../fixtures";

const requestId = "a".repeat(48);
const customSso = {
  protocol: "custom_sso",
  client: "iam-admin",
  redirectUrl: "https://business.example/callback%2Ftenant?keep=a%26b",
  state: "opaque & state",
  ssoReturn: "b".repeat(43),
};
const oidc = { protocol: "oidc", oidcReturn: "c".repeat(43) };

for (const { continuation, guardPath, resumePath, bindingCookie } of [
  {
    continuation: customSso,
    guardPath: "/sso/login-guard",
    resumePath: "/sso/authorize",
    bindingCookie: "custom_sso_continuation",
  },
  {
    continuation: oidc,
    guardPath: "/oidc/login-guard",
    resumePath: "/oidc/resume",
    bindingCookie: "oidc_interaction_binding",
  },
]) {
  test(`WeCom QR completes and resumes the original ${continuation.protocol} request`, async ({ page }) => {
    const originalQuery = new URLSearchParams(continuation);
    originalQuery.delete("protocol");
    const observed: Request[] = [];
    await mockSsoApi(page);

    await page.route(
      (url) => url.pathname === guardPath,
      (route) => {
        const decision = { decision: "login", wechatQr: true };
        return route.fulfill({
          json: continuation.protocol === "oidc" ? decision : { code: 200, data: decision },
          headers: { "set-cookie": `${bindingCookie}=browser-bound; Path=/; HttpOnly; SameSite=Lax` },
        });
      },
    );

    await page.route(/\/wechat-qr(?:\?|\/)/u, (route) => {
      const request = route.request();
      observed.push(request);
      const path = new URL(request.url()).pathname;
      if (path.endsWith("/events")) {
        return route.fulfill({ contentType: "text/event-stream", body: 'data: {"status":"confirmed"}\n\n' });
      }
      if (path.endsWith("/complete")) {
        return route.fulfill({ json: { data: { decision: "continue" } } });
      }
      return route.fulfill({
        json: {
          data: {
            decision: "scan",
            requestId,
            expiresAt: Date.now() + 300_000,
            mobileUrl: "https://wecom.example.test/scan",
          },
        },
      });
    });
    await page.route(
      (url) => url.pathname === resumePath,
      (route) => route.fulfill({ body: "Resumed" }),
    );

    await page.goto(`/portal/login?${originalQuery}`);
    await page.getByRole("button", { name: "企业微信扫码登录" }).click({ timeout: 10_000 });
    await page.waitForURL((url) => url.pathname === resumePath, { timeout: 10_000 });

    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(Object.fromEntries(originalQuery));
    expect(observed.map((request) => [request.method(), new URL(request.url()).pathname])).toEqual([
      ["POST", "/api/iam/auth/wechat-qr"],
      ["GET", `/api/iam/auth/wechat-qr/${requestId}/events`],
      ["POST", `/api/iam/auth/wechat-qr/${requestId}/complete`],
    ]);
    for (const request of observed) {
      expect(Object.fromEntries(new URL(request.url()).searchParams)).toEqual(continuation);
      const cookie = await request.headerValue("cookie");
      expect(cookie).toContain(`${bindingCookie}=browser-bound`);
    }
  });
}

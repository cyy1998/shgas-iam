import { expect, test } from "@playwright/test";
import { z } from "zod";
import { startBrowserFixture } from "./fixture-process";

test("two business hostnames receive derived callbacks and isolated host-only Cookies through Host rewriting", async ({ page, context }) => {
  const running = await startBrowserFixture("test-integration/browser/custom-sso-server.fixture.ts");
  try {
    const f = z.object({ iamOrigin: z.url(), businessOrigins: z.array(z.url()), redirectUrls: z.array(z.url()), token: z.string() })
      .parse(JSON.parse(running.ready));
    await context.addCookies([{ name: "global_session", value: f.token, url: f.iamOrigin, httpOnly: true, sameSite: "Lax" }]);
    for (const [index, businessOrigin] of f.businessOrigins.entries()) {
      const redirectUrl = f.redirectUrls[index]!;
      const query = new URLSearchParams({ client: "iam", redirectUrl, state: "original-state" });
      const response = await page.goto(`${f.iamOrigin}/sso/authorize?${query}`);
      expect(response?.status()).toBe(200);
      const destination = new URL(page.url());
      expect(destination.origin + destination.pathname).toBe(new URL(redirectUrl).origin + new URL(redirectUrl).pathname);
      expect(destination.searchParams.get("state")).toBe("original-state");
      const token = destination.searchParams.get("token");
      expect(token).toBeTruthy();
      const receipt = await response!.json();
      const callback = new URLSearchParams(receipt.callbackQuery);
      expect(callback.has("tenant")).toBe(false);
      expect(callback.has("state")).toBe(false);
      expect(callback.get("redirectUrl")).toBe(redirectUrl);
      expect(receipt.cookie).toContain(`local_iam_session=${token}`);
      expect(receipt.cookie).not.toContain("global_session");
      const businessCookies = await context.cookies(businessOrigin);
      expect(businessCookies.find(cookie => cookie.name === "local_iam_session")).toMatchObject({
        value: token,
        domain: new URL(businessOrigin).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      });
      const otherOrigin = f.businessOrigins[1 - index]!;
      const otherCookies = await context.cookies(otherOrigin);
      expect(otherCookies.some(cookie => cookie.value === token)).toBe(false);
      expect(destination.searchParams.get("order")).toBe("123");
    }
    const iamCookies = await context.cookies(f.iamOrigin);
    expect(iamCookies.some(cookie => cookie.name === "local_iam_session")).toBe(false);
  }
  finally {
    await running.close();
  }
});

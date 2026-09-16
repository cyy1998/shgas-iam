import { expect, test } from "@playwright/test";
import { z } from "zod";
import { startBrowserFixture } from "./fixture-process";

test("business proxy receives fixed callback and host-only Custom Cookie from the real IAM handler", async ({ page, context }) => {
  const running = await startBrowserFixture("test-integration/browser/custom-sso-server.fixture.ts");
  try {
    const f = z.object({ iamOrigin: z.url(), businessOrigin: z.url(), redirectUrl: z.url(), token: z.string() })
      .parse(JSON.parse(running.ready));
    await context.addCookies([{ name: "global_session", value: f.token, url: f.iamOrigin, httpOnly: true, sameSite: "Lax" }]);
    const query = new URLSearchParams({ client: "iam", redirectUrl: f.redirectUrl, state: "original-state" });
    const response = await page.goto(`${f.iamOrigin}/sso/authorize?${query}`);
    expect(response?.status()).toBe(200);
    const destination = new URL(page.url());
    expect(destination.origin + destination.pathname).toBe(f.redirectUrl);
    expect(destination.searchParams.get("state")).toBe("original-state");
    const token = destination.searchParams.get("token");
    expect(token).toBeTruthy();
    const receipt = await response!.json();
    const callback = new URLSearchParams(receipt.callbackQuery);
    expect(callback.get("tenant")).toBe("fixed");
    expect(callback.has("state")).toBe(false);
    expect(callback.get("redirectUrl")).toBe(f.redirectUrl);
    expect(receipt.cookie).toContain(`local_iam_session=${token}`);
    expect(receipt.cookie).not.toContain("global_session");
    const businessCookies = await context.cookies(f.businessOrigin);
    expect(businessCookies.find(cookie => cookie.name === "local_iam_session")).toMatchObject({
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    });
    const iamCookies = await context.cookies(f.iamOrigin);
    expect(iamCookies.some(cookie => cookie.name === "local_iam_session")).toBe(false);
  }
  finally {
    await running.close();
  }
});

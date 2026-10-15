import { expect, test } from "@playwright/test";
import { startOidcBrowserFixture } from "./oidc-browser.fixture";

// The browser exercises the API adapter; a real Gateway owns this header in system E2E.
test.use({ extraHTTPHeaders: { "X-IAM-Entry-Network": "external" } });

test("real candidate browser cancels without logout, then confirms with bound state and root termination", async ({
  page,
  context,
}) => {
  const f = await startOidcBrowserFixture();
  try {
    await context.addCookies([
      { name: "global_session", value: f.token, url: f.origin, httpOnly: true, sameSite: "Lax" },
    ]);
    const parameters = new URLSearchParams({
      client_id: f.clientId,
      id_token_hint: f.id_token,
      post_logout_redirect_uri: f.logoutUri,
      state: "browser-state",
    });
    await page.goto(`${f.origin}/oidc/session/end?${parameters}`);
    await page.getByRole("button", { name: "No, stay signed in" }).click();
    await expect(page).toHaveURL(`${f.logoutUri}?state=browser-state`);
    expect((await context.cookies(f.origin)).find((value) => value.name === "global_session")?.value).toBe(f.token);
    expect(
      (
        await context.request.get(`${f.origin}/oidc/me`, {
          headers: { Authorization: `Bearer ${f.access_token}` },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`${f.origin}/oidc/session/end?${parameters}`);
    await page.getByRole("button", { name: "Yes, sign me out" }).click();
    await expect(page).toHaveURL(`${f.logoutUri}?state=browser-state`);
    expect((await context.cookies(f.origin)).some((value) => value.name === "global_session")).toBe(false);
    expect(
      (
        await context.request.get(`${f.origin}/oidc/me`, {
          headers: { Authorization: `Bearer ${f.access_token}` },
        })
      ).status(),
    ).toBe(401);
  } finally {
    await f.close();
  }
});

test("browser rejects tampered CSRF and unsafe redirects locally while preserving the session", async ({
  page,
  context,
}) => {
  const f = await startOidcBrowserFixture();
  try {
    await context.addCookies([
      { name: "global_session", value: f.token, url: f.origin, httpOnly: true, sameSite: "Lax" },
    ]);
    await page.goto(`${f.origin}/oidc/session/end`);
    await page.locator('input[name="xsrf"]').evaluate((element) => {
      if (element instanceof HTMLInputElement) element.value = "invalid";
    });
    await page.getByRole("button", { name: "Yes, sign me out" }).click();
    await expect(page.locator("body")).toContainText("invalid_request");
    expect(page.url()).toBe(`${f.origin}/oidc/session/end/confirm`);
    const bad = new URLSearchParams({
      id_token_hint: f.id_token,
      post_logout_redirect_uri: "https://evil.example",
    });
    await page.goto(`${f.origin}/oidc/session/end?${bad}`);
    await expect(page.locator("body")).toContainText("invalid_request");
    expect((await context.cookies(f.origin)).find((value) => value.name === "global_session")?.value).toBe(f.token);
    expect(
      (
        await context.request.get(`${f.origin}/oidc/me`, {
          headers: { Authorization: `Bearer ${f.access_token}` },
        })
      ).status(),
    ).toBe(200);
  } finally {
    await f.close();
  }
});

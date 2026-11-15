import { randomUUID } from "node:crypto";
import { devices, expect } from "@playwright/test";
import { loginToAdmin } from "./src/admin-client-journey.ts";
import { requireEnvironment } from "./src/environment.ts";
import { test } from "./src/gateway-test.ts";
import { standInForWecomAuthorization } from "./src/wecom-journey.ts";
import { wecomUnboundMember, wecomUnlinkMember } from "./src/wecom-provider.ts";

test("WeCom confirmation on the public phone updates the originating internal browser", async ({
  browser,
  page,
  request,
}) => {
  const desktopOrigin = requireEnvironment("IAM_E2E_INTERNAL_ORIGIN");
  const mobileOrigin = requireEnvironment("IAM_E2E_WECHAT_QR_MOBILE_ORIGIN");
  const client = requireEnvironment("IAM_E2E_CUSTOM_CLIENT_CODE");
  const destination = `${desktopOrigin}/e2e/custom-sso/callback`;
  const authorization = new URL("/sso/authorize", desktopOrigin);
  authorization.search = new URLSearchParams({ client, redirectUrl: destination, state: randomUUID() }).toString();

  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  try {
    const mobilePage = await phone.newPage();
    await standInForWecomAuthorization(mobilePage, { mobileOrigin, member: wecomUnboundMember });
    const desktopNetwork = await page.context().newCDPSession(page);
    await desktopNetwork.send("Network.enable");
    const streamRequests = new Map<string, string>();
    const events: Array<{ url: string; status: string }> = [];
    desktopNetwork.on("Network.responseReceived", ({ requestId, response }) => {
      if (response.mimeType === "text/event-stream") streamRequests.set(requestId, response.url);
    });
    desktopNetwork.on("Network.eventSourceMessageReceived", ({ requestId, data }) => {
      const url = streamRequests.get(requestId);
      if (url && data) events.push({ url, status: JSON.parse(data).status });
    });

    await page.goto(authorization.href);
    await expect(page).toHaveURL((url) => url.origin === desktopOrigin && url.pathname === "/portal/login");
    await page.getByRole("tab", { name: "企业微信扫码登录" }).click();
    const mobileLink = await page.getByRole("link", { name: "企业微信扫码链接" }).getAttribute("href");
    if (!mobileLink) throw new Error("WeCom QR did not expose its mobile destination");
    const qrUrl = new URL(mobileLink);
    expect(qrUrl.origin).toBe(mobileOrigin);
    expect(qrUrl.protocol).toBe("https:");
    expect(qrUrl.hostname).not.toBe(new URL(desktopOrigin).hostname);
    expect(qrUrl.pathname).toMatch(/^\/sso\/wechat-qr\/mobile\/[a-zA-Z0-9_-]+$/u);
    expect(qrUrl.search + qrUrl.hash + qrUrl.username + qrUrl.password).toBe("");
    const insecureMobile = new URL(qrUrl.pathname, requireEnvironment("IAM_E2E_ORIGIN"));
    const insecureResponse = await request.get(insecureMobile.href, {
      headers: { "X-Forwarded-Proto": "https" },
      maxRedirects: 0,
    });
    expect(insecureResponse.status()).toBe(404);
    expect(insecureResponse.headers()["set-cookie"]).toBeUndefined();

    const requestId = qrUrl.pathname.split("/").at(-1);
    const streamPath = `/sso/wechat-qr/${requestId}/events`;
    const desktopStatuses = () =>
      events
        .filter(({ url }) => {
          const stream = new URL(url);
          return stream.origin === desktopOrigin && stream.pathname === streamPath;
        })
        .map(({ status }) => status);
    await expect.poll(desktopStatuses).toContain("waiting");

    const callback = mobilePage.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === mobileOrigin && url.pathname === "/sso/wechat-qr/mobile/callback";
    });
    const confirmation = await mobilePage.goto(qrUrl.href);
    expect(confirmation?.status()).toBe(200);
    const callbackResponse = await callback;
    expect(callbackResponse.status()).toBe(303);
    const location = callbackResponse.headers().location;
    if (!location) throw new Error("WeCom callback did not redirect to mobile confirmation");
    expect(location).toMatch(/^\/sso\/wechat-qr\/mobile\/confirm\/[a-zA-Z0-9_-]+$/u);
    await expect(mobilePage).toHaveURL(new URL(location, mobileOrigin).href);
    expect(new Set(desktopStatuses())).toEqual(new Set(["waiting"]));

    const [decision] = await Promise.all([
      mobilePage.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.origin === mobileOrigin &&
          url.pathname === "/sso/wechat-qr/mobile/decision" &&
          response.request().method() === "POST"
        );
      }),
      mobilePage.getByRole("button", { name: "确认登录" }).click(),
    ]);
    expect(decision.ok()).toBe(true);
    await expect.poll(desktopStatuses).toContain("binding_required");
    await expect(mobilePage).toHaveURL((url) => url.origin === mobileOrigin);
    await expect(page).toHaveURL((url) => url.origin === desktopOrigin && url.pathname === "/portal/login");
    for (const context of [page.context(), phone]) {
      const cookies = await context.cookies([desktopOrigin, mobileOrigin]);
      expect(cookies.some(({ name }) => name === "global_session")).toBe(false);
    }
  } finally {
    await phone.close();
  }
});

test("WeCom confirmation continues the original Custom SSO request after switching tabs and unlinking", async ({
  browser,
  page,
}) => {
  const desktopOrigin = requireEnvironment("IAM_E2E_INTERNAL_ORIGIN");
  const mobileOrigin = requireEnvironment("IAM_E2E_WECHAT_QR_MOBILE_ORIGIN");
  const adminOrigin = requireEnvironment("IAM_E2E_ORIGIN");
  const client = requireEnvironment("IAM_E2E_CUSTOM_CLIENT_CODE");
  const delegatee = requireEnvironment("IAM_E2E_DELEGATEE_USERNAME");
  const destination = `${desktopOrigin}/e2e/custom-sso/callback`;
  const authorization = new URL("/sso/authorize", desktopOrigin);
  const state = randomUUID();
  authorization.search = new URLSearchParams({ client, redirectUrl: destination, state }).toString();

  const admin = await browser.newContext({ baseURL: adminOrigin });
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  try {
    const adminPage = await admin.newPage();
    await loginToAdmin({
      adminPassword: requireEnvironment("IAM_E2E_ADMIN_PASSWORD"),
      adminUsername: requireEnvironment("IAM_E2E_ADMIN_USERNAME"),
      origin: adminOrigin,
      page: adminPage,
    });
    const mobilePage = await phone.newPage();
    await standInForWecomAuthorization(mobilePage, { mobileOrigin, member: wecomUnlinkMember });
    await page.goto(authorization.href);
    await expect(page).toHaveURL((url) => url.origin === desktopOrigin && url.pathname === "/portal/login");
    const qrTab = page.getByRole("tab", { name: "企业微信扫码登录" });
    const desktopNetwork = await page.context().newCDPSession(page);
    await desktopNetwork.send("Network.enable");
    const streams = new Set<string>();
    let confirmed = false;
    const completionRequests: string[] = [];
    desktopNetwork.on("Network.responseReceived", ({ requestId, response }) => {
      if (/^\/sso\/wechat-qr\/[^/]+\/events$/u.test(new URL(response.url).pathname)) streams.add(requestId);
    });
    desktopNetwork.on("Network.eventSourceMessageReceived", ({ requestId, data }) => {
      if (streams.has(requestId) && JSON.parse(data).status === "confirmed") confirmed = true;
    });
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/complete")) completionRequests.push(request.url());
    });
    await qrTab.click();
    const mobileLink = await page.getByRole("link", { name: "企业微信扫码链接" }).getAttribute("href");
    if (!mobileLink) throw new Error("WeCom QR did not expose its mobile destination");
    const requestId = new URL(mobileLink).pathname.split("/").at(-1);
    const completePath = `/sso/wechat-qr/${requestId}/complete`;

    await page.getByRole("tab", { name: "密码登录" }).click();
    await page.getByLabel("工号 / 账号").fill(delegatee);
    expect((await mobilePage.goto(mobileLink))?.status()).toBe(200);
    await mobilePage.getByRole("button", { name: "确认登录" }).click();
    await expect.poll(() => confirmed).toBe(true);
    await expect(page.getByLabel("工号 / 账号")).toHaveValue(delegatee);
    expect(completionRequests).toEqual([]);
    expect((await page.context().cookies([desktopOrigin])).some(({ name }) => name === "global_session")).toBe(false);

    await page.getByRole("tab", { name: "手机登录" }).click();
    const unlink = await adminPage.request.post(`/api/iam/admin/users/${encodeURIComponent(delegatee)}/unlink-wecom`, {
      headers: { Client: "iam-admin" },
    });
    expect(unlink.status()).toBe(200);
    expect(await unlink.json()).toMatchObject({ code: 200, data: { changed: true } });
    expect(completionRequests).toEqual([]);
    const completion = page.waitForResponse((candidate) => new URL(candidate.url()).pathname === completePath);
    await qrTab.click();
    const delivered = await completion;
    expect(delivered.ok()).toBe(true);
    await expect(page).toHaveURL((url) => `${url.origin}${url.pathname}` === destination);
    const result = new URL(page.url());
    expect(result.searchParams.get("state")).toBe(state);
    const token = result.searchParams.get("token");
    if (!token) throw new Error("The original Custom SSO callback did not receive a session");
    expect(completionRequests).toHaveLength(1);
    const identity = await page.request.get(`${desktopOrigin}/api/iam/public/user-info`, {
      headers: { Client: client, Authorization: token },
    });
    expect(identity.status()).toBe(200);
    expect(await identity.json()).toMatchObject({ data: { profile: { username: delegatee } } });
    expect((await page.context().cookies([desktopOrigin])).find(({ name }) => name === "global_session")).toMatchObject(
      {
        domain: new URL(desktopOrigin).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    );
    expect((await page.context().cookies([mobileOrigin])).some(({ name }) => name === "global_session")).toBe(false);
    expect((await phone.cookies()).some(({ name }) => name === "global_session")).toBe(false);
  } finally {
    await Promise.all([admin.close(), phone.close()]);
  }
});

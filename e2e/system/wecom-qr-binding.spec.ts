import { randomUUID } from "node:crypto";
import { ApiErrorCode, UserType } from "@iam/contracts";
import { devices, expect, type Page } from "@playwright/test";
import { loginToAdmin } from "./src/admin-client-journey.ts";
import { type E2ERunContext, readDeliveredSmsCode } from "./src/e2e-context.ts";
import { test } from "./src/gateway-test.ts";
import { smsBindingMobile, smsBindingUsername } from "./src/sms-provider.ts";
import { standInForWecomAuthorization } from "./src/wecom-journey.ts";

const firstBindingMember = "wecom-e2e-password-binding";
const deniedBindingMember = "wecom-e2e-password-denied";
const smsBindingMember = "wecom-e2e-sms-binding";

function customAuthorization(origin: string, client: string) {
  const redirectUrl = `${origin}/e2e/custom-sso/callback`;
  const state = randomUUID();
  const url = new URL("/sso/authorize", origin);
  url.search = new URLSearchParams({ client, redirectUrl, state }).toString();
  return { url, redirectUrl, state };
}

async function confirmWecom(desktop: Page, phone: Page, authorization: URL, member: string, runtime: E2ERunContext) {
  const mobileOrigin = runtime.wecomMobileOrigin;
  await standInForWecomAuthorization(phone, { mobileOrigin, member, runId: runtime.references.runId });
  await desktop.goto(authorization.href);
  await expect(desktop).toHaveURL((url) => url.origin === authorization.origin && url.pathname === "/portal/login");
  await desktop.getByRole("button", { name: "企业微信扫码登录" }).click();
  const mobileLink = await desktop.getByRole("link", { name: "企业微信扫码链接" }).getAttribute("href");
  if (!mobileLink) throw new Error("WeCom QR did not expose its mobile destination");
  expect(new URL(mobileLink).origin).toBe(mobileOrigin);
  expect(new URL(mobileLink).hostname).not.toBe(authorization.hostname);
  expect((await phone.goto(mobileLink))?.status()).toBe(200);

  const [decision] = await Promise.all([
    phone.waitForResponse((response) => new URL(response.url()).pathname === "/sso/wechat-qr/mobile/decision"),
    phone.getByRole("button", { name: "确认登录" }).click(),
  ]);
  expect(decision.request().method()).toBe("POST");
  expect(decision.status()).toBe(200);
  expect((await phone.context().cookies()).some(({ name }) => name === "global_session")).toBe(false);
}

async function submitPassword(page: Page, username: string, password: string) {
  await page.getByLabel("工号 / 账号").fill(username);
  await page.getByLabel("登录密码", { exact: true }).fill(password);
  const [response] = await Promise.all([
    page.waitForResponse((response) =>
      /^\/api\/iam\/auth\/wechat-qr\/[^/]+\/bind\/password$/u.test(new URL(response.url()).pathname),
    ),
    page.getByRole("button", { name: "验证并绑定企业微信" }).click(),
  ]);
  expect(response.request().method()).toBe("POST");
  return response;
}

async function expectCustomIdentity(
  page: Page,
  authorization: ReturnType<typeof customAuthorization>,
  client: string,
  username: string,
) {
  await expect(page).toHaveURL((url) => url.origin + url.pathname === authorization.redirectUrl);
  const callback = new URL(page.url());
  expect(callback.searchParams.get("state")).toBe(authorization.state);
  const token = callback.searchParams.get("token");
  if (!token) throw new Error("The original Custom SSO callback did not receive a session");
  const identity = await page.request.get(`${authorization.url.origin}/api/iam/sso/user-info`, {
    headers: { Client: client, Authorization: token },
  });
  expect(identity.status()).toBe(200);
  expect(await identity.json()).toMatchObject({ data: { profile: { username } } });
  expect(
    (await page.context().cookies(authorization.url.origin)).find(({ name }) => name === "global_session"),
  ).toMatchObject({
    httpOnly: true,
    domain: authorization.url.hostname,
  });
}

test("WeCom password binding accepts a password with edge spaces and continues the original application", async ({
  runtime,
  browser,
  page,
}) => {
  const origin = runtime.internalOrigin;
  const adminOrigin = runtime.origin;
  const client = `${runtime.references.customSsoClientCode}-dual`;
  const adminUsername = runtime.references.adminUsername;
  const adminPassword = runtime.adminPassword;
  const username = "e2e-wecom-password";
  const password = "  PaddedPass123!  ";
  const authorization = customAuthorization(origin, client);
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const admin = await browser.newContext({ baseURL: adminOrigin });
  try {
    await loginToAdmin({ adminPassword, adminUsername, origin: adminOrigin, page: await admin.newPage() });
    const created = await admin.request.post("/api/iam/admin/users", {
      headers: { Client: "iam-admin" },
      data: { username, password, name: "E2E WeCom Password User", userType: UserType.Formal },
    });
    expect(created.status()).toBe(200);
    expect(await created.json()).toMatchObject({ data: { result: { username, generatedPassword: null } } });
    await expect
      .poll(async () => {
        const profile = await page.request.get(`${origin}/api/iam/internal/users/${username}`, {
          headers: { apikey: runtime.internalApiKey },
        });
        return profile.status();
      })
      .toBe(200);

    await confirmWecom(page, await phone.newPage(), authorization.url, firstBindingMember, runtime);
    const rejected = await submitPassword(page, username, password.trim());
    expect(rejected.status()).toBe(400);
    expect(await rejected.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });
    const bound = await submitPassword(page, ` ${username} `, password);
    expect(new URL(bound.url()).pathname).toBe(new URL(rejected.url()).pathname);
    expect(bound.status()).toBe(200);
    await expectCustomIdentity(page, authorization, client, username);
  } finally {
    await Promise.all([admin.close(), phone.close()]);
  }
});

test("WeCom SMS binding continues the original Custom SSO application after switching methods and retrying", async ({
  runtime,
  browser,
  page,
}) => {
  const origin = runtime.internalOrigin;
  const client = `${runtime.references.customSsoClientCode}-dual`;
  const authorization = customAuthorization(origin, client);
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  try {
    await confirmWecom(page, await phone.newPage(), authorization.url, smsBindingMember, runtime);
    await page.getByRole("button", { name: "使用短信验证" }).click();
    const mobileField = page.getByLabel("IAM 已登记的手机号");
    await mobileField.fill(smsBindingMobile);
    const [sent] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/bind/sms/send")),
      page.getByRole("button", { name: "获取验证码" }).click(),
    ]);
    expect(sent.request().method()).toBe("POST");
    expect(sent.request().postDataJSON()).toMatchObject({ phoneNumber: smsBindingMobile });
    expect(sent.status()).toBe(200);
    expect(await sent.json()).toMatchObject({ data: { decision: "sent" } });
    const code = await readDeliveredSmsCode(runtime);

    await page.getByRole("button", { name: "使用密码验证" }).click();
    await page.getByRole("button", { name: "使用短信验证" }).click();
    await mobileField.fill(smsBindingMobile);
    const submit = page.getByRole("button", { name: "验证并绑定企业微信" });
    const codeField = page.getByLabel("短信验证码", { exact: true });
    await codeField.fill(code === "0000" ? "1111" : "0000");
    const [rejected] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/bind/sms")),
      submit.click(),
    ]);
    expect(rejected.status()).toBe(400);
    expect(`${new URL(rejected.url()).pathname}/send`).toBe(new URL(sent.url()).pathname);
    expect(await rejected.json()).toMatchObject({ code: ApiErrorCode.LoginFailed });
    await codeField.fill(code);
    const [bound] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname.endsWith("/bind/sms")),
      submit.click(),
    ]);
    expect(bound.request().method()).toBe("POST");
    expect(bound.request().postDataJSON()).toMatchObject({ phoneNumber: smsBindingMobile, code });
    expect(bound.status()).toBe(200);
    await expectCustomIdentity(page, authorization, client, smsBindingUsername);
  } finally {
    await phone.close();
  }
});

test("application admission can reject a WeCom password binding login while preserving the binding for a new browser", async ({
  runtime,
  browser,
  page,
}) => {
  const origin = runtime.internalOrigin;
  const adminOrigin = runtime.origin;
  const client = `${runtime.references.customSsoClientCode}-dual`;
  const username = runtime.references.noScopeHrAdminUsername;
  const adminUsername = runtime.references.adminUsername;
  const adminPassword = runtime.adminPassword;
  const admin = await browser.newContext({ baseURL: adminOrigin });
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const nextDesktop = await browser.newContext();
  let policyEnabled = false;
  const admission = `/api/iam/admin/clients/${encodeURIComponent(client)}/admission`;
  const headers = { Client: "iam-admin" };

  async function setPolicy(enabled: boolean) {
    const response = await admin.request.post(`${admission}/enabled`, { headers, data: { enabled } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ data: { changed: true, result: { enabled } } });
    policyEnabled = enabled;
  }

  try {
    await loginToAdmin({ adminPassword, adminUsername, origin: adminOrigin, page: await admin.newPage() });
    const saved = await admin.request.post(admission, {
      headers,
      data: { filter: { field: "username", op: "eq", value: adminUsername } },
    });
    expect(saved.status()).toBe(200);
    await setPolicy(true);

    const denied = customAuthorization(origin, client);
    await confirmWecom(page, await phone.newPage(), denied.url, deniedBindingMember, runtime);
    const bound = await submitPassword(page, username, adminPassword);
    expect(bound.status()).toBe(200);
    await expect(page).toHaveURL(
      (url) => url.origin === origin && url.pathname === "/portal/application-access-denied",
    );
    expect(new URL(page.url()).searchParams.get("client")).toBe(client);
    expect(new URL(page.url()).searchParams.has("token")).toBe(false);

    await setPolicy(false);
    const next = customAuthorization(origin, client);
    const fresh = await nextDesktop.newPage();
    const boundCompletion = fresh.waitForResponse((response) =>
      /^\/api\/iam\/auth\/wechat-qr\/[^/]+\/complete$/u.test(new URL(response.url()).pathname),
    );
    await confirmWecom(fresh, await phone.newPage(), next.url, deniedBindingMember, runtime);
    expect((await boundCompletion).status()).toBe(200);
    await expectCustomIdentity(fresh, next, client, username);
  } finally {
    try {
      if (policyEnabled) await setPolicy(false);
    } finally {
      await Promise.all([admin.close(), phone.close(), nextDesktop.close()]);
    }
  }
});

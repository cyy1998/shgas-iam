import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ApiErrorCode, UserType } from "@iam/contracts";
import { devices, expect, type Page } from "@playwright/test";
import { loginToAdmin } from "./src/admin-client-journey.ts";
import { composeArguments } from "./src/docker-infra.ts";
import { requireEnvironment } from "./src/environment.ts";
import { test } from "./src/gateway-test.ts";
import { smsBindingMobile, smsBindingUsername, smsDeliveryPath } from "./src/sms-provider.ts";
import { standInForWecomAuthorization } from "./src/wecom-journey.ts";

const firstBindingMember = "wecom-e2e-password-binding";
const deniedBindingMember = "wecom-e2e-password-denied";
const smsBindingMember = "wecom-e2e-sms-binding";

async function readDeliveredSmsCode() {
  const runId = requireEnvironment("IAM_E2E_RUN_ID");
  if (!/^[a-z0-9][a-z0-9-]{7,62}$/u.test(runId)) throw new Error("Invalid E2E run ID");
  const composeFile = fileURLToPath(new URL("./compose.yaml", import.meta.url));
  const args = composeArguments(composeFile, `iam-e2e-${runId}`, ["exec", "-T", "api", "cat", smsDeliveryPath]);
  const { stdout } = await promisify(execFile)("docker", args, { timeout: 8000 });
  const code = stdout.trim();
  if (!/^\d{4}$/u.test(code)) throw new Error("The SMS provider did not deliver a verification code");
  return code;
}

function customAuthorization(origin: string, client: string) {
  const redirectUrl = `${origin}/e2e/custom-sso/callback`;
  const state = randomUUID();
  const url = new URL("/sso/authorize", origin);
  url.search = new URLSearchParams({ client, redirectUrl, state }).toString();
  return { url, redirectUrl, state };
}

async function confirmWecom(desktop: Page, phone: Page, authorization: URL, member: string) {
  const mobileOrigin = requireEnvironment("IAM_E2E_WECHAT_QR_MOBILE_ORIGIN");
  await standInForWecomAuthorization(phone, { mobileOrigin, member });
  await desktop.goto(authorization.href);
  await expect(desktop).toHaveURL((url) => url.origin === authorization.origin && url.pathname === "/portal/login");
  await desktop.getByRole("tab", { name: "企业微信扫码登录" }).click();
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
      /^\/sso\/wechat-qr\/[^/]+\/bind\/password$/u.test(new URL(response.url()).pathname),
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
  const identity = await page.request.get(`${authorization.url.origin}/api/iam/public/user-info`, {
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
  browser,
  page,
}) => {
  const origin = requireEnvironment("IAM_E2E_INTERNAL_ORIGIN");
  const adminOrigin = requireEnvironment("IAM_E2E_ORIGIN");
  const client = requireEnvironment("IAM_E2E_CUSTOM_CLIENT_CODE");
  const adminUsername = requireEnvironment("IAM_E2E_ADMIN_USERNAME");
  const adminPassword = requireEnvironment("IAM_E2E_ADMIN_PASSWORD");
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
          headers: { apikey: requireEnvironment("IAM_E2E_INTERNAL_API_KEY") },
        });
        return profile.status();
      })
      .toBe(200);

    await confirmWecom(page, await phone.newPage(), authorization.url, firstBindingMember);
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
  browser,
  page,
}) => {
  const origin = requireEnvironment("IAM_E2E_INTERNAL_ORIGIN");
  const client = requireEnvironment("IAM_E2E_CUSTOM_CLIENT_CODE");
  const authorization = customAuthorization(origin, client);
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  try {
    await confirmWecom(page, await phone.newPage(), authorization.url, smsBindingMember);
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
    const code = await readDeliveredSmsCode();

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
  browser,
  page,
}) => {
  const origin = requireEnvironment("IAM_E2E_INTERNAL_ORIGIN");
  const adminOrigin = requireEnvironment("IAM_E2E_ORIGIN");
  const client = requireEnvironment("IAM_E2E_CUSTOM_CLIENT_CODE");
  const username = requireEnvironment("IAM_E2E_NO_SCOPE_HR_ADMIN_USERNAME");
  const adminUsername = requireEnvironment("IAM_E2E_ADMIN_USERNAME");
  const adminPassword = requireEnvironment("IAM_E2E_ADMIN_PASSWORD");
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
    await confirmWecom(page, await phone.newPage(), denied.url, deniedBindingMember);
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
      /^\/sso\/wechat-qr\/[^/]+\/complete$/u.test(new URL(response.url()).pathname),
    );
    await confirmWecom(fresh, await phone.newPage(), next.url, deniedBindingMember);
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

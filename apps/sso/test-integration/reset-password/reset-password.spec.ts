// Browser Integration uses a mocked backend; this is not a full-system journey.
import { ApiErrorCode, IMAGE_CAPTCHA_PROOF_HEADER } from "@iam/contracts";
import { expect, type Page, test } from "@playwright/test";
import { mockImageCaptchaFallback, mockSsoApi, requireImageCaptcha } from "../fixtures";

async function fillPasswordReset(page: Page) {
  await page.goto("/portal/reset-password?client=iam-admin");

  await page.getByPlaceholder("请输入用户名").fill("zhangsan");
  const lookup = page.waitForRequest("**/open/users/zhangsan/masked-mobile*");
  await page.getByRole("button", { name: "下一步" }).click();
  await lookup;

  await page.getByRole("button", { name: "获取验证码" }).click();
  await page.getByPlaceholder("请输入验证码").fill("123456");
  await page.getByRole("button", { name: "下一步" }).click();

  await page.getByPlaceholder("请输入新密码").fill("Abc12345");
  await page.getByPlaceholder("请再次输入新密码").fill("Abc12345");
}

test("reset password page completes mocked verification flow", async ({ page }) => {
  await mockSsoApi(page);
  await fillPasswordReset(page);
  await page.getByRole("button", { name: /确\s*定/ }).click();

  await expect(page.getByRole("dialog", { name: "密码重置完成" })).toBeVisible();
});

test("password reset guides recovery and keeps the countdown on return to the SMS step", async ({ page }) => {
  await mockSsoApi(page);
  let attempts = 0;
  await page.route("**/open/password/reset", (route) => {
    attempts++;
    return route.fulfill({
      status: attempts === 1 ? 500 : 400,
      json: {
        code: attempts === 1 ? ApiErrorCode.InternalError : ApiErrorCode.InvalidVerificationCode,
        message: attempts === 1 ? "服务器内部错误" : "验证码错误",
        data: null,
      },
    });
  });
  await fillPasswordReset(page);
  const submit = page.getByRole("button", { name: /确\s*定/ });
  await submit.click();
  await expect(page.getByText(/请先确认变更是否已生效.*返回上一步重新获取验证码/)).toBeVisible();
  expect(attempts).toBe(1);

  await submit.click();
  await expect(page.getByText("验证码无效，请检查输入，或返回上一步重新获取验证码。")).toBeVisible();
  await page.getByRole("button", { name: /上一步/ }).click();
  await expect(page.getByRole("button", { name: /秒后重试/ })).toBeDisabled();
  await expect(page.getByRole("dialog", { name: "密码重置完成" })).toHaveCount(0);
});

test("keeps the inline captcha usable during phone lookup and SMS sending", async ({ page }) => {
  await mockSsoApi(page);
  await mockImageCaptchaFallback(page);
  let messagesSent = 0;
  await page.route("**/open/users/*/masked-mobile**", (route) => {
    if (!route.request().headers()[IMAGE_CAPTCHA_PROOF_HEADER.toLowerCase()]) return requireImageCaptcha(route);
    return route.fulfill({ json: { code: 200, data: { mobile: "138****0000" } } });
  });
  await page.route("**/open/code/send", (route) => {
    if (!route.request().headers()[IMAGE_CAPTCHA_PROOF_HEADER.toLowerCase()]) return requireImageCaptcha(route);
    messagesSent++;
    return route.fulfill({ json: { code: 200, data: true } });
  });

  await page.goto("/portal/reset-password?client=iam-admin");
  const username = page.getByPlaceholder("请输入用户名");
  await username.fill("zhangsan");
  await page.getByRole("button", { name: "下一步" }).click();
  const lookup = page.locator("form").filter({ has: username }).getByRole("group", { name: "图片验证码" });
  await lookup.getByLabel("图片验证码").fill("AC9TV3");
  await lookup.getByRole("button", { name: /^验\s*证$/ }).click();

  await page.getByRole("button", { name: "获取验证码" }).click();
  const smsCode = page.getByPlaceholder("请输入验证码");
  const send = page.locator("form").filter({ has: smsCode }).getByRole("group", { name: "图片验证码" });
  await send.getByLabel("图片验证码").fill("AC9TV3");
  await send.getByRole("button", { name: /^验\s*证$/ }).click();
  await expect(page.getByRole("button", { name: /秒后重试/ })).toBeVisible();
  expect(messagesSent).toBe(1);
});

test("null mobile blocks sending codes and advancing to password reset", async ({ page }) => {
  await mockSsoApi(page);
  await page.route("**/open/users/*/masked-mobile**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        code: 200,
        message: "OK",
        data: { mobile: null },
      }),
    }),
  );
  const recoveryRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/open\/(?:code\/(?:send|verify)|password\/reset)/.test(request.url())) {
      recoveryRequests.push(request.url());
    }
  });
  await page.goto("/portal/reset-password");
  await page.getByPlaceholder("请输入用户名").fill("unknown");
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByText("无法获取绑定手机号", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "获取验证码" }).click();
  await page.getByPlaceholder("请输入验证码").fill("123456");
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.getByPlaceholder("请输入新密码")).toHaveCount(0);
  expect(recoveryRequests).toEqual([]);
});

test("keeps the login destination during the password recovery round trip", async ({ page }) => {
  await mockSsoApi(page);
  const redirectUrl = "https://business.example/callback?keep=yes";
  const query = new URLSearchParams({ client: "iam-admin", redirectUrl, state: "opaque state" });
  await page.goto(`/portal/login?${query}`);
  await page.getByPlaceholder("请输入您的工号").fill("zhangsan");
  await page.getByRole("button", { name: "忘记密码？" }).click();

  await expect(page).toHaveURL(/\/portal\/reset-password\?/);
  await expect(page.getByPlaceholder("请输入用户名")).toHaveValue("zhangsan");
  expect(new URL(page.url()).searchParams.get("redirectUrl")).toBe(redirectUrl);

  await page.getByRole("button", { name: "返回登录" }).click();
  await expect(page).toHaveURL(`/portal/login?${query}`);
  await expect(page.getByPlaceholder("请输入您的工号")).toBeVisible();
});

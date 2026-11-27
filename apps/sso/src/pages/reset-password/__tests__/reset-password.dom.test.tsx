import { ApiErrorCode, IMAGE_CAPTCHA_PROOF_HEADER } from "@iam/contracts";
import { http } from "msw";
import { expect, it } from "vitest";
import { mockImageCaptchaFallback, ok, requireImageCaptcha, serviceFailure } from "~sso/test/mocks/auth";
import "~sso/test/mocks/cap-widget";
import { server } from "~sso/test/mocks/server";
import { fireEvent, screen, waitFor, within } from "~sso/test/render";
import { registerSsoAppLifecycle, renderSsoApp } from "~sso/test/render-app";
import { registerMswLifecycle } from "~sso/test/setup-msw";

registerMswLifecycle();
registerSsoAppLifecycle();

const lookupPath = "*/api/iam/auth/recovery/users/:username/masked-mobile";
const smsPath = "*/api/iam/auth/sms/send";
const resetPath = "*/api/iam/auth/recovery/password-reset";

function fill(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
}

async function enterUsername() {
  fill(await screen.findByPlaceholderText("请输入用户名"), "zhangsan");
  next();
}

async function enterNewPassword() {
  renderSsoApp("/portal/reset-password?client=iam-admin");
  await enterUsername();
  fireEvent.click(await screen.findByRole("button", { name: "获取验证码" }));
  await screen.findByRole("button", { name: /秒后重试/ });
  fill(screen.getByPlaceholderText("请输入验证码"), "123456");
  next();
  fill(await screen.findByPlaceholderText("请输入新密码"), "Abc12345");
  fill(screen.getByPlaceholderText("请再次输入新密码"), "Abc12345");
  return screen.getByRole("button", { name: /确\s*定/ });
}

it("completes account lookup, SMS verification and password reset", async () => {
  fireEvent.click(await enterNewPassword());
  await waitFor(() => expect(screen.getByRole("dialog", { name: "密码重置完成" })).toBeVisible());
});

it("guides recovery after an unknown result and an invalid code, retaining the SMS countdown", async () => {
  let attempts = 0;
  server.use(
    http.post(resetPath, () => {
      attempts++;
      return attempts === 1
        ? serviceFailure(500, ApiErrorCode.InternalError, "服务器内部错误")
        : serviceFailure(400, ApiErrorCode.InvalidVerificationCode, "验证码错误");
    }),
  );

  const submit = await enterNewPassword();
  fireEvent.click(submit);
  expect(await screen.findByText(/请先确认变更是否已生效.*返回上一步重新获取验证码/)).toBeVisible();
  expect(attempts).toBe(1);

  fireEvent.click(submit);
  expect(await screen.findByText("验证码无效，请检查输入，或返回上一步重新获取验证码。")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "上一步" }));
  expect(await screen.findByRole("button", { name: /秒后重试/ })).toBeDisabled();
  expect(screen.queryByRole("dialog", { name: "密码重置完成" })).not.toBeInTheDocument();
  expect(attempts).toBe(2);
});

it("uses inline image verification for both masked-mobile lookup and SMS sending", async () => {
  const { handlers } = mockImageCaptchaFallback();
  const proofs: (string | null)[] = [];
  server.use(
    ...handlers,
    http.get(lookupPath, ({ request }) =>
      request.headers.get(IMAGE_CAPTCHA_PROOF_HEADER) === "test-proof"
        ? ok({ mobile: "138****0000" })
        : requireImageCaptcha(),
    ),
    http.post(smsPath, ({ request }) => {
      const proof = request.headers.get(IMAGE_CAPTCHA_PROOF_HEADER);
      proofs.push(proof);
      return proof === "test-proof" ? ok(true) : requireImageCaptcha();
    }),
  );
  renderSsoApp("/portal/reset-password?client=iam-admin");
  await enterUsername();
  await verifyInlineCaptcha();

  fireEvent.click(await screen.findByRole("button", { name: "获取验证码" }));
  await verifyInlineCaptcha();
  expect(await screen.findByRole("button", { name: /秒后重试/ })).toBeDisabled();
  expect(proofs).toEqual([null, "test-proof"]);
});

async function verifyInlineCaptcha() {
  const captcha = within(await screen.findByRole("group", { name: "图片验证码" }));
  await captcha.findByAltText("图片验证码");
  fill(captcha.getByLabelText("图片验证码"), "AC9TV3");
  fireEvent.click(captcha.getByRole("button", { name: /^验\s*证$/ }));
}

it("blocks SMS send, verification and reset when the user has no bound phone", async () => {
  const requests: string[] = [];
  server.use(
    http.get(lookupPath, () => ok({ mobile: null })),
    ...[smsPath, "*/api/iam/auth/sms/verify", resetPath].map((path) =>
      http.post(path, ({ request }) => {
        requests.push(request.url);
        return ok(null);
      }),
    ),
  );
  renderSsoApp("/portal/reset-password");
  await enterUsername();
  expect(await screen.findByText("无法获取绑定手机号", { exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
  fill(screen.getByPlaceholderText("请输入验证码"), "123456");
  next();
  expect(screen.queryByPlaceholderText("请输入新密码")).not.toBeInTheDocument();
  expect(requests).toEqual([]);
});

it("carries the username and continuation through the forgot-password round trip", async () => {
  const query = new URLSearchParams({
    client: "iam-admin",
    redirectUrl: "https://business.example/callback?keep=yes",
    state: "opaque state",
  });
  const { user } = renderSsoApp(`/portal/login?${query}`);
  fill(await screen.findByPlaceholderText("请输入您的工号"), "zhangsan");
  await user.click(screen.getByRole("button", { name: "忘记密码？" }));

  expect(await screen.findByPlaceholderText("请输入用户名")).toHaveValue("zhangsan");
  expect(location.pathname).toBe("/portal/reset-password");
  expect(new URLSearchParams(location.search).get("redirectUrl")).toBe(query.get("redirectUrl"));

  await user.click(screen.getByRole("button", { name: /返回登录/ }));
  await waitFor(() => expect(location.pathname + location.search).toBe(`/portal/login?${query}`));
  expect(await screen.findByPlaceholderText("请输入您的工号")).toBeVisible();
});

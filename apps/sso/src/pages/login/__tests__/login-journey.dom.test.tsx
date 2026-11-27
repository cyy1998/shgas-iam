import { ApiErrorCode, ClientStatus, IMAGE_CAPTCHA_PROOF_HEADER } from "@iam/contracts";
import * as navigation from "@sso/utils/navigation";
import { HttpResponse, http } from "msw";
import { expect, it, vi } from "vitest";
import {
  mockImageCaptchaFallback,
  mockLoginGuard,
  ok,
  requireImageCaptcha,
  serviceFailure,
} from "~sso/test/mocks/auth";
import "~sso/test/mocks/cap-widget";
import { server } from "~sso/test/mocks/server";
import { fireEvent, screen, waitFor, within } from "~sso/test/render";
import { registerSsoAppLifecycle, renderSsoApp } from "~sso/test/render-app";
import { registerMswLifecycle } from "~sso/test/setup-msw";

registerMswLifecycle();
registerSsoAppLifecycle();

const loginPath = "/portal/login?client=iam-admin&redirectUrl=http%3A%2F%2Fexample.test%2Fiam-admin";
const usernamePlaceholder = "请输入您的工号";
const passwordPlaceholder = "请输入登录密码";

function observeContinuation() {
  return vi.spyOn(navigation, "replaceBrowserLocation").mockImplementation(() => {});
}

function fill(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

it.each(["", "BMN"])(
  "continues via the discovered endpoint preserving business parameters with loginType=%s",
  async (loginType) => {
    const replace = observeContinuation();
    const guard = mockLoginGuard("continue");
    server.use(
      guard.handler,
      http.get("*/sso/.well-known/authentication-configuration", () =>
        ok({ authorizationEndpoint: `${location.origin}/sso/authorize`, logoutEndpoint: "/sso/logout" }),
      ),
    );
    const continuation = {
      client: "iam-admin",
      redirectUrl: "https://business.example/callback%2Ftenant?keep=a%26b",
      state: "opaque & state",
      ssoReturn: "a".repeat(43),
    };
    renderSsoApp(`/portal/login?${new URLSearchParams({ ...continuation, loginType })}`);

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const target = new URL(replace.mock.calls[0][0], location.origin);
    expect(target.origin).toBe(location.origin);
    expect(target.pathname).toBe("/sso/authorize");
    expect(Object.fromEntries(target.searchParams)).toEqual(continuation);
    expect(guard.requests[0]?.searchParams.get("ssoReturn")).toBe(continuation.ssoReturn);
    expect(screen.queryByPlaceholderText(usernamePlaceholder)).not.toBeInTheDocument();
    expect(screen.queryByText("您的账号尚未绑定手机号")).not.toBeInTheDocument();
  },
);

it.each([
  ["expense", "费用报销"],
  [".", "单点应用"],
  ["..", "双点应用"],
  ["%2E", "百分号应用"],
])("loads trusted denied-application metadata for %s", async (clientCode, clientName) => {
  const lookups: (string | null)[] = [];
  server.use(
    http.get("*/api/iam/auth/client/status", ({ request }) => {
      lookups.push(new URL(request.url).searchParams.get("clientCode"));
      return ok({ clientCode, clientName, status: ClientStatus.Enable, url: null });
    }),
  );
  renderSsoApp(
    `/portal/application-access-denied?${new URLSearchParams({ client: clientCode, clientName: "ignored" })}`,
  );
  expect(await screen.findByRole("heading", { name: clientName })).toBeVisible();
  expect(screen.getByRole("heading", { name: "无权限访问应用" })).toBeVisible();
  expect(screen.queryByText("ignored")).not.toBeInTheDocument();
  expect(screen.queryByPlaceholderText(usernamePlaceholder)).not.toBeInTheDocument();
  expect(lookups).toEqual([clientCode]);
});

it("uses history replacement for OIDC continuation without mounting the login form", async () => {
  const replace = observeContinuation();
  const oidcReturn = "a".repeat(43);
  const formSelector = `input[placeholder="${usernamePlaceholder}"]`;
  const mountedForm = vi.fn();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element && (node.matches(formSelector) || node.querySelector(formSelector))) mountedForm();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  server.use(http.get("*/oidc/login-guard", () => HttpResponse.json({ decision: "continue" })));
  try {
    renderSsoApp(`/portal/login?oidcReturn=${oidcReturn}`);
    await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(`/oidc/resume?oidcReturn=${oidcReturn}`));
    expect(mountedForm).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText(usernamePlaceholder)).not.toBeInTheDocument();
  } finally {
    observer.disconnect();
  }
});

it("verifies inline image captcha after CAP fails and encrypts a fresh credential for the verified retry", async () => {
  const { handlers, capAttempts } = mockImageCaptchaFallback();
  const attempts: { credential: string; proof: string | null }[] = [];
  server.use(
    ...handlers,
    http.post<never, { credential: string }>("*/api/iam/auth/login/password", async ({ request }) => {
      const { credential } = await request.json();
      const proof = request.headers.get(IMAGE_CAPTCHA_PROOF_HEADER);
      attempts.push({ credential, proof });
      return proof ? serviceFailure(400, ApiErrorCode.LoginFailed, "账号或密码错误") : requireImageCaptcha();
    }),
  );
  renderSsoApp(loginPath);
  fill(await screen.findByPlaceholderText(usernamePlaceholder), "zhangsan");
  const password = screen.getByPlaceholderText(passwordPlaceholder);
  fill(password, "secret123");
  const submit = screen.getByRole("button", { name: /安全登录/ });
  fireEvent.click(submit);

  const group = await screen.findByRole("group", { name: "图片验证码" });
  const captcha = within(group);
  expect(await captcha.findByAltText("图片验证码")).toBeVisible();
  expect(capAttempts).toEqual([{ method: "POST", action: "passwordLogin" }]);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(submit).toBeDisabled();
  expect(password.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const answer = captcha.getByLabelText("图片验证码");
  fill(answer, "WRONG");
  fireEvent.keyDown(answer, { key: "Enter" });
  expect(await captcha.findByRole("status")).toHaveTextContent("验证码不正确，请重新输入");
  expect(attempts).toHaveLength(1);

  fill(password, "updated-secret123");
  expect(screen.queryByRole("group", { name: "图片验证码" })).not.toBeInTheDocument();
  expect(attempts).toHaveLength(1);
  await waitFor(() => expect(submit).toBeEnabled());
  const form = password.closest("form");
  if (!form) throw new Error("Expected a password form");
  fireEvent.submit(form);
  const retry = within(await screen.findByRole("group", { name: "图片验证码" }));
  await retry.findByAltText("图片验证码");
  fill(retry.getByLabelText("图片验证码"), "AC9TV3");
  fireEvent.click(retry.getByRole("button", { name: /^验\s*证$/ }));
  expect(await screen.findByRole("dialog", { name: "登录失败" })).toHaveTextContent("账号或密码错误");
  expect(attempts.map(({ proof }) => proof)).toEqual([null, null, "test-proof"]);
  expect(attempts[1]?.credential).toBeTruthy();
  expect(attempts[2]?.credential).toBeTruthy();
  expect(attempts[2]?.credential).not.toBe(attempts[1]?.credential);
});

it("restores query and hash from the first-party callback after password login", async () => {
  const replace = observeContinuation();
  const query = "?tab=%E5%90%AF%E7%94%A8";
  const hash = "#profile";
  const profile = "/portal/userInfo";
  server.use(http.get("*/api/iam/sso/user-info", () => serviceFailure(401, ApiErrorCode.Unauthorized, "未登录")));
  const view = renderSsoApp(profile + query + hash);
  fill(await screen.findByPlaceholderText(usernamePlaceholder), "zhangsan");
  fill(screen.getByPlaceholderText(passwordPlaceholder), "secret123");
  fireEvent.click(screen.getByRole("button", { name: /安全登录/ }));
  await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));

  const authorize = new URL(replace.mock.calls[0][0], location.origin);
  expect(authorize.pathname).toBe("/sso/authorize");
  expect(authorize.searchParams.get("client")).toBe("iam");
  const callback = new URL(authorize.searchParams.get("redirectUrl") ?? "");
  expect(callback.href).toBe(location.origin + profile);
  const state = authorize.searchParams.get("state");
  expect(state).toBe(`iam-first-party-navigation:v1:${query}${hash}`);
  callback.searchParams.set("token", "local-session");
  if (state) callback.searchParams.set("state", state);

  view.unmount();
  server.resetHandlers();
  renderSsoApp(callback.href, { restoreCallback: true });
  expect((await screen.findAllByText("张三"))[0]).toBeVisible();
  expect(location.pathname + location.search + location.hash).toBe(profile + query + hash);
});

it("routes the portal index to login and identifies an unsafe entry", async () => {
  renderSsoApp("/portal");
  expect(await screen.findByText("登录地址校验未通过")).toBeVisible();
  expect(location.pathname).toBe("/portal/login");
});

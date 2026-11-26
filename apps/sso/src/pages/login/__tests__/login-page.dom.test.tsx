import { ApiErrorCode, LoginPageGuardDecision } from "@iam/contracts";
import LoginPage from "@sso/pages/login";
import { ServiceError } from "@sso/utils/request";
import { Modal } from "antd";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "~sso/test/mocks/server";
import { act, fireEvent, render, screen, waitFor } from "~sso/test/render";
import { registerMswLifecycle } from "~sso/test/setup-msw";

const withHumanVerification = vi.hoisted(() => vi.fn());
const modalError = vi.spyOn(Modal, "error").mockReturnValue({
  destroy: vi.fn(),
  update: vi.fn(),
});

vi.mock("@sso/lib/human-verification", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@sso/lib/human-verification")>()),
  withHumanVerification,
}));

registerMswLifecycle();

describe("LoginPage", () => {
  beforeEach(() => {
    window.history.pushState(
      {},
      "",
      "/portal/login?client=iam-admin&redirectUrl=http%3A%2F%2Fexample.test%2Fiam-admin",
    );
    withHumanVerification.mockReset();
  });

  it.each(["", `?ssoReturn=${"a".repeat(43)}`])("rejects a login entry without protocol context: %s", async (query) => {
    window.history.replaceState({}, "", `/portal/login${query}`);
    render(<LoginPage />, { withSso: true });
    expect(await screen.findByText("登录地址校验未通过")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("请输入您的工号")).not.toBeInTheDocument();
    expect(withHumanVerification).not.toHaveBeenCalled();
  });

  it("shows a strong failure prompt when password login is rejected", async () => {
    withHumanVerification.mockRejectedValue(new ServiceError("账号或密码错误", ApiErrorCode.LoginFailed));
    render(<LoginPage />, { withSso: true });

    const username = await screen.findByPlaceholderText("请输入您的工号");
    fireEvent.change(username, {
      target: { value: "zhangsan" },
    });
    fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByText("安全登录").closest("button")!);

    await waitFor(() => {
      expect(modalError).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "登录失败",
          content: "账号或密码错误",
        }),
      );
    });
  });

  it.each(["密码登录", "手机登录"])(
    "guards the switch from %s during submission and returns to the selected method from WeCom QR",
    async (method) => {
      const oidcReturn = "a".repeat(43);
      window.history.replaceState({}, "", `/portal/login?oidcReturn=${oidcReturn}`);
      const submitted = vi.fn();
      const qrStarted = vi.fn();
      let finishRequest!: (error: ServiceError) => void;
      const pending = new Promise<never>((_resolve, reject) => {
        finishRequest = reject;
      });
      withHumanVerification.mockImplementation((action) => {
        submitted(action);
        return pending;
      });
      server.use(
        http.get("*/oidc/login-guard", () => HttpResponse.json({ decision: "login", wechatQr: true })),
        http.post("*/api/iam/auth/wechat-qr", ({ request }) => {
          qrStarted(Object.fromEntries(new URL(request.url).searchParams));
          return new HttpResponse(null, { status: 503 });
        }),
      );
      render(<LoginPage />, { withSso: true });

      const qrSwitch = await screen.findByRole("button", { name: "企业微信扫码登录" });
      try {
        if (method === "密码登录") {
          fireEvent.change(screen.getByPlaceholderText("请输入您的工号"), { target: { value: "zhangsan" } });
          fireEvent.change(screen.getByPlaceholderText("请输入登录密码"), { target: { value: "secret" } });
        } else {
          fireEvent.click(screen.getByRole("tab", { name: method }));
          fireEvent.change(screen.getByPlaceholderText("请输入手机号"), { target: { value: "17721462865" } });
          fireEvent.change(screen.getByPlaceholderText("验证码"), { target: { value: "1234" } });
        }
        fireEvent.click(screen.getByRole("button", { name: /安全登录/ }));
        await waitFor(() =>
          expect(submitted).toHaveBeenCalledWith(method === "密码登录" ? "passwordLogin" : "mobileLogin"),
        );

        fireEvent.click(qrSwitch);
        expect(screen.getByRole("tab", { name: method })).toHaveAttribute("aria-selected", "true");
        expect(qrStarted).not.toHaveBeenCalled();
      } finally {
        await act(async () => {
          finishRequest(new ServiceError("登录失败", ApiErrorCode.LoginFailed));
        });
      }
      fireEvent.click(qrSwitch);
      await waitFor(() => expect(qrStarted).toHaveBeenCalledExactlyOnceWith({ protocol: "oidc", oidcReturn }));
      const accountSwitch = screen.getByRole("button", { name: "账号登录" });
      await waitFor(() => expect(accountSwitch).toBeEnabled());
      fireEvent.click(accountSwitch);
      expect(screen.getByRole("tab", { name: method })).toHaveAttribute("aria-selected", "true");
    },
  );

  it("does not render the login form while the continuation check is pending", async () => {
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    server.use(
      http.get("*/sso/login-guard", async () => {
        started();
        await pending;
        return HttpResponse.json({
          code: 200,
          data: { decision: LoginPageGuardDecision.Login },
          message: "OK",
        });
      }),
    );

    render(<LoginPage />, { withSso: true });

    try {
      await act(async () => {
        await requestStarted;
      });
      expect(screen.getByText("正在检查登录状态…")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("请输入您的工号")).not.toBeInTheDocument();
    } finally {
      release();
    }
    await screen.findByPlaceholderText("请输入您的工号");
  });

  it("shows an expired-request notice without rendering login for invalid continuation", async () => {
    server.use(
      http.get("*/sso/login-guard", () =>
        HttpResponse.json({ code: ApiErrorCode.BadRequest, data: null, message: "invalid" }, { status: 400 }),
      ),
    );

    render(<LoginPage />, { withSso: true });

    expect(await screen.findByText("登录请求已失效，请返回应用重新发起登录")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("请输入您的工号")).not.toBeInTheDocument();
  });

  it("keeps the form hidden on temporary failure and retries only on demand", async () => {
    let attempts = 0;
    server.use(
      http.get("*/sso/login-guard", () => {
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
        }
        return HttpResponse.json({
          code: 200,
          data: { decision: LoginPageGuardDecision.Login },
          message: "OK",
        });
      }),
    );

    render(<LoginPage />, { withSso: true });

    expect(await screen.findByText("统一身份认证服务暂时不可用，请稍后重试")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("请输入您的工号")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    await screen.findByPlaceholderText("请输入您的工号");
    expect(attempts).toBe(2);
  });

  it("enters unavailable after a ten second guard timeout without showing login", async () => {
    vi.useFakeTimers();
    let requestWasAborted = false;
    server.use(
      http.get("*/sso/login-guard", async ({ request }) => {
        request.signal.addEventListener(
          "abort",
          () => {
            requestWasAborted = true;
          },
          { once: true },
        );
        return await new Promise<never>(() => {});
      }),
    );
    try {
      render(<LoginPage />, { withSso: true });

      expect(screen.getByText("正在检查登录状态…")).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(screen.getByText("统一身份认证服务暂时不可用，请稍后重试")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("请输入您的工号")).not.toBeInTheDocument();
      expect(requestWasAborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns to checking immediately when the continuation changes", async () => {
    server.use(
      http.get("*/sso/login-guard", ({ request }) => {
        const client = new URL(request.url).searchParams.get("client");
        if (client === "iam-admin") {
          return HttpResponse.json({
            code: 200,
            data: { decision: LoginPageGuardDecision.Login },
            message: "OK",
          });
        }
        return new Promise<never>(() => {});
      }),
    );

    const view = render(<LoginPage />, { withSso: true });
    await screen.findByPlaceholderText("请输入您的工号");

    window.history.pushState(
      {},
      "",
      "/portal/login?client=another-client&redirectUrl=http%3A%2F%2Fexample.test%2Fcallback",
    );
    view.rerender(<LoginPage />);

    expect(screen.getByText("正在检查登录状态…")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("请输入您的工号")).not.toBeInTheDocument();
  });
});

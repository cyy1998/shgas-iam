import { LoginPageGuardDecision } from "@iam/contracts";
import * as app from "@sso/app";
import useSsoModel from "@sso/models/sso";
import LoginPage from "@sso/pages/login";
import UserInfoPage from "@sso/pages/user-info";
import { HttpResponse, http } from "msw";
import { createContext, type ReactNode, useContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticationConfig, currentUserInfo } from "~sso/test/mocks/fixtures";
import { server } from "~sso/test/mocks/server";
import { history } from "~sso/test/mocks/umijs-max";
import { fireEvent, render, screen, waitFor } from "~sso/test/render";
import { registerMswLifecycle } from "~sso/test/setup-msw";

const ModelContext = createContext<ReturnType<typeof useSsoModel> | null>(null);
vi.mock("@umijs/max", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useModel: () => {
    const model = useContext(ModelContext);
    if (!model) throw new Error("SSO model provider missing");
    return model;
  },
}));

function SsoRuntime({ children }: { children: ReactNode }) {
  const model = useSsoModel();
  return <ModelContext.Provider value={model}>{children}</ModelContext.Provider>;
}

registerMswLifecycle();

describe("SSO loading and recovery", () => {
  const replace = vi.fn();

  beforeEach(() => {
    const browserWindow = window;
    window.history.replaceState({}, "", "/portal/userInfo");
    vi.stubGlobal(
      "window",
      new Proxy(browserWindow, {
        get(target, property) {
          if (property === "location") {
            return {
              href: browserWindow.location.href,
              origin: browserWindow.location.origin,
              search: browserWindow.location.search,
              replace,
            };
          }
          return Reflect.get(target, property, target);
        },
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(["network", "unavailable", "invalid-json"])(
    "shows a failed user info request and recovers only after retry: %s",
    async (failure) => {
      let requests = 0;
      server.use(
        http.get("*/public/user-info", () => {
          requests += 1;
          if (requests > 1) return HttpResponse.json({ code: 200, data: currentUserInfo });
          if (failure === "network") return HttpResponse.error();
          if (failure === "invalid-json") return new HttpResponse("invalid json", { status: 200 });
          return HttpResponse.json({ code: 503, message: "暂时不可用" }, { status: 503 });
        }),
      );

      render(
        <SsoRuntime>
          <UserInfoPage />
        </SsoRuntime>,
      );

      expect(await screen.findByRole("alert")).toHaveTextContent("个人信息加载失败");
      expect(screen.queryByRole("button", { name: /保存设置/ })).not.toBeInTheDocument();
      expect(requests).toBe(1);
      fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
      await screen.findByRole("button", { name: /保存设置/ });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByText("zhangsan")).toBeInTheDocument();
      expect(requests).toBe(2);
    },
  );

  it("keeps the existing authentication redirect when user info returns 401", async () => {
    server.use(http.get("*/public/user-info", () => new HttpResponse(null, { status: 401 })));
    render(
      <SsoRuntime>
        <UserInfoPage />
      </SsoRuntime>,
    );
    await waitFor(() =>
      expect(history.replace).toHaveBeenCalledWith(
        "/login?client=iam&redirectUrl=http%3A%2F%2Flocalhost%3A3000%2Fportal%2FuserInfo",
      ),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("initializes discovery once across runtime bootstrap and the shared model", async () => {
    let requests = 0;
    server.use(
      http.get("*/sso/.well-known/authentication-configuration", () => {
        requests += 1;
        return HttpResponse.json({ data: authenticationConfig });
      }),
    );
    window.history.replaceState({}, "", "/portal/login?client=iam&redirectUrl=https%3A%2F%2Fapp.example%2Fhome");
    const bootstrap = Reflect.get(app, "getInitialState");
    if (typeof bootstrap === "function") await bootstrap();
    render(
      <SsoRuntime>
        <LoginPage />
      </SsoRuntime>,
    );
    await screen.findByPlaceholderText("请输入您的工号");
    expect(requests).toBe(1);
  });

  it.each([LoginPageGuardDecision.Continue, LoginPageGuardDecision.Login])(
    "blocks Custom login on discovery failure, then rechecks and resumes after retry: %s",
    async (decision) => {
      let discoveryRequests = 0;
      let guardRequests = 0;
      server.use(
        http.get("*/sso/.well-known/authentication-configuration", () => {
          discoveryRequests += 1;
          return discoveryRequests === 1
            ? new HttpResponse(null, { status: 503 })
            : HttpResponse.json({ data: authenticationConfig });
        }),
        http.get("*/sso/login-guard", () => {
          guardRequests += 1;
          return HttpResponse.json({ code: 200, data: { decision } });
        }),
      );
      window.history.replaceState({}, "", "/portal/login?client=iam&redirectUrl=https%3A%2F%2Fapp.example%2Fhome");
      render(
        <SsoRuntime>
          <LoginPage />
        </SsoRuntime>,
      );

      await screen.findByText("统一身份认证服务暂时不可用，请稍后重试");
      await waitFor(() => expect(guardRequests).toBe(1));
      expect(screen.queryByPlaceholderText("请输入您的工号")).not.toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();
      expect(discoveryRequests).toBe(1);
      fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
      if (decision === LoginPageGuardDecision.Continue) {
        await waitFor(() =>
          expect(replace).toHaveBeenCalledWith(
            "/sso/authorize?redirectUrl=https%3A%2F%2Fapp.example%2Fhome&client=iam",
          ),
        );
      } else {
        await screen.findByPlaceholderText("请输入您的工号");
        expect(replace).not.toHaveBeenCalled();
      }
      expect(discoveryRequests).toBe(2);
      expect(guardRequests).toBe(2);
    },
  );

  it("continues OIDC independently of failed Custom discovery", async () => {
    const handle = "a".repeat(43);
    server.use(
      http.get("*/sso/.well-known/authentication-configuration", () => new HttpResponse(null, { status: 503 })),
      http.get("*/oidc/login-guard", () => HttpResponse.json({ decision: LoginPageGuardDecision.Continue })),
    );
    window.history.replaceState({}, "", `/portal/login?oidcReturn=${handle}`);
    render(
      <SsoRuntime>
        <LoginPage />
      </SsoRuntime>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/oidc/resume?oidcReturn=${handle}`));
    expect(screen.queryByPlaceholderText("请输入您的工号")).not.toBeInTheDocument();
  });

  it("does not reuse an earlier continuation while a retry guard is pending or fails", async () => {
    let discoveryRequests = 0;
    let guardRequests = 0;
    let releaseGuard!: () => void;
    let retryGuardStarted!: () => void;
    const pendingGuard = new Promise<void>((resolve) => {
      releaseGuard = resolve;
    });
    const guardStarted = new Promise<void>((resolve) => {
      retryGuardStarted = resolve;
    });
    server.use(
      http.get("*/sso/.well-known/authentication-configuration", () => {
        discoveryRequests += 1;
        return discoveryRequests === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ data: authenticationConfig });
      }),
      http.get("*/sso/login-guard", async () => {
        guardRequests += 1;
        if (guardRequests === 1) {
          return HttpResponse.json({ code: 200, data: { decision: LoginPageGuardDecision.Continue } });
        }
        retryGuardStarted();
        await pendingGuard;
        return new HttpResponse(null, { status: 503 });
      }),
    );
    window.history.replaceState({}, "", "/portal/login?client=iam&redirectUrl=https%3A%2F%2Fapp.example%2Fhome");
    render(
      <SsoRuntime>
        <LoginPage />
      </SsoRuntime>,
    );
    await screen.findByText("统一身份认证服务暂时不可用，请稍后重试");
    await waitFor(() => expect(guardRequests).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    try {
      await guardStarted;
      await waitFor(() => expect(discoveryRequests).toBe(2));
      expect(replace).not.toHaveBeenCalled();
      expect(screen.queryByPlaceholderText("请输入您的工号")).not.toBeInTheDocument();
    } finally {
      releaseGuard();
    }
    await screen.findByText("统一身份认证服务暂时不可用，请稍后重试");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("请输入您的工号")).not.toBeInTheDocument();
  });
});

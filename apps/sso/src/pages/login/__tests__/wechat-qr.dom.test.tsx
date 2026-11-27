import * as navigation from "@sso/utils/navigation";
import { HttpResponse, http } from "msw";
import { expect, it, vi } from "vitest";
import { mockLoginGuard } from "~sso/test/mocks/auth";
import { stubEventSource } from "~sso/test/mocks/event-source";
import { server } from "~sso/test/mocks/server";
import { act, screen, waitFor } from "~sso/test/render";
import { registerSsoAppLifecycle, renderSsoApp } from "~sso/test/render-app";
import { registerMswLifecycle } from "~sso/test/setup-msw";

registerMswLifecycle();
registerSsoAppLifecycle();

const requestId = "a".repeat(48);
const basePath = "/api/iam/auth/wechat-qr";

it.each([
  {
    protocol: "custom_sso",
    query: {
      client: "iam-admin",
      redirectUrl: "https://business.example/callback%2Ftenant?keep=a%26b",
      state: "opaque & state",
      ssoReturn: "b".repeat(43),
    },
    resume: "/sso/authorize",
  },
  { protocol: "oidc", query: { oidcReturn: "c".repeat(43) }, resume: "/oidc/resume" },
])("completes WeCom QR and resumes the original $protocol request", async ({ protocol, query, resume }) => {
  const params = new URLSearchParams(Object.entries(query));
  const requests: Request[] = [];
  const sources = stubEventSource();
  const replace = vi.spyOn(navigation, "replaceBrowserLocation").mockImplementation(() => {});
  server.use(
    mockLoginGuard("login", true).handler,
    http.get("*/oidc/login-guard", () => HttpResponse.json({ decision: "login", wechatQr: true })),
    http.post(`*${basePath}`, ({ request }) => {
      requests.push(request);
      return HttpResponse.json({
        data: {
          decision: "scan",
          requestId,
          expiresAt: Date.now() + 300_000,
          mobileUrl: "https://wecom.example.test/scan",
        },
      });
    }),
    http.post(`*${basePath}/${requestId}/complete`, ({ request }) => {
      requests.push(request);
      return HttpResponse.json({ data: { decision: "continue" } });
    }),
  );

  const { user, unmount } = renderSsoApp(`/portal/login?${params}`);
  await user.click(await screen.findByRole("button", { name: "企业微信扫码登录" }));
  await waitFor(() => expect(sources).toHaveLength(1));

  const [source] = sources;
  const expectedQuery = { ...Object.fromEntries(params), protocol };
  expect(source.url.pathname).toBe(`${basePath}/${requestId}/events`);
  expect(Object.fromEntries(source.url.searchParams)).toEqual(expectedQuery);
  expect(source.withCredentials).toBe(false);
  expect(requests).toHaveLength(1);

  await act(async () => source.emit({ status: "confirmed" }));
  await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
  const target = new URL(replace.mock.calls[0][0], window.location.origin);
  expect(target.pathname).toBe(resume);
  expect(Object.fromEntries(target.searchParams)).toEqual(Object.fromEntries(params));
  expect(requests.map(({ method, url }) => [method, new URL(url).pathname])).toEqual([
    ["POST", basePath],
    ["POST", `${basePath}/${requestId}/complete`],
  ]);
  for (const request of requests) {
    expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual(expectedQuery);
    expect(request.credentials).toBe("same-origin");
  }
  unmount();
  expect(source.readyState).toBe(2);
});

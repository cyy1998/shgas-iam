import * as auth from "@admin/utils/auth";
import { HttpResponse, http } from "msw";
import { expect, it, vi } from "vitest";
import { currentHrAdminUser, hrAdminCapabilitySummary } from "~admin/test/mocks/fixtures";
import { mockAdminRpc, mockCurrentAdminUser, rpcFailure } from "~admin/test/mocks/rpc";
import { server } from "~admin/test/mocks/server";
import { act, screen, waitFor, within } from "~admin/test/render";
import { registerAdminAppLifecycle, renderAdminApp } from "~admin/test/render-app";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();
registerAdminAppLifecycle();

const emptyCapabilities = { ...hrAdminCapabilitySummary, visibleModules: [] };

it("redirects a route absent from the Admin registry to the forbidden page", async () => {
  server.use(mockCurrentAdminUser(), mockAdminRpc().handler);
  const { router } = renderAdminApp("/iam-admin/unknown");
  await screen.findByText("无访问权限");
  expect(router.state.location.pathname).toBe("/iam-admin/403");
});

it.each([
  ["no visible modules", emptyCapabilities, "clients"],
  ["malformed capabilities", { visibleModules: ["client"] }, "clients"],
  ["HR access", hrAdminCapabilitySummary, "delegations"],
])("denies access with %s before issuing a management request", async (_, capabilities, module) => {
  const { handler, requests } = mockAdminRpc({ "admin.authorization.capabilitySummary": () => capabilities });
  server.use(mockCurrentAdminUser(currentHrAdminUser), handler);
  const { router } = renderAdminApp(`/iam-admin/${module}`);
  await screen.findByText(module === "delegations" ? "抱歉，你无权访问该页面" : "无访问权限");
  expect(router.state.location.pathname).toBe(module === "delegations" ? "/iam-admin/delegations" : "/iam-admin/403");
  expect(requests.map(({ procedure }) => procedure)).toEqual(["admin.authorization.capabilitySummary"]);
  expect(screen.queryByRole("button", { name: "新建委托" })).not.toBeInTheDocument();
});

it("keeps management requests blocked during and after a failed capability load", async () => {
  const gate = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  const { handler, requests } = mockAdminRpc({
    "admin.authorization.capabilitySummary": async () => {
      requested.resolve();
      await gate.promise;
      return rpcFailure(503);
    },
  });
  server.use(mockCurrentAdminUser(), handler);
  const { router } = renderAdminApp("/iam-admin/clients");
  try {
    await requested.promise;
    expect(router.state.location.pathname).toBe("/iam-admin/clients");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(requests.map(({ procedure }) => procedure)).toEqual(["admin.authorization.capabilitySummary"]);
  } finally {
    gate.resolve();
  }
  await screen.findByText("无访问权限");
  expect(router.state.location.pathname).toBe("/iam-admin/403");
  expect(requests.map(({ procedure }) => procedure)).toEqual(["admin.authorization.capabilitySummary"]);
});

it("restores a trusted callback query and hash before starting the Admin shell", async () => {
  server.use(mockCurrentAdminUser(), mockAdminRpc().handler);
  const params = new URLSearchParams({
    token: "local-session",
    state: "iam-first-party-navigation:v1:?tab=enabled#details",
  });
  const { router } = renderAdminApp(`/iam-admin/users?${params}`, { restoreCallback: true });
  await screen.findByRole("menu");
  expect(router.state.location).toMatchObject({
    pathname: "/iam-admin/users",
    search: "?tab=enabled",
    hash: "#details",
  });
});

it("sends an unauthenticated entry to SSO with the exact destination and state", async () => {
  const redirect = vi.spyOn(auth, "redirectToLogin").mockImplementation(() => {});
  const { handler, requests } = mockAdminRpc();
  server.use(
    http.get("*/api/iam/sso/user-info", () => new HttpResponse(null, { status: 401 })),
    handler,
  );
  try {
    renderAdminApp("/iam-admin/users?tab=enabled#details");
    await waitFor(() => expect(redirect).toHaveBeenCalledTimes(1));
    const target = new URL(auth.buildLoginRedirectUrl(), location.origin);
    expect(target.pathname).toBe("/sso/authorize");
    expect(Object.fromEntries(target.searchParams)).toEqual({
      client: "iam-admin",
      redirectUrl: `${location.origin}/iam-admin/users`,
      state: "iam-first-party-navigation:v1:?tab=enabled#details",
    });
    expect(requests).toEqual([]);
  } finally {
    redirect.mockRestore();
  }
});

function contents() {
  return within(screen.getByRole("navigation", { name: "说明书目录" }));
}

function chapter(id: string) {
  const href = `/iam-admin/help/hr-admin#${id}`;
  const link = contents()
    .getAllByRole("link")
    .find((element) => element.getAttribute("href") === href);
  if (!link) throw new Error(`No link for chapter ${id}`);
  return link;
}

it("keeps the help chapter through return, back navigation, and remount", async () => {
  server.use(
    mockCurrentAdminUser(currentHrAdminUser),
    mockAdminRpc({ "admin.authorization.capabilitySummary": () => hrAdminCapabilitySummary }).handler,
  );
  const app = renderAdminApp("/iam-admin/users");
  await app.user.click(await screen.findByRole("link", { name: "使用帮助" }));
  await screen.findByRole("navigation", { name: "说明书目录" });
  expect(app.router.state.location.pathname).toBe("/iam-admin/help/hr-admin");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  await app.user.click(chapter("transfer"));
  expect(chapter("transfer")).toHaveAttribute("aria-current", "page");

  const operationLink = within(screen.getByRole("article")).getByRole("link", { name: /雇佣关系.*新标签页/ });
  expect(operationLink).toHaveAttribute("href", "/iam-admin/employments");
  expect(operationLink).toHaveAttribute("target", "_blank");

  await app.user.click(screen.getByRole("link", { name: "返回管理后台" }));
  await screen.findByRole("menu");
  expect(app.router.state.location.pathname).toBe("/iam-admin/users");
  await act(async () => app.router.navigate(-1));
  expect(chapter("transfer")).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  app.unmount();

  const reopened = renderAdminApp("/iam-admin/help/hr-admin#transfer");
  await screen.findByRole("navigation", { name: "说明书目录" });
  expect(chapter("transfer")).toHaveAttribute("aria-current", "page");
  await reopened.user.click(chapter("resignation"));
  await act(async () => reopened.router.navigate(-1));
  expect(chapter("transfer")).toHaveAttribute("aria-current", "page");
});

it.each([emptyCapabilities, rpcFailure(503)])(
  "allows standalone help even when management is denied",
  async (result) => {
    const { handler, requests } = mockAdminRpc({ "admin.authorization.capabilitySummary": () => result });
    server.use(mockCurrentAdminUser(), handler);
    const { router, user, unmount } = renderAdminApp("/iam-admin/help/hr-admin#organizations");
    await screen.findByRole("navigation", { name: "说明书目录" });
    expect(chapter("organizations")).toHaveAttribute("aria-current", "page");
    await user.click(chapter("users"));
    expect(chapter("users")).toHaveAttribute("aria-current", "page");
    const path = router.state.location.pathname + router.state.location.hash;
    unmount();

    const reopened = renderAdminApp(path);
    await screen.findByRole("navigation", { name: "说明书目录" });
    expect(chapter("users")).toHaveAttribute("aria-current", "page");
    await act(async () => reopened.router.navigate("/users"));
    await screen.findByText("无访问权限");
    expect(reopened.router.state.location.pathname).toBe("/iam-admin/403");
    expect(requests.every(({ procedure }) => procedure === "admin.authorization.capabilitySummary")).toBe(true);
  },
);

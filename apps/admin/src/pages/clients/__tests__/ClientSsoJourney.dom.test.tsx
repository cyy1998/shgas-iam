import type { ClientSsoDetail } from "@admin/services/client-sso";
import { ApiErrorCode, ClientSsoCallbackType, ClientSsoProtocol, OidcClientType, OidcScope } from "@iam/contracts";
import { HttpResponse, http } from "msw";
import { expect, it } from "vitest";
import { adminClientDetail } from "~admin/test/mocks/fixtures";
import { mockAdminRpc, mockCurrentAdminUser, mutationCommitted, rpcFailure } from "~admin/test/mocks/rpc";
import { server } from "~admin/test/mocks/server";
import { fireEvent, screen, waitFor, within } from "~admin/test/render";
import { registerAdminAppLifecycle, renderAdminApp } from "~admin/test/render-app";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();
registerAdminAppLifecycle();

const clientCode = "portal";
const path = `/iam-admin/clients/${clientCode}/sso`;
const initial: ClientSsoDetail = {
  ...adminClientDetail,
  clientCode,
  ssoConfig: null,
  allowedActions: { save: true, selectProtocol: true, setEnabled: true, rotateSecret: true, readSecret: true },
};
const configured: ClientSsoDetail = {
  ...initial,
  ssoConfig: {
    protocol: ClientSsoProtocol.CustomSso,
    callbackType: ClientSsoCallbackType.Business,
    callbackEndpoint: "https://business.example/cb",
    validRedirectUrls: ["https://business.example/*"],
    subjectClaims: ["subjectIdentifier"],
  },
};

function fillCallback(url: string) {
  fireEvent.change(screen.getByLabelText("回调地址"), { target: { value: url } });
}

const saveButton = () => screen.getByRole("button", { name: "保存协议及配置" });
const repair = /旧配置或旧 Secret 可能仍生效/;

it("handles lost Secret responses and audit failures without replay, leaking a Secret, or clearing the repair warning", async () => {
  const current = { ...initial, hasSsoSecret: true };
  let reads = 0;
  const secret = "CURRENT-SECRET";
  const rpc = mockAdminRpc({
    "admin.clientSso.detail": () => current,
    "admin.clientSso.rotateSecret": () => mutationCommitted,
    "admin.clientSso.readSecret": () => {
      reads++;
      if (reads === 3) return rpcFailure(500, ApiErrorCode.AdminClientSecretReadAuditFailed);
      return { secret, credentialId: "credential-current", updatedAt: "2026-09-14T00:00:00Z" };
    },
  });
  server.use(
    mockCurrentAdminUser(),
    http.post(
      "*/rpc/admin.clientSso.readSecret",
      () => {
        reads++;
        return HttpResponse.error();
      },
      { once: true },
    ),
    rpc.handler,
  );
  const app = renderAdminApp(path);
  await app.user.click(await screen.findByRole("button", { name: "轮换 SSO Secret" }));
  expect(await screen.findByText(repair)).toBeVisible();
  expect(reads).toBe(0);
  const read = async () => app.user.click(screen.getByRole("button", { name: "读取当前 Secret" }));
  await read();
  expect(await screen.findByText(/当前 Secret 未取得，可能是响应丢失或权限不足/)).toBeVisible();
  expect(reads).toBe(1);
  await read();
  expect(await screen.findByText(secret, { exact: true })).toBeVisible();
  expect(screen.getByText(repair)).toBeVisible();
  expect(JSON.stringify([localStorage, sessionStorage])).not.toContain(secret);
  await read();
  expect(await screen.findByText(/读取审计未确认，未交付 Secret/)).toBeVisible();
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
  expect(screen.getByText(repair)).toBeVisible();
  expect(reads).toBe(3);
  await read();
  await screen.findByText(secret);
  app.unmount();
  renderAdminApp(path);
  expect(await screen.findByText(repair)).toBeVisible();
  expect(screen.queryByText(secret)).not.toBeInTheDocument();
  expect(reads).toBe(4);
  expect(rpc.collectMutationRequests().filter(({ procedure }) => procedure.endsWith("rotateSecret"))).toHaveLength(1);
});

it("configures OIDC, enables it, and switches directly to Custom SSO without unrelated writes", async () => {
  let current = initial;
  const rpc = mockAdminRpc({
    "admin.clientSso.detail": () => current,
    "admin.clientSso.selectProtocol": ({ data }) => {
      current = { ...current, ssoConfig: data.config, hasSsoSecret: true };
      return { changed: true, result: current };
    },
    "admin.clientSso.setEnabled": ({ data }) => {
      current = { ...current, ssoEnabled: data.enabled };
      return { changed: true, result: current };
    },
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const { user } = renderAdminApp(path);
  async function select(label: string, value: string) {
    await user.click(await screen.findByLabelText(label, { exact: true }));
    await user.click(await screen.findByTitle(value, { exact: true }));
  }

  const enable = await screen.findByRole("button", { name: "启用 SSO" });
  expect(enable).toBeDisabled();
  await select("SSO 协议", "OIDC");
  await user.type(screen.getByLabelText("登录Redirect URIs"), "https://rp.example/cb{Enter}");
  await user.click(saveButton());
  await waitFor(() => expect(enable).toBeEnabled());
  await user.click(enable);
  expect(await screen.findByRole("button", { name: "停用 SSO" })).toBeEnabled();
  await select("SSO 协议", "Custom SSO");
  await select("回调类型", "业务回调");
  fillCallback("https://business.example/cb");
  await user.type(screen.getByLabelText("Redirect URIs", { exact: true }), "https://business.example/*{Enter}");
  await user.click(saveButton());
  await waitFor(() => expect(current.ssoConfig?.protocol).toBe(ClientSsoProtocol.CustomSso));
  expect(current.ssoEnabled).toBe(true);

  expect(rpc.collectMutationRequests().map(({ procedure, input }) => [procedure, input])).toEqual([
    [
      "admin.clientSso.selectProtocol",
      {
        clientCode,
        data: {
          config: {
            protocol: ClientSsoProtocol.Oidc,
            clientType: OidcClientType.Public,
            redirectUris: ["https://rp.example/cb"],
            postLogoutRedirectUris: [],
            allowedScopes: [OidcScope.OpenId],
          },
        },
      },
    ],
    ["admin.clientSso.setEnabled", { clientCode, data: { enabled: true } }],
    [
      "admin.clientSso.selectProtocol",
      {
        clientCode,
        data: {
          config: {
            protocol: ClientSsoProtocol.CustomSso,
            callbackType: ClientSsoCallbackType.Business,
            callbackEndpoint: "https://business.example/cb",
            validRedirectUrls: ["https://business.example/*"],
            subjectClaims: ["subjectIdentifier"],
          },
        },
      },
    ],
  ]);
});

it("refreshes committed protocol facts and honors withdrawn actions without replay", async () => {
  let current = configured;
  const rpc = mockAdminRpc({
    "admin.clientSso.detail": () => current,
    "admin.clientSso.selectProtocol": ({ data }) => {
      current = {
        ...current,
        ssoConfig: data.config,
        allowedActions: { ...current.allowedActions, selectProtocol: false },
      };
      return mutationCommitted;
    },
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const app = renderAdminApp(path);
  await screen.findByLabelText("回调地址");
  fillCallback("https://business.example/new");
  await app.user.click(saveButton());
  expect(await screen.findByText(repair)).toBeVisible();
  await waitFor(() => expect(saveButton()).toBeDisabled());
  await app.user.click(screen.getByRole("button", { name: "刷新详情" }));
  app.unmount();
  renderAdminApp(path);
  expect(await screen.findByLabelText("回调地址")).toHaveValue("https://business.example/new");
  expect(screen.getByText(/刷新或读取 Secret 成功不代表传播已修复/)).toBeVisible();
  expect(saveButton()).toBeDisabled();
  expect(rpc.collectMutationRequests()).toHaveLength(1);
});

it("retains the repair warning after rejection, uncertain result, success, no-op and remount", async () => {
  let current = configured;
  let writes = 0;
  const rpc = mockAdminRpc({
    "admin.clientSso.detail": () => current,
    "admin.clientSso.selectProtocol": ({ data }) => {
      writes++;
      if (writes === 1 || writes === 4) current = { ...current, ssoConfig: data.config };
      if (writes === 1) return mutationCommitted;
      if (writes === 2) return rpcFailure(400);
      if (writes === 3) return rpcFailure(500);
      return { changed: writes === 4, result: current };
    },
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const app = renderAdminApp(path);
  await screen.findByLabelText("回调地址");
  fillCallback("https://business.example/committed");
  await app.user.click(saveButton());
  expect(await screen.findByText(repair)).toBeVisible();
  const key = `client-sso-repair:${clientCode}`;
  const persisted = sessionStorage.getItem(key);
  expect(persisted).toBeTruthy();
  for (const feedback of [
    "操作被拒绝，请检查输入和权限后再发起操作。",
    /操作未确认成功，可能已经生效/,
    "已保存",
    "无需修改",
  ]) {
    await waitFor(() => expect(saveButton()).toBeEnabled());
    await app.user.click(saveButton());
    expect((await screen.findAllByText(feedback)).at(-1)).toBeVisible();
    expect(screen.getByText(repair)).toBeVisible();
  }
  await app.user.click(screen.getByRole("button", { name: "刷新详情" }));
  app.unmount();
  renderAdminApp(path);
  expect(await screen.findByText(repair)).toBeVisible();
  expect(sessionStorage.getItem(key)).toBe(persisted);
  expect(writes).toBe(5);
});

it.each([path, `/iam-admin/clients/${clientCode}/edit?section=sso`])(
  "preserves drafts through refresh and blocks other actions and navigation at %s",
  async (entry) => {
    const rpc = mockAdminRpc({ "admin.clientSso.detail": () => configured });
    server.use(mockCurrentAdminUser(), rpc.handler);
    const { user } = renderAdminApp(entry);
    const callback = await screen.findByLabelText("回调地址");
    fillCallback("https://business.example/draft");
    const rotate = screen.getByRole("button", { name: "轮换 SSO Secret" });
    const enable = screen.getByRole("button", { name: "启用 SSO" });
    expect(rotate).toBeDisabled();
    expect(enable).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "刷新详情" }));
    await waitFor(() =>
      expect(rpc.requests.filter(({ procedure }) => procedure === "admin.clientSso.detail")).toHaveLength(2),
    );
    expect(callback).toHaveValue("https://business.example/draft");
    expect(rotate).toBeDisabled();
    expect(enable).toBeDisabled();
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("link", { name: /应用管理/ }));
    await screen.findByText("放弃未保存的修改？", { selector: ".ant-modal-confirm-title" });
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: /取\s*消/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(callback).toHaveValue("https://business.example/draft");
    expect(rpc.collectMutationRequests()).toEqual([]);
  },
);

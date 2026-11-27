import type { ClientSsoDetail } from "@admin/services/client-sso";
import { ClientSsoProtocol } from "@iam/contracts";
import { message } from "antd";
import { expect, it } from "vitest";
import { adminClientDetail } from "~admin/test/mocks/fixtures";
import { mockAdminRpc, mockCurrentAdminUser, mutationCommitted } from "~admin/test/mocks/rpc";
import { server } from "~admin/test/mocks/server";
import { act, fireEvent, screen, waitFor, within } from "~admin/test/render";
import { registerAdminAppLifecycle, renderAdminApp } from "~admin/test/render-app";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();
registerAdminAppLifecycle();

const listPath = "/iam-admin/clients";
const editPath = `${listPath}/iam-admin/edit`;
const defaultSso: ClientSsoDetail = {
  ...adminClientDetail,
  ssoConfig: null,
  allowedActions: { save: true, selectProtocol: true, setEnabled: true, rotateSecret: true, readSecret: true },
};

function fill(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

it("opens the unified editor from the single list edit link", async () => {
  server.use(mockCurrentAdminUser(), mockAdminRpc().handler);
  const { user, router } = renderAdminApp(listPath);
  const edit = await screen.findByRole("link", { name: "编辑" });
  expect(screen.queryByRole("link", { name: "SSO 启用" })).not.toBeInTheDocument();
  await user.click(edit);
  expect(await screen.findByRole("tab", { name: "基础信息" })).toHaveAttribute("aria-selected", "true");
  expect(router.state.location).toMatchObject({ pathname: editPath, search: "?section=basic" });
});

it.each([false, true])("opens the created editor with persisted facts (committed failure %s)", async (committed) => {
  const rpc = mockAdminRpc({
    "admin.client.create": ({ clientCode }) =>
      committed ? mutationCommitted : { changed: true, result: { ...adminClientDetail, clientCode } },
    "admin.client.detail": ({ clientCode }) => ({ ...adminClientDetail, clientCode, clientName: "新门户" }),
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const { user, router } = renderAdminApp(listPath);
  await user.click(await screen.findByRole("button", { name: /新建应用/ }));
  const dialog = within(await screen.findByRole("dialog"));
  fill(dialog.getByLabelText("应用编码"), "portal cn");
  fill(dialog.getByLabelText("应用名称"), "门户");
  fill(dialog.getByLabelText("通用应用密钥"), "basic-secret");
  await user.click(dialog.getByRole("button", { name: "创建并编辑" }));

  await screen.findByRole("tab", { name: "基础信息" });
  expect(screen.getByLabelText("应用名称")).toHaveValue("新门户");
  expect(router.state.location).toMatchObject({
    pathname: `${listPath}/portal%20cn/edit`,
    search: committed ? "?section=basic&committed=1" : "?section=basic",
  });
  if (committed) expect(screen.getByText(/详情可读不代表传播已恢复/)).toBeVisible();
  expect(rpc.collectMutationRequests().map(({ procedure }) => procedure)).toEqual(["admin.client.create"]);
  expect(rpc.requests.filter(({ procedure }) => procedure === "admin.client.detail").map(({ input }) => input)).toEqual(
    [{ clientCode: "portal cn" }],
  );
});

it("guards a credential draft across tabs, history, and closing the document", async () => {
  const rpc = mockAdminRpc({ "admin.clientSso.detail": () => defaultSso });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const { user, router } = renderAdminApp(listPath);
  await user.click(await screen.findByRole("link", { name: "编辑" }));
  fill(await screen.findByLabelText("通用应用密钥"), "unsaved-secret");

  const beforeUnload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(beforeUnload);
  expect(beforeUnload.defaultPrevented).toBe(true);

  const ssoTab = screen.getByRole("tab", { name: "SSO 配置" });
  await user.click(ssoTab);
  await screen.findByText("放弃未保存的修改？", { selector: ".ant-modal-confirm-title" });
  await user.click(screen.getByRole("button", { name: /取\s*消/ }));
  expect(screen.getByLabelText("通用应用密钥")).toHaveValue("unsaved-secret");
  expect(router.state.location.search).toBe("?section=basic");

  await user.click(ssoTab);
  await user.click(await screen.findByRole("button", { name: "放弃修改" }));
  await waitFor(() => expect(router.state.location.search).toBe("?section=sso"));
  await user.click(screen.getByRole("tab", { name: "基础信息" }));
  expect(await screen.findByLabelText("通用应用密钥")).toHaveValue(adminClientDetail.clientSecret);
  fill(screen.getByLabelText("通用应用密钥"), "another-secret");
  await act(async () => router.navigate(-1));
  await user.click(await screen.findByRole("button", { name: "放弃修改" }));
  await waitFor(() => expect(router.state.location.search).toBe("?section=sso"));
  await user.click(screen.getByRole("button", { name: /返回应用列表/ }));
  await user.click(await screen.findByRole("link", { name: "编辑" }));
  expect(await screen.findByLabelText("通用应用密钥")).toHaveValue(adminClientDetail.clientSecret);
  expect(rpc.collectMutationRequests()).toEqual([]);
});

it("normalizes an unknown section and returns to the list after deletion", async () => {
  const rpc = mockAdminRpc();
  server.use(mockCurrentAdminUser(), rpc.handler);
  const { user, router } = renderAdminApp(`${editPath}?section=unknown`);
  expect(await screen.findByRole("tab", { name: "基础信息" })).toHaveAttribute("aria-selected", "true");
  expect(router.state.location.search).toBe("?section=basic");
  await user.click(screen.getByRole("button", { name: "删除应用" }));
  await screen.findByText("删除应用 IAM 管理后台？", { selector: ".ant-modal-confirm-title" });
  const confirm = () => within(screen.getByRole("dialog")).getByRole("button", { name: /确\s*定/ });
  await waitFor(() => expect(confirm()).toBeVisible());
  fireEvent.click(confirm());
  await waitFor(() => expect(rpc.collectMutationRequests()).toHaveLength(1));
  await waitFor(() => expect(router.state.location.pathname).toBe(listPath));
  expect(rpc.collectMutationRequests()).toMatchObject([
    { procedure: "admin.client.delete", input: { clientCode: "iam-admin" } },
  ]);
});

it("validates, saves and reopens both Custom SSO callback types without retaining a discarded endpoint", async () => {
  let current = { ...defaultSso };
  const rpc = mockAdminRpc({
    "admin.clientSso.detail": () => current,
    "admin.clientSso.selectProtocol": ({ data }) => {
      current = { ...current, ssoConfig: data.config };
      return { changed: true, result: current };
    },
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const path = `${listPath}/iam-admin/sso`;
  let app = renderAdminApp(path);
  const choose = async (label: string, option: string) => {
    await app.user.click(await screen.findByLabelText(label, { exact: true }));
    await app.user.click(await screen.findByTitle(option, { exact: true }));
  };
  const save = () => app.user.click(screen.getByRole("button", { name: "保存协议及配置" }));

  await choose("SSO 协议", "Custom SSO");
  const redirects = screen.getByLabelText("Redirect URIs", { exact: true });
  await app.user.type(redirects, "https://app.test/home{Enter}");
  await screen.findByTitle("https://app.test/home");
  await save();
  expect(await screen.findAllByText("请选择回调类型")).not.toHaveLength(0);
  expect(rpc.collectMutationRequests()).toEqual([]);
  await choose("回调类型", "托管回调");
  await save();
  await waitFor(() =>
    expect(current.ssoConfig).toEqual({
      protocol: ClientSsoProtocol.CustomSso,
      callbackType: "managed",
      validRedirectUrls: ["https://app.test/home"],
      subjectClaims: ["subjectIdentifier"],
    }),
  );

  app.unmount();
  app = renderAdminApp(path);
  await screen.findByLabelText("回调类型");
  expect(screen.queryByLabelText("回调地址")).not.toBeInTheDocument();
  await choose("回调类型", "业务回调");
  fill(screen.getByLabelText("回调地址"), "https://app.test/sso/callback");
  await save();
  await waitFor(() =>
    expect(current.ssoConfig).toMatchObject({
      callbackType: "business",
      callbackEndpoint: "https://app.test/sso/callback",
    }),
  );

  app.unmount();
  app = renderAdminApp(path);
  expect(await screen.findByLabelText("回调地址")).toHaveValue("https://app.test/sso/callback");
  await choose("回调类型", "托管回调");
  await save();
  await waitFor(() => expect(current.ssoConfig).toMatchObject({ callbackType: "managed" }));
  expect(current.ssoConfig).not.toHaveProperty("callbackEndpoint");

  app.unmount();
  app = renderAdminApp(path);
  await choose("回调类型", "业务回调");
  const callback = screen.getByLabelText("回调地址");
  expect(callback).toHaveValue("");
  await act(async () => message.destroy());
  await save();
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(rpc.collectMutationRequests()).toHaveLength(3);
  fill(callback, "https://app.test/new/callback");
  await save();
  await waitFor(() =>
    expect(current.ssoConfig).toMatchObject({
      callbackType: "business",
      callbackEndpoint: "https://app.test/new/callback",
    }),
  );
  expect(rpc.collectMutationRequests()).toHaveLength(4);
});

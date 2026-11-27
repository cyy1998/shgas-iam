import type { ClientSsoDetail } from "@admin/services/client-sso";
import { ApiErrorCode, UserType } from "@iam/contracts";
import { expect, it } from "vitest";
import { adminClientDetail, adminUsers } from "~admin/test/mocks/fixtures";
import { mockAdminRpc, mockCurrentAdminUser, mutationCommitted, rpcFailure } from "~admin/test/mocks/rpc";
import { server } from "~admin/test/mocks/server";
import { fireEvent, screen, waitFor } from "~admin/test/render";
import { registerAdminAppLifecycle, renderAdminApp } from "~admin/test/render-app";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();
registerAdminAppLifecycle();

const path = "/iam-admin/clients/expense/edit";
const allowedActions = { save: true, preview: true, setEnabled: true };
const sso: ClientSsoDetail = {
  ...adminClientDetail,
  clientCode: "expense",
  ssoConfig: null,
  allowedActions: { save: true, selectProtocol: true, setEnabled: true, rotateSecret: true, readSecret: true },
};

function open(section = "admission") {
  const app = renderAdminApp(`${path}?section=${section}`);
  return {
    ...app,
    async choose(field: string, option: string, index = 0) {
      await screen.findAllByLabelText(field, { exact: true });
      await app.user.click(screen.getAllByLabelText(field, { exact: true })[index]);
      const choices = await screen.findAllByTitle(option, { exact: true });
      await app.user.click(choices[choices.length - 1]);
    },
    tab: async (name: string) => app.user.click(await screen.findByRole("tab", { name })),
  };
}

const saveButton = () => screen.getByRole("button", { name: "保存条件" });
const enableButton = () => screen.getByRole("button", { name: "开启准入策略" });
const conditionValue = () => screen.getByLabelText("条件值", { exact: true });

function fill(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

it("retains the draft on rejected, unavailable and uncertain saves and locks controls during action refresh", async () => {
  const failures = [
    { status: 403, notice: /准入策略操作已被拒绝/ },
    { status: 503, notice: /准入策略服务暂时不可用/ },
    { status: 500, notice: /操作结果未确认/ },
  ];
  let actions = allowedActions;
  let filter: unknown = { field: "username", op: "eq", value: "saved" };
  let saves = 0;
  const refreshing = Promise.withResolvers<void>();
  const releaseRefresh = Promise.withResolvers<void>();
  const rpc = mockAdminRpc({
    "admin.clientAdmission.detail": async () => {
      if (!actions.save) {
        refreshing.resolve();
        await releaseRefresh.promise;
      }
      return { enabled: false, filter, allowedActions: actions };
    },
    "admin.clientAdmission.save": ({ data }) => {
      const failure = failures[saves++];
      if (failure) return rpcFailure(failure.status);
      filter = data.filter;
      actions = { save: false, preview: false, setEnabled: false };
      return { changed: true, result: { enabled: false, filter } };
    },
  });
  server.use(mockCurrentAdminUser(), rpc.handler);

  const { user } = open();
  const condition = await screen.findByLabelText("条件值", { exact: true });
  const previewUser = screen.getByRole("combobox", { name: "试算用户" });
  expect(enableButton()).toBeEnabled();
  expect(previewUser).toBeEnabled();
  fill(condition, "draft");

  for (const { notice } of failures) {
    await user.click(saveButton());
    expect(await screen.findByText(notice)).toBeVisible();
    expect(conditionValue()).toHaveValue("draft");
    expect(saveButton()).toBeEnabled();
  }
  try {
    await user.click(saveButton());
    await refreshing.promise;
    expect(enableButton()).toBeDisabled();
    expect(previewUser).toBeDisabled();
  } finally {
    releaseRefresh.resolve();
  }
  await screen.findByText("准入条件已保存");
  await waitFor(() => expect(conditionValue()).toBeDisabled());
  expect(conditionValue()).toHaveValue("draft");
  expect(enableButton()).toBeDisabled();
  expect(previewUser).toBeDisabled();
  expect(rpc.collectMutationRequests()).toHaveLength(4);
});

it("preserves committed enablement and its repair warning across sections and remount", async () => {
  let policy: { enabled: boolean; filter: unknown } = { enabled: false, filter: null };
  const toggles: boolean[] = [];
  const committed = Promise.withResolvers<void>();
  const reply = Promise.withResolvers<void>();
  const rpc = mockAdminRpc({
    "admin.clientSso.detail": () => sso,
    "admin.clientAdmission.detail": () => ({ ...policy, allowedActions }),
    "admin.clientAdmission.save": ({ data }) => {
      policy = { ...policy, filter: data.filter };
      return { changed: true, result: policy };
    },
    "admin.clientAdmission.setEnabled": async ({ data }) => {
      policy = { ...policy, enabled: data.enabled };
      toggles.push(data.enabled);
      if (toggles.length < 3) return { changed: true, result: { enabled: policy.enabled } };
      committed.resolve();
      await reply.promise;
      return mutationCommitted;
    },
  });
  server.use(mockCurrentAdminUser(), rpc.handler);

  const app = open();
  await screen.findByRole("button", { name: "开启准入策略" });
  expect(enableButton()).toBeDisabled();
  await app.choose("字段", "账号");
  fill(conditionValue(), "employee");
  expect(enableButton()).toBeDisabled();
  await app.user.click(saveButton());
  await waitFor(() => expect(enableButton()).toBeEnabled());
  await app.user.click(enableButton());
  await screen.findByText("状态：已开启");
  await app.user.click(screen.getByRole("button", { name: "关闭准入策略" }));
  await screen.findByText("状态：已关闭");
  expect(conditionValue()).toHaveValue("employee");

  try {
    await app.user.click(enableButton());
    await committed.promise;
    await app.tab("SSO 配置");
    expect(await screen.findByRole("button", { name: "保存协议及配置" })).toBeEnabled();
  } finally {
    reply.resolve();
  }
  const warning = /操作已提交，但缓存同步失败或未确认/;
  expect(await screen.findByText(warning)).toBeVisible();
  await app.tab("应用准入");
  await screen.findByText("状态：已开启");
  expect(screen.getByText(warning)).toBeVisible();
  app.unmount();
  const reopened = open();
  await screen.findByText("状态：已开启");
  expect(conditionValue()).toHaveValue("employee");
  expect(screen.getByText(warning)).toBeVisible();
  await reopened.tab("SSO 配置");
  expect(await screen.findByRole("button", { name: "保存协议及配置" })).toBeEnabled();
  expect(screen.getByText(warning)).toBeVisible();
  expect(toggles).toEqual([true, false, true]);
});

it("previews unsaved conditions on a disabled policy and reopens the saved condition", async () => {
  const formal = { field: "userType", op: "eq", value: UserType.Formal };
  const external = { ...formal, value: UserType.External };
  let policy: { enabled: boolean; filter: unknown } = { enabled: false, filter: null };
  let available = true;
  const rpc = mockAdminRpc({
    "admin.clientAdmission.detail": () => ({ ...policy, allowedActions }),
    "admin.clientAdmission.preview": ({ data }) => ({
      status: available
        ? JSON.stringify(data.filter) === JSON.stringify(formal)
          ? "match"
          : "no-match"
        : "unavailable",
    }),
    "admin.clientAdmission.save": ({ data }) => {
      policy = { ...policy, filter: data.filter };
      return { changed: true, result: policy };
    },
  });
  server.use(mockCurrentAdminUser(), rpc.handler);

  const app = open("basic");
  await app.tab("应用准入");
  const user = adminUsers[0];
  const selectUser = async () => {
    fill(screen.getByRole("combobox", { name: "试算用户" }), user.username);
    await app.user.click(await screen.findByTitle(`${user.name} (${user.username})`));
  };
  const preview = () => app.user.click(screen.getByRole("button", { name: /^试\s*算$/ }));
  const inputs = (suffix: string) =>
    rpc.requests.filter(({ procedure }) => procedure === `admin.clientAdmission.${suffix}`).map(({ input }) => input);

  await app.choose("用户类型", UserType.Formal);
  await selectUser();
  await preview();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/^匹配$/));
  expect(inputs("preview")).toEqual([{ clientCode: "expense", data: { userId: user.id, filter: formal } }]);
  expect(inputs("save")).toEqual([]);

  await app.user.click(saveButton());
  await screen.findByText("准入条件已保存");
  expect(inputs("save")).toEqual([{ clientCode: "expense", data: { filter: formal } }]);
  await app.tab("基础信息");
  await app.tab("应用准入");
  expect(await screen.findByText(UserType.Formal, { exact: true })).toBeVisible();
  await app.choose("用户类型", UserType.External);
  await selectUser();
  await preview();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("不匹配"));
  expect(inputs("preview")).toHaveLength(2);
  expect(inputs("preview").at(-1)).toEqual({ clientCode: "expense", data: { userId: user.id, filter: external } });
  available = false;
  await preview();
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("暂时无法判断"));
  expect(inputs("save")).toHaveLength(1);
});

it("builds and reopens a nested condition scoped to one active employment", async () => {
  let filter: unknown = null;
  const rpc = mockAdminRpc({
    "admin.clientAdmission.detail": () => ({ enabled: false, filter, allowedActions }),
    "admin.clientAdmission.save": ({ data }) => {
      filter = data.filter;
      return { changed: true, result: { enabled: false, filter } };
    },
  });
  server.use(mockCurrentAdminUser(), rpc.handler);

  const app = open();
  await app.choose("条件类型", "存在满足条件的有效任职");
  await app.choose("条件类型", "全部满足", 1);
  await app.choose("字段", "岗位名称");
  fill(conditionValue(), "审批员");
  await app.user.click(screen.getByRole("button", { name: "添加子条件" }));
  await app.choose("条件值", "是", 1);
  await app.user.click(saveButton());
  await screen.findByText("准入条件已保存");
  expect(rpc.collectMutationRequests()).toMatchObject([
    {
      procedure: "admin.clientAdmission.save",
      input: {
        clientCode: "expense",
        data: {
          filter: {
            exists: {
              path: "employments",
              where: {
                and: [
                  { field: "position.name", op: "eq", value: "审批员" },
                  { field: "isPrimary", op: "eq", value: true },
                ],
              },
            },
          },
        },
      },
    },
  ]);
  await app.tab("基础信息");
  await app.tab("应用准入");
  expect(await screen.findByText("存在满足条件的有效任职", { exact: true })).toBeVisible();
  expect(screen.getByText("全部满足", { exact: true })).toBeVisible();
  expect(screen.getAllByLabelText("条件值", { exact: true })[0]).toHaveValue("审批员");
  expect(screen.getByText("是", { exact: true })).toBeVisible();
});

it("explains null semantics and round-trips missing reference codes while editing another condition", async () => {
  const filter = {
    or: [
      { not: { field: "mobile", op: "in", value: ["13000000001", "13000000002"] } },
      {
        not: {
          exists: {
            path: "employments",
            where: {
              and: [
                { exists: { path: "organization.path", where: { field: "code", op: "eq", value: "FIN-OLD" } } },
                { field: "position.code", op: "eq", value: "APPROVER-OLD" },
                { field: "roles", op: "containsAny", value: ["expense:old"] },
              ],
            },
          },
        },
      },
    ],
  };
  const rpc = mockAdminRpc({
    "admin.clientAdmission.detail": () => ({ enabled: false, filter, allowedActions }),
    "admin.organization.detail": () => rpcFailure(404, ApiErrorCode.OrganizationNotFound),
    "admin.position.detail": () => rpcFailure(404, ApiErrorCode.PositionNotFound),
    "admin.role.detail": () => rpcFailure(404, ApiErrorCode.RoleNotFound),
    "admin.clientAdmission.save": ({ data }) => ({ changed: true, result: { enabled: false, filter: data.filter } }),
  });
  server.use(mockCurrentAdminUser(), rpc.handler);

  const { user } = open();
  expect(await screen.findByText("手机号未填写时比较结果为假，外层排除后可为真。")).toBeVisible();
  expect(screen.getByText(/没有有效任职时，本条件为假，外层排除后可为真/)).toBeVisible();
  expect(screen.getByText(/包含该组织自身及其后代/)).toBeVisible();
  expect(await screen.findByText(/找不到组织编码「FIN-OLD」/)).toBeVisible();
  expect(await screen.findByText(/找不到岗位编码「APPROVER-OLD」/)).toBeVisible();
  expect(await screen.findByText(/找不到角色编码「expense:old」/)).toBeVisible();
  expect(saveButton()).toBeDisabled();
  fill(screen.getAllByRole("textbox", { name: "条件值" })[1], "13000000003");
  await user.click(saveButton());
  await screen.findByText("准入条件已保存");
  expect(rpc.collectMutationRequests().map(({ input }) => input)).toEqual([
    {
      clientCode: "expense",
      data: {
        filter: { or: [{ not: { field: "mobile", op: "in", value: ["13000000001", "13000000003"] } }, filter.or[1]] },
      },
    },
  ]);
});

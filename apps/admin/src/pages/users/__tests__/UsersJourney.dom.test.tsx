import type { UserSearchParams } from "@admin/services/user";
import * as auth from "@admin/utils/auth";
import { UserStatus } from "@iam/contracts";
import { expect, it, vi } from "vitest";
import { adminUserSearchResult, hrAdminUserDetail } from "~admin/test/mocks/fixtures";
import { mockAdminRpc, mockCurrentAdminUser, rpcFailure } from "~admin/test/mocks/rpc";
import { mockScopedManagement } from "~admin/test/mocks/scoped-management";
import { server } from "~admin/test/mocks/server";
import { fireEvent, screen, waitFor, within } from "~admin/test/render";
import { registerAdminAppLifecycle, renderAdminApp } from "~admin/test/render-app";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();
registerAdminAppLifecycle();

const entry = "/iam-admin/users";

it("paginates, trims the server search keyword and resets exact filters and pagination", async () => {
  const inputs: UserSearchParams[] = [];
  server.use(
    mockCurrentAdminUser(),
    mockAdminRpc({
      "admin.user.search": (input) => {
        inputs.push(input);
        return { ...adminUserSearchResult, total: 45 };
      },
    }).handler,
  );
  const { user } = renderAdminApp(entry);
  await screen.findByRole("row", { name: /张三/ }, { timeout: 3000 });
  await user.click(screen.getByRole("button", { name: "下一页" }));
  await waitFor(() => expect(inputs.at(-1)?.pageNum).toBe(2));

  const search = screen.getByRole("searchbox", { name: "搜索用户" });
  fireEvent.change(search, { target: { value: "  张三  " } });
  await user.type(search, "{Enter}");
  await waitFor(() =>
    expect(inputs.at(-1)).toMatchObject({
      pageNum: 1,
      conditions: { fuzzyConditions: { text: "张三" } },
    }),
  );
  await user.click(screen.getByRole("combobox", { name: "用户状态" }));
  await user.click(await screen.findByTitle("暂停", { exact: true }));
  await waitFor(() => expect(inputs.at(-1)?.conditions?.exactConditions?.statuses).toEqual([UserStatus.Pause]));
  await user.click(screen.getByRole("button", { name: "清除筛选" }));
  await waitFor(() =>
    expect(inputs.at(-1)).toMatchObject({
      pageNum: 1,
      conditions: { fuzzyConditions: {}, exactConditions: {} },
    }),
  );
  expect(search).toHaveValue("");
});

it("shows an unavailable list as an error and reloads it on explicit retry", async () => {
  let reads = 0;
  server.use(
    mockCurrentAdminUser(),
    mockAdminRpc({
      "admin.user.search": () => (++reads === 1 ? rpcFailure(503) : adminUserSearchResult),
    }).handler,
  );
  const { user } = renderAdminApp(entry);
  expect(await screen.findByRole("alert")).toHaveTextContent("用户列表加载失败");
  expect(screen.queryByText("暂无用户")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /重\s*试/ }));
  await waitFor(() => expect(screen.getAllByRole("button", { name: "查看" })).toHaveLength(3));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(reads).toBe(2);
});

it("shows the scoped HR menu, follows an employment deep link and logs out from the shell", async () => {
  const rpc = mockScopedManagement();
  const logout = vi.spyOn(auth, "logout").mockImplementation(() => {});
  const { user, router } = renderAdminApp("/iam-admin/");
  try {
    await screen.findByRole("row", { name: /张三/ });
    const menu = within(screen.getByRole("menu"));
    for (const name of [/用户管理/, /职位管理/, /组织管理/, /组织责任/, /雇佣关系/]) {
      expect(menu.getByRole("menuitem", { name })).toBeVisible();
    }
    for (const name of [/应用管理/, /角色管理/, /会话管理/, /委托管理/, /审计日志/, /系统日志/]) {
      expect(menu.queryByRole("menuitem", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /新建用户/ })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("row", { name: /张三/ })).getByRole("button", { name: "查看" }));
    const drawer = within(await screen.findByRole("dialog"));
    expect(await drawer.findByRole("button", { name: /状\s*态/ })).toBeDisabled();
    expect(drawer.queryByRole("tab", { name: "操作日志" })).not.toBeInTheDocument();
    await user.click(drawer.getByRole("link", { name: "财务经理 (FIN-001)" }));
    await waitFor(() =>
      expect(router.state.location).toMatchObject({ pathname: "/iam-admin/employments", search: "?employmentId=42" }),
    );
    const start = await screen.findByText("开始日", { exact: true });
    const employment = start.closest<HTMLElement>('[role="dialog"]');
    if (!employment) throw new Error("Expected the Employment detail drawer");
    expect(within(employment).getByText("2026-01-05")).toBeVisible();
    await user.click(within(employment).getByRole("button", { name: "关闭" }));
    expect(rpc.collectMutationRequests()).toEqual([]);

    await user.click(screen.getByText("人事管理员(hradmin)"));
    await user.click(await screen.findByText("退出登录", { exact: true }));
    expect(logout).toHaveBeenCalledTimes(1);
    const target = new URL(auth.buildLogoutRedirectUrl(), location.origin);
    expect(target.pathname).toBe("/sso/logout");
    expect(target.searchParams.get("redirectUrl")).toBe(`${location.origin}/iam-admin`);
  } finally {
    logout.mockRestore();
  }
});

it("only enables rehire after refreshing a disabled User to Pause and defaults to the Beijing date", async () => {
  vi.setSystemTime(new Date("2026-11-17T16:30:00Z"));
  let status = UserStatus.Disable;
  const rpc = mockScopedManagement({
    "admin.user.detail": () => ({
      ...hrAdminUserDetail,
      status,
      employments: [],
      allowedActions: {
        ...hrAdminUserDetail.allowedActions,
        changeStatus: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
      },
    }),
    "admin.employment.create": () => ({ changed: true, result: { id: 101 } }),
  });
  try {
    const { user } = renderAdminApp(entry);
    const openUser = async () => {
      const row = await screen.findByRole("row", { name: /张三/ });
      await user.click(within(row).getByRole("button", { name: "查看" }));
      const drawer = within(await screen.findByRole("dialog"));
      await drawer.findByRole("region", { name: "雇佣信息" });
      return drawer;
    };
    let drawer = await openUser();
    expect(drawer.getByRole("button", { name: /状\s*态/ })).toBeDisabled();
    expect(drawer.getByRole("button", { name: /新增雇佣/ })).toBeDisabled();
    expect(rpc.collectMutationRequests()).toEqual([]);
    status = UserStatus.Pause;
    await user.click(drawer.getByRole("button", { name: "关闭" }));
    drawer = await openUser();
    await user.click(drawer.getByRole("button", { name: /新增雇佣/ }));
    const start = await screen.findByPlaceholderText("开始日");
    const formElement = start.closest<HTMLElement>('[role="dialog"]');
    if (!formElement) throw new Error("Expected an Employment form dialog");
    const form = within(formElement);
    await user.click(form.getAllByRole("combobox")[1]);
    await user.click(await screen.findByText("授权根 A (ROOT-A)", { exact: true }));
    await user.click(form.getAllByRole("combobox")[2]);
    await user.click(await screen.findByTitle("财务经理 (FIN-001)"));
    expect(form.getByPlaceholderText("开始日")).toHaveValue("2026-11-18");
    await user.click(form.getByRole("button", { name: /确\s*定/ }));
    await waitFor(() => expect(rpc.collectMutationRequests()).toHaveLength(1));
    expect(rpc.collectMutationRequests().map(({ input }) => input)).toEqual([
      {
        username: "zhangsan",
        orgCode: "ROOT-A",
        posCode: "FIN-001",
        isPrimary: false,
        description: null,
        startTime: "2026-11-18",
        endTime: null,
      },
    ]);
  } finally {
    vi.useRealTimers();
  }
});

import { EmploymentStatus } from "@iam/contracts";
import { expect, it, vi } from "vitest";
import {
  adminCapabilitySummary,
  adminEmploymentSearchResult,
  createHrEmploymentAllowedActions,
  currentAdminUser,
  hrAdminEmploymentDetail,
} from "~admin/test/mocks/fixtures";
import { mockCurrentAdminUser, mutationCommitted } from "~admin/test/mocks/rpc";
import { mockScopedManagement } from "~admin/test/mocks/scoped-management";
import { server } from "~admin/test/mocks/server";
import { act, fireEvent, screen, waitFor, within } from "~admin/test/render";
import { registerAdminAppLifecycle, renderAdminApp } from "~admin/test/render-app";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();
registerAdminAppLifecycle();
const path = "/iam-admin/employments";

type User = ReturnType<typeof renderAdminApp>["user"];

function fill(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

function openRow(user: User) {
  return screen.findByRole("row", { name: /张三/ }, { timeout: 3000 }).then(async (row) => {
    const view = within(row);
    expect(view.queryByRole("button", { name: /转\s*岗/ })).not.toBeInTheDocument();
    await user.click(view.getByText("查看"));
    const basic = await screen.findByRole("region", { name: "基本信息" });
    const drawer = basic.closest<HTMLElement>('[role="dialog"]');
    if (!drawer) throw new Error("Expected an Employment detail drawer");
    return within(drawer);
  });
}

async function pickDay(user: User, date: string) {
  const cells = await screen.findAllByTitle(date, { exact: true });
  const cell = cells.find((element) => element.classList.contains("ant-picker-cell-in-view"));
  if (!cell) throw new Error(`Date picker did not show ${date}`);
  await user.click(cell);
}

it("filters by scope and protects the date range before creating a pending Employment", async () => {
  vi.setSystemTime(new Date("2090-03-01T16:30:00Z"));
  const pending = {
    ...hrAdminEmploymentDetail,
    status: EmploymentStatus.Pending,
    startTime: "2090-03-03",
    endTime: "2090-03-10",
    allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Pending, true),
  };
  let created = false;
  const rpc = mockScopedManagement({
    "admin.employment.search": () => (created ? { result: [pending], total: 1 } : adminEmploymentSearchResult),
    "admin.employment.detail": () => pending,
    "admin.employment.create": () => {
      created = true;
      return { changed: true, result: { id: pending.id } };
    },
  });
  const searches = () =>
    rpc.requests.filter(({ procedure }) => procedure === "admin.employment.search").map(({ input }) => input);
  try {
    const { user } = renderAdminApp(path);
    await screen.findByRole("cell", { name: /张三/ }, { timeout: 3000 });
    const active = [EmploymentStatus.Enable, EmploymentStatus.Pause, EmploymentStatus.Pending];
    expect(searches()[0]).toMatchObject({ conditions: { exactConditions: { statuses: active } } });
    await user.click(screen.getByRole("combobox", { name: "雇佣状态" }));
    await user.click(await screen.findByTitle("结束", { exact: true }));
    const search = screen.getByRole("searchbox", { name: "搜索雇佣用户" });
    fill(search, " 张三 ");
    await user.type(search, "{Enter}");
    await user.click(screen.getByRole("combobox", { name: "主岗筛选" }));
    await user.click(await screen.findByTitle("非主岗", { exact: true }));
    await waitFor(() =>
      expect(searches().at(-1)).toMatchObject({
        conditions: {
          fuzzyConditions: { userText: "张三" },
          exactConditions: { statuses: [EmploymentStatus.Disable], isPrimary: false },
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    await waitFor(() =>
      expect(searches().at(-1)).toMatchObject({
        conditions: { fuzzyConditions: {}, exactConditions: { statuses: active } },
      }),
    );
    await user.click(screen.getByRole("button", { name: /新增雇佣/ }));
    const dialog = within(await screen.findByRole("dialog"));
    fill((await dialog.findAllByRole("combobox"))[0], "李");
    await user.click(await screen.findByTitle(/李四.*lisi/));
    await user.click(dialog.getAllByRole("combobox")[1]);
    await user.click(await screen.findByText("授权根 A (ROOT-A)", { exact: true }));
    expect(screen.queryByText("范围外根")).not.toBeInTheDocument();
    await user.click(dialog.getByRole("combobox", { name: "岗位" }));
    await user.click(await screen.findByTitle("财务经理 (FIN-001)"));
    const start = dialog.getByPlaceholderText("开始日");
    const end = dialog.getByPlaceholderText("截止日");
    expect(start).toHaveValue("2090-03-02");
    await user.click(start);
    await pickDay(user, pending.startTime);
    await pickDay(user, pending.startTime);
    expect(end).toHaveValue(pending.startTime);
    const submit = dialog.getByRole("button", { name: /确\s*定/ });
    await user.click(submit);
    expect(await dialog.findByText("开始日必须早于截止日")).toBeInTheDocument();
    expect(rpc.collectMutationRequests()).toEqual([]);
    await user.click(start);
    await pickDay(user, pending.startTime);
    await pickDay(user, pending.endTime);
    await user.click(submit);
    expect(await screen.findByRole("cell", { name: "未启用" })).toBeVisible();
    expect(rpc.collectMutationRequests().map(({ input }) => input)).toEqual([
      {
        username: "lisi",
        orgCode: "ROOT-A",
        posCode: "FIN-001",
        isPrimary: false,
        description: null,
        startTime: pending.startTime,
        endTime: pending.endTime,
      },
    ]);
    const detail = await openRow(user);
    expect(detail.getByText(pending.startTime)).toBeVisible();
    expect(detail.getByText(pending.endTime)).toBeVisible();
    expect(detail.getByRole("button", { name: "暂停" })).toBeEnabled();
  } finally {
    vi.useRealTimers();
  }
});

it("transfers across granted roots and leaves the global Position catalog read-only", async () => {
  let transferred = false;
  const ended = {
    ...hrAdminEmploymentDetail,
    status: EmploymentStatus.Disable,
    endTime: "2026-08-24",
    allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Disable, true),
  };
  const rpc = mockScopedManagement({
    "admin.employment.detail": () => (transferred ? ended : hrAdminEmploymentDetail),
    "admin.employment.transfer": () => {
      transferred = true;
      return { changed: true, result: { id: 100 } };
    },
  });
  const { user, router } = renderAdminApp(path);
  const drawer = await openRow(user);
  await user.click(drawer.getByRole("button", { name: /转\s*岗/ }));
  const date = await screen.findByLabelText("新任职截止日");
  const dialogElement = date.closest<HTMLElement>('[role="dialog"]');
  if (!dialogElement) throw new Error("Expected a Transfer dialog");
  const form = within(dialogElement);
  await user.click(form.getAllByRole("combobox")[0]);
  await waitFor(() => expect(screen.getByText("授权根 A (ROOT-A)", { exact: true })).toBeVisible());
  await user.click(screen.getByText("授权根 B (ROOT-B)", { exact: true }));
  expect(screen.queryByText("范围外根")).not.toBeInTheDocument();
  await user.click(form.getAllByRole("combobox")[1]);
  await user.click(await screen.findByTitle("财务经理 (FIN-001)"));
  await user.click(form.getByRole("radio", { name: "主任职" }));
  fill(date, "2090-04-01");
  await user.click(form.getByRole("button", { name: /确\s*定/ }));
  await waitFor(() => expect(drawer.getByRole("button", { name: /转\s*岗/ })).toBeDisabled());
  expect(rpc.collectMutationRequests()).toMatchObject([
    {
      procedure: "admin.employment.transfer",
      input: {
        id: 42,
        data: {
          newOrgCode: "ROOT-B",
          newPosCode: "FIN-001",
          isPrimary: true,
          endTime: "2090-04-01",
        },
      },
    },
  ]);
  await act(async () => router.navigate("/positions"));
  const row = within(await screen.findByRole("row", { name: /财务经理/ }));
  expect(row.getByRole("cell", { name: "2" })).toBeVisible();
  expect(row.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /新建岗位/ })).not.toBeInTheDocument();
});

it("loads scoped audit history on demand and keeps the description draft through the tab visit", async () => {
  let description = "原任职备注";
  const rpc = mockScopedManagement({
    "admin.authorization.capabilitySummary": () => adminCapabilitySummary,
    "admin.employment.detail": () => ({ ...hrAdminEmploymentDetail, description }),
    "admin.employment.update": ({ data }) => {
      if (data.description) description = data.description;
      return { changed: true, result: null };
    },
    "admin.audit.search": () => ({ result: [], total: 0 }),
  });
  server.use(mockCurrentAdminUser(currentAdminUser));
  const { user } = renderAdminApp(path);
  const drawer = await openRow(user);
  const edit = () => user.click(drawer.getByRole("button", { name: /^编\s*辑$/ }));
  const note = () => drawer.getByRole("textbox", { name: "备注" });
  const audit = () =>
    rpc.requests.filter(({ procedure }) => procedure === "admin.audit.search").map(({ input }) => input);
  await edit();
  fill(note(), "待保存备注");
  expect(audit()).toEqual([]);
  await user.click(drawer.getByRole("tab", { name: "操作日志" }));
  await waitFor(() =>
    expect(audit()).toEqual([{ pageNum: 1, pageSize: 10, conditions: { targetType: "employment", targetId: 42 } }]),
  );
  await user.click(drawer.getByRole("tab", { name: "任职信息" }));
  expect(note()).toHaveValue("待保存备注");
  await user.click(drawer.getByRole("button", { name: /^取\s*消$/ }));
  await edit();
  expect(note()).toHaveValue("原任职备注");
  expect(rpc.collectMutationRequests()).toEqual([]);
  fill(note(), "  更新任职备注  ");
  await user.click(drawer.getByRole("button", { name: /^保\s*存$/ }));
  expect(await drawer.findByText("更新任职备注")).toBeVisible();
  expect(rpc.collectMutationRequests()).toMatchObject([
    { procedure: "admin.employment.update", input: { id: 42, data: { description: "  更新任职备注  " } } },
  ]);
});

it.each([false, true])("refreshes authoritative dates after an edit (committed failure %s)", async (committed) => {
  let changed = false;
  const old = { ...hrAdminEmploymentDetail, startTime: "2026-01-05", endTime: committed ? "2026-02-01" : null };
  const latest = {
    ...old,
    status: EmploymentStatus.Disable,
    startTime: committed ? null : old.startTime,
    endTime: "2026-02-07",
    allowedActions: createHrEmploymentAllowedActions(EmploymentStatus.Disable, false),
  };
  const rpc = mockScopedManagement({
    "admin.employment.detail": () => (changed ? latest : old),
    "admin.employment.search": () => (changed ? { result: [], total: 0 } : adminEmploymentSearchResult),
    "admin.employment.update": () => {
      changed = true;
      return committed ? mutationCommitted : { changed: true, result: null };
    },
  });
  const { user } = renderAdminApp(path);
  const drawer = await openRow(user);
  const edit = () => drawer.getByRole("button", { name: /^编\s*辑$/ });
  const save = () => user.click(drawer.getByRole("button", { name: /^保\s*存$/ }));
  await user.click(edit());
  await save();
  expect(edit()).toBeEnabled();
  expect(rpc.collectMutationRequests()).toEqual([]);
  await user.click(edit());
  const start = drawer.getByPlaceholderText("开始日");
  const end = drawer.getByPlaceholderText("截止日");
  expect(start).toHaveValue(old.startTime);
  expect(end).toHaveValue(old.endTime ?? "");
  if (committed) {
    await user.click(start);
    await user.click(await screen.findByText("清空开始日"));
    expect(start).toHaveValue("");
  } else {
    await user.click(end);
    await pickDay(user, "2026-01-25");
    await user.click(drawer.getByRole("heading", { name: "基本信息" }));
    expect(end).toHaveValue("2026-01-25");
  }
  await save();
  expect(await drawer.findByText(latest.endTime)).toBeVisible();
  expect(drawer.queryByRole("button", { name: /^编\s*辑$/ })?.matches(":enabled") ?? false).toBe(false);
  if (committed) expect(drawer.getByRole("alert")).toHaveTextContent("后续处理失败");
  await waitFor(() => expect(screen.queryByRole("row", { name: /张三.*查看/ })).not.toBeInTheDocument());
  expect(rpc.collectMutationRequests().map(({ input }) => input)).toEqual([
    { id: 42, data: committed ? { startTime: null } : { endTime: "2026-01-25" } },
  ]);
});

it("warns of the responsibility cascade before confirming an Employment pause", async () => {
  const rpc = mockScopedManagement({
    "admin.employment.pause": () => ({ changed: true, result: null }),
  });
  const { user } = renderAdminApp(path);
  const drawer = await openRow(user);
  await user.click(drawer.getByRole("button", { name: /^暂\s*停$/ }));
  const confirm = await screen.findByRole("button", { name: "暂停任职" });
  await waitFor(() => expect(screen.getByText(/该任职下所有启用中的责任任命也会一并暂停/)).toBeVisible());
  expect(rpc.collectMutationRequests()).toEqual([]);
  await user.click(confirm);
  await waitFor(() =>
    expect(rpc.collectMutationRequests()).toMatchObject([{ procedure: "admin.employment.pause", input: { id: 42 } }]),
  );
});

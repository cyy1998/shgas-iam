import type {
  LoginRestrictionListItem,
  SessionListItem,
  SessionRevokeResult,
} from "@admin/services/session-management";
import { expect, it } from "vitest";
import {
  auditFailedAfterEffect,
  loginStateUnavailable,
  mockAdminRpc,
  mockCurrentAdminUser,
  type RpcResolvers,
} from "~admin/test/mocks/rpc";
import { server } from "~admin/test/mocks/server";
import { act, fireEvent, screen, waitFor, within } from "~admin/test/render";
import { registerAdminAppLifecycle, renderAdminApp } from "~admin/test/render-app";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();
registerAdminAppLifecycle();
const firstPageSessions = [
  {
    principalSessionId: "ps-current",
    user: {
      id: 42,
      subjectId: "00000000-0000-4000-8000-000000000042",
      username: "zhangsan",
      name: "张三",
      accountStatus: "normal",
    },
    authMethods: ["password", "mobile"],
    authTime: Date.parse("2026-07-28T08:00:00.000Z"),
    expiresAt: Date.parse("2026-07-29T08:00:00.000Z"),
    origin: {
      ip: "203.0.113.42",
      deviceType: "mobile",
      operatingSystem: "ios",
      browser: "wechat",
    },
    isCurrentSession: true,
    isCurrentUser: true,
    record: {
      kind: "userSession" as const,
      identity: {
        kind: "userSession" as const,
        id: "ps-current",
        instance: "00000000-0000-4000-8000-000000000194",
        userSessionId: "ps-current",
        subjectIdentifier: "00000000-0000-4000-8000-000000000042",
      },
    },
  },
  {
    principalSessionId: "ps-deleted",
    user: {
      id: 43,
      subjectId: "00000000-0000-4000-8000-000000000043",
      username: "deleted-user",
      name: "已删除用户",
      accountStatus: "deleted",
    },
    authMethods: ["unknown"],
    authTime: Date.parse("2026-07-27T08:00:00.000Z"),
    expiresAt: Date.parse("2026-07-29T07:00:00.000Z"),
    origin: null,
    isCurrentSession: false,
    isCurrentUser: false,
    record: {
      kind: "userSession" as const,
      identity: {
        kind: "userSession" as const,
        id: "ps-deleted",
        instance: "00000000-0000-4000-8000-000000000194",
        userSessionId: "ps-deleted",
        subjectIdentifier: "00000000-0000-4000-8000-000000000043",
      },
    },
  },
] satisfies SessionListItem[];

const secondPageSession = {
  principalSessionId: "ps-page-two",
  user: {
    id: null,
    subjectId: "00000000-0000-4000-8000-999999999999",
    username: null,
    name: null,
    accountStatus: "unknown",
  },
  authMethods: ["oa"],
  authTime: Date.parse("2026-07-26T08:00:00.000Z"),
  expiresAt: Date.parse("2026-07-29T06:00:00.000Z"),
  origin: {
    ip: null,
    deviceType: "unknown",
    operatingSystem: "unknown",
    browser: "other",
  },
  isCurrentSession: false,
  isCurrentUser: false,
  record: {
    kind: "userSession" as const,
    identity: {
      kind: "userSession" as const,
      id: "ps-page-two",
      instance: "00000000-0000-4000-8000-000000000194",
      userSessionId: "ps-page-two",
      subjectIdentifier: "00000000-0000-4000-8000-999999999999",
    },
  },
} satisfies SessionListItem;

const firstPageLoginRestrictions = [
  {
    user: {
      id: 42,
      username: "zhangsan",
      name: "张三",
      accountStatus: "normal",
    },
    cause: "too_many_login_failures",
    triggerMethod: "password",
    restrictedUntil: Date.parse("2030-07-28T08:30:00.000Z"),
    remainingSeconds: 120,
  },
  {
    user: {
      id: 43,
      username: "deleted-user",
      name: "已删除用户",
      accountStatus: "deleted",
    },
    cause: "too_many_login_failures",
    triggerMethod: "unknown",
    restrictedUntil: Date.parse("2030-07-28T08:20:00.000Z"),
    remainingSeconds: 60,
  },
] satisfies LoginRestrictionListItem[];

const [current, deleted] = firstPageSessions;

function list<T>(result: T[], { total = result.length, pageNum = 1, revoke = true } = {}) {
  return { result, total, pageNum, pageSize: 20, pages: Math.ceil(total / 20), allowedActions: { revoke } };
}

function open(overrides: RpcResolvers = {}) {
  const rpc = mockAdminRpc({
    "admin.sessionManagement.listSessions": () => list(firstPageSessions),
    "admin.sessionManagement.listLoginRestrictions": () => list(firstPageLoginRestrictions),
    "admin.user.search": () => ({ result: [{ id: 42, name: "张三", username: "zhangsan" }], total: 1 }),
    ...overrides,
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const app = renderAdminApp("/iam-admin/sessions");
  return {
    ...app,
    inputs(name: string) {
      return rpc.requests
        .filter(({ procedure }) => procedure === `admin.sessionManagement.${name}`)
        .map(({ input }) => input);
    },
    click: async (name: string | RegExp) => app.user.click(await screen.findByRole("button", { name })),
    tab: async (name: string) => app.user.click(await screen.findByRole("tab", { name })),
  };
}

function childOf(root: (typeof firstPageSessions)[number], clientId: string) {
  return {
    ...root,
    isCurrentSession: false,
    record: {
      kind: "clientSession" as const,
      clientId,
      protocol: "oidc" as const,
      identity: { ...root.record.identity, kind: "clientSession" as const, id: clientId, clientId },
    },
  };
}

it("loads application sessions per root on demand, paginates, and clears actions after a failed refresh", async () => {
  let unavailable = false;
  const app = open({
    "admin.sessionManagement.listSessions": ({ conditions, pageNum = 1 }) => {
      if (conditions?.kind !== "clientSession") return list(firstPageSessions);
      if (unavailable) return loginStateUnavailable;
      const root = conditions.userSessionId === current.principalSessionId ? current : deleted;
      return list([childOf(root, `${root.principalSessionId}-app-${pageNum}`)], { total: 21, pageNum });
    },
  });
  const entries = () => screen.findAllByRole("button", { name: "应用会话" });
  await waitFor(() => expect(screen.getAllByRole("button", { name: "应用会话" })).toHaveLength(2), { timeout: 3000 });
  expect(app.inputs("listSessions")).toMatchObject([{ conditions: { kind: "userSession" } }]);
  await app.user.click((await entries())[0]);
  const client = await screen.findByText("ps-current-app-1");
  const expanded = client.closest<HTMLElement>(".ant-table-expanded-row");
  if (!expanded) throw new Error("Expected the ClientSession in an expanded row");
  await app.user.click(within(expanded).getByRole("button", { name: "下一页" }));
  await screen.findByText("ps-current-app-2");
  expect(app.inputs("listSessions").at(-1)).toMatchObject({
    conditions: { kind: "clientSession", userSessionId: "ps-current" },
    pageNum: 2,
  });
  await app.user.click((await entries()).at(-1) ?? client);
  await screen.findByText("ps-deleted-app-1");
  expect(app.inputs("listSessions").at(-1)).toMatchObject({
    conditions: { kind: "clientSession", userSessionId: "ps-deleted" },
    pageNum: 1,
  });
  unavailable = true;
  await app.click("刷新应用会话");
  expect(await screen.findByText("登录状态服务暂时不可用")).toBeVisible();
  expect(screen.queryByRole("button", { name: "下线应用会话" })).not.toBeInTheDocument();
});

it.each(["switch-root", "refresh-root"])("ignores a late application response after %s", async (change) => {
  const late = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  let allowed = true;
  let delayedStarted = false;
  const app = open({
    "admin.sessionManagement.listSessions": async ({ conditions }) => {
      if (conditions?.kind !== "clientSession") return list(firstPageSessions, { revoke: allowed });
      if (conditions.userSessionId === "ps-current" && !delayedStarted) {
        delayedStarted = true;
        started.resolve();
        await late.promise;
        return list([childOf(current, "late-app")], { revoke: true });
      }
      return list([], { revoke: false });
    },
  });
  const delivered = Promise.withResolvers<void>();
  const onResponse = ({ request }: { request: Request }) => {
    if (decodeURIComponent(request.url).includes("ps-current")) delivered.resolve();
  };
  server.events.on("response:mocked", onResponse);
  try {
    const buttons = await screen.findAllByRole("button", { name: "应用会话" });
    await app.user.click(buttons[0]);
    await started.promise;
    allowed = false;
    if (change === "switch-root") {
      const second = (await screen.findAllByRole("button", { name: "应用会话" }))[0];
      await app.user.click(second);
      await screen.findByText("暂无应用会话");
    } else {
      await app.click("手动刷新");
    }
    const revoke = () =>
      within(screen.getByRole("row", { name: /已删除用户/ })).getByRole("button", { name: "下线该用户全部" });
    await waitFor(() => expect(revoke()).toBeDisabled());
    await act(async () => {
      late.resolve();
      await delivered.promise;
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    expect(revoke()).toBeDisabled();
    if (change === "switch-root") expect(screen.queryByText("late-app")).not.toBeInTheDocument();
  } finally {
    late.resolve();
    server.events.removeListener("response:mocked", onResponse);
  }
});

it("retries the original unfinished ClientSession identity across action and list refreshes", {
  timeout: 15_000,
}, async () => {
  const row = childOf(current, "portal");
  const identity = row.record.identity;
  let allowed = false;
  let written = 0;
  const app = open({
    "admin.sessionManagement.listSessions": ({ conditions }) =>
      list<SessionListItem>(conditions?.kind === "clientSession" ? [row] : [current], { revoke: allowed }),
    "admin.sessionManagement.revokeSessions": () => {
      const retry = ++written > 1;
      return {
        changed: retry,
        result: {
          scope: "session",
          generation: "unified",
          currentPrincipalSessionExcluded: false,
          sessions: {
            userSessionsTerminated: 0,
            clientSessionsTerminated: retry ? 1 : 0,
            excluded: 0,
            failed: 0,
            unknown: retry ? 0 : 1,
          },
          batch: {
            results: [{ target: identity, status: retry ? "terminated" : "unknown" }],
            unfinished: retry ? [] : [identity],
          },
          artifactCleanup: { attempted: 0, succeeded: 0, failed: 0 },
        },
      };
    },
  });
  const action = () => screen.getByRole("button", { name: "下线应用会话" });
  await app.click("应用会话");
  await screen.findByText("portal", { exact: true });
  expect(action()).toBeDisabled();
  allowed = true;
  await app.click("刷新应用会话");
  await waitFor(() => expect(action()).toBeEnabled());
  allowed = false;
  await app.click("手动刷新");
  await waitFor(() => expect(action()).toBeDisabled());
  allowed = true;
  await app.click("手动刷新");
  await waitFor(() => expect(action()).toBeEnabled());
  await app.click("下线应用会话");
  await app.click("确认下线");
  const unfinished = "原批次仍有 1 项未确认完成";
  await screen.findByText(unfinished);
  const captured = { target: { type: "captured", targets: [identity] } };
  expect(app.inputs("revokeSessions")).toEqual([captured]);
  allowed = false;
  await app.click("手动刷新");
  const retry = () => screen.getByRole("button", { name: "重试未完成集合" });
  await waitFor(() => expect(retry()).toBeDisabled());
  await app.tab("临时登录限制");
  await app.tab("会话记录");
  expect(screen.getByText(unfinished)).toBeVisible();
  expect(app.inputs("revokeSessions")).toHaveLength(1);
  allowed = true;
  await app.click("手动刷新");
  await waitFor(() => expect(retry()).toBeEnabled());
  await app.click("重试未完成集合");
  await app.click(/^确\s*定$/);
  await waitFor(() => expect(screen.queryByText(unfinished)).not.toBeInTheDocument());
  expect(app.inputs("revokeSessions")).toEqual([captured, captured]);
});

it.each([
  {
    name: "single root",
    row: deleted,
    action: "强制下线本次",
    target: { type: "session", principalSessionId: "ps-deleted" },
    users: 1,
    clients: 1,
    excluded: 0,
    unknown: 0,
  },
  {
    name: "another user",
    row: deleted,
    action: "下线该用户全部",
    target: { type: "user", userId: 43 },
    users: 2,
    clients: 2,
    excluded: 0,
    unknown: 0,
  },
  {
    name: "current user",
    row: current,
    action: "下线该用户全部",
    target: { type: "user", userId: 42 },
    users: 1,
    clients: 2,
    excluded: 1,
    unknown: 0,
  },
  {
    name: "uncertain self revoke",
    row: current,
    action: "下线该用户全部",
    target: { type: "user", userId: 42 },
    users: 0,
    clients: 2,
    excluded: 1,
    unknown: 1,
  },
])(
  "confirms $name revocation and reports unified effects",
  async ({ row, action, target, users, clients, excluded, unknown }) => {
    const result: SessionRevokeResult = {
      changed: true,
      result: {
        scope: target.type === "user" ? "user" : "session",
        generation: "unified",
        currentPrincipalSessionExcluded: Boolean(excluded),
        sessions: { userSessionsTerminated: users, clientSessionsTerminated: clients, excluded, failed: 0, unknown },
        ...(unknown ? {} : { artifactCleanup: { attempted: 1, succeeded: 1, failed: 0 } }),
      },
    };
    const app = open({ "admin.sessionManagement.revokeSessions": () => result });
    const currentRow = within(await screen.findByRole("row", { name: /张三/ }, { timeout: 3000 }));
    expect(currentRow.getByRole("button", { name: "强制下线本次" })).toBeDisabled();
    const rowView = within(screen.getByRole("row", { name: new RegExp(row.user.name ?? "") }));
    await app.user.click(rowView.getByRole("button", { name: action }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("不能保证第三方自行建立的本地会话退出");
    expect(dialog).toHaveTextContent("不会阻止未来重新登录");
    if (target.type === "user") {
      expect(dialog).toHaveTextContent("已索引");
      if (excluded) {
        expect(dialog).toHaveTextContent("保留当前管理端根会话");
        expect(dialog).toHaveTextContent("本人的其他根会话");
      } else {
        expect(dialog).toHaveTextContent("操作期间或之后建立的新会话仍可能存在");
      }
    } else {
      expect(dialog).toHaveTextContent("确认强制下线本次会话？");
    }
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(app.inputs("revokeSessions")).toEqual([]);
    const reads = app.inputs("listSessions").length;
    await app.click("确认下线");
    const counts = `已终止 ${users} 个根会话、${clients} 个应用会话；保留 ${excluded} 个当前根`;
    const detail = unknown
      ? "失败 0 项，结果未知 1 项，请刷新后明确发起新操作"
      : "产物回收尝试 1 项、成功 1 项、失败 0 项";
    expect(await screen.findByText(`${counts}；${detail}`)).toBeVisible();
    await waitFor(() => expect(app.inputs("listSessions")).toHaveLength(reads + 1));
    expect(app.inputs("revokeSessions")).toEqual([{ target }]);
  },
);

it("paginates session records, applies an exact user filter, and refreshes explicitly", async () => {
  const app = open({
    "admin.sessionManagement.listSessions": ({ conditions, pageNum }) =>
      conditions?.userId === 42
        ? list([current])
        : list<SessionListItem>(pageNum === 2 ? [secondPageSession] : firstPageSessions, { pageNum, total: 21 }),
  });
  expect(await screen.findByText("密码、手机验证码")).toBeVisible();
  expect(screen.getByText("203.0.113.42")).toBeVisible();
  expect(screen.getByText("手机 / iOS / 微信")).toBeVisible();
  expect(screen.getByText("当前会话")).toBeVisible();
  await app.click("下一页");
  expect((await screen.findAllByText("未知", { exact: true }))[0]).toBeVisible();
  await waitFor(() => expect(app.inputs("listSessions").at(-1)).toMatchObject({ pageNum: 2 }));
  await waitFor(() => expect(screen.queryByText("张三", { exact: true })).not.toBeInTheDocument());
  fireEvent.change(screen.getByRole("combobox", { name: "筛选会话用户" }), { target: { value: "张" } });
  await app.user.click(await screen.findByText("张三（zhangsan）", { exact: true }));
  await screen.findByRole("row", { name: /张三/ });
  expect(app.inputs("listSessions").at(-1)).toMatchObject({ pageNum: 1, conditions: { userId: 42 } });
  const reads = app.inputs("listSessions").length;
  await app.click("手动刷新");
  await waitFor(() => expect(app.inputs("listSessions")).toHaveLength(reads + 1));
});

it("filters restrictions by exact user and decrements the countdown locally without polling", async () => {
  const app = open({
    "admin.sessionManagement.listLoginRestrictions": ({ conditions }) =>
      list(conditions?.userId === 42 ? [firstPageLoginRestrictions[0]] : firstPageLoginRestrictions),
  });
  await app.tab("临时登录限制");
  const row = within(await screen.findByRole("row", { name: /张三/ }));
  const countdown = row.getByText(/^剩余 \d+ 分 \d+ 秒$/);
  expect(row.getByText("登录失败次数过多")).toBeVisible();
  expect(row.getByText("密码", { exact: true })).toBeVisible();
  const initial = countdown.textContent;
  const reads = app.inputs("listLoginRestrictions").length;
  await waitFor(() => expect(countdown.textContent).not.toBe(initial), { timeout: 2500 });
  expect(app.inputs("listLoginRestrictions")).toHaveLength(reads);
  fireEvent.change(screen.getByRole("combobox", { name: "筛选限制用户" }), { target: { value: "张" } });
  await app.user.click(await screen.findByText("张三（zhangsan）", { exact: true }));
  await waitFor(() => expect(screen.queryByRole("row", { name: /已删除用户/ })).not.toBeInTheDocument());
  expect(app.inputs("listLoginRestrictions").at(-1)).toMatchObject({ conditions: { userId: 42 } });
});

it.each([false, true])(
  "refreshes an audit-after-effect failure without replay (restriction %s)",
  async (restriction) => {
    let changed = false;
    const commit = () => {
      changed = true;
      return auditFailedAfterEffect;
    };
    const app = open({
      "admin.sessionManagement.listSessions": () => list(changed ? [current] : firstPageSessions),
      "admin.sessionManagement.listLoginRestrictions": () =>
        list(changed ? [firstPageLoginRestrictions[0]] : firstPageLoginRestrictions),
      "admin.sessionManagement.revokeSessions": commit,
      "admin.sessionManagement.releaseLoginRestriction": commit,
    });
    const tabName = restriction ? "临时登录限制" : "会话记录";
    const listName = restriction ? "listLoginRestrictions" : "listSessions";
    const mutation = restriction ? "releaseLoginRestriction" : "revokeSessions";
    if (restriction) await app.tab(tabName);
    const row = within(await screen.findByRole("row", { name: /已删除用户/ }));
    await app.user.click(row.getByRole("button", { name: restriction ? "解除限制" : "下线该用户全部" }));
    const reads = app.inputs(listName).length;
    await app.click(restriction ? "确认解除" : "确认下线");
    const warning = "操作可能已生效，但审计记录失败，请刷新确认且不要自动重试";
    await screen.findByText(warning);
    await waitFor(() => expect(screen.queryByRole("row", { name: /已删除用户/ })).not.toBeInTheDocument());
    expect(app.inputs(listName)).toHaveLength(reads + 1);
    await app.click("手动刷新");
    await waitFor(() => expect(app.inputs(listName)).toHaveLength(reads + 2));
    expect(screen.getByText(warning)).toBeVisible();
    await app.tab(restriction ? "会话记录" : "临时登录限制");
    await app.tab(tabName);
    expect(screen.getByText(warning)).toBeVisible();
    expect(screen.getByText(/列表刷新成功不代表审计记录已补齐/)).toBeVisible();
    expect(app.inputs(mutation)).toEqual([restriction ? { userId: 43 } : { target: { type: "user", userId: 43 } }]);
  },
);

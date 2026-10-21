import DelegationsPage from "@admin/pages/delegations";
import type { DelegationVo } from "@admin/services/delegation";
import { ConfigProvider, Modal, message } from "antd";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "~admin/test/mocks/server";
import { cleanup, fireEvent, render, screen, waitFor, within } from "~admin/test/render";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();
vi.mock("@admin/constants/config", () => ({ API_PREFIX: "http://localhost", SSO_CLIENT_CODE: "iam-admin" }));
vi.mock("@umijs/max", async (original) => ({
  ...(await original<typeof import("@umijs/max")>()),
  useAccess: () => ({ canCreateDelegation: true }),
}));

const allowed = { allowed: true, reason: null } as const;
const denied = { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" } as const;
const row: DelegationVo = {
  id: 7,
  delegatorUserId: 1,
  delegateeUserId: 2,
  clientId: 3,
  organizationScopeId: 4,
  delegatorUsername: "alice",
  delegatorName: "Alice",
  delegateeUsername: "bob",
  delegateeName: "Bob",
  delegatorUser: { id: 1, username: "alice", name: "Alice", isDelete: false },
  delegateeUser: { id: 2, username: "bob", name: "Bob", isDelete: false },
  client: { id: 3, clientCode: "expense", clientName: "报销应用", isDelete: false },
  organizationScope: { id: 4, orgCode: "ROOT", orgName: "总部", isDelete: false },
  startTime: "2026-01-01T00:00:00Z",
  endTime: "2030-01-01T00:00:00Z",
  status: 1,
  description: "出差代办",
  createTime: "2026-01-01T00:00:00Z",
  updateTime: "2026-01-01T00:00:00Z",
  allowedActions: { edit: allowed, pause: allowed, resume: denied, end: allowed },
};
let rows: DelegationVo[] = [row];
const reads = vi.fn();
beforeEach(() => {
  rows = [row];
  reads.mockReset();
  server.use(
    http.get("*/rpc/:procedures", ({ params, request }) =>
      HttpResponse.json(
        String(params.procedures)
          .split(",")
          .map((procedure, index) => {
            if (procedure === "admin.delegation.search") {
              reads(new URL(request.url).searchParams.get("input"));
              return { result: { data: rows } };
            }
            if (procedure === "admin.delegation.selectUsers")
              return {
                result: {
                  data: [
                    { id: 1, username: "alice", name: "Alice" },
                    { id: 2, username: "bob", name: "Bob" },
                  ],
                },
              };
            if (procedure === "admin.delegation.selectClients") {
              const inputs = JSON.parse(new URL(request.url).searchParams.get("input") ?? "{}");
              return {
                result: {
                  data: [
                    { id: 3, clientCode: "expense", clientName: "报销应用" },
                    ...(inputs[index]?.purpose === "filter"
                      ? [{ id: 8, clientCode: "retired", clientName: "历史应用" }]
                      : []),
                  ],
                },
              };
            }
            return { result: { data: [{ id: 4, orgCode: "ROOT", orgName: "总部" }] } };
          }),
      ),
    ),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  cleanup();
  message.destroy();
  Modal.destroyAll();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

async function page() {
  const view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <DelegationsPage />
    </ConfigProvider>,
  );
  await screen.findByText("出差代办");
  return view;
}

describe("Admin delegation management", () => {
  it("preserves sub-minute period precision when only the description changes", async () => {
    rows = [{ ...row, startTime: "2026-01-01T00:00:19.125Z", endTime: "2030-01-01T00:00:21.345Z" }];
    const writes: unknown[] = [];
    server.use(
      http.post("*/rpc/admin.delegation.update", async ({ request }) => {
        writes.push(await request.json());
        return HttpResponse.json([{ result: { data: { changed: true, result: null } } }]);
      }),
    );
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: "编辑" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.clear(dialog.getByLabelText("说明"));
    await user.type(dialog.getByLabelText("说明"), "仅改说明");
    await user.click(dialog.getByRole("button", { name: /确\s*定/ }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes).toEqual([
      {
        "0": {
          id: 7,
          data: { startTime: "2026-01-01T00:00:19.125Z", endTime: "2030-01-01T00:00:21.345Z", description: "仅改说明" },
        },
      },
    ]);
  });

  it("creates a delegation from selected identities and refreshes the list", async () => {
    const writes: unknown[] = [];
    server.use(
      http.post("*/rpc/admin.delegation.create", async ({ request }) => {
        writes.push(await request.json());
        return HttpResponse.json([{ result: { data: { changed: true, result: row } } }]);
      }),
    );
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: "新建委托" }));
    const dialog = within(await screen.findByRole("dialog"));
    for (const [label, option] of [
      ["委托人", "Alice（alice）"],
      ["受托人", "Bob（bob）"],
      ["应用", "报销应用（expense）"],
      ["组织范围", "总部（ROOT）"],
    ]) {
      await user.click(dialog.getByRole("combobox", { name: label }));
      const optionElement = (await screen.findAllByText(option, { selector: ".ant-select-item-option-content" })).at(
        -1,
      );
      if (!optionElement) throw new Error("Selector option did not render");
      await user.click(optionElement);
    }
    for (const [label, value] of [
      ["开始时间", "2026-11-01 09:00"],
      ["结束时间", "2026-11-02 09:00"],
    ]) {
      const input = dialog.getByLabelText(label);
      await user.click(input);
      fireEvent.change(input, { target: { value } });
      await user.keyboard("{Enter}");
    }
    await user.type(dialog.getByLabelText("说明"), "明日代办");
    await user.click(dialog.getByRole("button", { name: /确\s*定/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes).toMatchObject([
      {
        "0": {
          delegatorUsername: "alice",
          delegateeUsername: "bob",
          clientId: 3,
          orgCode: "ROOT",
          description: "明日代办",
          startTime: new Date("2026-11-01T09:00").toISOString(),
          endTime: new Date("2026-11-02T09:00").toISOString(),
        },
      },
    ]);
    expect(reads.mock.calls.length).toBeGreaterThan(1);
  });

  it("pauses a row and refreshes its available operations", async () => {
    const writes: unknown[] = [];
    server.use(
      http.post("*/rpc/admin.delegation.update", async ({ request }) => {
        writes.push(await request.json());
        rows = [{ ...row, status: 2, allowedActions: { edit: allowed, pause: denied, resume: allowed, end: allowed } }];
        return HttpResponse.json([{ result: { data: { changed: true, result: null } } }]);
      }),
    );
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: "暂停" }));
    await screen.findByRole("button", { name: "恢复" });
    expect(screen.queryByRole("button", { name: "暂停" })).not.toBeInTheDocument();
    expect(writes).toEqual([{ "0": { id: 7, data: { status: 2 } } }]);
  });

  it("submits selected filters through the service", async () => {
    const { user } = await page();
    await user.click(screen.getByRole("combobox", { name: "应用筛选" }));
    await user.click(await screen.findByText("报销应用（expense）", { selector: ".ant-select-item-option-content" }));
    await user.click(screen.getByRole("button", { name: /查\s*询/ }));
    await waitFor(() =>
      expect(reads.mock.calls.some(([input]) => String(input).includes('"clientIds":[3]'))).toBe(true),
    );
  });

  it("can filter historical identities while the creation selector only offers available objects", async () => {
    const { user } = await page();
    await user.click(screen.getByRole("combobox", { name: "应用筛选" }));
    await user.click(await screen.findByText("历史应用（retired）", { selector: ".ant-select-item-option-content" }));
    await user.click(screen.getByRole("button", { name: /查\s*询/ }));
    await waitFor(() =>
      expect(reads.mock.calls.some(([input]) => String(input).includes('"clientIds":[8]'))).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "新建委托" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("combobox", { name: "应用" }));
    await screen.findByText("报销应用（expense）", {
      selector: ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content",
    });
    expect(
      screen.queryByText("历史应用（retired）", {
        selector: ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content",
      }),
    ).not.toBeInTheDocument();
  });

  it("finds expired paused rows and keeps period facts independent from lifecycle actions", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-20T12:00:00Z").getTime());
    const pausedActions = { edit: allowed, pause: denied, resume: allowed, end: allowed };
    rows = [
      { ...row, status: 2, endTime: "2026-10-20T11:59:59Z", allowedActions: pausedActions },
      {
        ...row,
        id: 8,
        status: 3,
        description: "结束历史",
        endTime: "2026-10-20T11:59:59Z",
        allowedActions: { edit: denied, pause: denied, resume: denied, end: denied },
      },
      {
        ...row,
        id: 9,
        status: 2,
        description: "未来代办",
        startTime: "2026-10-21T00:00:00Z",
        allowedActions: pausedActions,
      },
      {
        ...row,
        id: 10,
        status: 2,
        description: "闭区间截止点",
        endTime: "2026-10-20T12:00:00Z",
        allowedActions: pausedActions,
      },
    ];
    const { user } = await page();
    const expired = screen.getByText("出差代办").closest("tr")!;
    expect(within(expired).getByText("已到期")).toBeInTheDocument();
    expect(within(expired).getByText("暂停", { selector: ".ant-tag" })).toBeInTheDocument();
    const future = screen.getByText("未来代办").closest("tr")!;
    expect(within(future).getByText("未开始")).toBeInTheDocument();
    const endpoint = screen.getByText("闭区间截止点").closest("tr")!;
    expect(within(endpoint).getByText("期间内")).toBeInTheDocument();
    const ended = screen.getByText("结束历史").closest("tr")!;
    expect(within(ended).getByText("已到期")).toBeInTheDocument();
    expect(within(ended).queryByRole("button", { name: "恢复" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "状态" }));
    await user.click(await screen.findByText("已到期", { selector: ".ant-select-item-option-content" }));
    await user.click(screen.getByRole("button", { name: /查\s*询/ }));
    await waitFor(() =>
      expect(reads.mock.calls.some(([input]) => String(input).includes('"statuses":[1,2]'))).toBe(true),
    );
    expect(screen.getByText("出差代办")).toBeInTheDocument();
    expect(screen.queryByText("结束历史")).not.toBeInTheDocument();
    expect(screen.queryByText("未来代办")).not.toBeInTheDocument();
    expect(screen.queryByText("闭区间截止点")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "恢复" })).toBeInTheDocument();
  });

  it("keeps a conflicting edit open and sends only mutable fields", async () => {
    const writes: unknown[] = [];
    server.use(
      http.post("*/rpc/admin.delegation.update", async ({ request }) => {
        writes.push(await request.json());
        return HttpResponse.json([{ error: { message: "委托期间冲突", code: -32600, data: { httpStatus: 409 } } }], {
          status: 409,
        });
      }),
    );
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: "编辑" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: /确\s*定/ }));
    await screen.findByText("委托期间冲突");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(writes).toHaveLength(1);
    expect(writes).toMatchObject([{ "0": { id: 7, data: { description: "出差代办" } } }]);
    expect(Object.keys((writes[0] as { "0": { data: object } })["0"].data).sort()).toEqual([
      "description",
      "endTime",
      "startTime",
    ]);
  });

  it("renders ended rows as read-only even when their related identities were deleted", async () => {
    rows = [
      {
        ...row,
        status: 3,
        client: { ...row.client, isDelete: true },
        allowedActions: { edit: denied, pause: denied, resume: denied, end: denied },
      },
    ];
    await page();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "暂停" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "恢复" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "结束" })).not.toBeInTheDocument();
  });

  it("rereads unknown write results without replay and retains the warning after refresh", async () => {
    const writes: unknown[] = [];
    server.use(
      http.post("*/rpc/admin.delegation.update", async ({ request }) => {
        writes.push(await request.json());
        rows = [{ ...row, status: 2, allowedActions: { edit: allowed, pause: denied, resume: allowed, end: allowed } }];
        return HttpResponse.json([{ error: { message: "服务暂时不可用", code: -32603, data: { httpStatus: 500 } } }], {
          status: 500,
        });
      }),
    );
    const { user } = await page();
    await user.click(screen.getByRole("button", { name: "暂停" }));
    await screen.findByRole("button", { name: "恢复" });
    expect(screen.getByText(/操作结果尚未确认/).closest('[role="alert"]')).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /刷\s*新/ }));
    await waitFor(() => expect(reads.mock.calls.length).toBeGreaterThan(2));
    expect(writes).toHaveLength(1);
    expect(screen.getByText(/操作结果尚未确认/).closest('[role="alert"]')).toBeInTheDocument();
  });
});

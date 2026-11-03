import UsersPage from "@admin/pages/users";
import UserFormModal from "@admin/pages/users/components/UserFormModal";
import { ApiErrorCode } from "@iam/contracts";
import { ConfigProvider, Modal, message } from "antd";
import { HttpResponse, http } from "msw";
import { type ComponentProps, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adminUserDetail, adminUserSearchResult } from "~admin/test/mocks/fixtures";
import { server } from "~admin/test/mocks/server";
import { cleanup, render, screen, waitFor, within } from "~admin/test/render";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();

vi.mock("@admin/constants/config", () => ({
  API_PREFIX: "http://localhost",
  SSO_CLIENT_CODE: "iam-admin",
}));

// jsdom does not finish CSS transitions; retain the real form and table behavior.
vi.mock("@ant-design/pro-components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ant-design/pro-components")>();
  const ModalForm = (props: ComponentProps<typeof actual.ModalForm>) => (
    <actual.ModalForm
      {...props}
      modalProps={{
        ...props.modalProps,
        transitionName: "",
        maskTransitionName: "",
      }}
    />
  );
  return { ...actual, ModalForm, default: { ...actual, ModalForm } };
});

ConfigProvider.config({
  holderRender: (children) => <ConfigProvider theme={{ token: { motion: false } }}>{children}</ConfigProvider>,
});

function mutation(procedure: string, data: unknown, committed = false) {
  const requests: unknown[] = [];
  server.use(
    http.post(`*/rpc/admin.user.${procedure}`, async ({ request }) => {
      requests.push(await request.json());
      return committed
        ? HttpResponse.json(
            [
              {
                error: {
                  message: "后续失败",
                  code: -32603,
                  data: {
                    code: "INTERNAL_SERVER_ERROR",
                    httpStatus: 500,
                    serviceCode: ApiErrorCode.AdminMutationCommitted,
                  },
                },
              },
            ],
            { status: 500 },
          )
        : HttpResponse.json([{ result: { data } }]);
    }),
  );
  return requests;
}
function renderPage() {
  const details = vi.fn((_info: { request: Request }) => HttpResponse.json([{ result: { data: adminUserDetail } }]));
  const searches = vi.fn(() => HttpResponse.json([{ result: { data: adminUserSearchResult } }]));
  server.use(
    http.get("*/rpc/admin.user.detail", details),
    http.get("*/rpc/admin.user.search", searches),
    http.get("*/rpc/admin.organizationResponsibility.searchAssignments", () =>
      HttpResponse.json([{ result: { data: { items: [], total: 0, nextCursor: null } } }]),
    ),
  );
  const view = render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <UsersPage />
    </ConfigProvider>,
  );
  return { ...view, details, searches };
}
async function openEdit(user: ReturnType<typeof render>["user"]) {
  await user.click((await screen.findAllByText("查看"))[0]);
  await user.click(await screen.findByRole("button", { name: /编\s*辑/ }));
  const panel = within(screen.getByRole("region", { name: "基本信息" }));
  await panel.findByRole("textbox", { name: "姓名" });
  return panel;
}
afterEach(async () => {
  cleanup();
  message.destroy();
  Modal.destroyAll();
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

function mutationFailure(procedure: string, messageText: string) {
  const requests: unknown[] = [];
  server.use(
    http.post(`*/rpc/admin.user.${procedure}`, async ({ request }) => {
      requests.push(await request.json());
      return HttpResponse.json(
        [
          {
            error: {
              message: messageText,
              code: -32009,
              data: { code: "CONFLICT", httpStatus: 409 },
            },
          },
        ],
        { status: 409 },
      );
    }),
  );
  return requests;
}
function renderForm() {
  const onSuccess = vi.fn();
  const onCommitted = vi.fn();
  function Form() {
    const [open, setOpen] = useState(true);
    return <UserFormModal open={open} onOpenChange={setOpen} onSuccess={onSuccess} onCommitted={onCommitted} />;
  }
  return {
    ...render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <Form />
      </ConfigProvider>,
    ),
    onSuccess,
    onCommitted,
  };
}

describe("UsersPage mutation outcomes", () => {
  it("saves only edited fields in the detail and refreshes the detail and list", async () => {
    const requests = mutation("update", { changed: true, result: null });
    const { user, searches, details } = renderPage();
    const form = await openEdit(user);
    const searchesBeforeSubmit = searches.mock.calls.length;
    await user.clear(form.getByRole("textbox", { name: "姓名" }));
    await user.type(form.getByRole("textbox", { name: "姓名" }), "  新姓名  ");
    await user.click(form.getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("更新成功")).toBeInTheDocument();
    expect(requests).toEqual([{ "0": { username: adminUserDetail.username, data: { name: "新姓名" } } }]);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await waitFor(() => expect(form.queryByRole("textbox", { name: "姓名" })).not.toBeInTheDocument());
    await waitFor(() => expect(details).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(searches.mock.calls.length).toBeGreaterThan(searchesBeforeSubmit));
  });

  it("reads the created resource and displays the returned initial password", async () => {
    const requests = mutation("create", {
      changed: true,
      result: {
        username: "created-user",
        user: { username: "created-user" },
        generatedPassword: "Initial123!",
      },
    });
    const { user, details } = renderPage();
    await screen.findByText(adminUserSearchResult.result[0].name);
    await user.click(screen.getByRole("button", { name: "+ 新建用户" }));
    const form = within(await screen.findByRole("dialog", { name: "新建用户" }));
    await user.type(form.getByRole("textbox", { name: "用户名" }), "submitted-user");
    await user.type(form.getByRole("textbox", { name: "姓名" }), "新用户");
    await user.click(form.getAllByRole("combobox")[0]);
    await user.click(
      await screen.findByText("正式员工", {
        selector: ".ant-select-item-option-content",
      }),
    );
    await user.click(form.getByRole("button", { name: "确 定" }));
    expect(await screen.findByText("Initial123!")).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    await waitFor(() => expect(details).toHaveBeenCalledTimes(1));
    const detailRequest = details.mock.calls[0][0];
    expect(decodeURIComponent(detailRequest.request.url)).toContain("created-user");
    await user.click(screen.getByRole("button", { name: "复制密码" }));
    const copiedPassword = await navigator.clipboard.readText();
    expect(copiedPassword).toBe("Initial123!");
    await user.click(screen.getByRole("button", { name: "我已复制" }));
    await waitFor(() => expect(screen.queryByText("Initial123!")).not.toBeInTheDocument());
  });
  it.each([false, true])(
    "refreshes committed creation with explicit password=%s and explains missing generated credentials",
    async (explicitPassword) => {
      const requests = mutation("create", null, true);
      const { user, details } = renderPage();
      await user.click(screen.getByRole("button", { name: "+ 新建用户" }));
      const form = within(await screen.findByRole("dialog", { name: "新建用户" }));
      await user.type(form.getByRole("textbox", { name: "用户名" }), "new-user");
      await user.type(form.getByRole("textbox", { name: "姓名" }), "新用户");
      if (explicitPassword) await user.type(form.getByLabelText("初始密码"), "Explicit123!");
      await user.click(form.getAllByRole("combobox")[0]);
      await user.click(
        await screen.findByText("正式员工", {
          selector: ".ant-select-item-option-content",
        }),
      );
      await user.click(form.getByRole("button", { name: "确 定" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("操作已生效，但后续处理失败");
      await waitFor(() => expect(details).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("alert")).toHaveTextContent("修复");
      if (explicitPassword) {
        expect(screen.getByRole("alert")).not.toHaveTextContent("初始密码未能交付");
      } else {
        expect(screen.getByRole("alert")).toHaveTextContent("初始密码未能交付");
        expect(screen.getByRole("alert")).toHaveTextContent("请先修复，再主动重置密码");
      }
      expect(requests).toHaveLength(1);
      expect(screen.queryByText("用户创建成功 — 初始密码")).not.toBeInTheDocument();
    },
  );
  it.each(["update", "resetPassword"])(
    "refreshes %s committed failure and retains its warning without replay",
    async (procedure) => {
      const requests = mutation(procedure, null, true);
      const { user, details } = renderPage();
      if (procedure === "update") {
        const form = await openEdit(user);
        await user.type(form.getByRole("textbox", { name: "姓名" }), "更新");
        await user.click(form.getByRole("button", { name: /保\s*存/ }));
      } else {
        await user.click((await screen.findAllByText("查看"))[0]);
        await user.click(await screen.findByRole("button", { name: "重置密码" }));
        const confirmation = (await screen.findAllByRole("dialog")).find((dialog) =>
          within(dialog).queryByText("确认后将生成新的随机密码，请做好交接准备。"),
        );
        expect(confirmation).toBeDefined();
        await user.click(within(confirmation!).getByRole("button", { name: "重 置" }));
      }
      expect(await screen.findByRole("alert")).toHaveTextContent("操作已生效，但后续处理失败");
      await waitFor(() => expect(details).toHaveBeenCalledTimes(2));
      expect(screen.getByRole("alert")).toHaveTextContent("修复");
      expect(requests).toHaveLength(1);
      expect(screen.queryByText("新密码已生成")).not.toBeInTheDocument();
    },
  );
  it("delivers the reset result password and refreshes the detail", async () => {
    const requests = mutation("resetPassword", {
      changed: true,
      result: "Reset123!",
    });
    const { user, details } = renderPage();
    await user.click((await screen.findAllByText("查看"))[0]);
    await user.click(await screen.findByRole("button", { name: "重置密码" }));
    const confirmation = (await screen.findAllByRole("dialog")).find((dialog) =>
      within(dialog).queryByText("确认后将生成新的随机密码，请做好交接准备。"),
    );
    expect(confirmation).toBeDefined();
    await user.click(within(confirmation!).getByRole("button", { name: "重 置" }));
    expect(await screen.findByText("Reset123!")).toBeInTheDocument();
    await waitFor(() => expect(details).toHaveBeenCalledTimes(2));
    expect(requests).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "复制密码" }));
    const copiedPassword = await navigator.clipboard.readText();
    expect(copiedPassword).toBe("Reset123!");
    await user.click(screen.getByRole("button", { name: "我已复制" }));
    await waitFor(() => expect(screen.queryByText("Reset123!")).not.toBeInTheDocument());
  });
});

describe("User forms through the user service", () => {
  it("discards cancelled edits and starts the next edit from the current detail", async () => {
    const requests = mutation("update", { changed: true, result: null });
    const { user, details } = renderPage();
    const form = await openEdit(user);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(form.queryByRole("textbox", { name: "用户名" })).not.toBeInTheDocument();
    await user.clear(form.getByRole("textbox", { name: "姓名" }));
    await user.type(form.getByRole("textbox", { name: "姓名" }), "未保存姓名");
    await user.click(form.getByRole("button", { name: /取\s*消/ }));
    await user.click(screen.getByRole("button", { name: /编\s*辑/ }));
    expect(form.getByRole("textbox", { name: "姓名" })).toHaveValue(adminUserDetail.name);
    await user.click(form.getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("请先编辑需要保存的字段")).toBeInTheDocument();
    expect(requests).toEqual([]);
    expect(details).toHaveBeenCalledTimes(1);
  });

  it("clears optional profile fields without sending the untouched profile", async () => {
    const requests = mutation("update", { changed: true, result: null });
    const { user } = renderPage();
    const form = await openEdit(user);
    await user.clear(form.getByRole("textbox", { name: "手机号" }));
    await user.type(form.getByRole("textbox", { name: "微信 ID" }), "temporary");
    await user.clear(form.getByRole("textbox", { name: "微信 ID" }));
    await user.click(form.getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("更新成功")).toBeInTheDocument();
    expect(requests).toEqual([{ "0": { username: adminUserDetail.username, data: { mobile: null, wxId: null } } }]);
  });

  it.each([
    ["   ", "请输入姓名"],
    ["N".repeat(65), "姓名最多64个字符"],
  ])("keeps an invalid edited name out of the update request", async (nameInput, error) => {
    const requests = mutation("update", { changed: true, result: null });
    const { user } = renderPage();
    const form = await openEdit(user);
    await user.clear(form.getByRole("textbox", { name: "姓名" }));
    await user.click(form.getByRole("textbox", { name: "姓名" }));
    await user.paste(nameInput);
    await user.click(form.getByRole("button", { name: /保\s*存/ }));
    expect(await form.findByText(error)).toBeInTheDocument();
    expect(form.getByRole("textbox", { name: "姓名" })).toHaveValue(nameInput);
    expect(requests).toEqual([]);
  });

  it("retains the inline draft on a rejected save without replaying the update", async () => {
    const requests = mutationFailure("update", "基本信息修改被拒绝");
    const { user, details } = renderPage();
    const form = await openEdit(user);
    await user.clear(form.getByRole("textbox", { name: "姓名" }));
    await user.type(form.getByRole("textbox", { name: "姓名" }), "保留草稿");
    await user.click(form.getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("基本信息修改被拒绝")).toBeInTheDocument();
    expect(form.getByRole("textbox", { name: "姓名" })).toHaveValue("保留草稿");
    expect(form.getByRole("button", { name: /保\s*存/ })).toBeEnabled();
    expect(requests).toHaveLength(1);
    expect(details).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("finishes an acknowledged save when detail refresh fails, committed=%s", async (committed) => {
    const requests = mutation("update", { changed: true, result: null }, committed);
    const { user, searches } = renderPage();
    let detailReads = 0;
    server.use(
      http.get("*/rpc/admin.user.detail", () => {
        detailReads += 1;
        return detailReads === 1
          ? HttpResponse.json([{ result: { data: adminUserDetail } }])
          : HttpResponse.json(
              [
                {
                  error: {
                    message: "详情暂时不可用",
                    code: -32603,
                    data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
                  },
                },
              ],
              { status: 500 },
            );
      }),
    );
    const form = await openEdit(user);
    const searchesBeforeSubmit = searches.mock.calls.length;
    await user.type(form.getByRole("textbox", { name: "姓名" }), "更新");
    await user.click(form.getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText(/基本信息已保存，但详情刷新失败/)).toBeInTheDocument();
    expect(form.queryByRole("textbox", { name: "姓名" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /编\s*辑/ })).toBeEnabled();
    await waitFor(() => expect(searches.mock.calls.length).toBeGreaterThan(searchesBeforeSubmit));
    if (committed)
      expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("操作已生效，但后续处理失败");
    expect(requests).toHaveLength(1);
    expect(detailReads).toBe(2);
  });

  it("blocks an empty profile submission without sending stale fields", async () => {
    const requests = mutation("update", { changed: false, result: null });
    const { user, details } = renderPage();
    const form = await openEdit(user);
    await user.click(form.getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("请先编辑需要保存的字段")).toBeInTheDocument();
    expect(requests).toHaveLength(0);
    expect(details).toHaveBeenCalledTimes(1);
    expect(form.getByRole("textbox", { name: "姓名" })).toBeInTheDocument();
  });
  it("completes a no-op edit and submits only the normalized edited field", async () => {
    const requests = mutation("update", { changed: false, result: null });
    const { user, details } = renderPage();
    const form = await openEdit(user);
    await user.clear(form.getByRole("textbox", { name: "姓名" }));
    await user.type(form.getByRole("textbox", { name: "姓名" }), `  ${adminUserDetail.name}  `);
    await user.click(form.getByRole("button", { name: /保\s*存/ }));
    expect(await screen.findByText("无需修改")).toBeInTheDocument();
    expect(requests).toEqual([{ "0": { username: adminUserDetail.username, data: { name: adminUserDetail.name } } }]);
    await waitFor(() => expect(details).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(form.queryByRole("textbox", { name: "姓名" })).not.toBeInTheDocument());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("submits normalized User identity fields while preserving the password exactly", async () => {
    const requests = mutation("create", {
      changed: true,
      result: {
        username: "Mixed-Case",
        user: { username: "Mixed-Case" },
        generatedPassword: null,
      },
    });
    const { user, onSuccess } = renderForm();
    const form = within(await screen.findByRole("dialog", { name: "新建用户" }));
    await user.type(form.getByRole("textbox", { name: "用户名" }), "  Mixed-Case  ");
    await user.type(form.getByRole("textbox", { name: "姓名" }), "  新用户  ");
    await user.type(form.getByLabelText("初始密码"), "  Secret123  ");
    await user.click(form.getAllByRole("combobox")[0]);
    await user.click(
      await screen.findByText("正式员工", {
        selector: ".ant-select-item-option-content",
      }),
    );
    await user.click(form.getByRole("button", { name: "确 定" }));

    expect(await screen.findByText("创建成功")).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledWith("Mixed-Case");
    expect(requests).toEqual([
      {
        "0": {
          mobile: null,
          name: "新用户",
          password: "  Secret123  ",
          status: 1,
          userType: "正式员工",
          username: "Mixed-Case",
          wxId: null,
        },
      },
    ]);
  });

  it.each([
    ["blank", "   ", "   ", "请输入用户名", "请输入姓名"],
    ["overlong", "U".repeat(65), "N".repeat(65), "用户名最多64个字符", "姓名最多64个字符"],
  ])(
    "keeps %s normalized User identities in the form without sending a request",
    async (_, usernameInput, nameInput, usernameError, nameError) => {
      const requests = mutation("create", null);
      const { user, onSuccess } = renderForm();
      const form = within(await screen.findByRole("dialog", { name: "新建用户" }));
      const username = form.getByRole("textbox", { name: "用户名" });
      const name = form.getByRole("textbox", { name: "姓名" });
      await user.click(username);
      await user.paste(usernameInput);
      await user.click(name);
      await user.paste(nameInput);
      await user.click(form.getByRole("button", { name: "确 定" }));
      expect(await form.findByText(usernameError)).toBeInTheDocument();
      expect(await form.findByText(nameError)).toBeInTheDocument();
      expect(requests).toHaveLength(0);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "新建用户" })).toBeInTheDocument();
    },
  );

  it("keeps a backend conflict in the form without reporting success or replaying", async () => {
    const requests = mutationFailure("create", "用户名已存在");
    const { user, onSuccess } = renderForm();
    const form = within(await screen.findByRole("dialog", { name: "新建用户" }));
    await user.type(form.getByRole("textbox", { name: "用户名" }), "occupied");
    await user.type(form.getByRole("textbox", { name: "姓名" }), "新用户");
    await user.click(form.getAllByRole("combobox")[0]);
    await user.click(
      await screen.findByText("正式员工", {
        selector: ".ant-select-item-option-content",
      }),
    );
    await user.click(form.getByRole("button", { name: "确 定" }));

    expect(await screen.findByText("用户名已存在")).toBeInTheDocument();
    expect(screen.queryByText("创建成功")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "新建用户" })).toBeInTheDocument();
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

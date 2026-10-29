import BasicSettings from "@admin/pages/clients/components/BasicSettings";
import type { ClientDetailVo } from "@admin/services/client";
import { ApiErrorCode, ClientStatus } from "@iam/contracts";
import { ConfigProvider, Modal, message } from "antd";
import { HttpResponse, http } from "msw";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminClientDetail } from "~admin/test/mocks/fixtures";
import { server } from "~admin/test/mocks/server";
import { act, render, screen, waitFor } from "~admin/test/render";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();

vi.mock("@admin/constants/config", () => ({
  API_PREFIX: "http://localhost",
  SSO_CLIENT_CODE: "iam-admin",
}));

const client: ClientDetailVo = {
  ...adminClientDetail,
  id: 1,
  isDelete: false,
  updateTime: "2026-01-03T08:00:00.000Z",
  ssoEnabled: true,
  ssoConfig: null,
  hasSsoSecret: false,
};
type Command = "update" | "updateStatus" | "delete";
let requests: Record<Command, unknown[]>;

function mutationResponse(command: Command, changed = true) {
  server.use(
    http.post(`*/rpc/admin.client.${command}`, async ({ request }) => {
      requests[command].push(await request.json());
      return HttpResponse.json([{ result: { data: { changed, result: null } } }]);
    }),
  );
}

function mutationFailure(command: Command, messageText: string, status: number, serviceCode: string) {
  server.use(
    http.post(`*/rpc/admin.client.${command}`, async ({ request }) => {
      requests[command].push(await request.json());
      return HttpResponse.json(
        [
          {
            error: {
              message: messageText,
              code: -32603,
              data: { httpStatus: status, serviceCode },
            },
          },
        ],
        { status },
      );
    }),
  );
}

describe("BasicSettings through the client service", () => {
  beforeEach(() => {
    ConfigProvider.config({
      holderRender: (children) => <ConfigProvider theme={{ token: { motion: false } }}>{children}</ConfigProvider>,
    });
    requests = { update: [], updateStatus: [], delete: [] };
    for (const command of ["update", "updateStatus", "delete"] as const) mutationResponse(command);
  });

  afterEach(async () => {
    await act(async () => {
      Modal.destroyAll();
      message.destroy();
    });
    ConfigProvider.config({ holderRender: undefined });
  });

  function renderSettings(refreshedClient = { ...client, clientName: "服务端已刷新" }) {
    const onDirtyChange = vi.fn();
    const onMutated = vi.fn(async () => {});
    const onCommitted = vi.fn(async () => {});
    const onDeleted = vi.fn();
    function Parent() {
      const [current, setCurrent] = useState(client);
      return (
        <BasicSettings
          client={current}
          onDirtyChange={onDirtyChange}
          onMutated={async () => {
            await onMutated();
            setCurrent(refreshedClient);
          }}
          onDeleted={onDeleted}
          onCommitted={async () => {
            await onCommitted();
            setCurrent(refreshedClient);
          }}
        />
      );
    }
    return {
      ...render(
        <ConfigProvider theme={{ token: { motion: false } }}>
          <Parent />
        </ConfigProvider>,
      ),
      onMutated,
      onCommitted,
      onDeleted,
      onDirtyChange,
    };
  }

  async function selectStatus(user: ReturnType<typeof render>["user"], label: string) {
    await user.click(screen.getByRole("combobox", { name: "全局状态" }));
    await user.click(await screen.findByTitle(label));
    await user.click(screen.getByRole("button", { name: "更新全局状态" }));
  }

  it.each([false, true])("keeps internal credential writes separate from profile edits: %s", async (editSecret) => {
    const { user } = renderSettings();
    const name = screen.getByLabelText("应用名称");
    await user.clear(name);
    await user.type(name, "新的应用名称");
    if (editSecret) {
      const secret = screen.getByLabelText("通用应用密钥");
      await user.clear(secret);
      await user.type(secret, "explicit-new-secret");
    }
    await user.click(screen.getByRole("button", { name: "保存基础信息" }));
    await waitFor(() => expect(requests.update).toHaveLength(1));
    expect(requests.update).toEqual([
      {
        "0": {
          clientCode: client.clientCode,
          data: {
            clientName: "新的应用名称",
            url: client.url || null,
            description: client.description || null,
            extAttributes: {},
          },
        },
      },
    ]);
    await waitFor(() => expect(name).toHaveValue("服务端已刷新"));
    if (editSecret) {
      expect(screen.getByLabelText("通用应用密钥")).toHaveValue("explicit-new-secret");
      await user.click(await screen.findByRole("button", { name: "保存内部 API 凭据" }));
      await waitFor(() => expect(requests.update).toHaveLength(2));
      expect(requests.update[1]).toEqual({
        "0": { clientCode: client.clientCode, data: { clientSecret: "explicit-new-secret" } },
      });
    }
  });

  it("keeps the unsaved credential after a committed profile failure refreshes parent props", async () => {
    mutationFailure("update", "required cleanup failed", 500, ApiErrorCode.AdminMutationCommitted);
    const { user, onCommitted, onMutated } = renderSettings();
    const secret = screen.getByLabelText("通用应用密钥");
    await user.clear(secret);
    await user.type(secret, "retained-draft");
    await user.click(screen.getByRole("button", { name: "保存基础信息" }));
    await waitFor(() => expect(screen.getByLabelText("应用名称")).toHaveValue("服务端已刷新"));
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(onMutated).not.toHaveBeenCalled();
    expect(requests.update).toHaveLength(1);
    expect(secret).toHaveValue("retained-draft");
    mutationResponse("update");
    await user.click(await screen.findByRole("button", { name: "保存内部 API 凭据" }));
    await waitFor(() => expect(requests.update).toHaveLength(2));
    expect(requests.update[1]).toEqual({
      "0": { clientCode: client.clientCode, data: { clientSecret: "retained-draft" } },
    });
  });

  it("switches to maintenance without a second confirmation", async () => {
    const { user, onMutated } = renderSettings();
    await selectStatus(user, "维护中");
    expect(screen.queryAllByText("更新应用全局状态？")).toHaveLength(0);
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
    expect(requests.updateStatus).toEqual([
      { "0": { clientCode: client.clientCode, status: ClientStatus.Maintenance } },
    ]);
    expect(await screen.findByText("全局状态已更新")).toBeInTheDocument();
  });

  it("still requires confirmation before disabling a client", async () => {
    const { user } = renderSettings();
    await selectStatus(user, "停用");
    expect(requests.updateStatus).toHaveLength(0);
    expect(await screen.findAllByText("更新应用全局状态？")).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "确 定" }));
    await waitFor(() => expect(requests.updateStatus).toHaveLength(1));
    expect(requests.updateStatus).toEqual([{ "0": { clientCode: client.clientCode, status: ClientStatus.Disable } }]);
  });

  it.each(["update", "updateStatus"] as const)(
    "reports %s no-op and refreshes once without replay",
    async (command) => {
      mutationResponse(command, false);
      const { user, onMutated, onCommitted } = renderSettings();
      if (command === "update") await user.click(screen.getByRole("button", { name: "保存基础信息" }));
      else await selectStatus(user, "维护中");
      expect(await screen.findByText("无需修改")).toBeInTheDocument();
      await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1));
      expect(requests[command]).toHaveLength(1);
      expect(onCommitted).not.toHaveBeenCalled();
      expect(screen.queryByText(command === "update" ? "基础信息已保存" : "全局状态已更新")).not.toBeInTheDocument();
    },
  );

  it("clears pending status and delegates committed recovery once without replaying", async () => {
    mutationFailure("updateStatus", "required cleanup failed", 500, ApiErrorCode.AdminMutationCommitted);
    const { user, onCommitted, onMutated, onDirtyChange } = renderSettings({
      ...client,
      status: ClientStatus.Disable,
    });
    await selectStatus(user, "维护中");
    await waitFor(() => expect(onCommitted).toHaveBeenCalledTimes(1));
    expect(requests.updateStatus).toEqual([
      { "0": { clientCode: client.clientCode, status: ClientStatus.Maintenance } },
    ]);
    await waitFor(() => expect(screen.getByRole("button", { name: "更新全局状态" })).toBeDisabled());
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "全局状态" }).closest(".ant-select")).toHaveTextContent("停用");
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    });
    expect(onMutated).not.toHaveBeenCalled();
    expect(screen.queryByText("全局状态已更新")).not.toBeInTheDocument();
  });

  it("omits concurrent status from profile writes and changes it only through the status command", async () => {
    const callbacks = {
      onDirtyChange: vi.fn(),
      onMutated: vi.fn(async () => {}),
      onCommitted: vi.fn(async () => {}),
      onDeleted: vi.fn(),
    };
    const settings = (value: ClientDetailVo) => (
      <ConfigProvider theme={{ token: { motion: false } }}>
        <BasicSettings client={value} {...callbacks} />
      </ConfigProvider>
    );
    const { user, rerender } = render(settings(client));
    const name = screen.getByLabelText("应用名称");
    await user.clear(name);
    await user.type(name, "Rename");
    rerender(settings({ ...client, status: ClientStatus.Maintenance }));
    expect(name).toHaveValue("Rename");
    await user.click(await screen.findByRole("button", { name: "保存基础信息" }));
    await waitFor(() => expect(callbacks.onMutated).toHaveBeenCalledTimes(1));
    expect(requests.update).toEqual([
      {
        "0": {
          clientCode: client.clientCode,
          data: {
            clientName: "Rename",
            url: client.url || null,
            description: client.description || null,
            extAttributes: {},
          },
        },
      },
    ]);
    expect(requests.updateStatus).toHaveLength(0);
    await selectStatus(user, "正常");
    await waitFor(() => expect(callbacks.onMutated).toHaveBeenCalledTimes(2));
    expect(requests.updateStatus).toEqual([{ "0": { clientCode: client.clientCode, status: ClientStatus.Enable } }]);
    rerender(settings({ ...client, status: ClientStatus.Enable }));
    await user.clear(name);
    await user.type(name, "Rename again");
    await user.click(await screen.findByRole("button", { name: "保存基础信息" }));
    await waitFor(() => expect(callbacks.onMutated).toHaveBeenCalledTimes(3));
    expect(requests.update).toHaveLength(2);
    expect(requests.update[1]).toEqual({
      "0": {
        clientCode: client.clientCode,
        data: {
          clientName: "Rename again",
          url: client.url || null,
          description: client.description || null,
          extAttributes: {},
        },
      },
    });
  });

  it("keeps a Role-blocked Client editable without success, deletion callback or replay", async () => {
    const blockedMessage = "应用仍存在未删除的角色，请先处理角色分配并删除角色后再删除应用";
    mutationFailure("delete", blockedMessage, 409, ApiErrorCode.ClientHasRole);
    const { user, onDeleted, onCommitted, onMutated } = renderSettings();
    await user.click(screen.getByRole("button", { name: "删除应用" }));
    expect(requests.delete).toHaveLength(0);
    await user.click(await screen.findByRole("button", { name: "确 定" }));
    expect(await screen.findByText(blockedMessage)).toBeInTheDocument();
    expect(requests.delete).toEqual([{ "0": { clientCode: client.clientCode } }]);
    expect(screen.queryByText("已删除", { exact: true })).not.toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(onMutated).not.toHaveBeenCalled();
    const name = screen.getByLabelText("应用名称");
    expect(name).toBeEnabled();
    await user.clear(name);
    await user.type(name, "仍可编辑");
    expect(name).toHaveValue("仍可编辑");
    expect(requests.delete).toHaveLength(1);
  });
});

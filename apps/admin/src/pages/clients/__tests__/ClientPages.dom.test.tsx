import ClientsPage from "@admin/pages/clients";
import ClientSsoPage from "@admin/pages/clients/ClientSsoPage";
import ClientEditPage from "@admin/pages/clients/edit";
import type { ClientSearchParams } from "@admin/services/client";
import type { ClientSsoDetail } from "@admin/services/client-sso";
import { ApiErrorCode, ClientSsoProtocol, ClientStatus } from "@iam/contracts";
import { history } from "@umijs/max";
import { ConfigProvider, Modal, message } from "antd";
import { HttpResponse, http } from "msw";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminClientDetail, adminClientSearchResult } from "~admin/test/mocks/fixtures";
import { server } from "~admin/test/mocks/server";
import { act, cleanup, render as renderWithProviders, screen, waitFor, within } from "~admin/test/render";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();

const route = vi.hoisted(() => ({ clientCode: "iam-admin", search: "?section=basic" }));

vi.mock("@admin/constants/config", () => ({
  API_PREFIX: "http://localhost",
  SSO_CLIENT_CODE: "iam-admin",
}));

vi.mock("@umijs/max", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@umijs/max")>();
  return {
    ...actual,
    useParams: () => ({ clientCode: route.clientCode }),
    useLocation: () => ({ search: route.search }),
    history: { ...actual.history, block: vi.fn(() => vi.fn()) },
  };
});

function render(ui: ReactElement) {
  return renderWithProviders(<ConfigProvider theme={{ token: { motion: false } }}>{ui}</ConfigProvider>);
}

function success(data: unknown) {
  return HttpResponse.json([{ result: { data } }]);
}

function failure(status: number, serviceCode?: string) {
  return HttpResponse.json(
    [{ error: { message: "private operation details", code: -32603, data: { httpStatus: status, serviceCode } } }],
    { status },
  );
}

beforeEach(() => {
  route.clientCode = "iam-admin";
  route.search = "?section=basic";
  sessionStorage.clear();
  ConfigProvider.config({
    holderRender: (children) => <ConfigProvider theme={{ token: { motion: false } }}>{children}</ConfigProvider>,
  });
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    Modal.destroyAll();
    message.destroy();
  });
  ConfigProvider.config({ holderRender: undefined });
  sessionStorage.clear();
});

describe("Client pages through the real services", () => {
  it("submits structured protocol and enable filters and displays only the matching result", async () => {
    const inputs: ClientSearchParams[] = [];
    server.use(
      http.get("*/rpc/admin.client.search", ({ request }) => {
        const batch: Record<string, ClientSearchParams> = JSON.parse(
          new URL(request.url).searchParams.get("input") ?? "{}",
        );
        const input = batch["0"];
        inputs.push(input);
        const exact = input.conditions?.exactConditions;
        return success(
          exact?.ssoProtocols?.[0] === ClientSsoProtocol.CustomSso && exact.ssoEnabled === false
            ? adminClientSearchResult
            : { result: [], total: 0 },
        );
      }),
    );
    const { user } = render(<ClientsPage />);
    await waitFor(() => expect(inputs).toHaveLength(1));
    expect(screen.queryByText("IAM 管理后台")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("全局状态", { exact: true }));
    await user.click(await screen.findByTitle("维护中"));
    await user.click(screen.getByLabelText("SSO 协议", { exact: true }));
    await user.click(await screen.findByTitle("Custom SSO"));
    await user.click(screen.getByLabelText("SSO 启用", { exact: true }));
    await user.click(await screen.findByTitle("已停用"));
    await waitFor(() =>
      expect(inputs.at(-1)).toMatchObject({
        conditions: {
          exactConditions: {
            statuses: [ClientStatus.Maintenance],
            ssoProtocols: [ClientSsoProtocol.CustomSso],
            ssoEnabled: false,
          },
        },
      }),
    );
    expect(await screen.findByText("IAM 管理后台")).toBeVisible();
    expect(within(screen.getByRole("table")).getByText("已停用")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /重\s*置/ }));
    await waitFor(() => expect(inputs.at(-1)?.conditions.exactConditions).toEqual({}));
  });

  it("keeps the loading state until the actual detail request completes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get("*/rpc/admin.client.detail", async () => {
        await gate;
        return success(adminClientDetail);
      }),
    );
    render(<ClientEditPage />);
    try {
      expect(screen.getByTestId("client-edit-loading")).toBeVisible();
    } finally {
      release();
    }
    expect(await screen.findByRole("tab", { name: "基础信息" })).toBeVisible();
    expect(screen.queryByTestId("client-edit-loading")).not.toBeInTheDocument();
  });

  it.each([
    [404, "应用不存在"],
    [500, "应用详情加载失败"],
  ] as const)("maps detail HTTP %s to the editor result and allows explicit recovery", async (status, title) => {
    let reads = 0;
    server.use(
      http.get("*/rpc/admin.client.detail", () => {
        reads++;
        return failure(status, status === 404 ? ApiErrorCode.ClientNotFound : undefined);
      }),
    );
    const { user } = render(<ClientEditPage />);
    expect(await screen.findByText(title)).toBeVisible();
    expect(screen.queryByRole("tab", { name: "基础信息" })).not.toBeInTheDocument();
    expect(reads).toBe(1);
    if (status === 500) {
      server.use(http.get("*/rpc/admin.client.detail", () => success(adminClientDetail)));
      await user.click(screen.getByRole("button", { name: /重\s*试/ }));
      expect(await screen.findByRole("tab", { name: "基础信息" })).toBeVisible();
    } else {
      await user.click(screen.getByRole("button", { name: "返回应用列表" }));
      expect(history.push).toHaveBeenCalledWith("/clients");
    }
  });

  it.each(["update", "delete"] as const)(
    "uses refreshed facts after a committed %s failure and keeps the repair warning without replay",
    async (operation) => {
      const reads: unknown[] = [];
      const writes: unknown[] = [];
      server.use(
        http.get("*/rpc/admin.client.detail", ({ request }) => {
          reads.push(JSON.parse(new URL(request.url).searchParams.get("input") ?? "{}"));
          if (operation === "delete" && writes.length) return failure(404, ApiErrorCode.ClientNotFound);
          return success({ ...adminClientDetail, clientName: writes.length ? "已提交的应用" : "IAM 管理后台" });
        }),
        http.post(`*/rpc/admin.client.${operation}`, async ({ request }) => {
          writes.push(await request.json());
          return failure(500, ApiErrorCode.AdminMutationCommitted);
        }),
      );
      const { user } = render(<ClientEditPage />);
      await screen.findByRole("tab", { name: "基础信息" });
      if (operation === "update") {
        await user.click(screen.getByRole("button", { name: "保存基础信息" }));
        await waitFor(() => expect(screen.getByLabelText("应用名称")).toHaveValue("已提交的应用"));
      } else {
        await user.click(screen.getByRole("button", { name: "删除应用" }));
        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByRole("button", { name: /确\s*定/ }));
        expect(await screen.findByText("应用不存在")).toBeVisible();
        expect(screen.queryByRole("tab", { name: "基础信息" })).not.toBeInTheDocument();
      }
      expect(screen.getByRole("alert")).toHaveTextContent("详情可读不代表传播已恢复");
      expect(writes).toHaveLength(1);
      expect(writes[0]).toMatchObject({ "0": { clientCode: "iam-admin" } });
      expect(reads).toEqual([{ "0": { clientCode: "iam-admin" } }, { "0": { clientCode: "iam-admin" } }]);
      expect(history.push).not.toHaveBeenCalled();
    },
  );

  it("uses independent Secret actions and refreshes permissions after an unknown rotation without replay", async () => {
    const detail: ClientSsoDetail = {
      ...adminClientDetail,
      ssoConfig: null,
      allowedActions: { save: true, selectProtocol: true, setEnabled: true, rotateSecret: true, readSecret: false },
    };
    let reads = 0;
    const rotations: unknown[] = [];
    let secretReads = 0;
    server.use(
      http.get("*/rpc/admin.clientSso.detail", () => {
        reads++;
        return success(detail);
      }),
      http.post("*/rpc/admin.clientSso.rotateSecret", async ({ request }) => {
        rotations.push(await request.json());
        detail.allowedActions.rotateSecret = false;
        return HttpResponse.error();
      }),
      http.post("*/rpc/admin.clientSso.readSecret", () => {
        secretReads++;
        return success(null);
      }),
    );
    const { user } = render(<ClientSsoPage />);
    const rotate = await screen.findByRole("button", { name: "轮换 SSO Secret" });
    const read = screen.getByRole("button", { name: "读取当前 Secret" });
    expect(read).toBeDisabled();
    expect(rotate).toBeEnabled();
    await user.click(read);
    expect(secretReads).toBe(0);
    await user.click(rotate);
    expect(await screen.findByText(/操作未确认成功，可能已经生效/)).toBeVisible();
    await waitFor(() => expect(rotate).toBeDisabled());
    expect(reads).toBe(2);
    await user.click(screen.getByRole("button", { name: "刷新详情" }));
    await waitFor(() => expect(reads).toBe(3));
    expect(rotate).toBeDisabled();
    expect(read).toBeDisabled();
    expect(rotations).toEqual([{ "0": { clientCode: "iam-admin" } }]);
    expect(secretReads).toBe(0);
  });
});

import SessionsPage from "@admin/pages/sessions";
import LoginRestrictionsTab from "@admin/pages/sessions/LoginRestrictionsTab";
import type {
  LoginRestrictionListInput,
  LoginRestrictionListItem,
  LoginRestrictionReleaseInput,
  SessionListInput,
  SessionListItem,
  SessionRevokeInput,
} from "@admin/services/session-management";
import { ApiErrorCode } from "@iam/contracts";
import { ConfigProvider, Modal, message } from "antd";
import { HttpResponse, http } from "msw";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "~admin/test/mocks/server";
import { act, render as renderWithProviders, screen, userEvent, waitFor, within } from "~admin/test/render";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();

vi.mock("@admin/constants/config", () => ({
  API_PREFIX: "http://localhost",
  SSO_CLIENT_CODE: "iam-admin",
}));

function render(ui: ReactElement) {
  return renderWithProviders(<ConfigProvider theme={{ token: { motion: false } }}>{ui}</ConfigProvider>);
}

const session = {
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
    kind: "userSession",
    identity: {
      kind: "userSession",
      id: "ps-deleted",
      instance: "00000000-0000-4000-8000-000000000194",
      userSessionId: "ps-deleted",
      subjectIdentifier: "00000000-0000-4000-8000-000000000043",
    },
  },
} satisfies SessionListItem;

const restriction = {
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
} satisfies LoginRestrictionListItem;

function success(data: unknown) {
  return HttpResponse.json([{ result: { data } }]);
}

function unavailable() {
  return HttpResponse.json(
    [
      {
        error: {
          message: "private Redis connection details",
          code: -32603,
          data: {
            code: "SERVICE_UNAVAILABLE",
            httpStatus: 503,
            serviceCode: ApiErrorCode.AdminLoginStateUnavailable,
          },
        },
      },
    ],
    { status: 503 },
  );
}

function sessionList(respond: (requestNumber: number) => SessionListItem[] | "unavailable") {
  const inputs: SessionListInput[] = [];
  server.use(
    http.get("*/rpc/admin.sessionManagement.listSessions", ({ request }) => {
      const batch: Record<string, SessionListInput> = JSON.parse(
        new URL(request.url).searchParams.get("input") ?? "{}",
      );
      inputs.push(batch["0"]);
      const rows = respond(inputs.length);
      return rows === "unavailable"
        ? unavailable()
        : success({
            result: rows,
            total: rows.length,
            pageNum: 1,
            pageSize: 20,
            pages: rows.length ? 1 : 0,
            allowedActions: { revoke: true },
          });
    }),
  );
  return inputs;
}

function restrictionList(respond: (requestNumber: number) => LoginRestrictionListItem[] | "unavailable") {
  const inputs: LoginRestrictionListInput[] = [];
  server.use(
    http.get("*/rpc/admin.sessionManagement.listLoginRestrictions", ({ request }) => {
      const batch: Record<string, LoginRestrictionListInput> = JSON.parse(
        new URL(request.url).searchParams.get("input") ?? "{}",
      );
      inputs.push(batch["0"]);
      const rows = respond(inputs.length);
      return rows === "unavailable"
        ? unavailable()
        : success({ result: rows, total: rows.length, pageNum: 1, pageSize: 20, pages: rows.length ? 1 : 0 });
    }),
  );
  return inputs;
}

async function confirmRestrictionRelease(user: ReturnType<typeof render>["user"]) {
  await user.click(await screen.findByRole("button", { name: "解除限制" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "确认解除" }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}

beforeEach(() => {
  ConfigProvider.config({
    holderRender: (children) => <ConfigProvider theme={{ token: { motion: false } }}>{children}</ConfigProvider>,
  });
});

afterEach(async () => {
  vi.useRealTimers();
  await act(async () => {
    Modal.destroyAll();
    message.destroy();
  });
  ConfigProvider.config({ holderRender: undefined });
});

describe("LoginRestrictionsTab through the session management service", () => {
  it("reports an expired release as a no-op and refreshes once without replaying", async () => {
    const listInputs = restrictionList(() => [restriction]);
    const releaseInputs: LoginRestrictionReleaseInput[] = [];
    server.use(
      http.post("*/rpc/admin.sessionManagement.releaseLoginRestriction", async ({ request }) => {
        const batch: Record<string, LoginRestrictionReleaseInput> = JSON.parse(await request.text());
        releaseInputs.push(batch["0"]);
        return success({ changed: false, result: { failureStateCleared: true } });
      }),
    );
    const { user } = render(<LoginRestrictionsTab />);
    await screen.findByText("已删除用户", { exact: true });
    expect(listInputs).toEqual([{ conditions: {}, pageNum: 1, pageSize: 20 }]);

    await confirmRestrictionRelease(user);

    expect(await screen.findByText("限制已自然过期或已被处理")).toBeVisible();
    await waitFor(() => expect(listInputs).toHaveLength(2));
    expect(listInputs[1]).toEqual(listInputs[0]);
    expect(releaseInputs).toEqual([{ userId: 43 }]);
    expect(screen.queryByText("临时登录限制已解除，当前失败历史已清理")).not.toBeInTheDocument();
  });

  it("clears stale inventory and actions when a refresh cannot read login state", async () => {
    const inputs = restrictionList((requestNumber) => (requestNumber === 1 ? [restriction] : "unavailable"));
    const { user } = render(<LoginRestrictionsTab />);
    await screen.findByText("已删除用户", { exact: true });
    expect(screen.getByRole("button", { name: "解除限制" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "手动刷新" }));

    expect(await screen.findByText("登录状态服务暂时不可用")).toBeVisible();
    expect(screen.queryByText("已删除用户", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "解除限制" })).not.toBeInTheDocument();
    expect(screen.getByText("加载失败")).toBeVisible();
    expect(screen.queryByText("暂无数据")).not.toBeInTheDocument();
    expect(screen.queryByText(/private Redis connection details/)).not.toBeInTheDocument();
    expect(inputs).toHaveLength(2);
  });

  it("keeps current inventory after release 503 without false success, refresh or delayed replay", async () => {
    const listInputs = restrictionList(() => [restriction]);
    const releaseInputs: LoginRestrictionReleaseInput[] = [];
    server.use(
      http.post("*/rpc/admin.sessionManagement.releaseLoginRestriction", async ({ request }) => {
        const batch: Record<string, LoginRestrictionReleaseInput> = JSON.parse(await request.text());
        releaseInputs.push(batch["0"]);
        return unavailable();
      }),
    );
    render(<LoginRestrictionsTab />);
    await screen.findByText("已删除用户", { exact: true });
    // Install before the mutation so a delayed retry scheduled by its failure path is observable.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await confirmRestrictionRelease(user);

    expect(await screen.findByText("登录状态服务暂时不可用")).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    vi.useRealTimers();
    expect(releaseInputs).toEqual([{ userId: 43 }]);
    expect(listInputs).toHaveLength(1);
    expect(screen.getByText("已删除用户", { exact: true })).toBeVisible();
    expect(screen.queryByText("临时登录限制已解除，当前失败历史已清理")).not.toBeInTheDocument();
  });
});

describe("SessionsPage through the session management service", () => {
  it("shows an empty result without presenting a load failure", async () => {
    const inputs = sessionList(() => []);
    render(<SessionsPage />);

    await waitFor(() => {
      expect(inputs).toEqual([{ conditions: { kind: "userSession" }, pageNum: 1, pageSize: 20 }]);
      expect(document.querySelector(".ant-spin-spinning")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("暂无数据", { selector: ".ant-empty-description" })).toBeVisible();
    expect(screen.queryByText("登录状态服务暂时不可用")).not.toBeInTheDocument();
    expect(screen.queryByText("加载失败")).not.toBeInTheDocument();
  });

  it("distinguishes an unavailable initial inventory from an empty result", async () => {
    const inputs = sessionList(() => "unavailable");
    render(<SessionsPage />);

    expect(await screen.findByText("登录状态服务暂时不可用")).toBeVisible();
    expect(screen.getByText("请稍后手动刷新。")).toBeVisible();
    expect(screen.queryByText("暂无数据")).not.toBeInTheDocument();
    expect(screen.queryByText(/private Redis connection details/)).not.toBeInTheDocument();
    expect(inputs).toHaveLength(1);
  });

  it("removes old sessions and revoke actions when refreshing unavailable login state", async () => {
    const inputs = sessionList((requestNumber) => (requestNumber === 1 ? [session] : "unavailable"));
    const { user } = render(<SessionsPage />);
    await screen.findByText("已删除用户", { exact: true });
    expect(screen.getByRole("button", { name: "下线该用户全部" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "手动刷新" }));

    expect(await screen.findByText("登录状态服务暂时不可用")).toBeVisible();
    expect(screen.queryByText("已删除用户", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下线该用户全部" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "强制下线本次" })).not.toBeInTheDocument();
    expect(screen.getByText("加载失败")).toBeVisible();
    expect(inputs).toHaveLength(2);
  });

  it.each([
    { scenario: "no-op", changed: false, roots: 0, clients: 0, attempted: 0, succeeded: 0, failed: 0 },
    { scenario: "cleanup failure", changed: true, roots: 2, clients: 2, attempted: 3, succeeded: 1, failed: 2 },
  ])("reports $scenario as a completed revoke and refreshes once without replaying", async (outcome) => {
    const listInputs = sessionList(() => [session]);
    const revokeInputs: SessionRevokeInput[] = [];
    server.use(
      http.post("*/rpc/admin.sessionManagement.revokeSessions", async ({ request }) => {
        const batch: Record<string, SessionRevokeInput> = JSON.parse(await request.text());
        revokeInputs.push(batch["0"]);
        return success({
          changed: outcome.changed,
          result: {
            scope: "user",
            generation: "unified",
            currentPrincipalSessionExcluded: false,
            sessions: {
              userSessionsTerminated: outcome.roots,
              clientSessionsTerminated: outcome.clients,
              excluded: 0,
              failed: 0,
              unknown: 0,
            },
            artifactCleanup: {
              attempted: outcome.attempted,
              succeeded: outcome.succeeded,
              failed: outcome.failed,
              reference: "cleanup-ref-secret",
              error: "remote cleanup error",
            },
          },
        });
      }),
    );
    const { user } = render(<SessionsPage />);
    await user.click(await screen.findByRole("button", { name: "下线该用户全部" }));
    const confirmation = await screen.findByRole("dialog");
    expect(revokeInputs).toHaveLength(0);
    await user.click(within(confirmation).getByRole("button", { name: "确认下线" }));

    expect(
      await screen.findByText(
        `已终止 ${outcome.roots} 个根会话、${outcome.clients} 个应用会话；保留 0 个当前根；产物回收尝试 ${outcome.attempted} 项、成功 ${outcome.succeeded} 项、失败 ${outcome.failed} 项`,
        { exact: true },
      ),
    ).toBeVisible();
    await waitFor(() => expect(listInputs).toHaveLength(2));
    expect(listInputs[1]).toEqual(listInputs[0]);
    expect(revokeInputs).toEqual([{ target: { type: "user", userId: 43 } }]);
    expect(screen.queryByText(/cleanup-ref-secret/)).not.toBeInTheDocument();
    expect(screen.queryByText(/remote cleanup error/)).not.toBeInTheDocument();
    expect(screen.queryByText("会话下线失败", { exact: true })).not.toBeInTheDocument();
  });
});

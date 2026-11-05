import AuditLogTable from "@admin/components/audit/AuditLogTable";
import { auditActionOptions } from "@admin/components/audit/auditLogDisplay";
import { searchAuditLogs } from "@admin/services/audit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "~admin/test/render";

vi.mock("@admin/services/audit", () => ({ searchAuditLogs: vi.fn() }));

describe("Audit target filters", () => {
  beforeEach(() => {
    cleanup();
    vi.mocked(searchAuditLogs)
      .mockReset()
      .mockResolvedValue({ result: [], total: 100, pages: 5, pageNum: 1, pageSize: 20 });
  });
  it("can query responsibility assignments by target type and reset the condition", async () => {
    vi.mocked(searchAuditLogs).mockResolvedValue({ result: [], total: 0, pages: 0, pageNum: 1, pageSize: 20 });
    const { user } = render(<AuditLogTable />);
    await waitFor(() => expect(searchAuditLogs).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "更多筛选" }));
    await user.click(screen.getByRole("combobox", { name: "目标类型" }));
    await user.click(await screen.findByText("组织责任任命"));
    await waitFor(() =>
      expect(searchAuditLogs).toHaveBeenLastCalledWith({
        pageNum: 1,
        pageSize: 20,
        conditions: { targetType: "organization_responsibility_assignment" },
      }),
    );
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    await waitFor(() =>
      expect(searchAuditLogs).toHaveBeenLastCalledWith({
        pageNum: 1,
        pageSize: 20,
        conditions: {},
      }),
    );
  });
  it("applies multiple actions and resets pagination when a common filter changes", async () => {
    const { user } = render(<AuditLogTable />);
    await waitFor(() => expect(searchAuditLogs).toHaveBeenCalled());
    await user.click(screen.getByTitle("2"));
    await waitFor(() => expect(searchAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ pageNum: 2 })));
    await user.click(screen.getByRole("combobox", { name: "动作" }));
    await user.click(await screen.findByTitle(auditActionOptions[0].label));
    await user.click(await screen.findByTitle(auditActionOptions[1].label));
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(searchAuditLogs).toHaveBeenLastCalledWith({
        pageNum: 1,
        pageSize: 20,
        conditions: { actions: [auditActionOptions[0].value, auditActionOptions[1].value] },
      }),
    );
    await user.click(screen.getByRole("combobox", { name: "结果" }));
    await user.click(await screen.findByTitle("失败"));
    await waitFor(() =>
      expect(searchAuditLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({
          conditions: { actions: [auditActionOptions[0].value, auditActionOptions[1].value], outcome: "failure" },
        }),
      ),
    );
  });

  it("retains advanced conditions when collapsed, submits text on Enter, and clears all filters", async () => {
    const { user } = render(<AuditLogTable />);
    await waitFor(() => expect(searchAuditLogs).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "更多筛选" }));
    const request = screen.getByRole("searchbox", { name: "Request ID" });
    const before = vi.mocked(searchAuditLogs).mock.calls.length;
    await user.type(request, " req-1 ");
    expect(searchAuditLogs).toHaveBeenCalledTimes(before);
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(searchAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ conditions: { requestId: "req-1" } })),
    );
    await user.click(screen.getByRole("button", { name: /更多筛选/ }));
    await user.click(screen.getByRole("combobox", { name: "结果" }));
    await user.click(await screen.findByTitle("成功"));
    await waitFor(() =>
      expect(searchAuditLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ conditions: { requestId: "req-1", outcome: "success" } }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "清除筛选" }));
    await waitFor(() => expect(searchAuditLogs).toHaveBeenLastCalledWith(expect.objectContaining({ conditions: {} })));
    await user.click(screen.getByRole("button", { name: /更多筛选/ }));
    expect(screen.getByRole("searchbox", { name: "Request ID" })).toHaveValue("");
  });

  it("keeps fixed conditions authoritative when filters are changed and when embedded", async () => {
    const { user, unmount } = render(<AuditLogTable fixedConditions={{ targetType: "role", targetId: 7 }} />);
    await waitFor(() => expect(searchAuditLogs).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "更多筛选" }));
    await user.click(screen.getByRole("combobox", { name: "目标类型" }));
    await user.click(await screen.findByText("组织责任任命"));
    await waitFor(() =>
      expect(searchAuditLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ conditions: { targetType: "role", targetId: 7 } }),
      ),
    );
    unmount();
    render(<AuditLogTable search={false} fixedConditions={{ targetType: "role", targetId: 8 }} pageSize={10} />);
    await waitFor(() =>
      expect(searchAuditLogs).toHaveBeenLastCalledWith({
        pageNum: 1,
        pageSize: 10,
        conditions: { targetType: "role", targetId: 8 },
      }),
    );
    expect(screen.queryByRole("button", { name: /更多筛选/ })).not.toBeInTheDocument();
  });

  it("queries the confirmed date range", async () => {
    const { user } = render(<AuditLogTable />);
    await waitFor(() => expect(searchAuditLogs).toHaveBeenCalled());
    const start = screen.getByPlaceholderText("开始时间");
    await user.click(start);
    fireEvent.change(start, { target: { value: "2026-11-01 10:00:00" } });
    await user.keyboard("{Enter}");
    const end = screen.getByPlaceholderText("结束时间");
    fireEvent.change(end, { target: { value: "2026-11-02 12:00:00" } });
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(searchAuditLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({
          conditions: {
            eventTimeFrom: new Date("2026-11-01T10:00:00"),
            eventTimeTo: new Date("2026-11-02T12:00:00"),
          },
        }),
      ),
    );
  });
});

import AuditLogTable from "@admin/components/audit/AuditLogTable";
import { searchAuditLogs } from "@admin/services/audit";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "~admin/test/render";

vi.mock("@admin/services/audit", () => ({ searchAuditLogs: vi.fn() }));

describe("Audit target filters", () => {
  it("can query responsibility assignments by target type and reset the condition", async () => {
    vi.mocked(searchAuditLogs).mockResolvedValue({ result: [], total: 0, pages: 0, pageNum: 1, pageSize: 20 });
    const { user } = render(<AuditLogTable />);
    await waitFor(() => expect(searchAuditLogs).toHaveBeenCalled());
    await user.click(screen.getByText("展开", { exact: true }));
    await user.click(screen.getByRole("combobox", { name: "目标类型" }));
    await user.click(await screen.findByText("组织责任任命"));
    await user.click(screen.getByRole("button", { name: /查\s*询/ }));
    await waitFor(() =>
      expect(searchAuditLogs).toHaveBeenLastCalledWith({
        pageNum: 1,
        pageSize: 20,
        conditions: { targetType: "organization_responsibility_assignment" },
      }),
    );
    await user.click(screen.getByRole("button", { name: /重\s*置/ }));
    await waitFor(() =>
      expect(searchAuditLogs).toHaveBeenLastCalledWith({
        pageNum: 1,
        pageSize: 20,
        conditions: {},
      }),
    );
  });
});

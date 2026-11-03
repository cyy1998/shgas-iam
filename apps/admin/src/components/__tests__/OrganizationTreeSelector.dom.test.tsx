import OrganizationTreeSelector from "@admin/components/OrganizationTreeSelector";
import type { OrganizationSelectorNode } from "@admin/services/organization";
import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { message } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationService = vi.hoisted(() => ({ getNodes: vi.fn() }));

vi.mock("@admin/services/organization", () => ({
  getOrganizationSelectorNodes: organizationService.getNodes,
}));

vi.mock("antd", () => {
  const message = { error: vi.fn() };
  const TreeSelect = ({
    onSearch,
    loadData,
    treeData,
    loading,
  }: {
    onSearch: (text: string) => Promise<void>;
    loadData: (node: { value: string }) => Promise<void>;
    treeData: { value: string; title: string }[];
    loading: boolean;
  }) => (
    <div>
      <input aria-label="组织搜索" onChange={(event) => void onSearch(event.target.value)} />
      <button type="button" onClick={() => void loadData({ value: "ROOT" })}>
        加载子组织
      </button>
      <ul>
        {treeData.map((node) => (
          <li key={node.value}>{node.title}</li>
        ))}
      </ul>
      <output aria-label="加载状态">{String(loading)}</output>
    </div>
  );
  return { default: { message, TreeSelect }, message, TreeSelect };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function node(orgCode: string): OrganizationSelectorNode {
  return {
    id: 1,
    orgCode,
    orgName: orgCode,
    orgType: OrganizationType.Department,
    status: OrganizationStatus.Enable,
    level: OrganizationLevel.Two,
    parentId: 0,
    isLeaf: true,
    fullPath: [],
    pathText: orgCode,
    selectable: true,
  };
}

beforeEach(() => {
  organizationService.getNodes.mockReset().mockResolvedValue([]);
});

describe("OrganizationTreeSelector request filters", () => {
  it("keeps the latest search result when older responses finish later and ignores searches cleared by the user", async () => {
    const first = deferred<OrganizationSelectorNode[]>();
    const second = deferred<OrganizationSelectorNode[]>();
    const cleared = deferred<OrganizationSelectorNode[]>();
    organizationService.getNodes.mockImplementation(({ text }: { text?: string }) =>
      text === "old"
        ? first.promise
        : text === "new"
          ? second.promise
          : text === "cleared"
            ? cleared.promise
            : Promise.resolve([node("ROOT")]),
    );
    render(<OrganizationTreeSelector />);
    await screen.findByText("ROOT (ROOT)");
    const input = screen.getByRole("textbox", { name: "组织搜索" });
    fireEvent.change(input, { target: { value: "old" } });
    fireEvent.change(input, { target: { value: "new" } });
    await act(async () => second.resolve([node("NEW")]));
    expect(screen.getByText("NEW (NEW)")).toBeVisible();
    await act(async () => first.resolve([node("OLD")]));
    expect(screen.queryByText("OLD (OLD)")).not.toBeInTheDocument();
    expect(screen.getByText("NEW (NEW)")).toBeVisible();
    fireEvent.change(input, { target: { value: "cleared" } });
    fireEvent.change(input, { target: { value: "" } });
    await act(async () => cleared.resolve([node("CLEARED")]));
    expect(screen.getByText("ROOT (ROOT)")).toBeVisible();
    expect(screen.queryByText("CLEARED (CLEARED)")).not.toBeInTheDocument();
    expect(screen.getByLabelText("加载状态")).toHaveTextContent("false");
  });

  it("ignores stale errors without clearing the current loading state and invalidates searches on unmount", async () => {
    const stale = deferred<OrganizationSelectorNode[]>();
    const current = deferred<OrganizationSelectorNode[]>();
    const abandoned = deferred<OrganizationSelectorNode[]>();
    organizationService.getNodes.mockImplementation(({ text }: { text?: string }) =>
      text === "old"
        ? stale.promise
        : text === "new"
          ? current.promise
          : text === "abandoned"
            ? abandoned.promise
            : Promise.resolve([node("ROOT")]),
    );
    const { unmount } = render(<OrganizationTreeSelector />);
    await screen.findByText("ROOT (ROOT)");
    const input = screen.getByRole("textbox", { name: "组织搜索" });
    fireEvent.change(input, { target: { value: "old" } });
    fireEvent.change(input, { target: { value: "new" } });
    await act(async () => stale.reject(new Error("过期错误")));
    expect(message.error).not.toHaveBeenCalled();
    expect(screen.getByLabelText("加载状态")).toHaveTextContent("true");
    await act(async () => current.resolve([node("NEW")]));
    expect(screen.getByText("NEW (NEW)")).toBeVisible();
    expect(screen.getByLabelText("加载状态")).toHaveTextContent("false");
    fireEvent.change(input, { target: { value: "abandoned" } });
    unmount();
    await act(async () => abandoned.reject(new Error("卸载后错误")));
    expect(message.error).not.toHaveBeenCalled();
  });

  it("invalidates search results on scope changes and handles only the current search error", async () => {
    const old = deferred<OrganizationSelectorNode[]>();
    const failed = deferred<OrganizationSelectorNode[]>();
    organizationService.getNodes.mockImplementation(
      ({ text, visibleStatuses }: { text?: string; visibleStatuses: OrganizationStatus[] }) =>
        text === "old"
          ? old.promise
          : text === "failed"
            ? failed.promise
            : Promise.resolve([node(visibleStatuses.includes(OrganizationStatus.Disable) ? "ARCHIVE" : "ROOT")]),
    );
    const { rerender } = render(<OrganizationTreeSelector />);
    await screen.findByText("ROOT (ROOT)");
    const input = screen.getByRole("textbox", { name: "组织搜索" });
    fireEvent.change(input, { target: { value: "old" } });
    rerender(<OrganizationTreeSelector visibleStatuses={[OrganizationStatus.Disable]} />);
    await screen.findByText("ARCHIVE (ARCHIVE)");
    await act(async () => old.resolve([node("OLD")]));
    expect(screen.queryByText("OLD (OLD)")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "组织搜索" }), { target: { value: "failed" } });
    await act(async () => failed.reject(new Error("组织搜索失败")));
    expect(message.error).toHaveBeenCalledWith("组织搜索失败");
  });
  it.each([
    { name: "default statuses", visibleStatuses: undefined, expectedStatuses: [OrganizationStatus.Enable] },
    {
      name: "explicit statuses",
      visibleStatuses: [OrganizationStatus.Enable, OrganizationStatus.Pause],
      expectedStatuses: [OrganizationStatus.Enable, OrganizationStatus.Pause],
    },
    { name: "empty statuses", visibleStatuses: [], expectedStatuses: [] },
  ])(
    "forwards $name for roots, selected organization, children and search",
    async ({ visibleStatuses, expectedStatuses }) => {
      render(
        <OrganizationTreeSelector
          value="SELECTED"
          visibleStatuses={visibleStatuses}
          selectableOrgTypes={[OrganizationType.Department]}
          selectableStatuses={[OrganizationStatus.Enable]}
        />,
      );

      const filters = {
        visibleStatuses: expectedStatuses,
        selectableOrgTypes: [OrganizationType.Department],
        selectableStatuses: [OrganizationStatus.Enable],
      };
      await waitFor(() => {
        expect(organizationService.getNodes).toHaveBeenCalledWith({ ...filters, parentOrgCode: null, pageSize: 100 });
        expect(organizationService.getNodes).toHaveBeenCalledWith({ ...filters, orgCode: "SELECTED", pageSize: 1 });
      });

      fireEvent.click(screen.getByRole("button", { name: "加载子组织" }));
      await waitFor(() => {
        expect(organizationService.getNodes).toHaveBeenCalledWith({ ...filters, parentOrgCode: "ROOT", pageSize: 200 });
      });

      fireEvent.change(screen.getByRole("textbox", { name: "组织搜索" }), { target: { value: "  部门  " } });
      await waitFor(() => {
        expect(organizationService.getNodes).toHaveBeenCalledWith({ ...filters, text: "部门", pageSize: 80 });
      });
    },
  );
});

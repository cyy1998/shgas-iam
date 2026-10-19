import OrganizationTreeSelector from "@admin/components/OrganizationTreeSelector";
import { OrganizationStatus, OrganizationType } from "@iam/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  }: {
    onSearch: (text: string) => Promise<void>;
    loadData: (node: { value: string }) => Promise<void>;
  }) => (
    <div>
      <input aria-label="组织搜索" onChange={(event) => void onSearch(event.target.value)} />
      <button type="button" onClick={() => void loadData({ value: "ROOT" })}>
        加载子组织
      </button>
    </div>
  );
  return { default: { message, TreeSelect }, message, TreeSelect };
});

beforeEach(() => {
  organizationService.getNodes.mockReset().mockResolvedValue([]);
});

describe("OrganizationTreeSelector request filters", () => {
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

import { ApiErrorCode } from "@iam/contracts";
import { expect, it } from "vitest";
import { adminCapabilitySummary, currentAdminUser } from "~admin/test/mocks/fixtures";
import { mockCurrentAdminUser, rpcFailure } from "~admin/test/mocks/rpc";
import { mockScopedManagement, scopedOrganizationRoots } from "~admin/test/mocks/scoped-management";
import { server } from "~admin/test/mocks/server";
import { screen, within } from "~admin/test/render";
import { registerAdminAppLifecycle, renderAdminApp } from "~admin/test/render-app";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();
registerAdminAppLifecycle();

const path = "/iam-admin/organizations";
const root = scopedOrganizationRoots[0];

function organizationDetail(changeStatus: boolean) {
  return {
    ...root,
    businessParentId: -1,
    path: `/${root.id}`,
    isVirtual: false,
    isEntity: true,
    isDelete: false,
    parentCode: null,
    parentName: null,
    statusText: "正常",
    childrenCount: 0,
    employmentCount: 1,
    createTime: "2026-08-20T00:00:00.000Z",
    updateTime: "2026-08-20T00:00:00.000Z",
    allowedActions: {
      createChild: { allowed: true, reason: null },
      edit: { allowed: true, reason: null },
      changeStatus: changeStatus
        ? { allowed: true, reason: null }
        : { allowed: false, reason: "INTEGRITY_GUARD_BLOCKED" },
      delete: { allowed: false, reason: "INTEGRITY_GUARD_BLOCKED" },
    },
  };
}

function children(parentOrgCode: string | null | undefined) {
  const result = parentOrgCode ? [] : scopedOrganizationRoots;
  return { result, total: result.length, pageNum: 1, pageSize: 50, pages: result.length ? 1 : 0 };
}

it("warns about the subtree check and retains detail after a 409 for open responsibility assignments", async () => {
  const blocker = "该组织层级内存在开放责任任命，无法暂停、停用或删除";
  const rpc = mockScopedManagement({
    "admin.authorization.capabilitySummary": () => adminCapabilitySummary,
    "admin.organization.children": ({ parentOrgCode }) => children(parentOrgCode),
    "admin.organization.detail": () => organizationDetail(true),
    "admin.organization.updateStatus": () =>
      rpcFailure(409, ApiErrorCode.OrganizationHasOpenResponsibilityAssignment, blocker),
  });
  server.use(mockCurrentAdminUser(currentAdminUser));
  const { user } = renderAdminApp(path);
  await user.click(await screen.findByText("授权根 A", { exact: true }));
  await user.click(await screen.findByRole("button", { name: /状\s*态/ }));
  await user.click(await screen.findByText(/切为.*暂停/));
  const confirm = await screen.findByRole("button", { name: "确认变更" });
  expect(screen.getByText(/服务端将检查该组织及全部下级组织/)).toBeInTheDocument();
  expect(rpc.collectMutationRequests()).toEqual([]);
  await user.click(confirm);
  expect(await screen.findByText(blocker)).toBeVisible();
  expect(screen.queryByText("状态已更新")).not.toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "责任任命" })).toBeVisible();
  expect(rpc.collectMutationRequests().map(({ procedure }) => procedure)).toEqual(["admin.organization.updateStatus"]);
});

it("shows granted roots and disables status changes in the HR edit dialog", async () => {
  const rpc = mockScopedManagement({
    "admin.organization.children": ({ parentOrgCode }) => children(parentOrgCode),
    "admin.organization.detail": () => organizationDetail(false),
  });
  const { user } = renderAdminApp(path);
  const firstRoot = await screen.findByText("授权根 A", { exact: true });
  expect(screen.getByText("授权根 B", { exact: true })).toBeVisible();
  expect(screen.queryByText("范围外根")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /新建根组织/ })).not.toBeInTheDocument();
  await user.click(firstRoot);
  expect(await screen.findByRole("button", { name: /下级组织/ })).toBeEnabled();
  expect(screen.getByRole("button", { name: /状\s*态/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /删\s*除/ })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: /编\s*辑/ }));
  const dialog = within(await screen.findByRole("dialog"));
  expect(await dialog.findByLabelText(/^状态/)).toBeDisabled();
  await user.click(dialog.getByRole("button", { name: /取\s*消/ }));
  expect(rpc.collectMutationRequests()).toEqual([]);
});

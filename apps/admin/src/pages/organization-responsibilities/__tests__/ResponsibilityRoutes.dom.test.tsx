import {
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
} from "@iam/contracts";
import { expect, it } from "vitest";
import { adminEmploymentSearchResult, hrAdminCapabilitySummary } from "~admin/test/mocks/fixtures";
import { mockAdminRpc, mockCurrentAdminUser } from "~admin/test/mocks/rpc";
import { mockScopedManagement } from "~admin/test/mocks/scoped-management";
import { server } from "~admin/test/mocks/server";
import { act, fireEvent, screen, waitFor, within } from "~admin/test/render";
import { registerAdminAppLifecycle, renderAdminApp } from "~admin/test/render-app";
import { registerMswLifecycle } from "~admin/test/setup-msw";

registerMswLifecycle();
registerAdminAppLifecycle();
const path = "/iam-admin/organization-responsibilities/assignments";

function allowedActionsForStatus(status: OrganizationResponsibilityAssignmentStatus) {
  const allowed = { allowed: true, reason: null } as const;
  const unavailable = {
    allowed: false,
    reason: "RESOURCE_STATE_NOT_ACTIONABLE",
  } as const;
  return {
    pause: status === OrganizationResponsibilityAssignmentStatus.Enable ? allowed : unavailable,
    resume: status === OrganizationResponsibilityAssignmentStatus.Pause ? allowed : unavailable,
    end: status === OrganizationResponsibilityAssignmentStatus.Disable ? unavailable : allowed,
  };
}

const assignment = {
  id: 101,
  typeCode: OrganizationResponsibilityTypeCode.Head,
  targetOrganization: {
    id: 4,
    orgCode: "FIN",
    orgName: "财务部",
    fullPath: [
      { id: 1, orgCode: "ROOT", orgName: "集团" },
      { id: 4, orgCode: "FIN", orgName: "财务部" },
    ],
  },
  holder: {
    employmentId: 42,
    user: { id: 7, name: "张三", username: "zhangsan" },
    organization: {
      id: 3,
      orgCode: "OPS",
      orgName: "运营部",
      fullPath: [
        { id: 1, orgCode: "ROOT", orgName: "集团" },
        { id: 3, orgCode: "OPS", orgName: "运营部" },
      ],
    },
    position: { id: 8, posCode: "OPS-LEAD", posName: "运营负责人" },
  },
  status: OrganizationResponsibilityAssignmentStatus.Enable,
  startTime: "2026-08-20T00:00:00.000Z",
  endTime: null,
  allowedActions: allowedActionsForStatus(OrganizationResponsibilityAssignmentStatus.Enable),
};

const targetOrganization = {
  id: 4,
  orgCode: "FIN",
  orgName: "财务部",
  orgType: OrganizationType.Department,
  status: OrganizationStatus.Enable,
  level: OrganizationLevel.Two,
  parentId: 1,
  isLeaf: true,
  fullPath: [
    { id: 1, orgCode: "ROOT", orgName: "集团" },
    { id: 4, orgCode: "FIN", orgName: "财务部" },
  ],
  pathText: "集团 / 财务部",
  selectable: true,
};

it("restores a trimmed user search on remount, supports an empty result and clears the URL filter", async () => {
  const second = {
    ...assignment,
    id: 102,
    typeCode: OrganizationResponsibilityTypeCode.Supervising,
    holder: { ...assignment.holder, employmentId: 43, user: { id: 8, name: "李四", username: "lisi" } },
  };
  const rpc = mockAdminRpc({
    "admin.organization.selector": () => [targetOrganization],
    "admin.organizationResponsibility.searchAssignments": ({ userText }) => {
      const items = userText === "李四" ? [second] : userText ? [] : [assignment, second];
      return { items, total: items.length, nextCursor: null };
    },
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const app = renderAdminApp(path);
  const input = () => screen.getByRole("searchbox", { name: "搜索责任用户" });
  await screen.findByRole("row", { name: /张三（zhangsan）/ });
  fireEvent.change(input(), { target: { value: " 李四 " } });
  await app.user.type(input(), "{Enter}");
  await screen.findByRole("row", { name: /李四（lisi）/ });
  expect(screen.queryByRole("row", { name: /张三（zhangsan）/ })).not.toBeInTheDocument();
  const { search } = app.router.state.location;
  expect(new URLSearchParams(search).get("user")).toBe("李四");
  app.unmount();

  const reopened = renderAdminApp(path + search);
  expect(await screen.findByRole("searchbox", { name: "搜索责任用户" })).toHaveValue("李四");
  fireEvent.change(input(), { target: { value: " no-match " } });
  await reopened.user.type(input(), "{Enter}");
  expect(await screen.findByText("无符合条件的责任任命")).toBeVisible();
  await reopened.user.click(screen.getByRole("button", { name: "清除筛选" }));
  await waitFor(() => expect(screen.getAllByRole("button", { name: "详情" })).toHaveLength(2));
  expect(new URLSearchParams(reopened.router.state.location.search).has("user")).toBe(false);
  const last = rpc.requests.filter(({ procedure }) => procedure.endsWith("searchAssignments")).at(-1);
  expect(last?.input).not.toHaveProperty("userText");
});

it("hydrates linked scope and uses the real organization selector when changing it", async () => {
  const rpc = mockAdminRpc({
    "admin.organization.selector": () => [targetOrganization],
    "admin.organizationResponsibility.searchAssignments": () => ({ items: [assignment], total: 1, nextCursor: null }),
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const app = renderAdminApp(`${path}?target=FIN&type=head&employment=42&lifecycle=all`);
  await screen.findByRole("button", { name: "详情" });
  const inputs = () =>
    rpc.requests.filter(({ procedure }) => procedure.endsWith("searchAssignments")).map(({ input }) => input);
  expect(inputs().at(-1)).toMatchObject({
    targetOrganizationCode: "FIN",
    typeCode: "head",
    employmentId: 42,
    lifecycle: "all",
  });
  expect(await screen.findByText("财务部 (FIN)")).toBeVisible();
  await app.user.click(screen.getByRole("button", { name: "清除任职筛选" }));
  await waitFor(() => expect(inputs().at(-1)).not.toHaveProperty("employmentId"));
  const search = app.router.state.location.search;
  expect(Object.fromEntries(new URLSearchParams(search))).toEqual({ target: "FIN", type: "head", lifecycle: "all" });
  app.unmount();
  renderAdminApp(path + search);
  await screen.findByRole("button", { name: "详情" });
  expect(screen.queryByRole("button", { name: "清除任职筛选" })).not.toBeInTheDocument();
  expect(inputs().at(-1)).toMatchObject({ targetOrganizationCode: "FIN", typeCode: "head", lifecycle: "all" });
  expect(inputs().at(-1)).not.toHaveProperty("employmentId");
});

it("selects a real organization and Employment in the global create form", async () => {
  const rpc = mockAdminRpc({
    "admin.organization.selector": () => [targetOrganization],
    "admin.organizationResponsibility.searchAssignments": () => ({ items: [], total: 0, nextCursor: null }),
    "admin.employment.search": () => adminEmploymentSearchResult,
    "admin.organizationResponsibility.createAssignment": () => ({ changed: true, result: { id: 102 } }),
  });
  server.use(mockCurrentAdminUser(), rpc.handler);
  const { user } = renderAdminApp(path);
  await user.click(await screen.findByRole("button", { name: /新建责任任命/ }));
  const dialog = within(await screen.findByRole("dialog"));
  const [target, type, employment] = dialog.getAllByRole("combobox");
  await user.click(target);
  await user.click((await screen.findAllByText("财务部 (FIN)", { exact: true })).at(-1) ?? target);
  await user.click(type);
  await user.click(await screen.findByTitle("分管领导"));
  fireEvent.change(employment, { target: { value: "张三" } });
  const option = await screen.findByTitle(/张三（zhangsan）.*财务部.*财务经理（FIN-001）/);
  expect(dialog.queryByText(/任职 ID|#42/)).not.toBeInTheDocument();
  await user.click(option);
  await user.click(dialog.getByRole("button", { name: /确\s*定|提交/ }));
  await waitFor(() =>
    expect(rpc.collectMutationRequests().map(({ input }) => input)).toEqual([
      { orgCode: "FIN", typeCode: "supervising", employmentId: 42 },
    ]),
  );
});

it("rejects malformed assignment links without loading a wider scope", async () => {
  const rpc = mockScopedManagement();
  renderAdminApp(`${path}?employment=oops&assignment=0`);
  expect(await screen.findByText("责任任命链接参数无效")).toBeVisible();
  expect(rpc.requests.map(({ procedure }) => procedure)).toEqual(["admin.authorization.capabilitySummary"]);
});

it("keeps the two directories readable under HR and issues no requests for denied modules", async () => {
  const rpc = mockScopedManagement({
    "admin.authorization.capabilitySummary": () => ({
      ...hrAdminCapabilitySummary,
      collectionActions: {
        ...hrAdminCapabilitySummary.collectionActions,
        organizationResponsibility: { create: { allowed: false, reason: "ACTION_NOT_GRANTED" } },
      },
    }),
  });
  const { router } = renderAdminApp("/iam-admin/organization-responsibilities/types");
  expect(await screen.findByRole("cell", { name: "head" })).toBeVisible();
  await act(async () => router.navigate("/organization-responsibilities/assignments"));
  expect(await screen.findByText("无符合条件的责任任命")).toBeVisible();
  expect(screen.queryByRole("button", { name: /新建责任任命/ })).not.toBeInTheDocument();
  await act(async () => router.navigate("/clients"));
  expect(await screen.findByText("抱歉，你无权访问该页面")).toBeVisible();
  expect(rpc.collectMutationRequests()).toEqual([]);
  expect(
    rpc.requests.filter(({ procedure }) => /^admin\.(client|role|sessionManagement|audit|systemLog)\./.test(procedure)),
  ).toEqual([]);
});

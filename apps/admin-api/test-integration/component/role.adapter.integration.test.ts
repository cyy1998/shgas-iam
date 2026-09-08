import type { Context } from "hono";
import { createRoleAdapter } from "@admin-api/routes/admin/role/role.adapter";
import { createRoleRoute } from "@admin-api/routes/admin/role/role.index";
import { BadRequestError } from "@iam/api-core/errors";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { RoleAssignmentTargetType, RoleStatus } from "@iam/contracts";
import { RoleCodeExistsError, RoleNotFoundError } from "@iam/domain/role";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { addTestAdminAuthorizationMiddleware, getTestAdminAuthorizationValue } from "../helpers/admin-authorization";

const now = new Date("2026-01-01T00:00:00Z");

function roleDto() {
  return {
    id: 1,
    roleCode: "portal-admin",
    roleName: "Portal Admin",
    clientId: 10,
    status: RoleStatus.Enable,
    description: null,
    isDelete: false,
    createTime: now,
    updateTime: now,
    client: {
      id: 10,
      clientCode: "portal",
      clientName: "Portal",
      status: 1,
    },
    assignmentCount: 0,
  };
}

function assignmentDto() {
  return {
    id: 100,
    roleId: 1,
    targetType: RoleAssignmentTargetType.Organization,
    targetId: 20,
    includeDescendants: true,
    createTime: now,
    updateTime: now,
    target: {
      id: 20,
      code: "ORG",
      name: "Org",
      status: 1,
      description: null,
    },
  };
}

const roleService = {
  createAssignment: mock(),
  createRole: mock(),
  deleteAssignment: mock(),
  deleteRole: mock(),
  getRoleDetailByCode: mock(),
  searchAssignments: mock(),
  searchRolesForAdmin: mock(),
  updateAssignmentScope: mock(),
  updateRole: mock(),
  updateRoleStatus: mock(),
};

const handlers = createRoleAdapter({ roleService } as any);

beforeEach(() => {
  for (const fn of Object.values(roleService))
    fn.mockReset();
});

function createContext(valid: Record<string, unknown>) {
  return {
    get: mock((key: string) => {
      const authorizationValue = getTestAdminAuthorizationValue(key);
      if (authorizationValue !== undefined)
        return authorizationValue;
      if (key === "userId")
        return 1001;
      if (key === "username")
        return "admin";
      if (key === "requestId")
        return "req-1";
      return undefined;
    }),
    req: {
      valid: mock((target: string) => valid[target]),
      header: mock(() => undefined),
      path: "/admin/roles",
      method: "POST",
    },
    json: mock((body: unknown) => body),
  } as unknown as Context & {
    get: ReturnType<typeof mock>;
    req: { valid: ReturnType<typeof mock> };
    json: ReturnType<typeof mock>;
  };
}

describe("admin role adapter", () => {
  test("delegates role search and maps status text", async () => {
    const query = {
      conditions: {
        fuzzyConditions: { text: "admin" },
        exactConditions: { status: RoleStatus.Enable },
      },
      pageNum: 1,
      pageSize: 10,
    };
    roleService.searchRolesForAdmin.mockResolvedValue({
      result: [roleDto()],
      total: 1,
      pageNum: 1,
      pageSize: 10,
      pages: 1,
    });

    const context = createContext({ json: query });
    await expect(handlers.rolesSearch(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(roleService.searchRolesForAdmin).toHaveBeenCalledWith(query);
    expect(context.json).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        result: [expect.objectContaining({ roleCode: "portal-admin", statusText: "正常" })],
      }),
    }), 200);
  });

  test("delegates assignment scope updates with audit context", async () => {
    roleService.updateAssignmentScope.mockResolvedValue({ changed: true, result: null });

    const context = createContext({
      param: { roleCode: "portal-admin", assignmentId: 100 },
      json: { includeDescendants: false },
    });
    await expect(handlers.roleAssignmentScopeUpdate(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(roleService.updateAssignmentScope).toHaveBeenCalledWith(
      "portal-admin",
      100,
      false,
      expect.objectContaining({ actorUserId: 1001, actorUsername: "admin", requestId: "req-1" }),
    );
  });

  test("delegates assignment creation", async () => {
    const input = {
      targetType: RoleAssignmentTargetType.Organization,
      orgCode: "ORG",
      includeDescendants: true,
    };
    roleService.createAssignment.mockResolvedValue({ changed: true, result: assignmentDto() });

    const context = createContext({ param: { roleCode: "portal-admin" }, json: input });
    await expect(handlers.roleAssignmentCreate(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(roleService.createAssignment).toHaveBeenCalledWith(
      "portal-admin",
      input,
      expect.objectContaining({ actorUserId: 1001, actorUsername: "admin", requestId: "req-1" }),
    );
  });
});

describe("Role mutation public transports", () => {
  function surface(roles = ["iam:admin"]) {
    const app = new Hono();
    addTestAdminAuthorizationMiddleware(app, roles);
    app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() } as never));
    app.route("/admin", createRoleRoute(handlers));
    const caller = handlers.roleAdminRouter.createCaller({ hono: createContext({}) });
    return { app, caller };
  }

  function prepareResults() {
    roleService.createRole.mockResolvedValue({ changed: true, result: roleDto() });
    roleService.createAssignment.mockResolvedValue({ changed: true, result: assignmentDto() });
    roleService.updateRole.mockResolvedValue({ changed: false, result: null });
    roleService.updateRoleStatus.mockResolvedValue({ changed: false, result: null });
    roleService.updateAssignmentScope.mockResolvedValue({ changed: false, result: null });
    roleService.deleteRole.mockResolvedValue({ changed: true, result: null });
    roleService.deleteAssignment.mockResolvedValue({ changed: true, result: null });
  }

  test("mounted REST returns unified results and preserves created resource mapping", async () => {
    prepareResults();
    const { app } = surface();
    for (const item of [
      { method: "POST", path: "", input: { roleCode: "portal-admin", roleName: "Portal Admin", clientCode: "portal" }, changed: true, result: { roleCode: "portal-admin", statusText: "正常" } },
      { method: "PUT", path: "/portal-admin", input: { roleName: "Portal Admin" }, changed: false, result: null },
      { method: "PATCH", path: "/portal-admin/status", input: { status: RoleStatus.Enable }, changed: false, result: null },
      { method: "POST", path: "/portal-admin/assignments", input: { targetType: RoleAssignmentTargetType.Organization, orgCode: "ORG" }, changed: true, result: { id: 100, includeDescendants: true } },
      { method: "PATCH", path: "/portal-admin/assignments/100/scope", input: { includeDescendants: true }, changed: false, result: null },
      { method: "DELETE", path: "/portal-admin/assignments/100", changed: true, result: null },
      { method: "DELETE", path: "/portal-admin", changed: true, result: null },
    ]) {
      const response = await app.request(`/admin/roles${item.path}`, {
        method: item.method,
        headers: { "content-type": "application/json" },
        ...(item.input ? { body: JSON.stringify(item.input) } : {}),
      });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ data: { changed: item.changed, result: item.result } });
    }
  });

  test("tRPC returns unified business results directly for every mutation", async () => {
    prepareResults();
    const { caller } = surface();
    const created = await caller.create({ roleCode: "portal-admin", roleName: "Portal Admin", clientCode: "portal", status: RoleStatus.Enable });
    expect(created).toMatchObject({ changed: true, result: { roleCode: "portal-admin", statusText: "正常" } });
    const assignment = await caller.assignments.create({ roleCode: "portal-admin", data: { targetType: RoleAssignmentTargetType.Organization, orgCode: "ORG" } });
    expect(assignment).toMatchObject({ changed: true, result: { id: 100 } });
    const updated = await caller.update({ roleCode: "portal-admin", data: { roleName: "Portal Admin" } });
    const status = await caller.updateStatus({ roleCode: "portal-admin", status: RoleStatus.Enable });
    const scope = await caller.assignments.updateScope({ roleCode: "portal-admin", assignmentId: 100, includeDescendants: true });
    for (const result of [updated, status, scope])
      expect(result).toEqual({ changed: false, result: null });
    const deletedAssignment = await caller.assignments.delete({ roleCode: "portal-admin", assignmentId: 100 });
    const deletedRole = await caller.delete({ roleCode: "portal-admin" });
    expect(deletedAssignment).toEqual({ changed: true, result: null });
    expect(deletedRole).toEqual({ changed: true, result: null });
  });

  test("REST and tRPC preserve 400, 404 and 409 mutation failures", async () => {
    const { app, caller } = surface();
    for (const entry of [
      { error: new BadRequestError("至少提交一个角色更新字段"), status: 400, code: "BAD_REQUEST" },
      { error: new RoleNotFoundError(), status: 404, code: "NOT_FOUND" },
      { error: new RoleCodeExistsError(), status: 409, code: "CONFLICT" },
    ]) {
      roleService.updateRole.mockRejectedValue(entry.error);
      const response = await app.request("/admin/roles/portal-admin", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(entry.status);
      let failure: unknown;
      try {
        await caller.update({ roleCode: "portal-admin", data: {} });
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ code: entry.code });
    }
  });

  test("HR authorization rejects role mutations before service access", async () => {
    const { app } = surface(["iam:hr-admin"]);
    const response = await app.request("/admin/roles/missing", { method: "DELETE" });
    expect(response.status).toBe(403);
    expect(roleService.deleteRole).not.toHaveBeenCalled();
  });
});

import type { Context } from "hono";
import { createRoleAdapter } from "@admin-api/routes/admin/role/role.adapter";
import { RoleAssignmentTargetType, RoleStatus } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { getTestAdminAuthorizationValue } from "../helpers/admin-authorization";

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
    roleService.updateAssignmentScope.mockResolvedValue(assignmentDto());

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
    roleService.createAssignment.mockResolvedValue(assignmentDto());

    const context = createContext({ param: { roleCode: "portal-admin" }, json: input });
    await expect(handlers.roleAssignmentCreate(context, async () => {})).resolves.toMatchObject({ code: 200 });

    expect(roleService.createAssignment).toHaveBeenCalledWith(
      "portal-admin",
      input,
      expect.objectContaining({ actorUserId: 1001, actorUsername: "admin", requestId: "req-1" }),
    );
  });
});

import type { Context } from "hono";
import { createAdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { createOrganizationResponsibilityAdapter } from "@admin-api/routes/admin/organization-responsibility/organization-responsibility.adapter";
import { createOrganizationResponsibilityRoute } from "@admin-api/routes/admin/organization-responsibility/organization-responsibility.index";
import {
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  UserStatus,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

const principalSession = {
  principalSessionId: "ps-admin",
  principal: {
    principalType: "user",
    subjectId: "00000000-0000-4000-8000-000000000001",
  },
};

function createProtectedCatalogApp(roles: string[]) {
  const authentication = createAdminAuthenticationHandlers({
    sessionKernel: {
      resolvePrincipalSession: async () => ({
        status: "resolved",
        value: principalSession,
      }),
    },
    userService: {
      getUserDetailBySubjectIdentifierForAdmin: async () => ({
        id: 1,
        username: "catalog-reader",
        status: UserStatus.Enable,
        roles,
      }),
    },
    config: {
      allowedClientCodes: ["iam-admin"],
      adminRoleCodes: ["iam:admin"],
    },
  } as never);
  const app = new Hono();
  app.use("*", authentication.adminAuthenticationHandler);
  app.route(
    "/admin",
    createOrganizationResponsibilityRoute(createCatalogAdapter()),
  );
  app.onError((error, c) => {
    const status
      = "httpStatus" in error && typeof error.httpStatus === "number"
        ? error.httpStatus
        : 500;
    return c.text(error.message, status as never);
  });
  return app;
}

describe("Organization Responsibility Type Catalog admin adapter", () => {
  test("publishes the same canonical catalog through REST GET and a tRPC query only", async () => {
    const adapter = createCatalogAdapter();
    const route = createOrganizationResponsibilityRoute(adapter);
    const restApp = new Hono().route("/admin", route);

    const restResponse = await restApp.request(
      "http://localhost/admin/organization-responsibilities/types",
    );
    expect(restResponse.status).toBe(200);
    expect(await restResponse.json()).toEqual({
      code: 200,
      data: ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
      message: "success",
    });

    const caller = adapter.organizationResponsibilityAdminRouter.createCaller({
      hono: {
        get: (key: string) => {
          if (key === "userId")
            return 3;
          if (key === "username")
            return "holder";
          return undefined;
        },
        req: {
          header: () => undefined,
          method: "POST",
          path: "/rpc/admin.organizationResponsibility.resumeAssignment",
        },
      } as unknown as Context,
    });
    await expect(caller.listTypes({})).resolves.toEqual(
      ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map(entry => ({ ...entry })),
    );

    expect(
      Object.keys(
        adapter.organizationResponsibilityAdminRouter._def.procedures,
      ),
    ).toEqual([
      "listTypes",
      "listAssignments",
      "searchAssignments",
      "detailAssignment",
      "createAssignment",
      "pauseAssignment",
      "resumeAssignment",
      "endAssignment",
    ]);
    const postResponse = await restApp.request(
      "http://localhost/admin/organization-responsibilities/types",
      { method: "POST" },
    );
    expect(postResponse.status).toBe(404);
  });

  test("exposes organization-scoped create, Open cursor list, and stable-ID detail", async () => {
    const assignment = {
      id: 41,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: "2026-08-20T00:00:00.000Z",
      endTime: null,
      holder: {
        employmentId: 7,
        user: { id: 3, username: "holder", name: "Holder" },
        organization: {
          id: 10,
          orgCode: "HOLDER",
          orgName: "Holder Org",
          fullPath: [{ id: 10, orgCode: "HOLDER", orgName: "Holder Org" }],
        },
        position: { id: 20, posCode: "LEAD", posName: "Lead" },
      },
      targetOrganization: {
        id: 30,
        orgCode: "TARGET",
        orgName: "Target Org",
        fullPath: [{ id: 30, orgCode: "TARGET", orgName: "Target Org" }],
      },
    };
    const listAssignments = mock(async () => ({
      items: [assignment],
      nextCursor: null,
    }));
    const detailAssignment = mock(async () => assignment);
    const execute = mock(async () => ({ id: assignment.id }));
    const manageLifecycle = mock(async () => true);
    const adapter = createOrganizationResponsibilityAdapter({
      createAssignment: { execute } as never,
      manageAssignmentLifecycle: { execute: manageLifecycle } as never,
      service: { listAssignments, detailAssignment } as never,
    });
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("userId" as never, 3 as never);
      c.set("username" as never, "holder" as never);
      await next();
    });
    app.route("/admin", createOrganizationResponsibilityRoute(adapter));

    const listResponse = await app.request(
      "http://localhost/admin/organizations/TARGET/responsibility-assignments?limit=20",
    );
    expect(listResponse.status).toBe(200);
    expect(((await listResponse.json()) as { data: unknown }).data).toEqual({
      items: [assignment],
      nextCursor: null,
    });
    expect(listAssignments).toHaveBeenCalledWith({
      orgCode: "TARGET",
      lifecycle: "open",
      limit: 20,
    });

    const detailResponse = await app.request(
      "http://localhost/admin/organizations/TARGET/responsibility-assignments/41",
    );
    expect(detailResponse.status).toBe(200);
    expect(((await detailResponse.json()) as { data: unknown }).data).toEqual(
      assignment,
    );
    expect(detailAssignment).toHaveBeenCalledWith({
      orgCode: "TARGET",
      id: 41,
    });

    const createResponse = await app.request(
      "http://localhost/admin/organizations/TARGET/responsibility-assignments",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employmentId: 7,
          typeCode: OrganizationResponsibilityTypeCode.Head,
        }),
      },
    );
    expect(createResponse.status).toBe(200);
    expect(((await createResponse.json()) as { data: unknown }).data).toEqual({
      id: 41,
    });
    expect(execute).toHaveBeenCalledWith(
      {
        employmentId: 7,
        targetOrganizationCode: "TARGET",
        typeCode: OrganizationResponsibilityTypeCode.Head,
      },
      expect.objectContaining({
        auditContext: expect.objectContaining({
          actorType: "admin",
          actorUserId: 3,
        }),
      }),
    );

    const pauseResponse = await app.request(
      "http://localhost/admin/organization-responsibilities/assignments/41/pause",
      { method: "POST" },
    );
    expect(pauseResponse.status).toBe(200);
    expect(((await pauseResponse.json()) as { data: unknown }).data).toBe(true);
    expect(manageLifecycle).toHaveBeenCalledWith(
      { id: 41, command: "pause" },
      expect.objectContaining({
        auditContext: expect.objectContaining({
          actorType: "admin",
          actorUserId: 3,
        }),
      }),
    );

    const caller = adapter.organizationResponsibilityAdminRouter.createCaller({
      hono: {
        get: (key: string) => {
          if (key === "userId")
            return 3;
          if (key === "username")
            return "holder";
          return undefined;
        },
        req: {
          header: () => undefined,
          method: "POST",
          path: "/rpc/admin.organizationResponsibility.resumeAssignment",
        },
      } as unknown as Context,
    });
    await expect(caller.resumeAssignment({ id: 41 })).resolves.toBe(true);
    await expect(caller.endAssignment({ id: 41 })).resolves.toBe(true);
    expect(manageLifecycle).toHaveBeenCalledWith(
      { id: 41, command: "resume" },
      expect.any(Object),
    );
    expect(manageLifecycle).toHaveBeenCalledWith(
      { id: 41, command: "end" },
      expect.any(Object),
    );
  });

  test("exposes global Assignment discovery with recoverable cursor filters", async () => {
    const searchAssignments = mock(async () => ({
      items: [],
      nextCursor: "40",
    }));
    const detailAssignment = mock(async ({ id }: { id: number }) => ({ id }));
    const adapter = createOrganizationResponsibilityAdapter({
      createAssignment: {
        execute: async () => {
          throw new Error("assignment create is outside this discovery test");
        },
      } as never,
      manageAssignmentLifecycle: {
        execute: async () => true,
      } as never,
      service: {
        detailAssignment,
        listAssignments: async () => ({ items: [], nextCursor: null }),
        searchAssignments,
      } as never,
    });
    const app = new Hono().route(
      "/admin",
      createOrganizationResponsibilityRoute(adapter),
    );

    const response = await app.request(
      "http://localhost/admin/organization-responsibilities/assignments"
      + "?targetOrganizationCode=TARGET&employmentId=7&typeCode=head"
      + "&lifecycle=all&cursor=41&limit=10",
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: unknown }).data).toEqual({
      items: [],
      nextCursor: "40",
    });
    expect(searchAssignments).toHaveBeenCalledWith({
      targetOrganizationCode: "TARGET",
      employmentId: 7,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      lifecycle: "all",
      cursor: "41",
      limit: 10,
    });

    const caller = adapter.organizationResponsibilityAdminRouter.createCaller({
      hono: {} as Context,
    });
    await expect(
      caller.searchAssignments({
        employmentId: 7,
        lifecycle: "ended",
        limit: 20,
      }),
    ).resolves.toEqual({ items: [], nextCursor: "40" });

    const detailResponse = await app.request(
      "http://localhost/admin/organization-responsibilities/assignments/41",
    );
    expect(detailResponse.status).toBe(200);
    expect(detailAssignment).toHaveBeenCalledWith({ id: 41 });
    expect((await caller.detailAssignment({ id: 42 })).id).toBe(42);
  });

  test("rejects a signed-in non-Admin at the authoritative server boundary", async () => {
    const response = await createProtectedCatalogApp(["iam:user"]).request(
      "http://localhost/admin/organization-responsibilities/types",
      {
        headers: {
          Client: "iam-admin",
          Cookie: "global_session=ps-admin",
        },
      },
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("无管理端访问权限");

    const discoveryResponse = await createProtectedCatalogApp([
      "iam:user",
    ]).request(
      "http://localhost/admin/organization-responsibilities/assignments",
      {
        headers: {
          Client: "iam-admin",
          Cookie: "global_session=ps-admin",
        },
      },
    );
    expect(discoveryResponse.status).toBe(403);
  });
});

function createCatalogAdapter() {
  return createOrganizationResponsibilityAdapter({
    createAssignment: {
      execute: async () => {
        throw new Error("assignment create is outside this catalog test");
      },
    } as never,
    manageAssignmentLifecycle: {
      execute: async () => true,
    } as never,
    service: {
      detailAssignment: async () => {
        throw new Error("assignment detail is outside this catalog test");
      },
      listAssignments: async () => ({ items: [], nextCursor: null }),
      searchAssignments: async () => ({ items: [], nextCursor: null }),
    } as never,
  });
}

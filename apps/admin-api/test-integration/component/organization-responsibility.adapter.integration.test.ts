import type { CreateOrganizationResponsibilityAdapterDeps } from "@admin-api/routes/admin/organization-responsibility/organization-responsibility.adapter";
import type { CreateOrganizationResponsibilityServiceDeps } from "@admin-api/services/organization-responsibility/organization-responsibility.service";
import type { Context } from "hono";
import { createAdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { createOrganizationResponsibilityAdapter } from "@admin-api/routes/admin/organization-responsibility/organization-responsibility.adapter";
import { createOrganizationResponsibilityRoute } from "@admin-api/routes/admin/organization-responsibility/organization-responsibility.index";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { createOrganizationResponsibilityService } from "@admin-api/services/organization-responsibility/organization-responsibility.service";
import {
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  UserStatus,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import {
  addTestAdminAuthorizationMiddleware,
  getTestAdminAuthorizationValue,
} from "../helpers/admin-authorization";

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
    },
  } as never);
  const app = new Hono();
  app.use("*", authentication.adminAuthenticationHandler);
  addTestAdminAuthorizationMiddleware(app, roles);
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
    const restApp = new Hono();
    addTestAdminAuthorizationMiddleware(restApp);
    restApp.route("/admin", route);

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
          const authorizationValue = getTestAdminAuthorizationValue(key);
          if (authorizationValue !== undefined)
            return authorizationValue;
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
    const allowedActions = {
      pause: { allowed: true, reason: null },
      resume: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      end: { allowed: true, reason: null },
    } as const;
    const authorizedAssignment = { ...assignment, allowedActions };
    const listAssignmentsForAdmin = mock(async () => [assignment]);
    const getAssignmentDetailForAdmin = mock(async () => assignment);
    const repository = {
      listAssignmentsForAdmin,
      getAssignmentDetailForAdmin,
    } satisfies CreateOrganizationResponsibilityServiceDeps["repository"];
    const service = createOrganizationResponsibilityService({
      repository,
    });
    const execute = mock(async () => ({ id: assignment.id }));
    const manageLifecycle = mock(async () => true);
    const adapterDeps = {
      createAssignment: { execute },
      manageAssignmentLifecycle: { execute: manageLifecycle },
      service,
    } satisfies CreateOrganizationResponsibilityAdapterDeps;
    const adapter = createOrganizationResponsibilityAdapter(adapterDeps);
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("userId" as never, 3 as never);
      c.set("username" as never, "holder" as never);
      await next();
    });
    addTestAdminAuthorizationMiddleware(app);
    app.route("/admin", createOrganizationResponsibilityRoute(adapter));

    const listResponse = await app.request(
      "http://localhost/admin/organizations/TARGET/responsibility-assignments?limit=20",
    );
    expect(listResponse.status).toBe(200);
    expect(((await listResponse.json()) as { data: unknown }).data).toEqual({
      items: [authorizedAssignment],
      nextCursor: null,
    });
    expect(listAssignmentsForAdmin).toHaveBeenCalledWith(
      {
        targetOrganizationCode: "TARGET",
        lifecycle: "open",
        limit: 21,
      },
      { kind: "full" },
    );

    const detailResponse = await app.request(
      "http://localhost/admin/organizations/TARGET/responsibility-assignments/41",
    );
    expect(detailResponse.status).toBe(200);
    expect(((await detailResponse.json()) as { data: unknown }).data).toEqual(
      authorizedAssignment,
    );
    expect(getAssignmentDetailForAdmin).toHaveBeenCalledWith(
      { orgCode: "TARGET", id: 41 },
      { kind: "full" },
    );

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
        authorization: expect.objectContaining({
          kind: "full",
          readScope: { kind: "full" },
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
        authorization: expect.objectContaining({
          kind: "full",
          readScope: { kind: "full" },
        }),
      }),
    );

    const caller = adapter.organizationResponsibilityAdminRouter.createCaller({
      hono: {
        get: (key: string) => {
          const authorizationValue = getTestAdminAuthorizationValue(key);
          if (authorizationValue !== undefined)
            return authorizationValue;
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
    const app = new Hono();
    addTestAdminAuthorizationMiddleware(app);
    app.route("/admin", createOrganizationResponsibilityRoute(adapter));

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
    expect(searchAssignments).toHaveBeenCalledWith(
      {
        targetOrganizationCode: "TARGET",
        employmentId: 7,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        lifecycle: "all",
        cursor: "41",
        limit: 10,
      },
      expect.objectContaining({
        kind: "full",
        readScope: { kind: "full" },
      }),
    );

    const caller = adapter.organizationResponsibilityAdminRouter.createCaller({
      hono: {
        get: (key: string) => {
          const authorizationValue = getTestAdminAuthorizationValue(key);
          if (authorizationValue !== undefined)
            return authorizationValue;
          if (key === "userId")
            return 3;
          if (key === "username")
            return "holder";
          return undefined;
        },
        req: { header: () => undefined, method: "POST", path: "/rpc/admin.organizationResponsibility.searchAssignments" },
      } as unknown as Context,
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
    expect(detailAssignment).toHaveBeenCalledWith(
      { id: 41 },
      expect.objectContaining({ kind: "full" }),
    );
    expect((await caller.detailAssignment({ id: 42 })).id).toBe(42);
  });

  test("keeps REST and tRPC on the same scoped HR read and mutation authorization", async () => {
    const scope = {
      rootOrganizationIds: [10, 30],
      organizationIds: [10, 11, 30, 31],
    } as const;
    const policy = createAdminAuthorizationPolicy({
      hrAdministrationScopeResolver: { resolveForActor: async () => scope },
      logger: { warn: mock() },
    });
    const listAssignments = mock(async () => ({ items: [], nextCursor: null }));
    const searchAssignments = mock(async () => ({
      items: [],
      nextCursor: null,
    }));
    const detailAssignment = mock(async () => ({ id: 41 }));
    const createAssignment = mock(async (
      ..._args: Parameters<
        CreateOrganizationResponsibilityAdapterDeps["createAssignment"]["execute"]
      >
    ) => ({ id: 41 }));
    const manageAssignmentLifecycle = mock(async (
      ..._args: Parameters<
        CreateOrganizationResponsibilityAdapterDeps["manageAssignmentLifecycle"]["execute"]
      >
    ) => true);
    const adapter = createOrganizationResponsibilityAdapter({
      createAssignment: { execute: createAssignment } as never,
      manageAssignmentLifecycle: {
        execute: manageAssignmentLifecycle,
      } as never,
      service: {
        listAssignments,
        searchAssignments,
        detailAssignment,
      } as never,
    });
    const setHrContext = (c: Context) => {
      c.set("adminAuthorizationPolicy" as never, policy as never);
      c.set("userId" as never, 7 as never);
      c.set("username" as never, "hr-reader" as never);
      c.set("userDetailDto" as never, { roles: ["iam:hr-admin"] } as never);
    };
    const app = new Hono();
    app.use("*", async (c, next) => {
      setHrContext(c);
      await next();
    });
    app.route("/admin", createOrganizationResponsibilityRoute(adapter));
    app.onError((error, c) => {
      const status
        = "httpStatus" in error && typeof error.httpStatus === "number"
          ? error.httpStatus
          : 500;
      return c.text(error.message, status as never);
    });

    for (const url of [
      "http://localhost/admin/organization-responsibilities/types",
      "http://localhost/admin/organizations/TARGET/responsibility-assignments",
      "http://localhost/admin/organization-responsibilities/assignments",
      "http://localhost/admin/organization-responsibilities/assignments/41",
    ]) {
      const response = await app.request(url);
      expect(response.status).toBe(200);
    }

    const callerContext = {
      get: (key: string) => {
        if (key === "adminAuthorizationPolicy")
          return policy;
        if (key === "userId")
          return 7;
        if (key === "username")
          return "hr-reader";
        if (key === "userDetailDto")
          return { roles: ["iam:hr-admin"] };
        return undefined;
      },
      req: {
        header: () => undefined,
        method: "POST",
        path: "/rpc/admin.organizationResponsibility.searchAssignments",
      },
    } as unknown as Context;
    const caller = adapter.organizationResponsibilityAdminRouter.createCaller({
      hono: callerContext,
    });
    const catalog = await caller.listTypes({});
    expect(catalog).toEqual(
      ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map(entry => ({ ...entry })),
    );
    await caller.listAssignments({
      orgCode: "TARGET",
      lifecycle: "open",
      limit: 20,
    });
    await caller.searchAssignments({ lifecycle: "all", limit: 20 });
    await caller.detailAssignment({ id: 41 });

    for (const call of [
      ...listAssignments.mock.calls,
      ...searchAssignments.mock.calls,
      ...detailAssignment.mock.calls,
    ]) {
      expect(call.at(-1)).toMatchObject({
        kind: "scoped",
        readScope: {
          kind: "scoped",
          organizationIds: scope.organizationIds,
        },
      });
    }

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
    const trpcCreated = await caller.createAssignment({
      orgCode: "OTHER",
      employmentId: 8,
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
    });
    expect(trpcCreated).toEqual({ id: 41 });
    expect(createAssignment).toHaveBeenCalledTimes(2);
    expect(createAssignment.mock.calls[0]?.[0]).toEqual({
      employmentId: 7,
      targetOrganizationCode: "TARGET",
      typeCode: OrganizationResponsibilityTypeCode.Head,
    });
    expect(createAssignment.mock.calls[1]?.[0]).toEqual({
      employmentId: 8,
      targetOrganizationCode: "OTHER",
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
    });
    for (const call of createAssignment.mock.calls) {
      expect(call[1]).toMatchObject({
        authorization: {
          kind: "scoped",
          readScope: {
            kind: "scoped",
            organizationIds: scope.organizationIds,
          },
        },
      });
    }
    const pauseResponse = await app.request(
      "http://localhost/admin/organization-responsibilities/assignments/41/pause",
      { method: "POST" },
    );
    expect(pauseResponse.status).toBe(200);
    expect(await caller.resumeAssignment({ id: 42 })).toBe(true);
    expect(await caller.endAssignment({ id: 43 })).toBe(true);
    expect(manageAssignmentLifecycle).toHaveBeenCalledTimes(3);
    expect(manageAssignmentLifecycle.mock.calls.map(call => call[0])).toEqual([
      { id: 41, command: "pause" },
      { id: 42, command: "resume" },
      { id: 43, command: "end" },
    ]);
    for (const call of manageAssignmentLifecycle.mock.calls) {
      expect(call[1]).toMatchObject({
        authorization: {
          kind: "scoped",
          readScope: {
            kind: "scoped",
            organizationIds: scope.organizationIds,
          },
        },
      });
    }
  });

  test("rejects ordinary roles, scoped HR without scope, and wrong Client binding", async () => {
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
    expect(await response.text()).toBe("无管理端操作权限");

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

    const missingScopeResponse = await createProtectedCatalogApp([
      "iam:hr-admin",
    ]).request(
      "http://localhost/admin/organization-responsibilities/assignments/41/pause",
      {
        method: "POST",
        headers: {
          Client: "iam-admin",
          Cookie: "global_session=ps-admin",
        },
      },
    );
    expect(missingScopeResponse.status).toBe(403);
    expect(await missingScopeResponse.text()).toBe("无管理端操作权限");

    const wrongClientResponse = await createProtectedCatalogApp([
      "iam:hr-admin",
    ]).request(
      "http://localhost/admin/organization-responsibilities/assignments/41/pause",
      {
        method: "POST",
        headers: {
          Client: "other-client",
          Cookie: "global_session=ps-admin",
        },
      },
    );
    expect(wrongClientResponse.status).toBe(403);
    expect(await wrongClientResponse.text()).toBe("无管理端访问权限");
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

import {
  createInternalDelegationQueryResource,
  INTERNAL_DELEGATION_STATEMENT_TIMEOUT_MS,
} from "@api/composition/internal-delegation-query";
import {
  createInternalUserQueryResource,
  INTERNAL_USER_STATEMENT_TIMEOUT_MS,
} from "@api/composition/internal-user-query";
import { createApiRoutes } from "@api/composition/routes";
import { createApiUserProfileSearch } from "@api/composition/services/user-profile-search";
import { createApiUserProfileResources } from "@api/composition/user-profile-resources";
import { PRIVILEGE_DELEGATION_RESOLUTION_HANDLER_TIMEOUT_MS } from "@api/routes/internal/delegation/delegation.handlers";
import { INTERNAL_USER_HANDLER_TIMEOUT_MS } from "@api/routes/internal/user/user.handlers";
import { createPublicHandlers } from "@api/routes/public/public.handlers";
import * as publicRoutes from "@api/routes/public/public.routes";
import { createV3UserProfileSearchAdapter } from "@api/services/user-profile-search/user-profile-search-v3.adapter";
import createApp from "@iam/api-core/core/create-app";
import { createRouter } from "@iam/api-core/core/create-router";
import { UserStatus, UserType } from "@iam/contracts";
import { expect, mock, test } from "bun:test";
import pino from "pino";
import appConfig from "~api/app.config";

// This component exercises search transport; authentication is covered by the real root composition.
function authenticationRoutes(userProfileSearch?: unknown) {
  const publicRouter = createRouter<import("@iam/api-core/types").PublicBindings>();
  if (userProfileSearch) {
    const handlers = createPublicHandlers({ userProfileSearch } as never);
    publicRouter.openapi(publicRoutes.usersSearch, handlers.usersSearch);
  }
  return {
    routers: { auth: createRouter(), sso: createRouter(), oidc: createRouter(), public: publicRouter },
  };
}

test("owns dedicated Internal query clients with fixed budgets and deterministic shutdown", async () => {
  expect(INTERNAL_USER_STATEMENT_TIMEOUT_MS).toBe(2_000);
  expect(INTERNAL_USER_HANDLER_TIMEOUT_MS).toBe(5_000);
  expect(INTERNAL_DELEGATION_STATEMENT_TIMEOUT_MS).toBe(2_000);
  expect(PRIVILEGE_DELEGATION_RESOLUTION_HANDLER_TIMEOUT_MS).toBe(5_000);

  const resources = [
    {
      applicationName: "iam-api-internal-user-v3",
      createResource: createInternalUserQueryResource,
      databaseUrl: "postgresql://internal-user.invalid/iam",
    },
    {
      applicationName: "iam-api-internal-delegation-resolution",
      createResource: createInternalDelegationQueryResource,
      databaseUrl: "postgresql://delegation-resolution.invalid/iam",
    },
  ];
  for (const expected of resources) {
    const end = mock(async () => {});
    const queryClient = { end };
    const createSql = mock((_databaseUrl: string, _options: unknown) => queryClient as never);
    const createDatabase = mock((_client: unknown) => ({}) as never);
    const resource = expected.createResource({
      databaseUrl: expected.databaseUrl,
      createSql,
      createDatabase,
    });

    expect(createSql).toHaveBeenCalledWith(expected.databaseUrl, {
      connection: {
        application_name: expected.applicationName,
        statement_timeout: 2_000,
      },
    });
    await resource.close();
    expect(end).toHaveBeenCalledTimes(1);
  }
});

test("closes the production user profile query and queue resources", async () => {
  const closeQuery = mock(async () => {});
  const closeQueue = mock(async () => {});
  const resources = createApiUserProfileResources({
    databaseUrl: "postgresql://internal-user.invalid/iam",
    redis: { host: "127.0.0.1", port: 6379, db: 0 },
    createQueryResource: mock(() => ({ db: {}, close: closeQuery }) as never),
    createQueue: mock(() => ({ close: closeQueue }) as never),
  });

  await resources.close();

  expect(closeQuery).toHaveBeenCalledTimes(1);
  expect(closeQueue).toHaveBeenCalledTimes(1);
});

test("wires canonical Filter through every production search entry and rejects the old DSL", async () => {
  const searchDsl = mock(async () => []);
  const searchLegacyUsers = mock(async () => []);
  const getDelegationsByUserAndOrganizationScopeAndPrivilege = mock(async () => []);
  const userProfileSearch = createApiUserProfileSearch({
    dslSearch: { searchDsl },
    legacySearch: { searchLegacyUsers },
    privilegeDelegationRepository: {
      getDelegationsByUserAndOrganizationScopeAndPrivilege,
    },
  });
  const activeRoutes = await createApiRoutes({
    verifyDatabase: async () => {},
    auditLogWriter: {} as never,
    runtime: {
      logger: {},
      config: {
        auth: {},
        env: { sso: {} },
        userProfile: { dslMaxLimit: 100 },
      },
    } as never,
    services: {
      ...userProfileSearch,
      authentication: authenticationRoutes(userProfileSearch.userProfileSearch),
    } as never,
    useCases: {} as never,
  });
  const app = createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger: pino({ enabled: false }),
    routes: activeRoutes,
    middlewares: {},
  });
  const request = (path: string, body: unknown) =>
    app.request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const internalLegacy = await request("/internal/users/search", { usernames: ["internal-user"] });
  const publicLegacy = await request("/public/users/search", { usernames: ["public-user"] });
  const delegation = await request("/internal/users/search-with-delegation", {
    ancestorOrgCodes: ["ORG"],
    privilegeCode: "privilege:a",
  });
  const dsl = await request("/internal/users/search-dsl", {
    filter: {
      exists: {
        path: "employments",
        where: {
          exists: {
            path: "responsibilities",
            where: {
              field: "type.code",
              op: "eq",
              value: "head",
            },
          },
        },
      },
    },
  });
  const legacyDsl = await request("/internal/users/search-dsl", {
    filter: {
      nested: "employments",
      where: {
        nested: "responsibilities",
        where: {
          field: "responsibility.type.code",
          op: "eq",
          value: "head",
        },
      },
    },
  });

  expect([
    internalLegacy.status,
    publicLegacy.status,
    delegation.status,
    dsl.status,
    legacyDsl.status,
  ]).toEqual([200, 200, 200, 200, 422]);
  expect(searchLegacyUsers).toHaveBeenCalledTimes(3);
  expect(searchDsl).toHaveBeenCalledTimes(1);
  expect(getDelegationsByUserAndOrganizationScopeAndPrivilege).toHaveBeenCalledWith([], "ORG", "privilege:a");
});

test("maps Internal, Public, and Delegation requests through the inactive v3 adapter facade", async () => {
  const detail = {
    id: 101,
    username: "zhangsan",
    wxId: null,
    name: "张三",
    mobile: "13800000000",
    userType: UserType.Formal,
    orderNum: 1,
    status: UserStatus.Disable,
    isDelete: false,
    createTime: new Date("2026-08-22T00:00:00.000Z"),
    updateTime: new Date("2026-08-22T01:00:00.000Z"),
    employments: [],
    privileges: [],
    roles: [],
  };
  const search = mock(async (_input: unknown) => [detail]);
  const adapter = createV3UserProfileSearchAdapter({
    search,
    searchBase: mock(async () => []),
  });
  const getDelegationsByUserAndOrganizationScopeAndPrivilege = mock(async () => []);
  const userProfileSearch = createApiUserProfileSearch({
    dslSearch: adapter,
    legacySearch: adapter,
    privilegeDelegationRepository: {
      getDelegationsByUserAndOrganizationScopeAndPrivilege,
    },
  });
  const activeRoutes = await createApiRoutes({
    verifyDatabase: async () => {},
    auditLogWriter: {} as never,
    runtime: {
      logger: {},
      config: {
        auth: {},
        env: { sso: {} },
        userProfile: { dslMaxLimit: 100 },
      },
    } as never,
    services: {
      ...userProfileSearch,
      authentication: authenticationRoutes(userProfileSearch.userProfileSearch),
    } as never,
    useCases: {} as never,
  });
  const app = createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger: pino({ enabled: false }),
    routes: activeRoutes,
    middlewares: {},
  });
  const request = (path: string, body: unknown) =>
    app.request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const internalResponse = await request("/internal/users/search", {
    usernames: ["zhangsan", "lisi"],
  });
  const publicResponse = await request("/public/users/search", {
    names: ["张三"],
  });
  const delegationResponse = await request("/internal/users/search-with-delegation", {
    ancestorOrgCodes: ["ORG-A"],
    roleCodes: ["role:a", "role:b"],
    privilegeCode: "privilege:a",
  });
  const emptyResponse = await request("/internal/users/search", {});

  expect(search.mock.calls.map(([input]) => input)).toEqual([
    {
      filter: {
        field: "user.username",
        op: "in",
        value: ["zhangsan", "lisi"],
      },
    },
    {
      filter: {
        field: "user.name",
        op: "in",
        value: ["张三"],
      },
    },
    {
      filter: {
        exists: {
          path: "employments",
          where: {
            and: [
              { field: "roles", op: "containsAny", value: ["role:a", "role:b"] },
              {
                exists: {
                  path: "organization.path",
                  where: { field: "code", op: "in", value: ["ORG-A"] },
                },
              },
            ],
          },
        },
      },
    },
  ]);
  expect(await internalResponse.json()).toMatchObject({
    code: 200,
    data: [{ username: "zhangsan", status: UserStatus.Disable }],
  });
  expect(await publicResponse.json()).toMatchObject({
    code: 200,
    data: [{ username: "zhangsan", status: UserStatus.Disable }],
  });
  expect(await delegationResponse.json()).toMatchObject({
    code: 200,
    data: {
      users: [{ username: "zhangsan", status: UserStatus.Disable }],
      delegations: [],
    },
  });
  expect(emptyResponse.status).toBe(422);
  expect(getDelegationsByUserAndOrganizationScopeAndPrivilege).toHaveBeenCalledWith(
    ["zhangsan"],
    "ORG-A",
    "privilege:a",
  );
});

test("publishes canonical Internal User routes and keeps deprecation scoped to Internal search", async () => {
  const activeRoutes = await createApiRoutes({
    verifyDatabase: async () => {},
    auditLogWriter: {} as never,
    runtime: {
      logger: {},
      config: {
        auth: {},
        env: { sso: {} },
        userProfile: { dslMaxLimit: 100 },
      },
    } as never,
    services: { authentication: authenticationRoutes() } as never,
    useCases: {} as never,
  });

  const app = createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger: pino({ enabled: false }),
    routes: activeRoutes,
    middlewares: {},
  });
  const response = await app.request("http://localhost/internal/doc");

  expect(response.status).toBe(200);
  const document = (await response.json()) as {
    paths: Record<string, { post?: { deprecated?: boolean } }>;
  };
  expect(document.paths).toMatchObject({
    "/internal/users/:username": { get: expect.any(Object) },
    "/internal/users/search-dsl": { post: expect.any(Object) },
  });
  expect(document.paths["/internal/users/search"]?.post?.deprecated).toBe(true);

  const publicResponse = await app.request("http://localhost/public/doc");
  expect(publicResponse.status).toBe(200);
  const publicDocument = (await publicResponse.json()) as {
    paths: Record<string, { post?: { deprecated?: boolean } }>;
  };
  expect(publicDocument.paths["/public/users/search"]?.post?.deprecated).toBeUndefined();
});

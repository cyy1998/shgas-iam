import { expect, mock, test } from "bun:test";
import {
  createInternalDelegationQueryResource,
  INTERNAL_DELEGATION_STATEMENT_TIMEOUT_MS,
} from "@api/composition/internal-delegation-query";
import {
  createInternalOrganizationQueryResource,
  INTERNAL_ORGANIZATION_STATEMENT_TIMEOUT_MS,
} from "@api/composition/internal-organization-query";
import {
  createInternalUserQueryResource,
  INTERNAL_USER_STATEMENT_TIMEOUT_MS,
} from "@api/composition/internal-user-query";
import { createApiRoutes } from "@api/composition/routes";
import { createApiUserProfileResources } from "@api/composition/user-profile-resources";
import { PRIVILEGE_DELEGATION_RESOLUTION_HANDLER_TIMEOUT_MS } from "@api/routes/internal/delegation/delegation.handlers";
import { INTERNAL_ORGANIZATION_HANDLER_TIMEOUT_MS } from "@api/routes/internal/organization/organization.handlers";
import { INTERNAL_USER_HANDLER_TIMEOUT_MS } from "@api/routes/internal/user/user.handlers";
import { createUserProfileSearchAdapter } from "@api/services/user-profile-search/user-profile-search.adapter";
import createApp from "@iam/api-core/core/create-app";
import { createRouter } from "@iam/api-core/core/create-router";
import pino from "pino";
import appConfig from "~api/app.config";

// This component exercises route wiring; authentication is covered by the real root composition.
function authenticationRoutes() {
  return {
    routers: { auth: createRouter(), sso: createRouter(), oidc: createRouter(), public: createRouter() },
  };
}

test("owns dedicated Internal query clients with fixed budgets and deterministic shutdown", async () => {
  expect(INTERNAL_USER_STATEMENT_TIMEOUT_MS).toBe(2_000);
  expect(INTERNAL_USER_HANDLER_TIMEOUT_MS).toBe(5_000);
  expect(INTERNAL_DELEGATION_STATEMENT_TIMEOUT_MS).toBe(2_000);
  expect(PRIVILEGE_DELEGATION_RESOLUTION_HANDLER_TIMEOUT_MS).toBe(5_000);
  expect(INTERNAL_ORGANIZATION_STATEMENT_TIMEOUT_MS).toBe(2_000);
  expect(INTERNAL_ORGANIZATION_HANDLER_TIMEOUT_MS).toBe(5_000);

  const resources = [
    {
      applicationName: "iam-api-internal-user",
      createResource: createInternalUserQueryResource,
      databaseUrl: "postgresql://internal-user.invalid/iam",
    },
    {
      applicationName: "iam-api-internal-delegation-resolution",
      createResource: createInternalDelegationQueryResource,
      databaseUrl: "postgresql://delegation-resolution.invalid/iam",
    },
    {
      applicationName: "iam-api-internal-organization-search",
      createResource: createInternalOrganizationQueryResource,
      databaseUrl: "postgresql://organization-search.invalid/iam",
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

test("wires canonical Filter search to the Base query and preserves Internal details", async () => {
  const base = {
    subjectIdentifier: "00000000-0000-4000-8000-000000001001",
    username: "alice",
    name: "Alice",
    mobile: null,
    wxId: null,
  };
  const detail = { ...base, employments: [], roles: [], privileges: [] };
  const searchBase = mock(async (_input: unknown) => [base]);
  const getDetailByUsername = mock(async (_username: string) => detail);
  const userProfileSearch = createUserProfileSearchAdapter({ searchBase });
  const activeRoutes = await createApiRoutes({
    verifyDatabase: async () => {},
    auditLogWriter: {} as never,
    runtime: {} as never,
    services: {
      userProfileSearch,
      internalUserProfileQuery: { getDetailByUsername },
      authentication: authenticationRoutes(),
    } as never,
    useCases: {} as never,
  });
  const app = createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger: pino({ enabled: false }),
    routes: activeRoutes,
    middlewares: {},
  });
  const input = {
    filter: {
      exists: {
        path: "employments",
        where: {
          exists: {
            path: "responsibilities",
            where: { field: "type.code", op: "eq", value: "head" },
          },
        },
      },
    },
  };
  const response = await app.request("http://localhost/internal/users/search-dsl", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).toMatchObject({ code: 200, data: [base] });
  expect(searchBase).toHaveBeenCalledWith(input);
  expect(getDetailByUsername).not.toHaveBeenCalled();

  const detailResponse = await app.request("http://localhost/internal/users/alice");
  const detailBody = await detailResponse.json();
  expect(detailResponse.status).toBe(200);
  expect(detailBody).toMatchObject({ code: 200, data: detail });
  expect(getDetailByUsername).toHaveBeenCalledWith("alice");
  expect(searchBase).toHaveBeenCalledTimes(1);
});

test("publishes canonical Internal User search, detail and write contracts", async () => {
  const activeRoutes = await createApiRoutes({
    verifyDatabase: async () => {},
    auditLogWriter: {} as never,
    runtime: {} as never,
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
  const document = (await response.json()) as { paths: Record<string, unknown> };
  expect(response.status).toBe(200);
  expect(document.paths).toMatchObject({
    "/internal/users/:username": { get: expect.any(Object) },
    "/internal/users/search-dsl": { post: expect.any(Object) },
    "/internal/users/purveyor/contacts": { post: expect.any(Object) },
  });
});

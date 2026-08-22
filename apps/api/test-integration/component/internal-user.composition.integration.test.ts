import {
  createInternalUserQueryResource,
  INTERNAL_USER_STATEMENT_TIMEOUT_MS,
} from "@api/composition/internal-user-query";
import { createApiRoutes } from "@api/composition/routes";
import { INTERNAL_USER_HANDLER_TIMEOUT_MS } from "@api/routes/internal/user/user.handlers";
import createApp from "@iam/api-core/core/create-app";
import { expect, mock, test } from "bun:test";
import pino from "pino";
import appConfig from "~api/app.config";

test("owns the active Internal V2 query client with fixed query and handler budgets", async () => {
  const end = mock(async () => {});
  const queryClient = { end };
  const createSql = mock((_databaseUrl: string, _options: unknown) => queryClient as never);
  const createDatabase = mock((_client: unknown) => ({}) as never);

  const resource = createInternalUserQueryResource({
    databaseUrl: "postgresql://internal-user.invalid/iam",
    createSql,
    createDatabase,
  });

  expect(INTERNAL_USER_STATEMENT_TIMEOUT_MS).toBe(2_000);
  expect(INTERNAL_USER_HANDLER_TIMEOUT_MS).toBe(5_000);
  expect(createSql).toHaveBeenCalledWith(
    "postgresql://internal-user.invalid/iam",
    {
      connection: {
        application_name: "iam-api-internal-user-v2",
        statement_timeout: 2_000,
      },
    },
  );
  await resource.close();

  expect(end).toHaveBeenCalledTimes(1);
});

test("mounts exactly one canonical Internal User route in the Internal API document", async () => {
  const activeRoutes = await createApiRoutes({
    auditLogWriter: {} as never,
    runtime: {
      logger: {},
      config: {
        auth: {},
        env: { sso: {} },
        userProfile: { dslMaxLimit: 100 },
      },
    } as never,
    services: {} as never,
    useCases: {} as never,
  });

  expect(Object.keys(activeRoutes).filter(route =>
    route.includes("/routes/internal/user/"),
  )).toEqual(["./src/routes/internal/user/user.index.ts"]);

  const app = createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger: pino({ enabled: false }),
    routes: activeRoutes,
    middlewares: {},
  });
  const response = await app.request("http://localhost/internal/doc");

  expect(response.status).toBe(200);
  const document = await response.json() as { paths: Record<string, unknown> };
  expect(document.paths).toMatchObject({
    "/internal/users/:username": { get: expect.any(Object) },
    "/internal/users/search-dsl": { post: expect.any(Object) },
  });
});

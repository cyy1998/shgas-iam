import { expect, mock, test } from "bun:test";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createUserHandlers } from "@api/routes/internal/user/user.handlers";
import { createUserRoute } from "@api/routes/internal/user/user.index";
import { createUserProfileSearchAdapter } from "@api/services/user-profile-search/user-profile-search.adapter";
import createApp from "@iam/api-core/core/create-app";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";
import { UserStatus, UserType } from "@iam/contracts";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import { createUserProfileSearchService } from "@iam/user-profile-read-model/query";
import pino from "pino";
import appConfig from "~api/app.config";

test("maps the canonical v3 Filter request through the production Internal HTTP route", async () => {
  const searchCurrentProfileBases = mock(async () => []);
  const query = createUserProfileSearchService({
    profileRepository: {
      searchCurrentProfileBases,
    },
  });
  const app = createProductionApp(query);

  const valid = await request(app, {
    filter: {
      and: [
        { field: "user.username", op: "eq", value: "alice" },
        { not: { field: "user.status", op: "eq", value: UserStatus.Disable } },
      ],
    },
  });
  const legacy = await request(app, {
    filter: { all: [] },
  });
  const empty = await request(app, {});
  const missingBody = await requestWithoutBody(app);
  const emptyStringBody = await requestWithRawBody(app, "");
  const whitespaceBody = await requestWithRawBody(app, "   ");
  const excessiveRawValues = await request(app, {
    filter: {
      field: "user.username",
      op: "in",
      value: Array.from({ length: 501 }).fill("alice"),
    },
  });
  const callerControlledExecution = await request(app, {
    filter: { field: "user.username", op: "eq", value: "alice" },
    limit: 1,
  });

  expect(valid.status).toBe(200);
  expect(await valid.json()).toMatchObject({ code: 200, data: [] });
  expect(legacy.status).toBe(422);
  expect(await legacy.json()).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  expect(empty.status).toBe(422);
  expect(await empty.json()).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  expect(missingBody.status).toBe(422);
  expect(await missingBody.json()).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  expect(emptyStringBody.status).toBe(422);
  expect(await emptyStringBody.json()).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  expect(whitespaceBody.status).toBe(422);
  expect(await whitespaceBody.json()).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  expect(excessiveRawValues.status).toBe(422);
  expect(callerControlledExecution.status).toBe(422);
  expect(searchCurrentProfileBases).toHaveBeenCalledTimes(1);
});

test("returns UserProfileBase from typed profile columns without depending on Detail", async () => {
  const searchCurrentProfileBases = mock(async () => [
    {
      detail: { malformed: "unused" },
      mobile: null,
      name: "Typed Bob",
      searchDocument: {
        user: {
          subjectIdentifier: "c7553267-7081-4a69-b2c8-121b208327a6",
          username: "filtered-alice",
          name: "Search Alice",
          mobile: "13800000000",
          wxId: "search-wx",
          userType: UserType.Formal,
          status: UserStatus.Enable,
        },
        employments: [],
      },
      subjectIdentifier: "87b69425-6d95-4a36-93c8-95327869318e",
      username: "typed-bob",
      wxId: null,
    },
  ]);
  const query = createUserProfileSearchService({
    profileRepository: {
      searchCurrentProfileBases,
    },
  });
  const app = createProductionApp(query);

  const response = await request(app, {
    filter: { field: "user.username", op: "eq", value: "filtered-alice" },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    code: 200,
    data: [
      {
        mobile: null,
        name: "Typed Bob",
        subjectIdentifier: "87b69425-6d95-4a36-93c8-95327869318e",
        username: "typed-bob",
        wxId: null,
      },
    ],
    message: "success",
  });
});

test("preserves Profile HTTP depth and node budgets before executing the query", async () => {
  const searchCurrentProfileBases = mock(async () => []);
  const app = createProductionApp(
    createUserProfileSearchService({
      profileRepository: { searchCurrentProfileBases },
    }),
  );
  const condition = { field: "user.username", op: "eq", value: "alice" };
  let atDepthLimit: unknown = condition;
  for (let depth = 1; depth < 8; depth++) atDepthLimit = { not: atDepthLimit };
  const valid = await request(app, { filter: atDepthLimit });
  const validBody = await valid.json();
  expect(valid.status).toBe(200);
  expect(validBody).toMatchObject({ code: 200, data: [] });
  const tooManyNodes = { and: Array.from({ length: 8 }, () => ({ and: Array.from({ length: 8 }, () => condition) })) };
  for (const filter of [
    { not: atDepthLimit },
    tooManyNodes,
    { and: Array.from({ length: 17 }, () => condition) },
    { ...condition, op: "in", value: Array.from({ length: 501 }, () => "alice") },
    { ...condition, value: "x".repeat(129) },
  ]) {
    const response = await request(app, { filter });
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  }
  expect(searchCurrentProfileBases).toHaveBeenCalledTimes(1);
});

test("describes one generic recursive Filter AST without enumerating field and operator pairs", async () => {
  const query = createUserProfileSearchService({
    profileRepository: {
      searchCurrentProfileBases: mock(async () => []),
    },
  });
  const app = createProductionApp(query);

  const response = await app.request("http://localhost/internal/doc");
  const document = (await response.json()) as {
    components: {
      schemas: Record<string, unknown>;
    };
  };

  expect(response.status).toBe(200);
  expect(document.components.schemas.UserProfileSearchRequest).toMatchObject({
    type: "object",
    additionalProperties: false,
    required: ["filter"],
    properties: {
      filter: {
        $ref: "#/components/schemas/UserProfileFilterExpression",
      },
    },
  });
  const expressionDocument = JSON.stringify(document.components.schemas.UserProfileFilterExpression);
  expect(document.components.schemas.UserProfileFilterExpression).toMatchObject({
    anyOf: expect.any(Array),
  });
  expect(expressionDocument).toContain('"and"');
  expect(expressionDocument).toContain('"or"');
  expect(expressionDocument).toContain('"not"');
  expect(expressionDocument).toContain('"exists"');
  expect(expressionDocument).toContain('"field"');
  expect(expressionDocument).not.toContain("user.username");
  expect(expressionDocument).not.toContain("responsibility.type.code");

  const userProfileBase = document.components.schemas.UserProfileBase as {
    additionalProperties?: unknown;
    properties?: Record<string, unknown>;
    required?: unknown[];
    type?: unknown;
  };
  expect(userProfileBase).toMatchObject({
    additionalProperties: false,
    type: "object",
  });
  expect(Object.keys(userProfileBase.properties ?? {}).sort()).toEqual([
    "mobile",
    "name",
    "subjectIdentifier",
    "username",
    "wxId",
  ]);
  expect(userProfileBase.required).toHaveLength(5);
  expect(userProfileBase.required).toEqual(
    expect.arrayContaining(["mobile", "name", "subjectIdentifier", "username", "wxId"]),
  );
});

test("maps the fixed Internal handler deadline to the sanitized v3 unavailable response", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const events: string[] = [];
  globalThis.setTimeout = ((callback: () => void) => {
    events.push("deadline-started");
    callback();
    return 1;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
  try {
    const app = createProductionApp({
      searchBase: async () => {
        events.push("query-started");
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        throw new Error("database detail must not escape");
      },
    } as never);

    const response = await request(app, {
      filter: { field: "user.username", op: "eq", value: "alice" },
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "USER_SEARCH_UNAVAILABLE",
      message: "用户搜索暂时不可用",
    });
    expect(events).toEqual(["deadline-started", "query-started"]);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

function createProductionApp(query: ReturnType<typeof createUserProfileSearchService>, authenticate = false) {
  const adapter = createUserProfileSearchAdapter(query);
  const handlers = createUserHandlers({
    registerPurveyorContact: { execute: async () => true },
    internalUserProfileQuery: { getDetailByUsername: async () => null as never },
    userProfileSearch: adapter,
  });
  return createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger: pino({ enabled: false }),
    routes: {
      "./src/routes/internal/user/user.index.ts": {
        default: createUserRoute(handlers),
      },
    },
    middlewares: authenticate
      ? {
          "./src/routes/internal/_middleware.ts": {
            default: createInternalMiddlewares({
              internalAuthenticationHandler: createInternalAuthenticationHandler({
                getClientBySecret: async (): Promise<GenericClientRuntimeDto | null> => null,
              }),
            }),
          },
        }
      : {},
  });
}

async function request(app: ReturnType<typeof createProductionApp>, body: unknown) {
  return await app.request("http://localhost/internal/users/search-dsl", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function requestWithoutBody(app: ReturnType<typeof createProductionApp>) {
  return await app.request("http://localhost/internal/users/search-dsl", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
}

async function requestWithRawBody(app: ReturnType<typeof createProductionApp>, body: string) {
  return await app.request("http://localhost/internal/users/search-dsl", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

test("requires a valid Internal Client credential before querying user profiles", async () => {
  const searchCurrentProfileBases = mock(async () => []);
  const app = createProductionApp(
    createUserProfileSearchService({ profileRepository: { searchCurrentProfileBases } }),
    true,
  );
  for (const credential of [undefined, "invalid-secret"]) {
    const headers = new Headers({ "content-type": "application/json" });
    if (credential !== undefined) headers.set("apikey", credential);
    const response = await app.request("http://localhost/internal/users/search-dsl", {
      method: "POST",
      headers,
      body: JSON.stringify({ filter: { field: "user.username", op: "eq", value: "alice" } }),
    });
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.data).toBeNull();
  }
  expect(searchCurrentProfileBases).not.toHaveBeenCalled();
});

import { expect, mock, test } from "bun:test";
import { createInternalAuthenticationHandler } from "@api/middlewares/internal-client-authentication";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createUserHandlers } from "@api/routes/internal/user/user.handlers";
import { createUserRoute } from "@api/routes/internal/user/user.index";
import { createUserDocumentSearchAdapter } from "@api/services/user-document-search/user-document-search.adapter";
import createApp from "@iam/api-core/core/create-app";
import { UserDocumentSchema, UserStatus, UserType } from "@iam/contracts";
import { userDocuments } from "@iam/db/schema";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import { USER_DOCUMENT_SCHEMA_VERSION } from "@iam/user-document";
import { compileUserDocumentFilter, createUserDocumentSearchService } from "@iam/user-document/query";
import { createMiddleware } from "hono/factory";
import pino from "pino";
import appConfig from "~api/app.config";

test("maps the canonical v4 Filter request through the production Internal HTTP route", async () => {
  const searchCurrentDocuments = mock(async () => ({ rows: [], total: 0 }));
  const query = createUserDocumentSearchService({
    documentRepository: {
      searchCurrentDocuments,
    },
  });
  const app = createProductionApp(query);

  const valid = await request(app, {
    filter: {
      and: [
        { field: "username", op: "eq", value: "alice" },
        { not: { field: "status", op: "eq", value: UserStatus.Disable } },
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
      field: "username",
      op: "in",
      value: Array.from({ length: 501 }).fill("alice"),
    },
  });
  const callerControlledExecution = await request(app, {
    filter: { field: "username", op: "eq", value: "alice" },
    limit: 1,
  });

  expect(valid.status).toBe(200);
  expect(await valid.json()).toMatchObject({ code: 200, data: { items: [], total: 0, page: null, pageSize: null } });
  expect(legacy.status).toBe(422);
  expect(await legacy.json()).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  expect(empty.status).toBe(200);
  expect(await empty.json()).toMatchObject({ code: 200, data: { items: [], total: 0 } });
  expect(missingBody.status).toBe(422);
  expect(await missingBody.json()).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  expect(emptyStringBody.status).toBe(422);
  expect(await emptyStringBody.json()).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  expect(whitespaceBody.status).toBe(422);
  expect(await whitespaceBody.json()).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  expect(excessiveRawValues.status).toBe(422);
  expect(callerControlledExecution.status).toBe(422);
  expect(searchCurrentDocuments).toHaveBeenCalledTimes(2);
});

test("returns 422 for retired authorization paths while role conditions remain searchable", async () => {
  const app = createProductionApp(
    createUserDocumentSearchService({
      documentRepository: {
        async searchCurrentDocuments(filter) {
          compileUserDocumentFilter(filter, userDocuments.document, "internal");
          return { rows: [], total: 0 };
        },
      },
    }),
  );

  const roles = await request(app, {
    filter: { exists: { path: "employments", where: { field: "roles", op: "containsAny", value: ["reader"] } } },
  });
  const retired = await request(app, {
    filter: { exists: { path: "employments", where: { field: "privileges", op: "containsAny", value: ["read"] } } },
  });
  const retiredBody = await retired.json();
  expect(roles.status).toBe(200);
  expect(retired.status).toBe(422);
  expect(retiredBody).toMatchObject({ code: "COMMON.VALIDATION_FAILED", data: null });
});

test("rejects retired document wrappers and subtree operators through Internal HTTP", async () => {
  const searchCurrentDocuments = mock(async () => ({ rows: [], total: 0 }));
  const app = createProductionApp(createUserDocumentSearchService({ documentRepository: { searchCurrentDocuments } }));
  for (const filter of [
    { field: "user.username", op: "eq", value: "alice" },
    {
      exists: {
        path: "employments",
        where: { field: "organization", op: "withinSubtreeOf", value: "ROOT" },
      },
    },
    {
      exists: {
        path: "employments",
        where: {
          exists: {
            path: "responsibilities",
            where: { field: "targetOrganization", op: "withinSubtreeOf", value: "ROOT" },
          },
        },
      },
    },
  ]) {
    const response = await request(app, { filter });
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  }
  expect(searchCurrentDocuments).not.toHaveBeenCalled();
});

test("returns one complete canonical document without storage metadata", async () => {
  const document = {
    subjectIdentifier: "87b69425-6d95-4a36-93c8-95327869318e",
    username: "alice",
    name: "Alice",
    mobile: null,
    wxId: null,
    userType: UserType.Formal,
    status: UserStatus.Enable,
    employments: [],
  };
  const query = createUserDocumentSearchService({
    documentRepository: {
      searchCurrentDocuments: mock(async () => ({
        rows: [
          {
            userId: 1,
            subjectIdentifier: document.subjectIdentifier,
            schemaVersion: USER_DOCUMENT_SCHEMA_VERSION,
            sourceVersion: "4",
            publishedAt: new Date(),
            document,
          },
        ],
        total: 1,
      })),
    },
  });
  const response = await request(createProductionApp(query), {
    filter: { field: "username", op: "eq", value: "alice" },
    select: Object.keys(UserDocumentSchema.shape),
  });
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).toEqual({
    code: 200,
    message: "success",
    data: { items: [document], total: 1, page: null, pageSize: null },
  });
});

test("preserves Profile HTTP depth and node budgets before executing the query", async () => {
  const searchCurrentDocuments = mock(async () => ({ rows: [], total: 0 }));
  const app = createProductionApp(
    createUserDocumentSearchService({
      documentRepository: { searchCurrentDocuments },
    }),
  );
  const condition = { field: "username", op: "eq", value: "alice" };
  let atDepthLimit: unknown = condition;
  for (let depth = 1; depth < 8; depth++) atDepthLimit = { not: atDepthLimit };
  const valid = await request(app, { filter: atDepthLimit });
  const validBody = await valid.json();
  expect(valid.status).toBe(200);
  expect(validBody).toMatchObject({ code: 200, data: { items: [], total: 0, page: null, pageSize: null } });
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
  expect(searchCurrentDocuments).toHaveBeenCalledTimes(1);
});

test("describes one generic recursive Filter AST without enumerating field and operator pairs", async () => {
  const query = createUserDocumentSearchService({
    documentRepository: {
      searchCurrentDocuments: mock(async () => ({ rows: [], total: 0 })),
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
  expect(document.components.schemas.UserDocumentSearchRequest).toMatchObject({
    type: "object",
    additionalProperties: false,
    properties: {
      filter: {
        $ref: "#/components/schemas/UserDocumentFilterExpression",
      },
      paginate: { type: "boolean", default: false },
      select: { type: "array", minItems: 1 },
    },
  });
  expect(document.components.schemas.UserDocumentSearchRequest).not.toHaveProperty("required");
  const expressionDocument = JSON.stringify(document.components.schemas.UserDocumentFilterExpression);
  expect(document.components.schemas.UserDocumentFilterExpression).toMatchObject({
    anyOf: expect.any(Array),
  });
  expect(expressionDocument).toContain('"and"');
  expect(expressionDocument).toContain('"or"');
  expect(expressionDocument).toContain('"not"');
  expect(expressionDocument).toContain('"exists"');
  expect(expressionDocument).toContain('"field"');
  expect(expressionDocument).not.toContain("username");
  expect(expressionDocument).not.toContain("responsibility.type.code");

  const schema = document.components.schemas.UserDocument as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const fields = ["employments", "mobile", "name", "status", "subjectIdentifier", "userType", "username", "wxId"];
  expect(Object.keys(schema.properties ?? {}).sort()).toEqual(fields);
  expect(schema.required).toEqual(expect.arrayContaining(fields));
});

test("maps the fixed Internal handler deadline to the sanitized v4 unavailable response", async () => {
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
      searchDocuments: async () => {
        events.push("query-started");
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        throw new Error("database detail must not escape");
      },
    } as never);

    const response = await request(app, {
      filter: { field: "username", op: "eq", value: "alice" },
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

function createProductionApp(query: ReturnType<typeof createUserDocumentSearchService>, authenticate = false) {
  const adapter = createUserDocumentSearchAdapter(query);
  const handlers = createUserHandlers({
    registerPurveyorContact: { execute: async () => true },
    internalUserDocumentQuery: { getDetailByUsername: async () => null as never },
    userDocumentSearch: adapter,
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
      : {
          "./src/routes/internal/_middleware.ts": {
            default: [
              createMiddleware(async (c, next) => {
                c.set("clientDto", { clientCode: "internal" });
                await next();
              }),
            ],
          },
        },
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

test("requires a valid Internal Client credential before querying user documents", async () => {
  const searchCurrentDocuments = mock(async () => ({ rows: [], total: 0 }));
  const app = createProductionApp(
    createUserDocumentSearchService({ documentRepository: { searchCurrentDocuments } }),
    true,
  );
  for (const credential of [undefined, "invalid-secret"]) {
    const headers = new Headers({ "content-type": "application/json" });
    if (credential !== undefined) headers.set("apikey", credential);
    const response = await app.request("http://localhost/internal/users/search-dsl", {
      method: "POST",
      headers,
      body: JSON.stringify({ filter: { field: "username", op: "eq", value: "alice" } }),
    });
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.data).toBeNull();
  }
  expect(searchCurrentDocuments).not.toHaveBeenCalled();
});

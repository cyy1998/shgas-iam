import { expect, test } from "bun:test";
import { createInternalAuthenticationHandler } from "@api/middlewares/internal-client-authentication";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createOrganizationHandlers } from "@api/routes/internal/organization/organization.handlers";
import { createOrganizationRoute } from "@api/routes/internal/organization/organization.index";
import createApp from "@iam/api-core/core/create-app";
import { OrganizationDocumentSchema, OrganizationStatus, OrganizationType } from "@iam/contracts";
import {
  createOrganizationDocumentQueryRepository,
  createOrganizationDocumentQueryService,
} from "@iam/documents/organization";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import pino from "pino";
import appConfig from "~api/app.config";

const publishedDocument = {
  code: "ROOT",
  name: "已发布根组织",
  type: OrganizationType.Company,
  status: OrganizationStatus.Pause,
  level: 1,
  isVirtual: false,
  isEntity: true,
  path: [{ code: "ROOT", name: "已发布根组织", type: OrganizationType.Company, level: 1, distanceToTarget: 0 }],
};

test("returns the complete published organization document through the production Internal route", async () => {
  const app = createProductionApp(async () => [{ document: publishedDocument }]);
  const response = await request(app, {
    filter: { field: "code", op: "eq", value: "ROOT" },
    select: Object.keys(OrganizationDocumentSchema.shape),
  });
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).toEqual({
    code: 200,
    message: "success",
    data: { items: [publishedDocument], total: 1, page: null, pageSize: null },
  });
});

test("exact directory detail uses the same paused published document as search", async () => {
  const app = createProductionApp(async () => [{ document: publishedDocument }]);
  const response = await app.request("http://localhost/internal/organizations/ROOT");
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.data).toEqual(publishedDocument);
});

test.each([
  { name: "missing publication", rows: [], status: 404 },
  { name: "corrupt publication", rows: [{ document: { organization: { code: "ROOT" } } }], status: 503 },
])("exact directory detail reports $status for $name", async ({ rows, status }) => {
  const app = createProductionApp(async () => rows);
  const response = await app.request("http://localhost/internal/organizations/ROOT");
  expect(response.status).toBe(status);
});

test("exact directory detail maps database failure to unavailable without source fallback", async () => {
  const app = createProductionApp(async () => {
    throw new Error("database unavailable");
  });
  const response = await app.request("http://localhost/internal/organizations/ROOT");
  expect(response.status).toBe(503);
});

test("publishes the recursive DSL request and the common public document shape in OpenAPI", async () => {
  const app = createProductionApp(async () => []);
  const response = await app.request("http://localhost/internal/doc");
  const document = await response.json();
  expect(response.status).toBe(200);
  expect(
    document.paths["/internal/organizations/search-dsl"].post.requestBody.content["application/json"].schema,
  ).toEqual({ $ref: "#/components/schemas/OrganizationDocumentRequest" });
  expect(document.components.schemas.OrganizationDocumentRequest.properties.paginate).toMatchObject({
    type: "boolean",
    default: false,
  });
  expect(document.components.schemas.OrganizationDocumentRequest.properties).toHaveProperty("page");
  expect(document.components.schemas.OrganizationDocumentRequest.properties.pageSize).toMatchObject({ maximum: 500 });
  expect(document.components.schemas.OrganizationDocument.required).toEqual(
    expect.arrayContaining(["code", "name", "type", "status", "level", "isVirtual", "isEntity", "path"]),
  );
  expect(document.components.schemas.OrganizationDocument.properties.path.items.required).toEqual(
    expect.arrayContaining(["code", "name", "type", "level", "distanceToTarget"]),
  );
});

test("rejects unknown fields, incorrect types and operators, empty expressions and caller-selected execution", async () => {
  const app = createProductionApp(async () => []);
  for (const body of [
    { filter: {} },
    { filter: { and: [] } },
    { filter: { or: [] } },
    { filter: { field: "organization.code", op: "eq", value: "ROOT" } },
    { filter: { field: "organization", op: "withinSubtreeOf", value: "ROOT" } },
    { filter: { field: "path", op: "withinSubtreeOf", value: "ROOT" } },
    { filter: { field: "orgCode", op: "eq", value: "ROOT" } },
    { filter: { field: "id", op: "eq", value: 1 } },
    { filter: { field: "level", op: "eq", value: "1" } },
    { filter: { field: "level", op: "eq", value: 0 } },
    { filter: { field: "level", op: "eq", value: 6 } },
    { filter: { field: "status", op: "eq", value: 0 } },
    { filter: { field: "isVirtual", op: "eq", value: 0 } },
    { filter: { field: "code", op: "containsAny", value: ["ROOT"] } },
    { filter: { field: "code", op: "eq", value: null } },
    { filter: { field: "code", op: "in", value: [] } },
    {
      filter: { exists: { path: "path", where: { field: "organization.code", op: "eq", value: "ROOT" } } },
    },
    { filter: { field: "code", op: "eq", value: "ROOT" }, limit: 1 },
    { filter: { field: "code", op: "eq", value: "ROOT" }, sort: "name" },
    { filter: { field: "code", op: "eq", value: "ROOT" }, fields: ["code"] },
  ]) {
    const response = await request(app, body);
    const result = await response.json();
    expect(response.status).toBe(422);
    expect(result).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  }
});

test("enforces shared structural and condition budgets before executing a query", async () => {
  const app = createProductionApp(async () => {
    throw new Error("invalid input cannot query");
  });
  const condition = { field: "code", op: "eq", value: "ROOT" };
  let tooDeep: unknown = condition;
  for (let index = 0; index < 8; index++) tooDeep = { not: tooDeep };
  const tooManyNodes = { and: Array.from({ length: 8 }, () => ({ and: Array.from({ length: 8 }, () => condition) })) };
  for (const filter of [
    tooDeep,
    tooManyNodes,
    { and: Array.from({ length: 17 }, () => condition) },
    { field: "code", op: "in", value: Array.from({ length: 51 }, (_, index) => `ORG-${index}`) },
    { field: "code", op: "eq", value: "x".repeat(129) },
    { field: "code", op: "in", value: Array.from({ length: 501 }, () => "ROOT") },
  ]) {
    const response = await request(app, { filter });
    const result = await response.json();
    expect(response.status).toBe(422);
    expect(result).toMatchObject({ code: "COMMON.VALIDATION_FAILED" });
  }
});

test("accepts duplicate in values within the distinct-value budget and preserves exact strings", async () => {
  const app = createProductionApp(async () => []);
  const response = await request(app, {
    filter: { field: "code", op: "in", value: Array.from({ length: 100 }, () => " ROOT ") },
  });
  const result = await response.json();
  expect(response.status).toBe(200);
  expect(result).toEqual({ code: 200, message: "success", data: { items: [], total: 0, page: null, pageSize: null } });
});

test("returns all 500 matches and rejects a 501st match as a whole", async () => {
  const filter = { field: "type", op: "eq", value: OrganizationType.Company };
  const full = await request(
    createProductionApp(async () => Array.from({ length: 500 }, () => ({ document: publishedDocument }))),
    { filter },
  );
  const fullBody = await full.json();
  expect(full.status).toBe(200);
  expect(fullBody.data.items).toHaveLength(500);
  const excessive = await request(
    createProductionApp(async () => Array.from({ length: 501 }, () => ({ document: publishedDocument }))),
    { filter },
  );
  const excessiveBody = await excessive.json();
  expect(excessive.status).toBe(422);
  expect(excessiveBody).toMatchObject({ code: "ORGANIZATION_DOCUMENT_RESULT_TOO_LARGE" });
  expect(excessiveBody.data).toBeNull();
});

test("fails the whole search when any matched document is corrupt or the database query fails", async () => {
  for (const search of [
    async () => [{ document: publishedDocument }, { document: { ...publishedDocument, internalId: 1 } }],
    async () => [{ document: { ...publishedDocument, path: [] } }],
    async () => [
      {
        document: {
          ...publishedDocument,
          path: [{ ...publishedDocument.path[0], distanceToTarget: 1 }],
        },
      },
    ],
    async () => [
      {
        document: {
          ...publishedDocument,
          path: [{ ...publishedDocument.path[0], code: "OTHER" }],
        },
      },
    ],
    async () => {
      throw new Error("database-password-must-not-escape");
    },
  ]) {
    const response = await request(createProductionApp(search), {
      filter: { field: "code", op: "eq", value: "ROOT" },
    });
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({ code: "ORGANIZATION_DOCUMENT_UNAVAILABLE", message: "组织搜索暂时不可用" });
    expect(body.data).toBeNull();
  }
});

test("maps the five-second handler deadline to a sanitized unavailable response", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timeouts: number[] = [];
  globalThis.setTimeout = ((callback: () => void, timeoutMs: number) => {
    timeouts.push(timeoutMs);
    callback();
    return 1;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
  try {
    const response = await request(
      createProductionApp(async () => {
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        throw new Error("query failure after deadline");
      }),
      { filter: { field: "code", op: "eq", value: "ROOT" } },
    );
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({ code: "ORGANIZATION_DOCUMENT_UNAVAILABLE", message: "组织搜索暂时不可用" });
    expect(timeouts).toEqual([5_000]);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

function createProductionApp(
  searchCurrentDocuments: () => Promise<readonly { document: unknown }[]>,
  authenticate = false,
) {
  const selection = {
    from: () => selection,
    where: () => selection,
    orderBy: () => selection,
    limit: searchCurrentDocuments,
  };
  const query = createOrganizationDocumentQueryService({
    repository: createOrganizationDocumentQueryRepository({ select: () => selection } as never),
  });
  const handlers = createOrganizationHandlers({
    auditLogWriter: { recordAuditLog: async () => undefined, recordAuditLogFromContext: async () => undefined },
    organizationDocument: query,
    organizationService: {
      findOrganizationByCode: async () => null,
      getOrganizationByCode: async () => {
        throw new Error("DSL must not read source detail");
      },
      setOrganization: async () => true,
      updateOrganization: async () => true,
    },
  });
  return createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger: pino({ enabled: false }),
    routes: {
      "./src/routes/internal/organization/organization.index.ts": { default: createOrganizationRoute(handlers) },
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
  return await app.request("http://localhost/internal/organizations/search-dsl", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("requires a valid Internal Client credential for the DSL endpoint", async () => {
  const app = createProductionApp(async () => {
    throw new Error("unauthorized input must not query");
  }, true);
  const unauthorized = await app.request("http://localhost/internal/organizations/search-dsl", {
    method: "POST",
    headers: { "content-type": "application/json", apikey: "invalid-secret" },
    body: JSON.stringify({ filter: { field: "code", op: "eq", value: "ROOT" } }),
  });
  const body = await unauthorized.json();
  expect(unauthorized.status).toBe(401);
  expect(body.data).toBeNull();
});

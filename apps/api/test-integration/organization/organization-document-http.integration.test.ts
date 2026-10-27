import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createInternalOrganizationQueryResource } from "@api/composition/internal-organization-query";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createOrganizationHandlers } from "@api/routes/internal/organization/organization.handlers";
import { createOrganizationRoute } from "@api/routes/internal/organization/organization.index";
import createApp from "@iam/api-core/core/create-app";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";
import { ClientStatus, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { organizationClosures, organizationDocuments, organizations } from "@iam/db/schema";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import {
  createOrganizationDocumentQueryRepository,
  createOrganizationDocumentQueryService,
} from "@iam/organization-document";
import {
  createOrganizationDocumentProcessor,
  type OrganizationOutboxJobPayload,
  type OrganizationRebuildJobPayload,
} from "@iam/organization-document/worker";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import appConfig from "~api/app.config";
import { type ApiPostgresTestHarness, createApiPostgresTestHarness } from "../support/postgres-test-harness";

const now = new Date("2026-10-14T00:00:00.000Z");
const internalClient: GenericClientRuntimeDto = {
  id: 1,
  clientCode: "organization-document",
  clientName: "Organization Search",
  clientSecret: "organization-document-secret",
  status: ClientStatus.Enable,
  isDelete: false,
  description: null,
  extAttributes: {},
  url: null,
  createTime: now,
  updateTime: now,
};
let harness: ApiPostgresTestHarness;
let queryResource: ReturnType<typeof createInternalOrganizationQueryResource>;
let app: ReturnType<typeof createOrganizationApp>;

beforeAll(async () => {
  harness = await createApiPostgresTestHarness();
  queryResource = createInternalOrganizationQueryResource({ databaseUrl: harness.databaseUrl });
  app = createOrganizationApp();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await queryResource?.close();
  await harness?.close();
});

describe("Organization Filter DSL through authenticated Internal HTTP and PostgreSQL", () => {
  test("exact details share published facts with search and do not require current source visibility", async () => {
    await seedTree();
    const unpublished = await detail("ROOT");
    expect(unpublished.status).toBe(404);
    await publishAll();
    const matches = await search({ field: "code", op: "eq", value: "ROOT" });
    await harness.db
      .update(organizations)
      .set({ orgName: "New source name", isDelete: true })
      .where(eq(organizations.id, 30));
    const published = await detail("ROOT");
    expect(published.status).toBe(200);
    expect(published.body.data).toEqual(matches.body.data[0]);
    expect(published.body.data.status).toBe(OrganizationStatus.Disable);
  });

  test("exact details distinguish absent current entries and corrupt published documents", async () => {
    await seedTree();
    await publishAll();
    await harness.sql`UPDATE organization_document SET document='{"code":"ROOT"}'::jsonb WHERE organization_id=30`;
    const corrupt = await detail("ROOT");
    expect(corrupt.status).toBe(503);
    await harness.sql`UPDATE organization_document SET document=NULL,search_visible=FALSE WHERE organization_id=30`;
    const removed = await detail("ROOT");
    expect(removed.status).toBe(404);
    await harness.sql`UPDATE organization_document SET schema_version=999 WHERE organization_id=20`;
    const outdated = await detail("COMPANY");
    expect(outdated.status).toBe(404);
  });
  test("returns matching published facts, full ancestor path and stable internal-ID ordering across all statuses", async () => {
    await seedTree();
    await publishAll();
    await harness.db
      .update(organizations)
      .set({ orgName: "源表新部门", status: OrganizationStatus.Disable, isDelete: true })
      .where(eq(organizations.id, 10));

    const result = await search({
      field: "status",
      op: "in",
      value: [OrganizationStatus.Enable, OrganizationStatus.Pause, OrganizationStatus.Disable],
    });
    expect(result.status).toBe(200);
    expect(result.body.data.map((document: { code: string }) => document.code)).toEqual([
      "DEPT",
      "COMPANY",
      "ROOT",
      "OTHER",
    ]);
    expect(result.body.data[0]).toEqual({
      code: "DEPT",
      name: "已发布部门",
      type: OrganizationType.Department,
      status: OrganizationStatus.Enable,
      level: 3,
      isVirtual: false,
      isEntity: true,
      path: [
        { code: "ROOT", name: "根组织", type: OrganizationType.Company, level: 1, distanceToTarget: 2 },
        { code: "COMPANY", name: "公司", type: OrganizationType.Company, level: 2, distanceToTarget: 1 },
        { code: "DEPT", name: "已发布部门", type: OrganizationType.Department, level: 3, distanceToTarget: 0 },
      ],
    });
    const oldFacts = await search({
      and: [
        { field: "name", op: "eq", value: "已发布部门" },
        { field: "status", op: "eq", value: OrganizationStatus.Enable },
      ],
    });
    expect(oldFacts.body.data.map((document: { code: string }) => document.code)).toEqual(["DEPT"]);
  });

  test("binds composed exists conditions to one path node while independent exists can match distinct nodes", async () => {
    await seedTree();
    await publishAll();
    const sameNode = await search({
      exists: {
        path: "path",
        where: {
          and: [
            { field: "code", op: "eq", value: "ROOT" },
            { field: "level", op: "eq", value: 2 },
          ],
        },
      },
    });
    expect(sameNode.status).toBe(200);
    expect(sameNode.body.data).toEqual([]);
    const distinctNodes = await search({
      and: [
        { exists: { path: "path", where: { field: "code", op: "eq", value: "ROOT" } } },
        { exists: { path: "path", where: { field: "level", op: "eq", value: 2 } } },
      ],
    });
    expect(distinctNodes.status).toBe(200);
    expect(distinctNodes.body.data.map((document: { code: string }) => document.code)).toEqual(["DEPT", "COMPANY"]);
    const immediateParent = await search({
      exists: {
        path: "path",
        where: {
          and: [
            { field: "code", op: "eq", value: "COMPANY" },
            { field: "distanceToTarget", op: "eq", value: 1 },
            { field: "type", op: "eq", value: OrganizationType.Company },
            { field: "name", op: "eq", value: "公司" },
          ],
        },
      },
    });
    expect(immediateParent.body.data.map((document: { code: string }) => document.code)).toEqual(["DEPT"]);
  });

  test("includes the subtree root itself and applies precise scalar and boolean combinations", async () => {
    await seedTree();
    await publishAll();
    const subtree = await search({ exists: { path: "path", where: { field: "code", op: "eq", value: "COMPANY" } } });
    expect(subtree.status).toBe(200);
    expect(subtree.body.data.map((document: { code: string }) => document.code)).toEqual(["DEPT", "COMPANY"]);
    const scoped = await search({
      and: [
        { exists: { path: "path", where: { field: "code", op: "eq", value: "ROOT" } } },
        { field: "level", op: "in", value: [2, 3] },
        { field: "isVirtual", op: "eq", value: false },
        { field: "isEntity", op: "eq", value: true },
        {
          or: [
            { field: "type", op: "eq", value: OrganizationType.Department },
            { not: { field: "status", op: "eq", value: OrganizationStatus.Pause } },
          ],
        },
      ],
    });
    expect(scoped.body.data.map((document: { code: string }) => document.code)).toEqual(["DEPT"]);
    const whitespace = await search({ field: "code", op: "eq", value: " COMPANY " });
    const caseVariant = await search({ field: "code", op: "eq", value: "company" });
    expect(whitespace.body.data).toEqual([]);
    expect(caseVariant.body.data).toEqual([]);
  });

  test("omits unpublished, missing and old-schema documents without applying a source-coverage gate", async () => {
    await seedTree();
    const unpublished = await search({ exists: { path: "path", where: { field: "code", op: "eq", value: "ROOT" } } });
    expect(unpublished.status).toBe(200);
    expect(unpublished.body.data).toEqual([]);
    await publishAll();
    await harness.db.delete(organizationDocuments).where(eq(organizationDocuments.organizationId, 10));
    await harness.db
      .update(organizationDocuments)
      .set({ schemaVersion: 2 })
      .where(eq(organizationDocuments.organizationId, 20));
    await harness.db
      .update(organizationDocuments)
      .set({ document: null, searchVisible: false })
      .where(eq(organizationDocuments.organizationId, 40));
    const available = await search({ exists: { path: "path", where: { field: "code", op: "eq", value: "ROOT" } } });
    expect(available.status).toBe(200);
    expect(available.body.data.map((document: { code: string }) => document.code)).toEqual(["ROOT"]);
  });

  test("rejects a matched malformed document as a whole without scanning unrelated corruption", async () => {
    await seedTree();
    await publishAll();
    await harness.db
      .update(organizationDocuments)
      .set({ document: sql`${organizationDocuments.document} || '{"internalId": 10}'::jsonb` })
      .where(eq(organizationDocuments.organizationId, 10));
    const unmatched = await search({ field: "code", op: "eq", value: "OTHER" });
    expect(unmatched.status).toBe(200);
    expect(unmatched.body.data.map((document: { code: string }) => document.code)).toEqual(["OTHER"]);
    const matched = await search({ exists: { path: "path", where: { field: "code", op: "eq", value: "ROOT" } } });
    expect(matched.status).toBe(503);
    expect(matched.body).toMatchObject({ code: "ORGANIZATION_DOCUMENT_UNAVAILABLE", data: null });
    await harness.db
      .update(organizationDocuments)
      .set({ document: sql`jsonb_set(${organizationDocuments.document}, '{path}', 'null'::jsonb)` })
      .where(eq(organizationDocuments.organizationId, 10));
    const queryFailure = await search({
      exists: { path: "path", where: { field: "code", op: "eq", value: "ROOT" } },
    });
    expect(queryFailure.status).toBe(503);
    expect(queryFailure.body).toMatchObject({ code: "ORGANIZATION_DOCUMENT_UNAVAILABLE", data: null });
  });

  test("maps the independent two-second PostgreSQL statement deadline before the handler budget", async () => {
    await seedTree();
    await publishAll();
    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const holder = harness.sql.begin(async (transaction) => {
      await transaction`LOCK TABLE organization_document IN ACCESS EXCLUSIVE MODE`;
      locked.resolve();
      await release.promise;
    });
    try {
      await locked.promise;
      const startedAt = performance.now();
      const timedOut = await search({ field: "code", op: "eq", value: "ROOT" });
      const elapsedMs = performance.now() - startedAt;
      expect(timedOut.status).toBe(503);
      expect(timedOut.body).toMatchObject({ code: "ORGANIZATION_DOCUMENT_UNAVAILABLE", data: null });
      // A held lock cannot produce a result; completion before five seconds proves the DB deadline fired.
      expect(elapsedMs).toBeLessThan(4_500);
    } finally {
      release.resolve();
      await holder;
    }
    const recovered = await search({ field: "code", op: "eq", value: "ROOT" });
    expect(recovered.status).toBe(200);
  }, 10_000);

  test("returns exactly 500 complete matches and rejects a 501st published match without truncation", async () => {
    const roots = Array.from({ length: 501 }, (_, index) => ({
      id: index + 1,
      orgCode: `ORG-${index + 1}`,
      orgName: `Organization ${index + 1}`,
      orgType: OrganizationType.Company,
      level: 1 as const,
      parentId: -1,
      path: `/${index + 1}`,
      status: OrganizationStatus.Enable,
    }));
    await harness.db.insert(organizations).values(roots);
    await harness.db
      .insert(organizationClosures)
      .values(roots.map(({ id }) => ({ ancestorId: id, descendantId: id, depth: 0 })));
    await publishAll();
    const exactly500 = await search({ field: "code", op: "in", value: ["ORG-501"] });
    expect(exactly500.status).toBe(200);
    expect(exactly500.body.data).toHaveLength(1);
    const bounded = await search({ not: { field: "code", op: "eq", value: "ORG-501" } });
    expect(bounded.status).toBe(200);
    expect(bounded.body.data).toHaveLength(500);
    expect(bounded.body.data[0].code).toBe("ORG-1");
    expect(bounded.body.data[499].code).toBe("ORG-500");
    const excessive = await search({ field: "status", op: "eq", value: OrganizationStatus.Enable });
    expect(excessive.status).toBe(422);
    expect(excessive.body).toMatchObject({ code: "ORGANIZATION_DOCUMENT_RESULT_TOO_LARGE", data: null });
  }, 60_000);
});

async function seedTree() {
  await harness.db.insert(organizations).values([
    {
      id: 30,
      orgCode: "ROOT",
      orgName: "根组织",
      orgType: OrganizationType.Company,
      status: OrganizationStatus.Disable,
      level: 1,
      parentId: -1,
      path: "/30",
      isVirtual: false,
      isEntity: true,
    },
    {
      id: 20,
      orgCode: "COMPANY",
      orgName: "公司",
      orgType: OrganizationType.Company,
      status: OrganizationStatus.Pause,
      level: 2,
      parentId: 30,
      path: "/30/20",
      isVirtual: false,
      isEntity: true,
    },
    {
      id: 10,
      orgCode: "DEPT",
      orgName: "已发布部门",
      orgType: OrganizationType.Department,
      status: OrganizationStatus.Enable,
      level: 3,
      parentId: 20,
      path: "/30/20/10",
      isVirtual: false,
      isEntity: true,
    },
    {
      id: 40,
      orgCode: "OTHER",
      orgName: "另一个根",
      orgType: OrganizationType.Virtual,
      status: OrganizationStatus.Enable,
      level: 1,
      parentId: -1,
      path: "/40",
      isVirtual: true,
      isEntity: false,
    },
  ]);
  await harness.db.insert(organizationClosures).values([
    { ancestorId: 30, descendantId: 30, depth: 0 },
    { ancestorId: 30, descendantId: 20, depth: 1 },
    { ancestorId: 20, descendantId: 20, depth: 0 },
    { ancestorId: 30, descendantId: 10, depth: 2 },
    { ancestorId: 20, descendantId: 10, depth: 1 },
    { ancestorId: 10, descendantId: 10, depth: 0 },
    { ancestorId: 40, descendantId: 40, depth: 0 },
  ]);
}

async function publishAll() {
  const changes: OrganizationOutboxJobPayload[] = [];
  const rebuilds: OrganizationRebuildJobPayload[] = [];
  const processor = createOrganizationDocumentProcessor({
    db: harness.db,
    clock: { nowDate: () => now },
    jobProducer: {
      async enqueueOutboxEntries(payloads) {
        changes.push(...payloads);
        return { enqueued: payloads.length };
      },
      async enqueueRebuilds(payloads) {
        rebuilds.push(...payloads);
        return { enqueued: payloads.length };
      },
    },
  });
  await processor.backfillAllOrganizations();
  for (const change of changes) await processor.processOutbox(change);
  for (const rebuild of rebuilds) await processor.processRebuild(rebuild);
}

function createOrganizationApp() {
  const handlers = createOrganizationHandlers({
    auditLogWriter: { recordAuditLog: async () => undefined, recordAuditLogFromContext: async () => undefined },
    organizationDocument: createOrganizationDocumentQueryService({
      repository: createOrganizationDocumentQueryRepository(queryResource.db),
    }),
    organizationService: {
      findOrganizationByCode: async () => null,
      getOrganizationByCode: async () => {
        throw new Error("DSL cannot read source detail");
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
    middlewares: {
      "./src/routes/internal/_middleware.ts": {
        default: createInternalMiddlewares({
          internalAuthenticationHandler: createInternalAuthenticationHandler({
            getClientBySecret: async (secret) => (secret === internalClient.clientSecret ? internalClient : null),
          }),
        }),
      },
    },
  });
}

async function search(filter: unknown, secret = internalClient.clientSecret) {
  const response = await app.request("http://localhost/internal/organizations/search-dsl", {
    method: "POST",
    headers: { apikey: secret, Client: internalClient.clientCode, "content-type": "application/json" },
    body: JSON.stringify({ filter }),
  });
  return { status: response.status, body: await response.json() };
}

async function detail(code: string) {
  const response = await app.request(`http://localhost/internal/organizations/${code}`, {
    headers: { apikey: internalClient.clientSecret, Client: internalClient.clientCode },
  });
  return { status: response.status, body: await response.json() };
}

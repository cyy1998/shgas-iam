import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createCustomAttributeAdapter } from "@admin-api/routes/admin/custom-attribute/custom-attribute.index";
import { createOrganizationAdapter } from "@admin-api/routes/admin/organization/organization.adapter";
import { createOrganizationRoute } from "@admin-api/routes/admin/organization/organization.index";
import { createPositionAdapter } from "@admin-api/routes/admin/position/position.adapter";
import { createPositionRoute } from "@admin-api/routes/admin/position/position.index";
import { createAdminAuthorizationContextHandler } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { createCustomAttributeDefinitionService } from "@admin-api/services/custom-attribute/custom-attribute.service";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { createPositionService } from "@admin-api/services/position/position.service";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { createTRPCContext, router } from "@iam/api-core/trpc";
import { EmploymentStatus, OrganizationType, PositionStatus } from "@iam/contracts";
import {
  auditLogs,
  employments,
  organizationDocumentOutboxEntries,
  userDocumentOutboxEntries,
  users,
} from "@iam/db/schema";
import {
  createOrganizationDocumentQueryRepository,
  createOrganizationDocumentQueryService,
} from "@iam/documents/organization";
import {
  createOrganizationDocumentProcessor,
  createOrganizationDocumentVerifier,
  type OrganizationOutboxJobPayload,
  type OrganizationRebuildJobPayload,
} from "@iam/documents/organization/worker";
import { mapUnitOfWork } from "@iam/unit-of-work";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { addTestAdminAuthorizationMiddleware } from "../../src/testing/admin-authorization";
import { type AdminApiPostgresTestHarness, createAdminApiPostgresTestHarness } from "../support/postgres-test-harness";

import { createUserDocumentPublicationFixture } from "../support/user-document-workflow";

let harness: AdminApiPostgresTestHarness;
beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});
beforeEach(async () => {
  await harness.reset();
});
afterAll(async () => {
  await harness?.close();
});

function createTestApp(hrOrganizationId?: number) {
  const repositories = createAdminApiRepositories(harness.db);
  const logger = { info() {}, warn() {}, error() {} };
  const uow = createAdminApiUnitOfWork({
    db: harness.db,
    logger,
    clock: { nowDate: () => new Date("2026-11-22T00:00:00Z") },
    userDocumentJobProducer: {
      async enqueueOutboxEntries() {
        return { enqueued: 0 };
      },
    },
    organizationDocumentJobProducer: {
      async enqueueOutboxEntries() {
        return { enqueued: 0 };
      },
    },
  });
  const organization = createOrganizationService({
    organizationRepository: repositories.organization,
    customAttributeDefinitions: repositories.customAttribute,
    responsibilityReader: repositories.organizationResponsibility,
    uow: mapUnitOfWork(uow, (tx) => ({
      organizationRepository: tx.repositories.organization,
      customAttributeDefinitions: tx.repositories.customAttribute,
      auditService: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userDocumentInvalidation: tx.userDocumentInvalidation,
      organizationDocumentInvalidation: tx.organizationDocumentInvalidation,
    })),
  });
  const position = createPositionService({
    positionRepository: repositories.position,
    customAttributeDefinitions: repositories.customAttribute,
    uow: mapUnitOfWork(uow, (tx) => ({
      positionRepository: tx.repositories.position,
      customAttributeDefinitions: tx.repositories.customAttribute,
      auditService: tx.auditService,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });
  const definitions = createCustomAttributeAdapter(
    createCustomAttributeDefinitionService({
      reader: repositories.customAttribute,
      uow: mapUnitOfWork(uow, (tx) => ({
        definitions: tx.repositories.customAttribute,
        audit: tx.auditService,
        userDocumentInvalidation: tx.userDocumentInvalidation,
        organizationDocumentInvalidation: tx.organizationDocumentInvalidation,
      })),
    }),
  );
  const app = new Hono();
  app.onError(createErrorHandler(logger));
  addTestAdminAuthorizationMiddleware(app, hrOrganizationId === undefined ? ["iam:admin"] : ["iam:hr-admin"]);
  if (hrOrganizationId !== undefined) {
    app.use(
      "*",
      createAdminAuthorizationContextHandler(
        createAdminAuthorizationPolicy({
          logger,
          hrAdministrationScopeResolver: {
            resolveForActor: async () => ({
              rootOrganizationIds: [hrOrganizationId],
              organizationIds: [hrOrganizationId],
            }),
          },
        }),
      ),
    );
  }
  const organizationAdapter = createOrganizationAdapter({ organizationService: organization });
  const positionAdapter = createPositionAdapter({ positionService: position });
  app.route("/admin", createOrganizationRoute(organizationAdapter));
  app.route("/admin", createPositionRoute(positionAdapter));
  app.route("/admin", definitions.rest);
  const adminRouter = router({
    admin: router({
      organization: organizationAdapter.organizationAdminRouter,
      position: positionAdapter.positionAdminRouter,
    }),
  });
  app.all("/rpc/*", (c) =>
    fetchRequestHandler({
      endpoint: "/rpc",
      req: c.req.raw,
      router: adminRouter,
      createContext: () => createTRPCContext({ honoCtx: c }),
    }),
  );
  return app;
}

function write(app: Hono, method: "POST" | "PUT", path: string, payload: object) {
  return app.request(`/admin/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

test("organization and position keep independent definitions and return their own values through Admin detail", async () => {
  const app = createTestApp();
  for (const [entityType, valueType] of [
    ["organization", "text"],
    ["position", "number"],
  ] as const) {
    const defined = await write(app, "POST", "custom-attribute-definitions", {
      entityType,
      code: "grade",
      displayName: "Grade",
      valueType,
    });
    expect(defined.status).toBe(200);
  }
  const organization = await write(app, "POST", "organizations", {
    orgCode: "ORG",
    orgName: "Organization",
    orgType: OrganizationType.Department,
    customAttributes: { grade: "A" },
  });
  expect(organization.status).toBe(200);
  const position = await write(app, "POST", "positions", {
    posCode: "POS",
    posName: "Position",
    status: PositionStatus.Enable,
    customAttributes: { grade: 0 },
  });
  expect(position.status).toBe(200);
  const orgDetail = await app.request("/admin/organizations/ORG");
  expect(orgDetail.status).toBe(200);
  expect(await orgDetail.json()).toMatchObject({ data: { customAttributes: { grade: "A" } } });
  const posDetail = await app.request("/admin/positions/POS");
  expect(posDetail.status).toBe(200);
  expect(await posDetail.json()).toMatchObject({ data: { customAttributes: { grade: 0 } } });
});

const entries = [
  {
    entityType: "organization",
    collection: "organizations",
    code: "ORG",
    nameKey: "orgName",
    initialName: "Organization",
    create: { orgCode: "ORG", orgName: "Organization", orgType: OrganizationType.Department },
  },
  {
    entityType: "position",
    collection: "positions",
    code: "POS",
    nameKey: "posName",
    initialName: "Position",
    create: { posCode: "POS", posName: "Position", status: PositionStatus.Enable },
  },
] as const;

async function defineGrade(app: Hono, entityType: "organization" | "position") {
  const response = await write(app, "POST", "custom-attribute-definitions", {
    entityType,
    code: "grade",
    displayName: "Grade",
    valueType: "text",
  });
  expect(response.status).toBe(200);
}

async function committedChanges() {
  const [audits, organizationChanges, userChanges] = await Promise.all([
    harness.db.select().from(auditLogs).orderBy(asc(auditLogs.id)),
    harness.db.select().from(organizationDocumentOutboxEntries),
    harness.db.select().from(userDocumentOutboxEntries),
  ]);
  return { audits, organizationChanges, userChanges };
}

test.each(entries)(
  "manages optional $entityType values through definition lifecycle and saves redacted change summaries",
  async (entry) => {
    const app = createTestApp();
    const { entityType, collection, code, nameKey } = entry;
    const resource = `${collection}/${code}`;
    const old = await write(app, "POST", collection, entry.create);
    expect(old.status).toBe(200);
    await defineGrade(app, entityType);
    const original = await app.request(`/admin/${resource}`);
    expect(await original.json()).toMatchObject({ data: { customAttributes: {} } });

    const empty = await write(app, "PUT", resource, { customAttributes: {} });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({
      message: entityType === "organization" ? "至少提交一个组织更新字段" : "至少提交一个岗位更新字段",
    });
    const rejected = await write(app, "PUT", resource, {
      [nameKey]: "Rejected name",
      customAttributes: { grade: false },
    });
    expect(rejected.status).toBe(400);
    const update = await write(app, "PUT", resource, {
      [nameKey]: "Renamed",
      customAttributes: { grade: "private-grade" },
    });
    expect(await update.json()).toMatchObject({ data: { changed: true } });
    const persisted = await app.request(`/admin/${resource}`);
    expect(await persisted.json()).toMatchObject({
      data: { [nameKey]: "Renamed", customAttributes: { grade: "private-grade" } },
    });
    const changed = await committedChanges();
    expect(changed.userChanges).toMatchObject([{ source: { change: { kind: entityType } } }]);
    if (entityType === "organization") {
      expect(changed.organizationChanges).toHaveLength(2);
      expect(changed.organizationChanges.map(({ scope }) => scope)).toEqual(
        expect.arrayContaining(["self", "subtree"]),
      );
    }
    const same = await write(app, "PUT", resource, { customAttributes: { grade: "private-grade" } });
    expect(await same.json()).toMatchObject({ data: { changed: false } });
    expect(await committedChanges()).toEqual(changed);

    async function setEnabled(enabled: boolean) {
      const response = await write(app, "POST", "custom-attribute-definitions/enabled", {
        entityType,
        code: "grade",
        enabled,
      });
      expect(response.status).toBe(200);
    }
    await setEnabled(false);
    const disabled = await app.request(`/admin/${resource}`);
    expect(await disabled.json()).toMatchObject({ data: { customAttributes: {}, customAttributeDefinitions: [] } });
    expect((await write(app, "PUT", resource, { customAttributes: { grade: "replacement" } })).status).toBe(400);
    expect((await write(app, "PUT", resource, { [nameKey]: "Ordinary edit" })).status).toBe(200);
    await setEnabled(true);
    const enabled = await app.request(`/admin/${resource}`);
    expect(await enabled.json()).toMatchObject({
      data: { [nameKey]: "Ordinary edit", customAttributes: { grade: "private-grade" } },
    });
    const beforeClear = await committedChanges();
    const cleared = await write(app, "PUT", resource, { customAttributes: { grade: null } });
    expect(await cleared.json()).toMatchObject({ data: { changed: true } });
    const current = await app.request(`/admin/${resource}`);
    expect(await current.json()).toMatchObject({ data: { customAttributes: {} } });

    const { audits, organizationChanges } = await committedChanges();
    if (entityType === "organization") {
      const knownIds = new Set(beforeClear.organizationChanges.map(({ id }) => id));
      expect(organizationChanges.filter(({ id }) => !knownIds.has(id))).toMatchObject([{ scope: "self" }]);
    }
    const valueAudit = audits.filter(
      ({ action, details }) =>
        action === `admin.${entityType}.update` &&
        details !== null &&
        typeof details === "object" &&
        Object.hasOwn(details, "customAttributeChanges"),
    );
    expect(valueAudit).toMatchObject([
      {
        actorUserId: 1,
        targetCode: code,
        details: { customAttributeChanges: [{ attributeCode: "grade", action: "set" }] },
      },
      {
        actorUserId: 1,
        targetCode: code,
        details: { customAttributeChanges: [{ attributeCode: "grade", action: "clear" }] },
      },
    ]);
    expect(JSON.stringify(audits)).not.toContain("private-grade");
  },
);

test("recovers publication for directly assigned organizations and positions after profile and definition changes", async () => {
  const app = createTestApp();
  for (const [entityType, valueType] of [
    ["organization", "number"],
    ["position", "boolean"],
  ] as const) {
    const defined = await write(app, "POST", "custom-attribute-definitions", {
      entityType,
      valueType,
      code: "grade",
      displayName: "Grade",
    });
    expect(defined.status).toBe(200);
  }

  for (const org of [
    { orgCode: "ORG", orgName: "Organization" },
    { orgCode: "CHILD", orgName: "Child", parentCode: "ORG" },
  ]) {
    const created = await write(app, "POST", "organizations", { ...org, orgType: OrganizationType.Department });
    expect(created.status).toBe(200);
  }
  for (const posCode of ["POS", "OTHER"]) {
    const created = await write(app, "POST", "positions", { posCode, posName: posCode, status: PositionStatus.Enable });
    expect(created.status).toBe(200);
  }
  const root = await harness.db.query.organizations.findFirst({ where: { orgCode: "ORG" } });
  const child = await harness.db.query.organizations.findFirst({ where: { orgCode: "CHILD" } });
  const pos = await harness.db.query.positions.findFirst({ where: { posCode: "POS" } });
  const otherPos = await harness.db.query.positions.findFirst({ where: { posCode: "OTHER" } });
  if (!root || !child || !pos || !otherPos) throw new Error("Missing directory fixtures");
  const [direct, descendant, samePosition] = await harness.db
    .insert(users)
    .values([
      { username: "direct", name: "Direct" },
      { username: "descendant", name: "Descendant" },
      { username: "same-position", name: "Same position" },
    ])
    .returning({ id: users.id });
  if (!direct || !descendant || !samePosition) throw new Error("Missing user fixtures");
  await harness.db.insert(employments).values([
    { userId: direct.id, orgId: root.id, posId: pos.id, startTime: "2026-01-01", status: EmploymentStatus.Enable },
    {
      userId: samePosition.id,
      orgId: child.id,
      posId: pos.id,
      startTime: "2026-01-01",
      status: EmploymentStatus.Enable,
    },
    {
      userId: descendant.id,
      orgId: child.id,
      posId: otherPos.id,
      startTime: "2026-01-01",
      status: EmploymentStatus.Enable,
    },
  ]);

  const user = createUserDocumentPublicationFixture(harness.db);
  const sourceJobs: OrganizationOutboxJobPayload[] = [];
  const rebuildJobs: OrganizationRebuildJobPayload[] = [];
  const processor = createOrganizationDocumentProcessor({
    db: harness.db,
    jobProducer: {
      async enqueueOutboxEntries(payloads) {
        sourceJobs.push(...payloads);
        return { enqueued: payloads.length };
      },
      async enqueueRebuilds(payloads) {
        rebuildJobs.push(...payloads);
        return { enqueued: payloads.length };
      },
    },
  });
  const org = createOrganizationDocumentQueryService({
    repository: createOrganizationDocumentQueryRepository(harness.db),
  });
  async function publishOrganizations(expectedOutboxCount?: number) {
    const report = await processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 20 });
    expect(report.failed).toBe(0);
    if (expectedOutboxCount !== undefined) expect(report.outbox.selected).toBe(expectedOutboxCount);
    for (const payload of sourceJobs.splice(0)) await processor.processOutbox(payload);
    const targets = new Set<number>();
    for (const payload of rebuildJobs.splice(0)) {
      await processor.processRebuild(payload);
      targets.add(payload.organizationId);
    }
    return [...targets].sort((a, b) => a - b);
  }
  await publishOrganizations();

  // Existing assignment changes seed a published version before the first attribute write.
  await harness.db.insert(userDocumentOutboxEntries).values(
    [direct, descendant, samePosition].map(({ id }) => ({
      id: crypto.randomUUID(),
      source: { change: { kind: "employment", userId: id } },
    })),
  );
  await user.publishPending();
  async function readPublished() {
    const [organization, direct] = await Promise.all([org.getByCode("ORG"), user.get("direct")]);
    const employment = direct.employments?.[0];
    return {
      organization: organization.customAttributes,
      employmentOrganization: employment?.organization?.customAttributes,
      employmentPosition: employment?.position?.customAttributes,
    };
  }
  const old = await readPublished();
  const oldChild = await user.get("descendant");

  const organization = await write(app, "PUT", "organizations/ORG", { customAttributes: { grade: 0 } });
  expect(organization.status).toBe(200);
  const current = await app.request("/admin/organizations/ORG");
  const adminDetail = await current.json();
  expect(adminDetail).toMatchObject({ data: { customAttributes: { grade: 0 } } });
  const prior = await readPublished();
  expect(prior).toEqual(old);

  const updatedOrganizations = await publishOrganizations();
  const updatedOrganizationHolders = await user.publishPending();
  expect(updatedOrganizations).toEqual([root.id]);
  expect(updatedOrganizationHolders).toEqual([direct.id]);
  const updatedOrganization = await readPublished();
  expect(updatedOrganization).toEqual({
    ...old,
    organization: { grade: 0 },
    employmentOrganization: { grade: 0 },
  });

  const position = await write(app, "PUT", "positions/POS", { customAttributes: { grade: false } });
  expect(position.status).toBe(200);
  const priorPosition = await readPublished();
  expect(priorPosition).toEqual(updatedOrganization);
  const updatedPositionHolders = await user.publishPending();
  expect(updatedPositionHolders).toEqual([direct.id, samePosition.id]);
  const updated = await readPublished();
  expect(updated).toEqual({ ...updatedOrganization, employmentPosition: { grade: false } });
  const publishedDirect = await user.get("direct");
  expect(publishedDirect.employments?.[0]?.organization?.path?.[0]).not.toHaveProperty("customAttributes");
  const secondHolder = await user.get("same-position");
  expect(secondHolder.employments?.[0]?.position?.customAttributes).toEqual({ grade: false });
  expect(secondHolder.employments?.[0]?.organization).not.toHaveProperty("customAttributes");
  const publishedChild = await user.get("descendant");
  expect(publishedChild).toEqual(oldChild);

  async function setEnabled(entityType: "organization" | "position", enabled: boolean) {
    const response = await write(app, "POST", "custom-attribute-definitions/enabled", {
      entityType,
      code: "grade",
      enabled,
    });
    expect(response.status).toBe(200);
  }
  await setEnabled("organization", false);
  const priorDisable = await readPublished();
  expect(priorDisable).toEqual(updated);
  const disabledOrganizations = await publishOrganizations(1);
  const disabledOrganizationHolders = await user.publishPending();
  expect(disabledOrganizations).toEqual([root.id]);
  expect(disabledOrganizationHolders).toEqual([direct.id]);
  const disabledOrganization = await readPublished();
  expect(disabledOrganization).toEqual({ ...old, employmentPosition: { grade: false } });

  await setEnabled("position", false);
  const disabledPositionHolders = await user.publishPending();
  expect(disabledPositionHolders).toEqual([direct.id, samePosition.id]);
  const disabled = await readPublished();
  expect(disabled).toEqual(old);

  await setEnabled("organization", true);
  await setEnabled("position", true);
  await setEnabled("organization", true);
  await publishOrganizations(1);
  await user.publishPending();
  const restored = await readPublished();
  expect(restored).toEqual(updated);

  const clearedOrganization = await write(app, "PUT", "organizations/ORG", { customAttributes: { grade: null } });
  const clearedPosition = await write(app, "PUT", "positions/POS", { customAttributes: { grade: null } });
  expect(clearedOrganization.status).toBe(200);
  expect(clearedPosition.status).toBe(200);
  const priorClear = await readPublished();
  expect(priorClear).toEqual(updated);
  await publishOrganizations();
  await user.publishPending();
  const cleared = await readPublished();
  expect(cleared).toEqual(old);

  // A lifecycle event with no stored values is still a completed, verifiable receipt.
  await setEnabled("organization", false);
  const emptyOrganizations = await publishOrganizations(1);
  const emptyUsers = await user.publishPending();
  expect(emptyOrganizations).toEqual([]);
  expect(emptyUsers).toEqual([]);
  const verification = await createOrganizationDocumentVerifier({ db: harness.db }).verify();
  expect(verification.status).toBe("passed");
});

test("rolls back a definition change when either document source cannot be recorded", async () => {
  const app = createTestApp();
  await defineGrade(app, "organization");
  const change = { entityType: "organization", code: "grade", enabled: false };
  const before = await committedChanges();

  for (const table of ["user_document_outbox", "organization_document_outbox"]) {
    await harness.sql`ALTER TABLE ${harness.sql(table)} ADD CONSTRAINT fail_test_definition_work CHECK (false) NOT VALID`;
    try {
      const failed = await write(app, "POST", "custom-attribute-definitions/enabled", change);
      expect(failed.status).toBe(500);
    } finally {
      await harness.sql`ALTER TABLE ${harness.sql(table)} DROP CONSTRAINT fail_test_definition_work`;
    }
    const afterFailure = await committedChanges();
    expect(afterFailure).toEqual(before);
    const listed = await app.request("/admin/custom-attribute-definitions/organization");
    const detail = await listed.json();
    expect(detail).toMatchObject({ data: [{ code: "grade", enabled: true }] });
  }
});

test("HR keeps ordinary in-scope organization access while Admin reserves attribute values and definitions", async () => {
  const full = createTestApp();
  for (const { entityType, collection, create } of entries) {
    await defineGrade(full, entityType);
    const made = await write(full, "POST", collection, { ...create, customAttributes: { grade: "private-grade" } });
    expect(made.status).toBe(200);
  }
  const existing = await full.request("/admin/organizations/ORG");
  const {
    data: { id },
  } = z.object({ data: z.object({ id: z.number() }) }).parse(await existing.json());
  const hr = createTestApp(id);
  for (const { entityType, collection, code, nameKey } of entries) {
    const detail = await hr.request(`/admin/${collection}/${code}`);
    expect(detail.status).toBe(200);
    const { data } = z.object({ data: z.record(z.string(), z.unknown()) }).parse(await detail.json());
    expect(data).not.toHaveProperty("customAttributes");
    expect(data).not.toHaveProperty("customAttributeDefinitions");
    const definitions = await hr.request(`/admin/custom-attribute-definitions/${entityType}`);
    expect(definitions.status).toBe(403);
    const denied = await write(hr, "PUT", `${collection}/${code}`, {
      [nameKey]: "Forbidden",
      customAttributes: { grade: null },
    });
    expect(denied.status).toBe(403);
  }

  const deniedRpc = await hr.request("/rpc/admin.organization.update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgCode: "ORG", data: { customAttributes: { grade: { invalid: true } } } }),
  });
  expect(deniedRpc.status).toBe(403);
  const child = { orgCode: "CHILD", orgName: "Child", orgType: OrganizationType.Department, parentCode: "ORG" };
  expect(
    (await write(hr, "POST", "organizations", { ...child, customAttributes: { grade: "forbidden" } })).status,
  ).toBe(403);
  expect((await write(hr, "POST", "organizations", child)).status).toBe(200);
  expect((await write(hr, "PUT", "organizations/ORG", { orgName: "Allowed" })).status).toBe(200);
  const org = await full.request("/admin/organizations/ORG");
  expect(await org.json()).toMatchObject({
    data: { orgName: "Allowed", customAttributes: { grade: "private-grade" } },
  });
});

test.each(entries)(
  "rolls back $entityType profile, attribute, audit and outbox on final persistence failure",
  async (entry) => {
    const app = createTestApp();
    const { entityType, collection, code, nameKey } = entry;
    await defineGrade(app, entityType);
    const created = await write(app, "POST", collection, { ...entry.create, customAttributes: { grade: "original" } });
    expect(created.status).toBe(200);
    const before = await committedChanges();
    await harness.sql`ALTER TABLE user_document_outbox ADD CONSTRAINT fail_test_outbox_write CHECK (false) NOT VALID`;
    try {
      const failed = await write(app, "PUT", `${collection}/${code}`, {
        [nameKey]: "Rolled back",
        customAttributes: { grade: "rolled-back" },
      });
      expect(failed.status).toBe(500);
    } finally {
      await harness.sql`ALTER TABLE user_document_outbox DROP CONSTRAINT fail_test_outbox_write`;
    }
    expect(await committedChanges()).toEqual(before);
    const detail = await app.request(`/admin/${collection}/${code}`);
    expect(await detail.json()).toMatchObject({
      data: { [nameKey]: entry.initialName, customAttributes: { grade: "original" } },
    });
  },
);

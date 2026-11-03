import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createApiRepositories } from "@api/composition/repositories";
import { createApiUnitOfWork } from "@api/composition/tx";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createOrganizationHandlers } from "@api/routes/internal/organization/organization.handlers";
import { createOrganizationRoute } from "@api/routes/internal/organization/organization.index";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { OrganizationTransactionPorts } from "@api/services/organization/organization.port";
import { createOrganizationService } from "@api/services/organization/organization.service";
import createApp from "@iam/api-core/core/create-app";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";
import { runProcessCommandSmoke, spawnOwnedProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { mapUnitOfWork } from "@iam/api-core/uow";
import {
  ClientStatus,
  OrganizationDocumentSchema,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
} from "@iam/contracts";
import {
  auditLogs,
  employments,
  organizationClosures,
  organizationDocumentOutboxEntries,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  userDocumentOutboxEntries,
  users,
} from "@iam/db/schema";
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
import { eq } from "drizzle-orm";
import pino from "pino";
import appConfig from "~api/app.config";
import type { ApiPostgresTestHarness } from "../support/postgres-test-harness";
import { createApiPostgresTestHarness } from "../support/postgres-test-harness";

const now = new Date("2026-09-22T00:00:00.000Z");
const adminRoot = fileURLToPath(new URL("../../../admin-api/", import.meta.url));
const internalClient: GenericClientRuntimeDto = {
  id: 1,
  clientCode: "organization-contract",
  clientName: "Organization Contract",
  clientSecret: "organization-contract-secret",
  status: ClientStatus.Enable,
  isDelete: false,
  description: null,
  extAttributes: {},
  url: null,
  createTime: now,
  updateTime: now,
};

let harness: ApiPostgresTestHarness;

beforeAll(async () => {
  harness = await createApiPostgresTestHarness();
});

beforeEach(async () => {
  await harness.db.delete(organizationResponsibilityAssignments);
  await harness.db.delete(positions);
  await harness.reset();
  const [parent] = await harness.db
    .insert(organizations)
    .values({
      orgCode: "GY",
      orgName: "供应商根组织",
      path: "",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Company,
    })
    .returning();
  await harness.db
    .update(organizations)
    .set({ path: `/${parent!.id}` })
    .where(eq(organizations.id, parent!.id));
  await harness.db.insert(organizationClosures).values({
    ancestorId: parent!.id,
    descendantId: parent!.id,
    depth: 0,
  });
});

afterAll(async () => {
  await harness?.close();
});

interface OrganizationAppOptions {
  hideOccupiedCodeInTransaction?: string;
  decorateTransaction?: (tx: OrganizationTransactionPorts) => OrganizationTransactionPorts;
}

function createOrganizationApp(options: OrganizationAppOptions = {}) {
  const repositories = createApiRepositories(harness.db);
  const auditLogWriter = createApiAuditLogWriter({ auditRepository: repositories.audit });
  const uow = createApiUnitOfWork({
    db: harness.db,
    logger: { error() {}, warn() {} },
    clock: { nowDate: () => now },
    organizationDocumentJobProducer: {
      async enqueueOutboxEntries() {
        return { enqueued: 0 };
      },
    },
    userDocumentJobProducer: {
      async enqueueOutboxEntries() {
        return { enqueued: 0, jobIds: [] };
      },
    },
  });
  const organizationService = createOrganizationService({
    organizationRepository: repositories.organization,
    uow: mapUnitOfWork(uow, (tx) => {
      const ports: OrganizationTransactionPorts = {
        organizationRepository: options.hideOccupiedCodeInTransaction
          ? {
              ...tx.repositories.organization,
              getAnyOrganizationByCode: async (orgCode: string) =>
                orgCode === options.hideOccupiedCodeInTransaction
                  ? null
                  : await tx.repositories.organization.getAnyOrganizationByCode(orgCode),
            }
          : tx.repositories.organization,
        responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
        userDocumentInvalidation: tx.userDocumentInvalidation,
        organizationDocumentInvalidation: tx.organizationDocumentInvalidation,
      };
      return options.decorateTransaction?.(ports) ?? ports;
    }),
  });
  const handlers = createOrganizationHandlers({
    auditLogWriter,
    organizationService,
    organizationDocument: createOrganizationDocumentQueryService({
      repository: createOrganizationDocumentQueryRepository(harness.db),
    }),
  });
  return createApp(appConfig, {
    env: { NODE_ENV: "test" },
    logger: pino({ enabled: false }),
    routes: {
      "./src/routes/internal/organization/organization.index.ts": {
        default: createOrganizationRoute(handlers),
      },
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

async function request(method: "POST" | "PUT", path: string, body: unknown, options: OrganizationAppOptions = {}) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: createOrganizationApp(options).fetch });
  try {
    const response = await fetch(new URL(`/internal/organizations${path}`, server.url), {
      method,
      headers: {
        apikey: internalClient.clientSecret,
        Client: internalClient.clientCode,
        "content-type": "application/json",
      },
      body: JSON.stringify(
        path === "/search-dsl" ? { ...Object(body), select: Object.keys(OrganizationDocumentSchema.shape) } : body,
      ),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    await server.stop(true);
  }
}

async function attachCrossTreeResponsibility(orgCode: string, status: OrganizationResponsibilityAssignmentStatus) {
  const [target] = await harness.db.select().from(organizations).where(eq(organizations.orgCode, orgCode));
  if (!target) throw new Error("Missing responsibility target");
  const [holderOrganization] = await harness.db
    .insert(organizations)
    .values({
      orgCode: "HOLDER",
      orgName: "Independent holder tree",
      path: "",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Company,
    })
    .returning();
  await harness.db
    .update(organizations)
    .set({ path: `/${holderOrganization!.id}` })
    .where(eq(organizations.id, holderOrganization!.id));
  await harness.db
    .insert(organizationClosures)
    .values({ ancestorId: holderOrganization!.id, descendantId: holderOrganization!.id, depth: 0 });
  const [holder] = await harness.db.insert(users).values({ username: "holder", name: "Holder" }).returning();
  const [position] = await harness.db
    .insert(positions)
    .values({ posCode: randomUUID(), posName: "Holder" })
    .returning();
  const [employment] = await harness.db
    .insert(employments)
    .values({
      userId: holder!.id,
      orgId: holderOrganization!.id,
      posId: position!.id,
      startTime: now,
    })
    .returning();
  await harness.db.insert(organizationResponsibilityAssignments).values({
    employmentId: employment!.id,
    targetOrganizationId: target.id,
    typeCode: OrganizationResponsibilityTypeCode.Supervising,
    status,
    startTime: now,
    endTime: status === OrganizationResponsibilityAssignmentStatus.Disable ? new Date(now.getTime() + 1) : null,
  });
}

async function organizationWriteState() {
  return {
    organizations: await harness.db.select().from(organizations).orderBy(organizations.id),
    audits: await harness.db.select().from(auditLogs).orderBy(auditLogs.id),
    userOutbox: await harness.db.select().from(userDocumentOutboxEntries).orderBy(userDocumentOutboxEntries.id),
    organizationOutbox: await harness.db
      .select()
      .from(organizationDocumentOutboxEntries)
      .orderBy(organizationDocumentOutboxEntries.id),
  };
}

async function publishOrganizationChanges(mode: "ordinary" | "repair" = "ordinary") {
  const rebuilds: OrganizationRebuildJobPayload[] = [];
  const sourceJobs: OrganizationOutboxJobPayload[] = [];
  const processor = createOrganizationDocumentProcessor({
    db: harness.db,
    jobProducer: {
      async enqueueOutboxEntries(payloads) {
        sourceJobs.push(...payloads);
        return { enqueued: payloads.length };
      },
      async enqueueRebuilds(payloads) {
        rebuilds.push(...payloads);
        return { enqueued: payloads.length };
      },
    },
  });
  if (mode === "repair") {
    await processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 100 });
  } else {
    const changes = await harness.db
      .select()
      .from(organizationDocumentOutboxEntries)
      .where(eq(organizationDocumentOutboxEntries.status, "pending"));
    sourceJobs.push(...changes.map((change) => ({ outboxId: change.id })));
  }
  for (const payload of sourceJobs) await processor.processOutbox(payload);
  for (const payload of rebuilds) await processor.processRebuild(payload);
  if (mode === "repair") return await processor.repairFailedOrStale({ staleBefore: new Date(0), limit: 100 });
}

async function reassignCodeWithAdmin(mode: "replace" | "rename-only") {
  return await runProcessCommandSmoke({
    label: "Admin organization code reassignment",
    start: () =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "test-integration/organization/organization-code-reassignment.fixture.ts", mode],
        cwd: adminRoot,
        env: { ...process.env, NODE_ENV: "test", IAM_ADMIN_API_TEST_DATABASE_URL: harness.databaseUrl },
      }),
    expectedExitCode: 0,
    completionTimeoutMs: 10_000,
    cleanupTimeoutMs: 5_000,
  });
}

describe("Internal Organization HTTP writes with production PostgreSQL", () => {
  test.each([
    { assignmentStatus: OrganizationResponsibilityAssignmentStatus.Enable, status: OrganizationStatus.Pause },
    { assignmentStatus: OrganizationResponsibilityAssignmentStatus.Enable, status: OrganizationStatus.Disable },
    { assignmentStatus: OrganizationResponsibilityAssignmentStatus.Pause, status: OrganizationStatus.Pause },
    { assignmentStatus: OrganizationResponsibilityAssignmentStatus.Pause, status: OrganizationStatus.Disable },
  ])("rejects status $status with an Open responsibility in state $assignmentStatus atomically", async (input) => {
    await request("POST", "/purveyors", { orgCode: "TARGET", orgName: "Target" });
    await attachCrossTreeResponsibility("TARGET", input.assignmentStatus);
    const before = await organizationWriteState();
    const result = await request("PUT", "/TARGET", { status: input.status, orgName: "Must roll back" });
    const after = await organizationWriteState();
    expect(result).toMatchObject({ status: 409, body: { code: "ORG.HAS_OPEN_RESPONSIBILITY_ASSIGNMENT" } });
    expect(after).toEqual(before);
  });

  test("also blocks an ancestor whose descendant has an Open responsibility", async () => {
    await request("POST", "/purveyors", { orgCode: "TARGET", orgName: "Target" });
    await attachCrossTreeResponsibility("TARGET", OrganizationResponsibilityAssignmentStatus.Pause);
    const before = await organizationWriteState();
    const result = await request("PUT", "/GY", { status: OrganizationStatus.Disable });
    const after = await organizationWriteState();
    expect(result.status).toBe(409);
    expect(after).toEqual(before);
  });

  test.each([OrganizationStatus.Pause, OrganizationStatus.Disable])(
    "allows status %s when no Open responsibility targets the organization",
    async (status) => {
      await request("POST", "/purveyors", { orgCode: "TARGET", orgName: "Target" });
      await attachCrossTreeResponsibility("TARGET", OrganizationResponsibilityAssignmentStatus.Disable);
      const before = await organizationWriteState();
      const result = await request("PUT", "/TARGET", { status });
      const after = await organizationWriteState();
      expect(result).toMatchObject({ status: 200, body: { data: true } });
      expect(after.organizations.find(({ orgCode }) => orgCode === "TARGET")).toMatchObject({ status });
      expect(after.userOutbox).toHaveLength(before.userOutbox.length + 1);
      expect(after.organizationOutbox).toHaveLength(before.organizationOutbox.length + 1);
    },
  );

  test("keeps legal name and Enable updates available for an Open responsibility target", async () => {
    await request("POST", "/purveyors", { orgCode: "TARGET", orgName: "Target" });
    await attachCrossTreeResponsibility("TARGET", OrganizationResponsibilityAssignmentStatus.Enable);
    const renamed = await request("PUT", "/TARGET", { orgName: "Updated target" });
    const enabled = await request("PUT", "/TARGET", { status: OrganizationStatus.Enable });
    const after = await organizationWriteState();
    expect(renamed).toMatchObject({ status: 200, body: { data: true } });
    expect(enabled).toMatchObject({ status: 200, body: { data: true } });
    expect(after.organizations.find(({ orgCode }) => orgCode === "TARGET")).toMatchObject({
      orgName: "Updated target",
      status: OrganizationStatus.Enable,
    });
  });

  test("checks the actual updated organization after a concurrent code reassignment", async () => {
    await request("POST", "/purveyors", { orgCode: "A", orgName: "Original" });
    const prechecked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const pending = request(
      "PUT",
      "/A",
      { status: OrganizationStatus.Pause },
      {
        decorateTransaction: (tx) => ({
          ...tx,
          organizationRepository: {
            ...tx.organizationRepository,
            async updateOrganizationByCode(code, patch) {
              prechecked.resolve();
              await release.promise;
              return await tx.organizationRepository.updateOrganizationByCode(code, patch);
            },
          },
        }),
      },
    );
    let before: Awaited<ReturnType<typeof organizationWriteState>> | undefined;
    try {
      await Promise.race([prechecked.promise, pending]);
      await reassignCodeWithAdmin("replace");
      await attachCrossTreeResponsibility("A", OrganizationResponsibilityAssignmentStatus.Enable);
      before = await organizationWriteState();
    } finally {
      release.resolve();
      await pending;
    }
    const result = await pending;
    const after = await organizationWriteState();
    expect(result.status).toBe(409);
    expect(after).toEqual(before);
  }, 20_000);

  test.each(["ordinary", "repair"] as const)(
    "%s consumption publishes the actual updated organization and its descendants after Admin transfers a prechecked code",
    async (mode) => {
      await request("POST", "/purveyors", { orgCode: "A", orgName: "Original" });
      await publishOrganizationChanges();
      const [original] = await harness.db.select().from(organizations).where(eq(organizations.orgCode, "A"));
      if (!original) throw new Error("Missing original organization");
      const prechecked = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const pending = request(
        "PUT",
        "/A",
        { orgName: "Actual updated name" },
        {
          decorateTransaction: (tx) => ({
            ...tx,
            organizationRepository: {
              ...tx.organizationRepository,
              async updateOrganizationByCode(code, patch) {
                prechecked.resolve();
                await release.promise;
                return await tx.organizationRepository.updateOrganizationByCode(code, patch);
              },
            },
          }),
        },
      );
      let userSourcesBefore: string[] = [];
      try {
        await Promise.race([prechecked.promise, pending]);
        await reassignCodeWithAdmin("replace");
        await publishOrganizationChanges();
        const publishedBefore = await request("POST", "/search-dsl", {
          filter: { field: "code", op: "in", value: ["A", "A-CHILD"] },
        });
        expect(publishedBefore).toMatchObject({
          body: {
            data: {
              items: [
                { code: "A", name: "Replacement" },
                { code: "A-CHILD", path: [{ code: "A", name: "Replacement" }, { code: "A-CHILD" }] },
              ],
            },
          },
        });
        userSourcesBefore = (
          await harness.db.select({ id: userDocumentOutboxEntries.id }).from(userDocumentOutboxEntries)
        ).map(({ id }) => id);
      } finally {
        release.resolve();
        await pending;
      }
      const updated = await pending;
      expect(updated).toMatchObject({ status: 200, body: { data: true } });
      const [actualTarget] = await harness.db.select().from(organizations).where(eq(organizations.orgCode, "A"));
      expect(actualTarget).toMatchObject({ orgName: "Actual updated name" });
      expect(actualTarget?.id).not.toBe(original.id);
      const userSources = await harness.db.select().from(userDocumentOutboxEntries);
      expect(userSources.filter(({ id }) => !userSourcesBefore.includes(id))).toMatchObject([
        { source: { change: { kind: "organization", organizationId: actualTarget!.id } } },
      ]);
      const completedRepair = await publishOrganizationChanges(mode);
      if (mode === "repair") expect(completedRepair).toMatchObject({ enqueued: 0, failed: 0 });
      const publishedAfter = await request("POST", "/search-dsl", {
        filter: { field: "code", op: "in", value: ["A", "A-CHILD"] },
      });
      expect(publishedAfter).toMatchObject({
        status: 200,
        body: {
          data: {
            items: [
              { code: "A", name: "Actual updated name" },
              {
                code: "A-CHILD",
                path: [{ code: "A", name: "Actual updated name" }, { code: "A-CHILD" }],
              },
            ],
          },
        },
      });
      const [retainedOriginal] = await harness.db.select().from(organizations).where(eq(organizations.id, original.id));
      expect(retainedOriginal).toMatchObject({ orgCode: "B", orgName: "Original" });
    },
    20_000,
  );

  test("keeps a successful zero-row Internal update from registering phantom search work after Admin renames its code", async () => {
    await request("POST", "/purveyors", { orgCode: "A", orgName: "Original" });
    await publishOrganizationChanges();
    const prechecked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const pending = request(
      "PUT",
      "/A",
      { orgName: "No actual target" },
      {
        decorateTransaction: (tx) => ({
          ...tx,
          organizationRepository: {
            ...tx.organizationRepository,
            async updateOrganizationByCode(code, patch) {
              prechecked.resolve();
              await release.promise;
              return await tx.organizationRepository.updateOrganizationByCode(code, patch);
            },
          },
        }),
      },
    );
    let committedChanges: (typeof organizationDocumentOutboxEntries.$inferSelect)[] = [];
    let committedSource: (typeof organizations.$inferSelect)[] = [];
    let committedUserSources: (typeof userDocumentOutboxEntries.$inferSelect)[] = [];
    try {
      await Promise.race([prechecked.promise, pending]);
      await reassignCodeWithAdmin("rename-only");
      await publishOrganizationChanges();
      committedChanges = await harness.db
        .select()
        .from(organizationDocumentOutboxEntries)
        .orderBy(organizationDocumentOutboxEntries.id);
      committedSource = await harness.db.select().from(organizations).orderBy(organizations.id);
      committedUserSources = await harness.db
        .select()
        .from(userDocumentOutboxEntries)
        .orderBy(userDocumentOutboxEntries.id);
    } finally {
      release.resolve();
      await pending;
    }
    const result = await pending;
    const afterChanges = await harness.db
      .select()
      .from(organizationDocumentOutboxEntries)
      .orderBy(organizationDocumentOutboxEntries.id);
    const afterSource = await harness.db.select().from(organizations).orderBy(organizations.id);
    expect(result).toMatchObject({ status: 200, body: { data: true } });
    expect(afterChanges).toEqual(committedChanges);
    expect(afterSource).toEqual(committedSource);
    const afterUserSources = await harness.db
      .select()
      .from(userDocumentOutboxEntries)
      .orderBy(userDocumentOutboxEntries.id);
    expect(afterUserSources).toEqual(committedUserSources);
    const completedRepair = await publishOrganizationChanges("repair");
    expect(completedRepair).toMatchObject({ enqueued: 0, failed: 0 });
    const retained = await request("POST", "/search-dsl", {
      filter: { field: "code", op: "eq", value: "B" },
    });
    expect(retained).toMatchObject({
      status: 200,
      body: { data: { items: [{ code: "B", name: "Original" }] } },
    });
  }, 20_000);

  test("publishes a registered supplier with its complete path after the source commit", async () => {
    const created = await request("POST", "/purveyors", { orgCode: "SUPPLIER", orgName: "Supplier" });
    expect(created).toMatchObject({ status: 200, body: { data: true } });
    const beforePublication = await request("POST", "/search-dsl", {
      filter: { field: "code", op: "eq", value: "SUPPLIER" },
    });
    expect(beforePublication).toMatchObject({ status: 200, body: { data: { items: [] } } });
    await publishOrganizationChanges();
    const published = await request("POST", "/search-dsl", {
      filter: { field: "code", op: "eq", value: "SUPPLIER" },
    });
    expect(published).toMatchObject({
      status: 200,
      body: {
        data: {
          items: [
            {
              code: "SUPPLIER",
              name: "Supplier",
              type: OrganizationType.External,
              status: OrganizationStatus.Enable,
              level: 2,
              isVirtual: true,
              isEntity: false,
              path: [
                { code: "GY", name: "供应商根组织", type: OrganizationType.Company, level: 1, distanceToTarget: 1 },
                { code: "SUPPLIER", name: "Supplier", type: OrganizationType.External, level: 2, distanceToTarget: 0 },
              ],
            },
          ],
        },
      },
    });
  });
  test("returns the same published Organization in detail and search without falling back to source-only facts", async () => {
    await harness.db.insert(organizations).values([
      {
        orgCode: "PAUSED",
        orgName: "Paused",
        orgType: OrganizationType.Company,
        status: OrganizationStatus.Pause,
        path: "",
        level: OrganizationLevel.One,
      },
      {
        orgCode: "DISABLED",
        orgName: "Disabled",
        orgType: OrganizationType.Company,
        status: OrganizationStatus.Disable,
        path: "",
        level: OrganizationLevel.One,
      },
      {
        orgCode: "DELETED",
        orgName: "Deleted",
        orgType: OrganizationType.Company,
        isDelete: true,
        path: "",
        level: OrganizationLevel.One,
      },
    ]);
    const dsl = await request("POST", "/search-dsl", { filter: { field: "code", op: "eq", value: "GY" } });
    expect(dsl).toMatchObject({ status: 200, body: { data: { items: [] } } });
    for (const orgCode of ["GY", "PAUSED", "DISABLED", "DELETED"]) {
      const response = await createOrganizationApp().request(`http://localhost/internal/organizations/${orgCode}`, {
        headers: { apikey: internalClient.clientSecret, Client: internalClient.clientCode },
      });
      expect(response.status).toBe(404);
    }
    await request("PUT", "/GY", { orgName: "Published root" });
    await publishOrganizationChanges();
    const detail = await createOrganizationApp().request("http://localhost/internal/organizations/GY", {
      headers: { apikey: internalClient.clientSecret, Client: internalClient.clientCode },
    });
    const published = await detail.json();
    const search = await request("POST", "/search-dsl", {
      filter: { field: "code", op: "eq", value: "GY" },
    });
    expect(detail.status).toBe(200);
    expect(published.data).toEqual(search.body.data.items[0]);
    expect(published.data).toMatchObject({ code: "GY", name: "Published root" });
    await request("PUT", "/GY", { orgName: "Unpublished root" });
    const retained = await createOrganizationApp().request("http://localhost/internal/organizations/GY", {
      headers: { apikey: internalClient.clientSecret, Client: internalClient.clientCode },
    });
    const retainedBody = await retained.json();
    expect(retained.status).toBe(200);
    expect(retainedBody.data).toEqual(published.data);
  });

  test("normalizes a purveyor before the first code lookup and persists it once", async () => {
    const input = { orgCode: "  SUPPLIER  ", orgName: "  供应商  " };
    const created = await request("POST", "/purveyors", input);
    expect(created).toMatchObject({ status: 200, body: { data: true } });

    const repeated = await request("POST", "/purveyors", input);
    expect(repeated).toMatchObject({ status: 200, body: { data: true } });

    const persisted = await harness.db.select().from(organizations);
    expect(persisted.filter((row) => row.orgCode === "SUPPLIER")).toMatchObject([
      { orgCode: "SUPPLIER", orgName: "供应商" },
    ]);
    const audits = await harness.db.select().from(auditLogs);
    expect(audits).toMatchObject([{ action: "internal.purveyor.register", targetCode: "SUPPLIER" }]);
  });

  test("publishes status and mixed ancestor patches", async () => {
    const created = await request("POST", "/purveyors", { orgCode: "CHILD", orgName: "Child" });
    expect(created.status).toBe(200);
    await publishOrganizationChanges();
    const changed = await request("PUT", "/GY", {
      orgCode: "RENAMED",
      orgName: "Renamed supplier",
      orgType: OrganizationType.Department,
      status: OrganizationStatus.Pause,
    });
    expect(changed).toMatchObject({ status: 200, body: { data: true } });
    const stale = await request("POST", "/search-dsl", {
      filter: { field: "code", op: "eq", value: "CHILD" },
    });
    expect(stale).toMatchObject({
      status: 200,
      body: { data: { items: [{ status: OrganizationStatus.Enable }] } },
    });
    await publishOrganizationChanges();
    const published = await request("POST", "/search-dsl", {
      filter: { field: "code", op: "in", value: ["RENAMED", "CHILD"] },
    });
    expect(published).toMatchObject({
      status: 200,
      body: {
        data: {
          items: [
            {
              code: "RENAMED",
              name: "Renamed supplier",
              type: OrganizationType.Department,
              status: OrganizationStatus.Pause,
            },
            {
              code: "CHILD",
              level: 2,
              path: [
                {
                  code: "RENAMED",
                  name: "Renamed supplier",
                  type: OrganizationType.Department,
                  level: 1,
                  distanceToTarget: 1,
                },
                { code: "CHILD", level: 2, distanceToTarget: 0 },
              ],
            },
          ],
        },
      },
    });
  });

  test("registers an explicitly written same-value patch that overwrites a concurrent update", async () => {
    await request("POST", "/purveyors", { orgCode: "SUPPLIER", orgName: "Original" });
    await publishOrganizationChanges();
    const prechecked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const pending = request(
      "PUT",
      "/SUPPLIER",
      { orgName: "Original" },
      {
        decorateTransaction: (tx) => ({
          ...tx,
          organizationRepository: {
            ...tx.organizationRepository,
            async updateOrganizationByCode(code, patch) {
              prechecked.resolve();
              await release.promise;
              return await tx.organizationRepository.updateOrganizationByCode(code, patch);
            },
          },
        }),
      },
    );
    await Promise.race([prechecked.promise, pending]);
    try {
      const changed = await request("PUT", "/SUPPLIER", { orgName: "Concurrent" });
      expect(changed.status).toBe(200);
      await publishOrganizationChanges();
      const intermediate = await request("POST", "/search-dsl", {
        filter: { field: "code", op: "eq", value: "SUPPLIER" },
      });
      expect(intermediate).toMatchObject({ body: { data: { items: [{ name: "Concurrent" }] } } });
    } finally {
      release.resolve();
      await pending;
    }
    const result = await pending;
    expect(result).toMatchObject({ status: 200, body: { data: true } });
    await publishOrganizationChanges();
    const final = await request("POST", "/search-dsl", {
      filter: { field: "code", op: "eq", value: "SUPPLIER" },
    });
    expect(final).toMatchObject({ body: { data: { items: [{ name: "Original" }] } } });
  });

  test.each(["create", "update"] as const)(
    "rolls back Internal %s source and durable search work together",
    async (operation) => {
      if (operation === "update") await request("POST", "/purveyors", { orgCode: "SUPPLIER", orgName: "Original" });
      const before = {
        source: await harness.db.select().from(organizations),
        closures: await harness.db.select().from(organizationClosures),
        changes: await harness.db.select().from(organizationDocumentOutboxEntries),
      };
      const result = await request(
        operation === "create" ? "POST" : "PUT",
        operation === "create" ? "/purveyors" : "/SUPPLIER",
        operation === "create" ? { orgCode: "NEW", orgName: "New" } : { orgName: "Rolled back" },
        {
          decorateTransaction: (tx) => ({
            ...tx,
            organizationDocumentInvalidation: {
              async recordChanges(changes) {
                await tx.organizationDocumentInvalidation.recordChanges(changes);
                throw new Error("injected search registration failure");
              },
            },
          }),
        },
      );
      expect(result.status).toBe(500);
      const after = {
        source: await harness.db.select().from(organizations),
        closures: await harness.db.select().from(organizationClosures),
        changes: await harness.db.select().from(organizationDocumentOutboxEntries),
      };
      expect(after).toEqual(before);
    },
  );

  for (const occupiedBy of ["disabled", "soft-deleted"] as const) {
    test(`returns a stable conflict when a ${occupiedBy} organization occupies the normalized code`, async () => {
      const [occupied] = await harness.db
        .insert(organizations)
        .values({
          orgCode: "SUPPLIER",
          orgName: "Existing supplier",
          path: "",
          level: OrganizationLevel.One,
          orgType: OrganizationType.External,
          status: occupiedBy === "disabled" ? OrganizationStatus.Disable : OrganizationStatus.Enable,
          isDelete: occupiedBy === "soft-deleted",
        })
        .returning();
      await harness.db.insert(organizationClosures).values({
        ancestorId: occupied!.id,
        descendantId: occupied!.id,
        depth: 0,
      });

      const conflict = await request("POST", "/purveyors", {
        orgCode: "  SUPPLIER  ",
        orgName: "New supplier",
      });
      expect(conflict).toMatchObject({
        status: 409,
        body: { code: "ORG.ALREADY_EXISTS" },
      });
      const rows = await harness.db.select().from(organizations).where(eq(organizations.orgCode, "SUPPLIER"));
      expect(rows).toHaveLength(1);
    });
  }

  test("maps a database-decided duplicate to the stable organization code conflict", async () => {
    await harness.db.insert(organizations).values({
      orgCode: "SUPPLIER",
      orgName: "Existing supplier",
      path: "",
      level: OrganizationLevel.One,
      orgType: OrganizationType.External,
      status: OrganizationStatus.Disable,
    });

    const conflict = await request(
      "POST",
      "/purveyors",
      { orgCode: "SUPPLIER", orgName: "New supplier" },
      { hideOccupiedCodeInTransaction: "SUPPLIER" },
    );
    expect(conflict).toMatchObject({
      status: 409,
      body: { code: "ORG.CODE_EXISTS" },
    });
  });

  test("normalizes submitted update fields, excludes the target code, and preserves omitted fields", async () => {
    await request("POST", "/purveyors", {
      orgCode: "SUPPLIER",
      orgName: "Original supplier",
    });

    const updated = await request("PUT", "/SUPPLIER", {
      orgCode: "  SUPPLIER  ",
      orgName: "  Updated supplier  ",
    });
    expect(updated).toMatchObject({ status: 200, body: { data: true } });

    const [persisted] = await harness.db.select().from(organizations).where(eq(organizations.orgCode, "SUPPLIER"));
    expect(persisted).toMatchObject({
      orgCode: "SUPPLIER",
      orgName: "Updated supplier",
      orgType: OrganizationType.External,
      status: OrganizationStatus.Enable,
    });
  });

  test("uses the normalized update code for conflicts including tombstones", async () => {
    await request("POST", "/purveyors", {
      orgCode: "SUPPLIER",
      orgName: "Supplier",
    });
    await harness.db.insert(organizations).values({
      orgCode: "OCCUPIED",
      orgName: "Deleted",
      path: "",
      level: OrganizationLevel.One,
      orgType: OrganizationType.External,
      isDelete: true,
    });

    const conflict = await request("PUT", "/SUPPLIER", { orgCode: "  OCCUPIED  " });
    expect(conflict).toMatchObject({
      status: 409,
      body: { code: "ORG.CODE_EXISTS" },
    });
    const [persisted] = await harness.db.select().from(organizations).where(eq(organizations.orgCode, "SUPPLIER"));
    expect(persisted).toMatchObject({ orgCode: "SUPPLIER", orgName: "Supplier" });
  });

  test("accepts and persists a 64-character organization code", async () => {
    const maxCode = "M".repeat(64);
    const accepted = await request("POST", "/purveyors", {
      orgCode: maxCode,
      orgName: "Maximum code length",
    });
    expect(accepted.status).toBe(200);

    const persisted = await harness.db.select().from(organizations);
    expect(persisted.map((row) => row.orgCode).sort()).toEqual(["GY", maxCode].sort());
  });

  test.each([
    { field: "blank organization code", input: { orgCode: "   ", orgName: "Supplier" } },
    { field: "65-character organization code", input: { orgCode: "A".repeat(65), orgName: "Supplier" } },
    { field: "blank organization name", input: { orgCode: "SUPPLIER", orgName: "   " } },
  ])("rejects a $field before persistence", async ({ input }) => {
    const rejected = await request("POST", "/purveyors", input);
    expect(rejected.status).toBe(422);

    const persisted = await harness.db.select().from(organizations);
    expect(persisted.map((row) => row.orgCode)).toEqual(["GY"]);
  });

  test("keeps organization codes case-sensitive", async () => {
    for (const orgCode of ["Supplier", "SUPPLIER"]) {
      const created = await request("POST", "/purveyors", { orgCode, orgName: `Organization ${orgCode}` });
      expect(created.status).toBe(200);
    }
    const persisted = await harness.db.select().from(organizations);
    expect(
      persisted
        .filter((row) => row.orgCode !== "GY")
        .map((row) => row.orgCode)
        .sort(),
    ).toEqual(["SUPPLIER", "Supplier"]);
  });

  test("does not impose the organization code limit on names", async () => {
    const longName = `Supplier-${"N".repeat(80)}`;
    const created = await request("POST", "/purveyors", { orgCode: "LONG-NAME", orgName: longName });
    expect(created.status).toBe(200);
    const persisted = await harness.db.select().from(organizations).where(eq(organizations.orgCode, "LONG-NAME"));
    expect(persisted).toMatchObject([{ orgCode: "LONG-NAME", orgName: longName }]);
  });

  test("allows distinct organization codes to share a name", async () => {
    for (const orgCode of ["FIRST", "SECOND"]) {
      const created = await request("POST", "/purveyors", { orgCode, orgName: "Shared name" });
      expect(created.status).toBe(200);
    }
    const persisted = await harness.db.select().from(organizations).orderBy(organizations.id);
    expect(persisted.filter((row) => row.orgCode !== "GY")).toMatchObject([
      { orgCode: "FIRST", orgName: "Shared name" },
      { orgCode: "SECOND", orgName: "Shared name" },
    ]);
  });
});

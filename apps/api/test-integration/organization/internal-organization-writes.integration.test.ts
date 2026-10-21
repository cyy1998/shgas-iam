import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
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
import { ClientStatus, OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { auditLogs, organizationClosures, organizationSearchChanges, organizations } from "@iam/db/schema";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import {
  createOrganizationSearchQueryRepository,
  createOrganizationSearchQueryService,
} from "@iam/organization-search-read-model";
import {
  createOrganizationSearchProcessor,
  type OrganizationRebuildJobPayload,
  type OrganizationSourceChangeJobPayload,
} from "@iam/organization-search-read-model/worker";
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
    organizationSearchJobProducer: {
      async enqueueSourceChanges() {
        return { enqueued: 0 };
      },
    },
    userProfileJobProducer: {
      async enqueueRebuildJobs() {
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
        userProfileInvalidation: tx.userProfileInvalidation,
        organizationSearchInvalidation: tx.organizationSearchInvalidation,
      };
      return options.decorateTransaction?.(ports) ?? ports;
    }),
  });
  const handlers = createOrganizationHandlers({
    auditLogWriter,
    organizationService,
    organizationSearch: createOrganizationSearchQueryService({
      repository: createOrganizationSearchQueryRepository(harness.db),
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
  const response = await createOrganizationApp(options).request(`http://localhost/internal/organizations${path}`, {
    method,
    headers: {
      apikey: internalClient.clientSecret,
      Client: internalClient.clientCode,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function publishOrganizationChanges(mode: "ordinary" | "repair" = "ordinary") {
  const rebuilds: OrganizationRebuildJobPayload[] = [];
  const sourceJobs: OrganizationSourceChangeJobPayload[] = [];
  const processor = createOrganizationSearchProcessor({
    db: harness.db,
    jobProducer: {
      async enqueueSourceChanges(payloads) {
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
      .from(organizationSearchChanges)
      .where(eq(organizationSearchChanges.status, "pending"));
    sourceJobs.push(...changes.map((change) => ({ changeId: change.id })));
  }
  for (const payload of sourceJobs) await processor.processSourceChange(payload);
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
      try {
        await Promise.race([prechecked.promise, pending]);
        await reassignCodeWithAdmin("replace");
        await publishOrganizationChanges();
        const publishedBefore = await request("POST", "/search-dsl", {
          filter: { field: "organization.code", op: "in", value: ["A", "A-CHILD"] },
        });
        expect(publishedBefore).toMatchObject({
          body: {
            data: [
              { organization: { code: "A", name: "Replacement" } },
              { organization: { code: "A-CHILD", path: [{ code: "A", name: "Replacement" }, { code: "A-CHILD" }] } },
            ],
          },
        });
      } finally {
        release.resolve();
        await pending;
      }
      const updated = await pending;
      expect(updated).toMatchObject({ status: 200, body: { data: true } });
      const [actualTarget] = await harness.db.select().from(organizations).where(eq(organizations.orgCode, "A"));
      expect(actualTarget).toMatchObject({ orgName: "Actual updated name" });
      expect(actualTarget?.id).not.toBe(original.id);
      const completedRepair = await publishOrganizationChanges(mode);
      if (mode === "repair") expect(completedRepair).toMatchObject({ enqueued: 0, failed: 0 });
      const publishedAfter = await request("POST", "/search-dsl", {
        filter: { field: "organization.code", op: "in", value: ["A", "A-CHILD"] },
      });
      expect(publishedAfter).toMatchObject({
        status: 200,
        body: {
          data: [
            { organization: { code: "A", name: "Actual updated name" } },
            {
              organization: {
                code: "A-CHILD",
                path: [{ code: "A", name: "Actual updated name" }, { code: "A-CHILD" }],
              },
            },
          ],
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
    let committedChanges: (typeof organizationSearchChanges.$inferSelect)[] = [];
    let committedSource: (typeof organizations.$inferSelect)[] = [];
    try {
      await Promise.race([prechecked.promise, pending]);
      await reassignCodeWithAdmin("rename-only");
      await publishOrganizationChanges();
      committedChanges = await harness.db
        .select()
        .from(organizationSearchChanges)
        .orderBy(organizationSearchChanges.id);
      committedSource = await harness.db.select().from(organizations).orderBy(organizations.id);
    } finally {
      release.resolve();
      await pending;
    }
    const result = await pending;
    const afterChanges = await harness.db
      .select()
      .from(organizationSearchChanges)
      .orderBy(organizationSearchChanges.id);
    const afterSource = await harness.db.select().from(organizations).orderBy(organizations.id);
    expect(result).toMatchObject({ status: 200, body: { data: true } });
    expect(afterChanges).toEqual(committedChanges);
    expect(afterSource).toEqual(committedSource);
    const completedRepair = await publishOrganizationChanges("repair");
    expect(completedRepair).toMatchObject({ enqueued: 0, failed: 0 });
    const retained = await request("POST", "/search-dsl", {
      filter: { field: "organization.code", op: "eq", value: "B" },
    });
    expect(retained).toMatchObject({
      status: 200,
      body: { data: [{ organization: { code: "B", name: "Original" } }] },
    });
  }, 20_000);

  test("publishes a registered supplier with its complete path after the source commit", async () => {
    const created = await request("POST", "/purveyors", { orgCode: "SUPPLIER", orgName: "Supplier" });
    expect(created).toMatchObject({ status: 200, body: { data: true } });
    const beforePublication = await request("POST", "/search-dsl", {
      filter: { field: "organization.code", op: "eq", value: "SUPPLIER" },
    });
    expect(beforePublication).toMatchObject({ status: 200, body: { data: [] } });
    await publishOrganizationChanges();
    const published = await request("POST", "/search-dsl", {
      filter: { field: "organization.code", op: "eq", value: "SUPPLIER" },
    });
    expect(published).toMatchObject({
      status: 200,
      body: {
        data: [
          {
            organization: {
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
          },
        ],
      },
    });
  });
  test("keeps organization detail on enabled source facts without requiring published documents", async () => {
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
    const dsl = await request("POST", "/search-dsl", { filter: { field: "organization.code", op: "eq", value: "GY" } });
    expect(dsl).toMatchObject({ status: 200, body: { data: [] } });
    for (const [orgCode, status] of [
      ["GY", 200],
      ["PAUSED", 404],
      ["DISABLED", 404],
      ["DELETED", 404],
    ] as const) {
      const response = await createOrganizationApp().request(`http://localhost/internal/organizations/${orgCode}`, {
        headers: { apikey: internalClient.clientSecret, Client: internalClient.clientCode },
      });
      const body = await response.json();
      expect(response.status).toBe(status);
      if (status === 200) expect(body.data).toMatchObject({ orgCode: "GY", orgName: "供应商根组织" });
    }
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
      filter: { field: "organization.code", op: "eq", value: "CHILD" },
    });
    expect(stale).toMatchObject({
      status: 200,
      body: { data: [{ organization: { status: OrganizationStatus.Enable } }] },
    });
    await publishOrganizationChanges();
    const published = await request("POST", "/search-dsl", {
      filter: { field: "organization.code", op: "in", value: ["RENAMED", "CHILD"] },
    });
    expect(published).toMatchObject({
      status: 200,
      body: {
        data: [
          {
            organization: {
              code: "RENAMED",
              name: "Renamed supplier",
              type: OrganizationType.Department,
              status: OrganizationStatus.Pause,
            },
          },
          {
            organization: {
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
          },
        ],
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
        filter: { field: "organization.code", op: "eq", value: "SUPPLIER" },
      });
      expect(intermediate).toMatchObject({ body: { data: [{ organization: { name: "Concurrent" } }] } });
    } finally {
      release.resolve();
      await pending;
    }
    const result = await pending;
    expect(result).toMatchObject({ status: 200, body: { data: true } });
    await publishOrganizationChanges();
    const final = await request("POST", "/search-dsl", {
      filter: { field: "organization.code", op: "eq", value: "SUPPLIER" },
    });
    expect(final).toMatchObject({ body: { data: [{ organization: { name: "Original" } }] } });
  });

  test.each(["create", "update"] as const)(
    "rolls back Internal %s source and durable search work together",
    async (operation) => {
      if (operation === "update") await request("POST", "/purveyors", { orgCode: "SUPPLIER", orgName: "Original" });
      const before = {
        source: await harness.db.select().from(organizations),
        closures: await harness.db.select().from(organizationClosures),
        changes: await harness.db.select().from(organizationSearchChanges),
      };
      const result = await request(
        operation === "create" ? "POST" : "PUT",
        operation === "create" ? "/purveyors" : "/SUPPLIER",
        operation === "create" ? { orgCode: "NEW", orgName: "New" } : { orgName: "Rolled back" },
        {
          decorateTransaction: (tx) => ({
            ...tx,
            organizationSearchInvalidation: {
              async recordChanges(changes) {
                await tx.organizationSearchInvalidation.recordChanges(changes);
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
        changes: await harness.db.select().from(organizationSearchChanges),
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

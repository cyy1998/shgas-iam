import type { GenericClientRuntimeDto } from "@iam/domain/client";
import type { ApiPostgresTestHarness } from "./postgres-test-harness";
import { createApiRepositories } from "@api/composition/repositories";
import { createApiUnitOfWork } from "@api/composition/tx";
import { createInternalMiddlewares } from "@api/routes/internal/_middleware";
import { createOrganizationHandlers } from "@api/routes/internal/organization/organization.handlers";
import { createOrganizationRoute } from "@api/routes/internal/organization/organization.index";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createOrganizationService } from "@api/services/organization/organization.service";
import createApp from "@iam/api-core/core/create-app";
import { createInternalAuthenticationHandler } from "@iam/api-core/middlewares";
import { mapUnitOfWork } from "@iam/api-core/uow";
import {
  ClientStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
} from "@iam/contracts";
import { auditLogs, organizationClosures, organizations } from "@iam/db/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import pino from "pino";
import appConfig from "~api/app.config";
import { createApiPostgresTestHarness } from "./postgres-test-harness";

const now = new Date("2026-09-22T00:00:00.000Z");
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
  const [parent] = await harness.db.insert(organizations).values({
    orgCode: "GY",
    orgName: "供应商根组织",
    path: "",
    level: OrganizationLevel.One,
    orgType: OrganizationType.Company,
  }).returning();
  await harness.db.insert(organizationClosures).values({
    ancestorId: parent!.id,
    descendantId: parent!.id,
    depth: 0,
  });
});

afterAll(async () => {
  await harness?.close();
});

function createOrganizationApp(options: { hideOccupiedCodeInTransaction?: string } = {}) {
  const repositories = createApiRepositories(harness.db);
  const auditLogWriter = createApiAuditLogWriter({ auditRepository: repositories.audit });
  const uow = createApiUnitOfWork({
    db: harness.db,
    logger: { error() {}, warn() {} },
    clock: { nowDate: () => now },
    userProfileJobProducer: {
      async enqueueRebuildJobs() {
        return { enqueued: 0, jobIds: [] };
      },
    },
  });
  const organizationService = createOrganizationService({
    organizationRepository: repositories.organization,
    uow: mapUnitOfWork(uow, tx => ({
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
    })),
  });
  const handlers = createOrganizationHandlers({ auditLogWriter, organizationService });
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
            getClientBySecret: async secret => secret === internalClient.clientSecret
              ? internalClient
              : null,
          }),
        }),
      },
    },
  });
}

async function request(
  method: "POST" | "PUT",
  path: string,
  body: unknown,
  options: { hideOccupiedCodeInTransaction?: string } = {},
) {
  const response = await createOrganizationApp(options).request(`http://localhost/internal/organizations${path}`, {
    method,
    headers: {
      "apikey": internalClient.clientSecret,
      "Client": internalClient.clientCode,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

describe("Internal Organization HTTP writes with production PostgreSQL", () => {
  test("normalizes a purveyor before the first code lookup and persists it once", async () => {
    const input = { orgCode: "  SUPPLIER  ", orgName: "  供应商  " };
    const created = await request("POST", "/purveyors", input);
    expect(created).toMatchObject({ status: 200, body: { data: true } });

    const repeated = await request("POST", "/purveyors", input);
    expect(repeated).toMatchObject({ status: 200, body: { data: true } });

    const persisted = await harness.db.select().from(organizations);
    expect(persisted.filter(row => row.orgCode === "SUPPLIER")).toMatchObject([
      { orgCode: "SUPPLIER", orgName: "供应商" },
    ]);
    const audits = await harness.db.select().from(auditLogs);
    expect(audits).toMatchObject([
      { action: "internal.purveyor.register", targetCode: "SUPPLIER" },
    ]);
  });

  for (const occupiedBy of ["disabled", "soft-deleted"] as const) {
    test(`returns a stable conflict when a ${occupiedBy} organization occupies the normalized code`, async () => {
      const [occupied] = await harness.db.insert(organizations).values({
        orgCode: "SUPPLIER",
        orgName: "Existing supplier",
        path: "",
        level: OrganizationLevel.One,
        orgType: OrganizationType.External,
        status: occupiedBy === "disabled" ? OrganizationStatus.Disable : OrganizationStatus.Enable,
        isDelete: occupiedBy === "soft-deleted",
      }).returning();
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
    expect(persisted.map(row => row.orgCode).sort()).toEqual(["GY", maxCode].sort());
  });

  test.each([
    { field: "blank organization code", input: { orgCode: "   ", orgName: "Supplier" } },
    { field: "65-character organization code", input: { orgCode: "A".repeat(65), orgName: "Supplier" } },
    { field: "blank organization name", input: { orgCode: "SUPPLIER", orgName: "   " } },
  ])("rejects a $field before persistence", async ({ input }) => {
    const rejected = await request("POST", "/purveyors", input);
    expect(rejected.status).toBe(422);

    const persisted = await harness.db.select().from(organizations);
    expect(persisted.map(row => row.orgCode)).toEqual(["GY"]);
  });

  test("keeps organization codes case-sensitive", async () => {
    for (const orgCode of ["Supplier", "SUPPLIER"]) {
      const created = await request("POST", "/purveyors", { orgCode, orgName: `Organization ${orgCode}` });
      expect(created.status).toBe(200);
    }
    const persisted = await harness.db.select().from(organizations);
    expect(persisted.filter(row => row.orgCode !== "GY").map(row => row.orgCode).sort()).toEqual([
      "SUPPLIER",
      "Supplier",
    ]);
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
    expect(persisted.filter(row => row.orgCode !== "GY")).toMatchObject([
      { orgCode: "FIRST", orgName: "Shared name" },
      { orgCode: "SECOND", orgName: "Shared name" },
    ]);
  });
});

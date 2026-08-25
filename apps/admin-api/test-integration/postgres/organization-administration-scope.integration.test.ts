import type { AdminOrganizationAuthorization } from "@admin-api/services/admin-authorization/admin-organization-authorization.type";
import type { DbClient } from "@iam/db";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createOrganizationService } from "@admin-api/services/organization/organization.service";
import { mapUnitOfWork } from "@iam/api-core/uow";
import {
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
} from "@iam/contracts";
import { organizationClosures, organizations } from "@iam/db/schema";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { and, eq } from "drizzle-orm";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

let harness: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;

beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});

beforeEach(async () => {
  await harness.reset();
  await seedOrganizationForest(harness.db);
});

afterAll(async () => {
  await harness.close();
});

describe("HR Organization administration scope", () => {
  test("filters both roots before pagination and keeps search, selector, and detail inside a multi-root union", async () => {
    const service = createService();
    const authorization = scopedAuthorization();

    const firstRootPage = await service.getOrganizationChildrenForAdmin(
      null,
      1,
      1,
      authorization,
    );
    const secondRootPage = await service.getOrganizationChildrenForAdmin(
      null,
      2,
      1,
      authorization,
    );
    const search = await service.searchOrganizationsForAdmin({
      conditions: { fuzzyConditions: {}, exactConditions: {} },
      pageNum: 2,
      pageSize: 2,
    }, authorization);
    const selector = await service.getOrganizationSelectorNodesForAdmin({
      pageSize: 50,
    }, authorization);
    const detail = await service.getOrganizationDetailByCodeForAdmin(
      "ROOT-B",
      authorization,
    );

    expect(firstRootPage).toMatchObject({
      result: [{ orgCode: "ROOT-A" }],
      total: 2,
      pages: 2,
    });
    expect(secondRootPage).toMatchObject({
      result: [{ orgCode: "ROOT-B" }],
      total: 2,
      pages: 2,
    });
    expect(search).toMatchObject({
      result: [{ orgCode: "A-BRANCH" }, { orgCode: "B-LEAF" }],
      total: 5,
      pageNum: 2,
      pages: 3,
    });
    expect(search.result.map(item => item.orgCode)).not.toContain("OUTSIDE");
    expect(selector.map(item => item.orgCode)).toEqual(["ROOT-A", "ROOT-B"]);
    expect(detail.orgCode).toBe("ROOT-B");

    let failure: unknown;
    try {
      await service.getOrganizationDetailByCodeForAdmin("OUTSIDE", authorization);
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(OrganizationNotFoundError);
  });

  test("commits in-scope child creation and approved updates while out-of-scope mutations write nothing", async () => {
    const service = createService();
    const authorization = scopedAuthorization();

    const created = await service.setOrganization({
      orgCode: "A-NEW",
      orgName: "A New Child",
      orgType: OrganizationType.Department,
      parentCode: "ROOT-A",
      path: "",
      level: OrganizationLevel.One,
      status: OrganizationStatus.Enable,
    } as never, undefined, authorization);
    expect(created).toBe(true);

    const createdRows = await harness.db
      .select({
        id: organizations.id,
        orgName: organizations.orgName,
        parentId: organizations.parentId,
      })
      .from(organizations)
      .where(eq(organizations.orgCode, "A-NEW"));
    expect(createdRows).toHaveLength(1);
    expect(createdRows[0]).toMatchObject({ orgName: "A New Child", parentId: 10 });
    const closureRows = await harness.db
      .select({
        ancestorId: organizationClosures.ancestorId,
        depth: organizationClosures.depth,
      })
      .from(organizationClosures)
      .where(eq(organizationClosures.descendantId, createdRows[0]!.id));
    expect(closureRows).toEqual([
      { ancestorId: 10, depth: 1 },
      { ancestorId: createdRows[0]!.id, depth: 0 },
    ]);

    let createProbeFailure: unknown;
    try {
      await service.setOrganization({
        orgCode: "OUTSIDE",
        orgName: "Probe Existing Code",
        orgType: OrganizationType.Department,
        parentCode: "ROOT-A",
        path: "",
        level: OrganizationLevel.One,
        status: OrganizationStatus.Enable,
      } as never, undefined, authorization);
    }
    catch (error) {
      createProbeFailure = error;
    }
    expect(createProbeFailure).toBeInstanceOf(OrganizationNotFoundError);
    const outsideAfterProbe = await harness.db
      .select({ orgName: organizations.orgName })
      .from(organizations)
      .where(eq(organizations.orgCode, "OUTSIDE"));
    expect(outsideAfterProbe).toEqual([{ orgName: "Outside" }]);

    const updated = await service.updateOrganization(
      "A-LEAF",
      {
        orgName: "Renamed Leaf",
        orgType: OrganizationType.TempDepartment,
      },
      undefined,
      authorization,
    );
    expect(updated).toBe(true);
    const renamedRows = await harness.db
      .select({ orgName: organizations.orgName, orgType: organizations.orgType })
      .from(organizations)
      .where(eq(organizations.orgCode, "A-LEAF"));
    expect(renamedRows).toEqual([{
      orgName: "Renamed Leaf",
      orgType: OrganizationType.TempDepartment,
    }]);

    let failure: unknown;
    try {
      await service.updateOrganization(
        "OUTSIDE",
        { orgName: "Forbidden Rename" },
        undefined,
        authorization,
      );
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(OrganizationNotFoundError);
    const outsideRows = await harness.db
      .select({ orgName: organizations.orgName })
      .from(organizations)
      .where(and(
        eq(organizations.orgCode, "OUTSIDE"),
        eq(organizations.isDelete, false),
      ));
    expect(outsideRows).toEqual([{ orgName: "Outside" }]);
  });

  test("preserves full-admin all-tree reads and root creation", async () => {
    const service = createService();

    const roots = await service.getOrganizationChildrenForAdmin(null, 1, 10);
    const search = await service.searchOrganizationsForAdmin({
      conditions: { fuzzyConditions: {}, exactConditions: {} },
      pageNum: 1,
      pageSize: 20,
    });
    const outsideDetail = await service.getOrganizationDetailByCodeForAdmin(
      "OUTSIDE",
    );
    const created = await service.setOrganization({
      orgCode: "NEW-ROOT",
      orgName: "New Root",
      orgType: OrganizationType.Company,
      parentCode: null,
      path: "",
      level: OrganizationLevel.One,
      status: OrganizationStatus.Enable,
    } as never);

    expect(roots).toMatchObject({ total: 3, pages: 1 });
    expect(roots.result.map(item => item.orgCode)).toEqual([
      "ROOT-A",
      "ROOT-B",
      "OUTSIDE",
    ]);
    expect(search.total).toBe(7);
    expect(outsideDetail.orgCode).toBe("OUTSIDE");
    expect(created).toBe(true);
    const createdRows = await harness.db
      .select({
        parentId: organizations.parentId,
        level: organizations.level,
      })
      .from(organizations)
      .where(eq(organizations.orgCode, "NEW-ROOT"));
    expect(createdRows).toEqual([{
      parentId: -1,
      level: OrganizationLevel.One,
    }]);
  });
});

function createService() {
  const repositories = createAdminApiRepositories(harness.db);
  const unitOfWork = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: mock(() => undefined), warn: mock(() => undefined) },
    userProfileJobProducer: {
      enqueueRebuildJobs: mock(async () => ({ enqueued: 0, jobIds: [] })),
    } as never,
    clock: { nowDate: () => new Date("2026-08-23T00:00:00Z") },
  });
  return createOrganizationService({
    organizationRepository: repositories.organization,
    responsibilityReader: repositories.organizationResponsibility,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      organizationRepository: tx.repositories.organization,
      auditService: tx.auditService,
      responsibilityParentLifecycle: tx.responsibilityParentLifecycle,
      userProfileInvalidation: tx.userProfileInvalidation,
    })),
  });
}

function scopedAuthorization(): AdminOrganizationAuthorization {
  return {
    kind: "scoped",
    rootOrganizationIds: [10, 20],
    organizationIds: [10, 11, 12, 20, 21],
    getAllowedActions: mock() as never,
    denyMutation(input) {
      if (input.concealExistence)
        throw new OrganizationNotFoundError();
      throw new Error(`denied: ${input.reason}`);
    },
  };
}

async function seedOrganizationForest(db: DbClient) {
  await db.insert(organizations).values([
    organization(10, "ROOT-A", "Root A", -1, OrganizationLevel.One, 1),
    organization(11, "A-BRANCH", "A Branch", 10, OrganizationLevel.Two, 1),
    organization(12, "A-LEAF", "A Leaf", 10, OrganizationLevel.Two, 2),
    organization(20, "ROOT-B", "Root B", -1, OrganizationLevel.One, 2),
    organization(21, "B-LEAF", "B Leaf", 20, OrganizationLevel.Two, 1),
    organization(30, "OUTSIDE", "Outside", -1, OrganizationLevel.One, 3),
    organization(31, "OUT-LEAF", "Outside Leaf", 30, OrganizationLevel.Two, 1),
  ]);
  await db.insert(organizationClosures).values([
    closure(10, 10, 0),
    closure(11, 11, 0),
    closure(12, 12, 0),
    closure(10, 11, 1),
    closure(10, 12, 1),
    closure(20, 20, 0),
    closure(21, 21, 0),
    closure(20, 21, 1),
    closure(30, 30, 0),
    closure(31, 31, 0),
    closure(30, 31, 1),
  ]);
}

function organization(
  id: number,
  orgCode: string,
  orgName: string,
  parentId: number,
  level: OrganizationLevel,
  orderNum: number,
) {
  return {
    id,
    orgCode,
    orgName,
    parentId,
    businessParentId: parentId,
    path: parentId === -1 ? `/${id}` : `/${parentId}/${id}`,
    level,
    orgType: OrganizationType.Department,
    orderNum,
    status: OrganizationStatus.Enable,
  };
}

function closure(ancestorId: number, descendantId: number, depth: number) {
  return { ancestorId, descendantId, depth };
}

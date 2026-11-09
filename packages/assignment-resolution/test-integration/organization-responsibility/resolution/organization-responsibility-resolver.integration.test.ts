import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
} from "@iam/contracts";
import type { DbClient } from "@iam/db";
import {
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
} from "@iam/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  createOrganizationResponsibilityResolver,
  type OrganizationResponsibilityResolver,
} from "../../../src/organization-responsibility/index.ts";
import type { PostgresTestHarness } from "../support/postgres-harness.ts";
import { createPostgresTestHarness } from "../support/postgres-harness.ts";

const at = new Date("2026-08-20T12:00:00.000Z");
let harness: PostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createPostgresTestHarness();
});

beforeEach(async () => {
  await harness!.reset();
});

afterAll(async () => {
  await harness?.close();
});

describe("OrganizationResponsibilityResolver", () => {
  test("resolves stable Effective responsibilities and cross-tree reverse holders", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db
      .insert(employments)
      .values([employment({ id: 100, userId: 900, orgId: 12 }), employment({ id: 101, userId: 901, orgId: 11 })]);
    await harness!.db.insert(organizationResponsibilityAssignments).values([
      assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
        targetOrganizationId: 21,
      }),
      assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 20,
      }),
      assignment({
        employmentId: 101,
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
        targetOrganizationId: 20,
        status: OrganizationResponsibilityAssignmentStatus.Pause,
      }),
    ]);
    await harness!.db.update(organizations).set({ status: OrganizationStatus.Disable }).where(eq(organizations.id, 11));

    const resolver = createOrganizationResponsibilityResolver(harness!.db);
    const forward = await resolver.resolveEffectiveResponsibilities({
      employmentIds: [100, 100, 101, 999],
      at,
    });
    const reverse = await resolver.resolveHolderEmploymentIds({
      targetOrganizationIds: [20],
      typeCodes: [OrganizationResponsibilityTypeCode.Supervising],
      at,
    });
    const catalogHolders = await resolver.resolveHolderEmploymentIdsByTypes({
      typeCodes: [OrganizationResponsibilityTypeCode.Head],
      at,
    });

    expect([...forward.entries()]).toEqual([
      [
        100,
        [
          { typeCode: OrganizationResponsibilityTypeCode.Head, targetOrganizationId: 20 },
          { typeCode: OrganizationResponsibilityTypeCode.Supervising, targetOrganizationId: 21 },
        ],
      ],
      [101, []],
      [999, []],
    ]);
    expect(reverse).toEqual([100]);
    expect(catalogHolders).toEqual([100]);
  });

  test("resolves current responsibilities without validating ended history for the same targets", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db
      .insert(employments)
      .values([employment({ id: 100, userId: 900, orgId: 12 }), employment({ id: 101, userId: 901, orgId: 12 })]);
    await harness!.db
      .update(employments)
      .set({ status: 99 as EmploymentStatus })
      .where(eq(employments.id, 101));
    await harness!.db.insert(organizationResponsibilityAssignments).values([
      assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 20,
      }),
      ...[
        { employmentId: 100, targetOrganizationId: 20 },
        { employmentId: 101, targetOrganizationId: 20 },
        { employmentId: 999, targetOrganizationId: 20 },
        { employmentId: 100, targetOrganizationId: 999 },
      ].map((input) =>
        assignment({
          ...input,
          typeCode: OrganizationResponsibilityTypeCode.Head,
          status: OrganizationResponsibilityAssignmentStatus.Disable,
          endTime: new Date("2026-08-19T00:00:00.000Z"),
        }),
      ),
    ]);

    const resolver = createOrganizationResponsibilityResolver(harness!.db);
    const forward = await resolver.resolveEffectiveResponsibilities({ employmentIds: [100, 101, 999], at });
    const reverse = await resolver.resolveHolderEmploymentIds({ targetOrganizationIds: [20], at });
    const catalogHolders = await resolver.resolveHolderEmploymentIdsByTypes({
      typeCodes: [OrganizationResponsibilityTypeCode.Head],
      at,
    });

    expect([...forward.entries()]).toEqual([
      [100, [{ typeCode: OrganizationResponsibilityTypeCode.Head, targetOrganizationId: 20 }]],
      [101, []],
      [999, []],
    ]);
    expect(reverse).toEqual([100]);
    expect(catalogHolders).toEqual([100]);
  });

  test("fails the whole batch when an enabled assignment has an invalid target reference", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db.insert(organizationResponsibilityAssignments).values(
      assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 999,
      }),
    );

    const resolver = createOrganizationResponsibilityResolver(harness!.db);

    const failure = await captureFailure(resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at }));

    expect(failure).toMatchObject({
      name: "OrganizationResponsibilityIntegrityError",
      code: "ORGANIZATION_RESPONSIBILITY_INTEGRITY_FAILED",
    });
  });

  test("resolves holders across a subtree larger than the SQL parameter limit", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db
      .insert(employments)
      .values([employment({ id: 100, userId: 900, orgId: 12 }), employment({ id: 101, userId: 901, orgId: 12 })]);
    await harness!.db.execute(sql`
      INSERT INTO organization (id, org_code, org_name, parent_id, path, level, org_type)
      SELECT id, 'broad-target-' || id, 'Broad target ' || id, 20, '20/' || id, 2, ${OrganizationType.Department}
      FROM generate_series(1000, 66533) AS id
    `);
    await harness!.db.insert(organizationResponsibilityAssignments).values(
      assignment({
        employmentId: 101,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 66533,
      }),
    );
    await harness!.db.execute(sql`
      INSERT INTO organization_closure (ancestor_id, descendant_id, depth)
      SELECT 20, id, 1 FROM generate_series(1000, 66533) AS id
    `);
    await harness!.db.execute(sql`
      INSERT INTO organization_responsibility_assignment
        (employment_id, type_code, target_organization_id, status, start_time)
      SELECT 100, ${OrganizationResponsibilityTypeCode.Head}, id,
        ${OrganizationResponsibilityAssignmentStatus.Enable}, '2026-08-01T00:00:00Z'::timestamptz
      FROM generate_series(1000, 2999) AS id
    `);

    const holders = await createOrganizationResponsibilityResolver(harness!.db).resolveHolderEmploymentIds({
      targetOrganizationIds: [20],
      at,
    });

    expect(holders).toEqual([100, 101]);
  });

  test("resolves large employment inputs and preserves empty entries and deduplication", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db.insert(organizationResponsibilityAssignments).values(
      assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 20,
      }),
    );

    const responsibilities = await createOrganizationResponsibilityResolver(
      harness!.db,
    ).resolveEffectiveResponsibilities({
      employmentIds: [100, ...Array.from({ length: 65534 }, (_, index) => index + 100), 65633],
      at,
    });

    expect(responsibilities.size).toBe(65534);
    expect(responsibilities.get(100)).toEqual([
      { typeCode: OrganizationResponsibilityTypeCode.Head, targetOrganizationId: 20 },
    ]);
    expect(responsibilities.get(65633)).toEqual([]);
  });

  test("resolves large overlapping target inputs without duplicating holders", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db.insert(organizationResponsibilityAssignments).values(
      assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 21,
      }),
    );

    const holders = await createOrganizationResponsibilityResolver(harness!.db).resolveHolderEmploymentIds({
      targetOrganizationIds: [20, 21, ...Array.from({ length: 65534 }, (_, index) => index + 1000), 20],
      at,
    });

    expect(holders).toEqual([100]);
  });

  test("fails the whole batch when an open assignment is scheduled after observation time", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db.insert(organizationResponsibilityAssignments).values(
      assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
        targetOrganizationId: 20,
        status: OrganizationResponsibilityAssignmentStatus.Pause,
        startTime: new Date("2026-08-21T00:00:00.000Z"),
      }),
    );

    const resolver = createOrganizationResponsibilityResolver(harness!.db);
    const failure = await captureFailure(resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at }));

    expect(failure).toMatchObject({
      name: "OrganizationResponsibilityIntegrityError",
      reason: "assignment-period-outside-observation",
    });
  });

  test.each([
    OrganizationResponsibilityAssignmentStatus.Enable,
    OrganizationResponsibilityAssignmentStatus.Pause,
    OrganizationResponsibilityAssignmentStatus.Disable,
  ])("validates stored Periods only for current assignments (status %s)", async (status) => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db.execute(sql`
      ALTER TABLE organization_responsibility_assignment
      DROP CONSTRAINT organization_responsibility_assignment_period_check
    `);

    try {
      await harness!.db.insert(organizationResponsibilityAssignments).values(
        assignment({
          employmentId: 100,
          typeCode: OrganizationResponsibilityTypeCode.Head,
          targetOrganizationId: 20,
          status,
          endTime:
            status === OrganizationResponsibilityAssignmentStatus.Disable
              ? undefined
              : new Date("2026-08-19T00:00:00.000Z"),
        }),
      );

      const resolver = createOrganizationResponsibilityResolver(harness!.db);
      if (status === OrganizationResponsibilityAssignmentStatus.Disable)
        await expectNoCurrentResponsibilities(resolver);
      else await expectResolutionFailure(resolver, "open-assignment-period-invalid");
    } finally {
      await harness!.db.delete(organizationResponsibilityAssignments);
      await harness!.db.execute(sql`
        ALTER TABLE organization_responsibility_assignment
        ADD CONSTRAINT organization_responsibility_assignment_period_check CHECK (
          (status IN (1, 2) AND end_time IS NULL)
          OR (status = 3 AND end_time IS NOT NULL AND end_time >= start_time)
        )
      `);
    }
  });

  test("ignores ended assignments whose stored Period is after observation time", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db.insert(organizationResponsibilityAssignments).values(
      assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 20,
        status: OrganizationResponsibilityAssignmentStatus.Disable,
        startTime: new Date("2026-08-21T00:00:00.000Z"),
        endTime: new Date("2026-08-21T01:00:00.000Z"),
      }),
    );

    const resolver = createOrganizationResponsibilityResolver(harness!.db);
    await expectNoCurrentResponsibilities(resolver);
  });

  test.each([
    OrganizationResponsibilityAssignmentStatus.Enable,
    OrganizationResponsibilityAssignmentStatus.Pause,
    OrganizationResponsibilityAssignmentStatus.Disable,
  ])("checks unknown holder statuses only for current assignments (status %s)", async (status) => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db
      .update(employments)
      .set({ status: 99 as EmploymentStatus })
      .where(eq(employments.id, 100));
    await harness!.db.insert(organizationResponsibilityAssignments).values(
      assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 20,
        status,
        endTime:
          status === OrganizationResponsibilityAssignmentStatus.Disable
            ? new Date("2026-08-20T01:00:00.000Z")
            : undefined,
      }),
    );

    const resolver = createOrganizationResponsibilityResolver(harness!.db);
    if (status === OrganizationResponsibilityAssignmentStatus.Disable) await expectNoCurrentResponsibilities(resolver);
    else await expectResolutionFailure(resolver, "holder-employment-status-unknown");
  });

  test.each([
    OrganizationResponsibilityAssignmentStatus.Enable,
    OrganizationResponsibilityAssignmentStatus.Pause,
    OrganizationResponsibilityAssignmentStatus.Disable,
  ])("checks unknown target statuses only for current assignments (status %s)", async (status) => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db
      .update(organizations)
      .set({ status: 99 as OrganizationStatus })
      .where(eq(organizations.id, 20));
    await harness!.db.insert(organizationResponsibilityAssignments).values(
      assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 20,
        status,
        endTime:
          status === OrganizationResponsibilityAssignmentStatus.Disable
            ? new Date("2026-08-20T01:00:00.000Z")
            : undefined,
      }),
    );

    const resolver = createOrganizationResponsibilityResolver(harness!.db);
    if (status === OrganizationResponsibilityAssignmentStatus.Disable) await expectNoCurrentResponsibilities(resolver);
    else await expectResolutionFailure(resolver, "target-organization-status-unknown");
  });

  test("fails the whole batch when an assignment has an unknown status", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db.execute(sql`
      ALTER TABLE organization_responsibility_assignment
      DROP CONSTRAINT organization_responsibility_assignment_status_check
    `);
    await harness!.db.execute(sql`
      ALTER TABLE organization_responsibility_assignment
      DROP CONSTRAINT organization_responsibility_assignment_period_check
    `);

    try {
      await harness!.db.insert(organizationResponsibilityAssignments).values(
        assignment({
          employmentId: 100,
          typeCode: OrganizationResponsibilityTypeCode.Head,
          targetOrganizationId: 20,
          status: 99 as OrganizationResponsibilityAssignmentStatus,
        }),
      );

      const resolver = createOrganizationResponsibilityResolver(harness!.db);
      await expectResolutionFailure(resolver, "assignment-status-unknown");
    } finally {
      await harness!.db.delete(organizationResponsibilityAssignments);
      await harness!.db.execute(sql`
        ALTER TABLE organization_responsibility_assignment
        ADD CONSTRAINT organization_responsibility_assignment_status_check
        CHECK (status IN (1, 2, 3))
      `);
      await harness!.db.execute(sql`
        ALTER TABLE organization_responsibility_assignment
        ADD CONSTRAINT organization_responsibility_assignment_period_check CHECK (
          (status IN (1, 2) AND end_time IS NULL)
          OR (status = 3 AND end_time IS NOT NULL AND end_time >= start_time)
        )
      `);
    }
  });

  test("validates paused responsibilities of other holders and Types for the same target", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db
      .insert(employments)
      .values([employment({ id: 100, userId: 900, orgId: 12 }), employment({ id: 101, userId: 901, orgId: 12 })]);
    await harness!.db
      .update(employments)
      .set({ status: EmploymentStatus.Disable, endTime: new Date("2026-08-19T00:00:00.000Z") })
      .where(eq(employments.id, 101));
    await harness!.db.insert(organizationResponsibilityAssignments).values([
      assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 20,
      }),
      assignment({
        employmentId: 101,
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
        targetOrganizationId: 20,
        status: OrganizationResponsibilityAssignmentStatus.Pause,
      }),
    ]);

    const resolver = createOrganizationResponsibilityResolver(harness!.db);
    await expectResolutionFailure(resolver, "holder-employment-not-open");
    const filteredReverseFailure = await captureFailure(
      resolver.resolveHolderEmploymentIds({
        targetOrganizationIds: [20],
        typeCodes: [OrganizationResponsibilityTypeCode.Head],
        at,
      }),
    );
    expect(filteredReverseFailure).toMatchObject({
      name: "OrganizationResponsibilityIntegrityError",
      reason: "holder-employment-not-open",
    });
  });

  test.each([OrganizationResponsibilityAssignmentStatus.Enable, OrganizationResponsibilityAssignmentStatus.Pause])(
    "fails the whole batch on target-wide head corruption even across input batches (status %s)",
    async (status) => {
      await seedOrganizationTree(harness!.db);
      await harness!.db
        .insert(employments)
        .values([employment({ id: 100, userId: 900, orgId: 12 }), employment({ id: 101, userId: 901, orgId: 12 })]);
      await harness!.db.execute(sql`DROP INDEX org_resp_assignment_open_head_unique_idx`);

      try {
        await harness!.db.insert(organizationResponsibilityAssignments).values([
          assignment({
            employmentId: 100,
            typeCode: OrganizationResponsibilityTypeCode.Head,
            targetOrganizationId: 20,
          }),
          assignment({
            employmentId: 101,
            typeCode: OrganizationResponsibilityTypeCode.Head,
            targetOrganizationId: 20,
            status,
          }),
        ]);

        const resolver = createOrganizationResponsibilityResolver(harness!.db);
        for (const employmentIds of [[100], [100, ...Array.from({ length: 2000 }, (_, index) => index + 1000), 101]]) {
          const failure = await captureFailure(resolver.resolveEffectiveResponsibilities({ employmentIds, at }));

          expect(failure).toMatchObject({
            name: "OrganizationResponsibilityIntegrityError",
            reason: "head-cardinality-violated",
          });
        }
        await expectResolutionFailure(resolver, "head-cardinality-violated");
      } finally {
        await harness!.db.delete(organizationResponsibilityAssignments);
        await harness!.db.execute(sql`
        CREATE UNIQUE INDEX org_resp_assignment_open_head_unique_idx
        ON organization_responsibility_assignment (target_organization_id, type_code)
        WHERE type_code = 'head' AND status IN (1, 2)
      `);
      }
    },
  );
});

async function expectNoCurrentResponsibilities(resolver: OrganizationResponsibilityResolver) {
  const forward = await resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at });
  const reverse = await resolver.resolveHolderEmploymentIds({ targetOrganizationIds: [20], at });
  const catalogHolders = await resolver.resolveHolderEmploymentIdsByTypes({
    typeCodes: [OrganizationResponsibilityTypeCode.Head],
    at,
  });
  expect([...forward.entries()]).toEqual([[100, []]]);
  expect(reverse).toEqual([]);
  expect(catalogHolders).toEqual([]);
}

async function expectResolutionFailure(resolver: OrganizationResponsibilityResolver, reason: string) {
  for (const resolve of [
    () => resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at }),
    () => resolver.resolveHolderEmploymentIds({ targetOrganizationIds: [20], at }),
    () => resolver.resolveHolderEmploymentIdsByTypes({ typeCodes: [OrganizationResponsibilityTypeCode.Head], at }),
  ]) {
    const failure = await captureFailure(resolve());
    expect(failure).toMatchObject({ name: "OrganizationResponsibilityIntegrityError", reason });
  }
}

async function seedOrganizationTree(db: DbClient) {
  await db
    .insert(organizations)
    .values([
      organization({ id: 10, orgCode: "holder-root", path: "10", level: OrganizationLevel.One }),
      organization({ id: 11, orgCode: "holder-child", path: "10/11", level: OrganizationLevel.Two }),
      organization({ id: 12, orgCode: "holder-leaf", path: "10/11/12", level: OrganizationLevel.Three }),
      organization({ id: 20, orgCode: "target-root", path: "20", level: OrganizationLevel.One }),
      organization({ id: 21, orgCode: "target-child", path: "20/21", level: OrganizationLevel.Two }),
    ]);
  await db.insert(organizationClosures).values([
    { ancestorId: 10, descendantId: 10, depth: 0 },
    { ancestorId: 11, descendantId: 11, depth: 0 },
    { ancestorId: 12, descendantId: 12, depth: 0 },
    { ancestorId: 10, descendantId: 11, depth: 1 },
    { ancestorId: 11, descendantId: 12, depth: 1 },
    { ancestorId: 10, descendantId: 12, depth: 2 },
    { ancestorId: 20, descendantId: 20, depth: 0 },
    { ancestorId: 21, descendantId: 21, depth: 0 },
    { ancestorId: 20, descendantId: 21, depth: 1 },
  ]);
}

function organization(input: { id: number; orgCode: string; path: string; level: OrganizationLevel }) {
  return {
    ...input,
    orgName: input.orgCode,
    parentId: -1,
    businessParentId: -1,
    orgType: OrganizationType.Department,
    status: OrganizationStatus.Enable,
  };
}

function employment(input: { id: number; userId: number; orgId: number }) {
  return {
    ...input,
    posId: input.id,
    status: EmploymentStatus.Enable,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function assignment(input: {
  employmentId: number;
  typeCode: OrganizationResponsibilityTypeCode;
  targetOrganizationId: number;
  status?: OrganizationResponsibilityAssignmentStatus;
  startTime?: Date;
  endTime?: Date;
}) {
  return {
    ...input,
    status: input.status ?? OrganizationResponsibilityAssignmentStatus.Enable,
    startTime: input.startTime ?? new Date("2026-08-01T00:00:00.000Z"),
  };
}

async function captureFailure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

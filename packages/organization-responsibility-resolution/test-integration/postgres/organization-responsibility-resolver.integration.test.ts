import type { DbClient } from "@iam/db";
import type { PostgresTestHarness } from "./postgres-harness.ts";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
} from "@iam/contracts";
import {
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
} from "@iam/db/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { createOrganizationResponsibilityResolver } from "../../src/index.ts";
import { createPostgresTestHarness } from "./postgres-harness.ts";

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
    await harness!.db.insert(employments).values([
      employment({ id: 100, userId: 900, orgId: 12 }),
      employment({ id: 101, userId: 901, orgId: 11 }),
    ]);
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
    await harness!.db
      .update(organizations)
      .set({ status: OrganizationStatus.Disable })
      .where(eq(organizations.id, 11));

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
      [100, [
        { typeCode: OrganizationResponsibilityTypeCode.Head, targetOrganizationId: 20 },
        { typeCode: OrganizationResponsibilityTypeCode.Supervising, targetOrganizationId: 21 },
      ]],
      [101, []],
      [999, []],
    ]);
    expect(reverse).toEqual([100]);
    expect(catalogHolders).toEqual([100]);
  });

  test("fails the whole batch when an enabled assignment has an invalid target reference", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db.insert(organizationResponsibilityAssignments).values(assignment({
      employmentId: 100,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      targetOrganizationId: 999,
    }));

    const resolver = createOrganizationResponsibilityResolver(harness!.db);

    const failure = await captureFailure(
      resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at }),
    );

    expect(failure).toMatchObject({
      name: "OrganizationResponsibilityIntegrityError",
      code: "ORGANIZATION_RESPONSIBILITY_INTEGRITY_FAILED",
    });
  });

  test("fails the whole batch when an open assignment is scheduled after observation time", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db.insert(organizationResponsibilityAssignments).values(assignment({
      employmentId: 100,
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
      targetOrganizationId: 20,
      status: OrganizationResponsibilityAssignmentStatus.Pause,
      startTime: new Date("2026-08-21T00:00:00.000Z"),
    }));

    const resolver = createOrganizationResponsibilityResolver(harness!.db);
    const failure = await captureFailure(
      resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at }),
    );

    expect(failure).toMatchObject({
      name: "OrganizationResponsibilityIntegrityError",
      reason: "assignment-period-outside-observation",
    });
  });

  test("fails the whole batch when a disabled assignment retains an open Period", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db.execute(sql`
      ALTER TABLE organization_responsibility_assignment
      DROP CONSTRAINT organization_responsibility_assignment_period_check
    `);

    try {
      await harness!.db.insert(organizationResponsibilityAssignments).values(assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 20,
        status: OrganizationResponsibilityAssignmentStatus.Disable,
      }));

      const resolver = createOrganizationResponsibilityResolver(harness!.db);
      const failure = await captureFailure(
        resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at }),
      );

      expect(failure).toMatchObject({
        name: "OrganizationResponsibilityIntegrityError",
        reason: "open-assignment-period-invalid",
      });
    }
    finally {
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

  test("fails the whole batch when a disabled Period is after observation time", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db.insert(organizationResponsibilityAssignments).values(assignment({
      employmentId: 100,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      targetOrganizationId: 20,
      status: OrganizationResponsibilityAssignmentStatus.Disable,
      startTime: new Date("2026-08-21T00:00:00.000Z"),
      endTime: new Date("2026-08-21T01:00:00.000Z"),
    }));

    const resolver = createOrganizationResponsibilityResolver(harness!.db);
    const failure = await captureFailure(
      resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at }),
    );

    expect(failure).toMatchObject({
      name: "OrganizationResponsibilityIntegrityError",
      reason: "assignment-period-outside-observation",
    });
  });

  test("fails the whole batch when a disabled assignment holder has an unknown status", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db
      .update(employments)
      .set({ status: 99 as EmploymentStatus })
      .where(eq(employments.id, 100));
    await harness!.db.insert(organizationResponsibilityAssignments).values(assignment({
      employmentId: 100,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      targetOrganizationId: 20,
      status: OrganizationResponsibilityAssignmentStatus.Disable,
      endTime: new Date("2026-08-20T01:00:00.000Z"),
    }));

    const resolver = createOrganizationResponsibilityResolver(harness!.db);
    const failure = await captureFailure(
      resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at }),
    );

    expect(failure).toMatchObject({
      name: "OrganizationResponsibilityIntegrityError",
      reason: "holder-employment-status-unknown",
    });
  });

  test("fails the whole batch when a disabled assignment target has an unknown status", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values(employment({ id: 100, userId: 900, orgId: 12 }));
    await harness!.db
      .update(organizations)
      .set({ status: 99 as OrganizationStatus })
      .where(eq(organizations.id, 20));
    await harness!.db.insert(organizationResponsibilityAssignments).values(assignment({
      employmentId: 100,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      targetOrganizationId: 20,
      status: OrganizationResponsibilityAssignmentStatus.Disable,
      endTime: new Date("2026-08-20T01:00:00.000Z"),
    }));

    const resolver = createOrganizationResponsibilityResolver(harness!.db);
    const failure = await captureFailure(
      resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at }),
    );

    expect(failure).toMatchObject({
      name: "OrganizationResponsibilityIntegrityError",
      reason: "target-organization-status-unknown",
    });
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
      await harness!.db.insert(organizationResponsibilityAssignments).values(assignment({
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganizationId: 20,
        status: 99 as OrganizationResponsibilityAssignmentStatus,
      }));

      const resolver = createOrganizationResponsibilityResolver(harness!.db);
      const failure = await captureFailure(
        resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at }),
      );

      expect(failure).toMatchObject({
        name: "OrganizationResponsibilityIntegrityError",
        reason: "assignment-status-unknown",
      });
    }
    finally {
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

  test("fails the whole batch when target-wide head cardinality is corrupted", async () => {
    await seedOrganizationTree(harness!.db);
    await harness!.db.insert(employments).values([
      employment({ id: 100, userId: 900, orgId: 12 }),
      employment({ id: 101, userId: 901, orgId: 12 }),
    ]);
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
        }),
      ]);

      const resolver = createOrganizationResponsibilityResolver(harness!.db);
      const failure = await captureFailure(
        resolver.resolveEffectiveResponsibilities({ employmentIds: [100], at }),
      );

      expect(failure).toMatchObject({
        name: "OrganizationResponsibilityIntegrityError",
        reason: "head-cardinality-violated",
      });
    }
    finally {
      await harness!.db.delete(organizationResponsibilityAssignments);
      await harness!.db.execute(sql`
        CREATE UNIQUE INDEX org_resp_assignment_open_head_unique_idx
        ON organization_responsibility_assignment (target_organization_id, type_code)
        WHERE type_code = 'head' AND status IN (1, 2)
      `);
    }
  });
});

async function seedOrganizationTree(db: DbClient) {
  await db.insert(organizations).values([
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

function organization(input: {
  id: number;
  orgCode: string;
  path: string;
  level: OrganizationLevel;
}) {
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
  }
  catch (error) {
    return error;
  }
  return undefined;
}

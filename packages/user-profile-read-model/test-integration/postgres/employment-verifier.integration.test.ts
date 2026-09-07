import type { db as database } from "@iam/db";
import {
  EmploymentStatus,
  OrganizationStatus,
  PositionStatus,
} from "@iam/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  createEmploymentRepository,
  createEmploymentVerifier,
} from "../../src/worker";
import { createPostgresTestHarness } from "./postgres-test-harness";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const START = new Date("2026-08-01T00:00:00.000Z");

describe("Employment verifier PostgreSQL contract", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.sql.unsafe(
      "TRUNCATE TABLE employment, position, organization RESTART IDENTITY CASCADE",
    );
    await seedParents();
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("returns success for a valid dataset", async () => {
    await insertEmployment({ id: 1 });
    const verifier = createVerifier();

    const report = await verifier.verify();
    expect(report).toEqual({
      version: 1,
      verifiedAt: NOW.toISOString(),
      status: "passed",
      counts: {
        employments: 1,
        legacyTombstones: 0,
        blockingEmployments: 0,
      },
      failures: [],
    });
  });

  test("aggregates every blocker, keeps tombstones non-blocking, and leaves all allowed tables unchanged", async () => {
    await insertEmployment({ id: 1 });
    await insertEmployment({ id: 2, status: 99, isDelete: true });
    await insertEmployment({ id: 3, status: 99 });
    await insertEmployment({ id: 4, positionId: 21 });
    await insertEmployment({ id: 5, organizationId: 31 });
    await insertEmployment({ id: 6, endTime: new Date("2026-08-10T00:00:00.000Z") });
    await insertEmployment({ id: 7, status: EmploymentStatus.Disable });
    await insertEmployment({ id: 8, status: EmploymentStatus.Disable, endTime: START });
    await insertEmployment({ id: 9, startTime: new Date("2026-08-12T00:00:00.000Z") });
    await insertEmployment({ id: 10, userId: 10 });
    await insertEmployment({ id: 11, userId: 10, status: EmploymentStatus.Pause });
    await insertEmployment({ id: 12, userId: 11, isPrimary: true });
    await insertEmployment({
      id: 13,
      userId: 11,
      positionId: 22,
      organizationId: 32,
      isPrimary: true,
      status: EmploymentStatus.Pause,
    });
    const before = await readAllowedTables();

    const report = await createVerifier().verify();

    expect(report).toMatchObject({
      status: "failed",
      counts: {
        employments: 13,
        legacyTombstones: 1,
        blockingEmployments: 11,
      },
    });
    expect(report.failures).toEqual([{
      code: "unknown-employment-status",
      count: 1,
      employmentIds: [3],
    }, {
      code: "position-not-effective",
      count: 1,
      employmentIds: [4],
    }, {
      code: "organization-not-effective",
      count: 1,
      employmentIds: [5],
    }, {
      code: "invalid-employment-period",
      count: 1,
      employmentIds: [8],
    }, {
      code: "open-employment-has-end-time",
      count: 1,
      employmentIds: [6],
    }, {
      code: "ended-employment-missing-end-time",
      count: 1,
      employmentIds: [7],
    }, {
      code: "future-open-start-time",
      count: 1,
      employmentIds: [9],
    }, {
      code: "duplicate-open-employment",
      count: 2,
      employmentIds: [10, 11],
    }, {
      code: "multiple-open-primary-employments",
      count: 2,
      employmentIds: [12, 13],
    }]);
    const after = await readAllowedTables();
    expect(after).toEqual(before);
  });

  function createVerifier() {
    return createEmploymentVerifier({
      inventory: createEmploymentRepository(harness.db as typeof database),
      clock: { nowDate: () => NOW },
    });
  }

  async function seedParents() {
    await harness.sql`
      INSERT INTO "user" (id, username, name)
      SELECT id, ${"employment-user-"} || id, ${"Employment User "} || id
      FROM generate_series(1, 13) AS id
    `;
    await harness.sql`
      INSERT INTO position (id, post_code, post_name, status, is_delete)
      VALUES
        (20, 'POS-20', 'Position 20', ${PositionStatus.Enable}, false),
        (21, 'POS-21', 'Position 21', ${PositionStatus.Pause}, false),
        (22, 'POS-22', 'Position 22', ${PositionStatus.Enable}, false)
    `;
    await harness.sql`
      INSERT INTO organization (
        id, org_code, org_name, parent_id, business_parent_id, path, level,
        org_type, status, is_delete
      )
      VALUES
        (30, 'ORG-30', 'Organization 30', -1, -1, '/30', 1, 'Department', ${OrganizationStatus.Enable}, false),
        (31, 'ORG-31', 'Organization 31', -1, -1, '/31', 1, 'Department', ${OrganizationStatus.Disable}, false),
        (32, 'ORG-32', 'Organization 32', -1, -1, '/32', 1, 'Department', ${OrganizationStatus.Enable}, false)
    `;
  }

  async function insertEmployment(input: {
    id: number;
    userId?: number;
    positionId?: number;
    organizationId?: number;
    isPrimary?: boolean;
    status?: number;
    startTime?: Date;
    endTime?: Date | null;
    isDelete?: boolean;
  }) {
    await harness.sql`
      INSERT INTO employment (
        id, user_id, pos_id, dept_id, is_primary, status, start_time,
        end_time, is_delete
      )
      VALUES (
        ${input.id},
        ${input.userId ?? input.id},
        ${input.positionId ?? 20},
        ${input.organizationId ?? 30},
        ${input.isPrimary ?? false},
        ${input.status ?? EmploymentStatus.Enable},
        ${(input.startTime ?? START).toISOString()},
        ${input.endTime?.toISOString() ?? null},
        ${input.isDelete ?? false}
      )
    `;
  }

  async function readAllowedTables() {
    const [employments, users, positions, organizations] = await Promise.all([
      harness.sql`SELECT * FROM employment ORDER BY id`,
      harness.sql`SELECT * FROM "user" ORDER BY id`,
      harness.sql`SELECT * FROM position ORDER BY id`,
      harness.sql`SELECT * FROM organization ORDER BY id`,
    ]);
    return {
      employments: [...employments],
      users: [...users],
      positions: [...positions],
      organizations: [...organizations],
    };
  }
});

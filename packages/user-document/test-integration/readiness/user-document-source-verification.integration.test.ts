import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  UserStatus,
} from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
import {
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  users,
} from "@iam/db/schema";
import {
  createCurrentUserDocumentPostgresReadiness,
  createCurrentUserDocumentProjectionBundle,
} from "../../src/worker";
import { createPostgresTestHarness } from "../support/postgres-test-harness";

const OBSERVED_AT = new Date("2026-08-22T06:00:00.000Z");

describe("User Document source verification", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.sql`TRUNCATE role_assignment, role, client, organization_responsibility_assignment,
      employment, organization_closure, organization, position RESTART IDENTITY CASCADE`;
  });

  afterAll(async () => {
    await harness?.close();
  });

  function gate() {
    return createCurrentUserDocumentPostgresReadiness({
      db: harness.db,
      clock: { nowDate: () => OBSERVED_AT },
      config: { buildBatchSize: 10 },
    });
  }

  async function seedUsers(count: number) {
    const ids = Array.from({ length: count }, (_, index) => index + 1);
    await harness.db.insert(users).values(
      ids.map((id) => ({
        id,
        subjectIdentifier: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
        username: `user-${id}`,
        name: `User ${id}`,
        status: UserStatus.Enable,
      })),
    );
    await harness.db.insert(positions).values(
      ids.map((id) => ({
        id: 100 + id,
        posCode: `position-${id}`,
        posName: `Position ${id}`,
        status: PositionStatus.Enable,
      })),
    );
    await harness.db.insert(organizations).values({
      id: 20,
      orgCode: "HOLDER",
      orgName: "Holder",
      orgType: OrganizationType.Department,
      status: OrganizationStatus.Enable,
      level: OrganizationLevel.One,
      path: "20",
      parentId: -1,
    });
    await harness.db.insert(organizationClosures).values({ ancestorId: 20, descendantId: 20, depth: 0 });
    await harness.db.insert(employments).values(
      ids.map((id) => ({
        id: 1000 + id,
        userId: id,
        orgId: 20,
        posId: 100 + id,
        status: EmploymentStatus.Enable,
        startTime: new Date("2026-01-01T00:00:00.000Z"),
      })),
    );
  }

  async function publishUsers(count: number) {
    const projection = createCurrentUserDocumentProjectionBundle();
    const publications = await projection
      .createBuilder({ db: harness.db, clock: { nowDate: () => OBSERVED_AT }, batchSize: 10 })
      .buildMany(Array.from({ length: count }, (_, index) => ({ userId: index + 1, sourceVersion: "1" })));
    for (const publication of publications) {
      await projection.createRowRepository(harness.db).upsert(publication);
      await harness.sql`INSERT INTO user_document_rebuild_state
        (user_id,version,status,processed_at,post_publication_version,
         post_publication_status,post_publication_completed_at)
        VALUES (${publication.userId},1,'processed',NOW(),1,'processed',NOW())`;
    }
  }

  test("aggregates source integrity and schema failures while checking healthy users in the same and later pages", async () => {
    await seedUsers(4);
    await publishUsers(4);
    await harness.sql`UPDATE position SET status=${PositionStatus.Disable} WHERE id=101`;
    await harness.sql`UPDATE "user" SET name='' WHERE id=3`;
    await harness.sql`UPDATE "user" SET name='Changed source name' WHERE id IN (2,4)`;

    const report = await gate().verify({ batchSize: 2 });

    expect(report).toMatchObject({ status: "failed", counts: { users: 4, verifiedUsers: 4 } });
    expect(report.failures).toEqual(
      expect.arrayContaining([
        { code: "document-source-invalid", count: 2, samples: ["user:1", "user:3"] },
        { code: "document-authoritative-mismatch", count: 2, samples: ["user:2", "user:4"] },
      ]),
    );
    const storedNames = await harness.sql`SELECT document->>'name' AS name FROM user_document ORDER BY user_id`;
    expect(storedNames.map(({ name }) => name)).toEqual(["User 1", "User 2", "User 3", "User 4"]);
  });

  test("isolates a source integrity error raised by a batch reader and continues checking unaffected users", async () => {
    await seedUsers(3);
    await harness.db.insert(organizations).values([
      {
        id: 30,
        orgCode: "TARGET-ROOT",
        orgName: "Target root",
        orgType: OrganizationType.Department,
        status: OrganizationStatus.Enable,
        level: OrganizationLevel.One,
        path: "30",
        parentId: -1,
      },
      {
        id: 31,
        orgCode: "TARGET",
        orgName: "Target",
        orgType: OrganizationType.Department,
        status: OrganizationStatus.Enable,
        level: OrganizationLevel.Two,
        path: "30/31",
        parentId: 30,
      },
    ]);
    await harness.db.insert(organizationClosures).values([
      { ancestorId: 30, descendantId: 30, depth: 0 },
      { ancestorId: 31, descendantId: 31, depth: 0 },
      { ancestorId: 30, descendantId: 31, depth: 1 },
    ]);
    await harness.db.insert(organizationResponsibilityAssignments).values({
      employmentId: 1001,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      targetOrganizationId: 31,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: new Date("2026-08-01T00:00:00.000Z"),
    });
    await publishUsers(3);
    await harness.sql`UPDATE organization SET parent_id=-1 WHERE id=31`;
    await harness.sql`UPDATE "user" SET name='Changed source name' WHERE id IN (2,3)`;

    const report = await gate().verify({ batchSize: 2 });

    expect(report).toMatchObject({ status: "failed", counts: { users: 3, verifiedUsers: 3 } });
    expect(report.failures).toEqual(
      expect.arrayContaining([
        { code: "document-source-invalid", count: 1, samples: ["user:1"] },
        { code: "document-authoritative-mismatch", count: 2, samples: ["user:2", "user:3"] },
      ]),
    );
  });

  test("rejects a database query failure during authoritative building instead of returning a source failure report", async () => {
    await seedUsers(3);
    await publishUsers(3);
    await harness.sql`ALTER TABLE position RENAME TO unavailable_position`;
    let failure: unknown;
    try {
      await gate().verify({ batchSize: 2 });
    } catch (error) {
      failure = error;
    } finally {
      await harness.sql`ALTER TABLE unavailable_position RENAME TO position`;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(extractPostgresError(failure)?.code).toBe("42P01");
    const recovered = await gate().verify({ batchSize: 2 });
    expect(recovered.status).toBe("passed");
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
} from "@iam/contracts";
import {
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  users,
} from "@iam/db/schema";
import { createOrganizationResponsibilityResolver } from "@iam/organization-responsibility-resolution";
import { UserDocumentSourceIntegrityError } from "../../src/build/document-build.error";
import { createDocumentBuildRepository } from "../../src/build/document-build.repository";
import { createUserDocumentBuilder } from "../../src/build/user-document-builder";
import { createPostgresTestHarness } from "../support/postgres-test-harness";

const at = new Date("2026-08-20T12:00:00.000Z");

describe("User Document v4 build repository", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.sql`TRUNCATE role_assignment, role, client, organization_responsibility_assignment, employment, organization_closure, organization, position RESTART IDENTITY CASCADE`;
    await seedResponsibility(harness);
  });

  afterAll(async () => {
    await harness?.close();
  });

  test("loads the resolver identity with the current cross-tree target path", async () => {
    const resolveEffectiveRoles = mock(async () => new Map());
    const repository = createDocumentBuildRepository(
      harness.db,
      { resolveEffectiveRoles },
      createOrganizationResponsibilityResolver(harness.db),
    );

    const dataset = await repository.loadByUserIds([1], at);

    expect(dataset.responsibilityRows).toEqual([
      {
        employmentId: 100,
        typeCode: OrganizationResponsibilityTypeCode.Head,
        targetOrganization: {
          code: "TARGET",
          name: "TARGET",
          type: OrganizationType.Department,
          path: [
            {
              code: "TARGET-ROOT",
              name: "TARGET-ROOT",
              type: OrganizationType.Department,
              level: OrganizationLevel.One,
              distanceToTarget: 1,
            },
            { level: 2, distanceToTarget: 0, code: "TARGET", name: "TARGET", type: OrganizationType.Department },
          ],
        },
      },
    ]);
  });

  test("isolates an incomplete cross-tree responsibility path inside one source snapshot", async () => {
    await harness.db.insert(users).values({ id: 2, username: "user2", name: "User 2" });
    await harness.sql`UPDATE organization SET parent_id=-1 WHERE id=31`;

    const results = await harness.db.transaction(
      async (tx) => {
        const builder = createUserDocumentBuilder({
          db: tx,
          roleAssignmentResolver: { resolveEffectiveRoles: async () => new Map() },
          responsibilityResolver: createOrganizationResponsibilityResolver(tx),
          clock: { nowDate: () => at },
          config: { batchSize: 10 },
        });
        return await builder.buildManyResults([
          { userId: 1, sourceVersion: "9007199254740993" },
          { userId: 2, sourceVersion: "8" },
        ]);
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );

    expect(results).toMatchObject([
      { userId: 1, sourceVersion: "9007199254740993", status: "failed" },
      { userId: 2, sourceVersion: "8", status: "built", document: { document: { username: "user2" } } },
    ]);
    if (results[0]?.status !== "failed") throw new Error("Expected malformed responsibility target to fail");
    expect(results[0].error).toBeInstanceOf(UserDocumentSourceIntegrityError);
  });

  test("isolates a role with missing Client ownership from unrelated users", async () => {
    await harness.db.insert(users).values({ id: 2, username: "user2", name: "User 2" });
    const results = await harness.db.transaction(
      async (tx) => {
        const builder = createUserDocumentBuilder({
          db: tx,
          roleAssignmentResolver: {
            async resolveEffectiveRoles({ employmentIds }) {
              return new Map(employmentIds.map((id) => [id, [{ id: 999, roleCode: "missing-owner" }]]));
            },
          },
          responsibilityResolver: createOrganizationResponsibilityResolver(tx),
          clock: { nowDate: () => at },
          config: { batchSize: 10 },
        });
        return await builder.buildManyResults([
          { userId: 1, sourceVersion: "8" },
          { userId: 2, sourceVersion: "9" },
        ]);
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );

    expect(results).toMatchObject([
      { userId: 1, status: "failed" },
      { userId: 2, status: "built", document: { document: { username: "user2" } } },
    ]);
    if (results[0]?.status !== "failed") throw new Error("Expected missing role ownership to fail");
    expect(results[0].error).toBeInstanceOf(UserDocumentSourceIntegrityError);
  });
});

async function seedResponsibility(harness: Awaited<ReturnType<typeof createPostgresTestHarness>>) {
  await harness.db.insert(users).values({ id: 1, username: "user1", name: "User 1" });
  await harness.db.insert(positions).values({
    id: 10,
    posCode: "holder-position",
    posName: "Holder Position",
    status: PositionStatus.Enable,
  });
  await harness.db
    .insert(organizations)
    .values([
      organization({ id: 20, code: "HOLDER", path: "20", level: OrganizationLevel.One }),
      organization({ id: 30, code: "TARGET-ROOT", path: "30", level: OrganizationLevel.One }),
      organization({ id: 31, code: "TARGET", path: "30/31", level: OrganizationLevel.Two }),
    ]);
  await harness.db.insert(organizationClosures).values([
    { ancestorId: 20, descendantId: 20, depth: 0 },
    { ancestorId: 30, descendantId: 30, depth: 0 },
    { ancestorId: 31, descendantId: 31, depth: 0 },
    { ancestorId: 30, descendantId: 31, depth: 1 },
  ]);
  await harness.db.insert(employments).values({
    id: 100,
    userId: 1,
    posId: 10,
    orgId: 20,
    status: EmploymentStatus.Enable,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
  });
  await harness.db.insert(organizationResponsibilityAssignments).values({
    employmentId: 100,
    typeCode: OrganizationResponsibilityTypeCode.Head,
    targetOrganizationId: 31,
    status: OrganizationResponsibilityAssignmentStatus.Enable,
    startTime: new Date("2026-08-01T00:00:00.000Z"),
  });
}

function organization(input: { id: number; code: string; path: string; level: OrganizationLevel }) {
  return {
    id: input.id,
    orgCode: input.code,
    orgName: input.code,
    path: input.path,
    level: input.level,
    parentId: input.level === OrganizationLevel.Two ? 30 : -1,
    orgType: OrganizationType.Department,
    status: OrganizationStatus.Enable,
  };
}

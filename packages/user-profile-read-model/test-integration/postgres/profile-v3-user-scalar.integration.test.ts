import type { PostgresTestHarness } from "./postgres-test-harness";
import process from "node:process";
import {
  ApiErrorCode,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { relations } from "@iam/db/relations";
import { userProfiles, users } from "@iam/db/schema";
import { createOrganizationResponsibilityResolver } from "@iam/organization-responsibility-resolution";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createUserProfileRowRepository } from "../../src/user-profile-row.repository";
import {
  createV3UserProfileBuilder,
  createV3UserProfileQueryRepository,
  createV3UserProfileQueryService,
  V3_USER_PROFILE_SCHEMA_VERSION,
  V3UserProfileSearchRequestSchema,
} from "../../src/v3";
import { createPostgresTestHarness } from "./postgres-test-harness";

const now = new Date("2026-08-22T12:00:00.000Z");
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

describe("User Profile v3 User scalar tracer", () => {
  test("builds, persists, and queries the public User Search Document by subject identifier", async () => {
    await harness!.db.insert(users).values({
      id: 1,
      subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId: "wx-alice",
      userType: UserType.Formal,
      orderNum: 10,
      status: UserStatus.Pause,
    });
    const { builder, candidatePersistence, query } = createTracer();

    const candidate = await builder.buildOne({ userId: 1, sourceDirtyVersion: "1" });
    expect(candidate).not.toBeNull();
    expect(candidate?.profileSchemaVersion).toBe(V3_USER_PROFILE_SCHEMA_VERSION);
    expect(candidate?.searchDoc).toEqual({
      user: {
        subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
        username: "alice",
        name: "Alice",
        mobile: null,
        wxId: "wx-alice",
        userType: UserType.Formal,
        status: UserStatus.Pause,
      },
      employments: [],
    });
    await candidatePersistence.upsert(candidate!);

    const persisted = await harness!.db
      .select({ profileSchemaVersion: userProfiles.profileSchemaVersion })
      .from(userProfiles)
      .where(eq(userProfiles.userId, 1));
    const details = await query.search({
      filter: {
        field: "user.subjectIdentifier",
        op: "eq",
        value: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
      },
    });

    expect(persisted).toEqual([{ profileSchemaVersion: 3 }]);
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      id: 1,
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId: "wx-alice",
      userType: UserType.Formal,
      orderNum: 10,
      status: UserStatus.Pause,
      employments: [],
      roles: [],
      privileges: [],
    });
    expect(details[0]?.createTime).toBeInstanceOf(Date);
  });

  test("applies exact scalar eq, normalized in, and binary not semantics", async () => {
    await harness!.db.insert(users).values([
      user({
        id: 1,
        subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f881",
        username: "alice",
        name: "Alice",
        mobile: null,
        wxId: "wx-alice",
        userType: UserType.Formal,
        status: UserStatus.Pause,
      }),
      user({
        id: 2,
        subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f882",
        username: "bob",
        name: "Bob",
        mobile: "13800000002",
        wxId: null,
        userType: UserType.Informal,
        status: UserStatus.Enable,
      }),
      user({
        id: 3,
        subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f883",
        username: "carol",
        name: "Carol",
        mobile: "13900000003",
        wxId: "wx-carol",
        userType: UserType.External,
        status: UserStatus.Disable,
      }),
    ]);
    const { builder, candidatePersistence, query } = createTracer();
    const candidates = await builder.buildMany([
      { userId: 1, sourceDirtyVersion: "1" },
      { userId: 2, sourceDirtyVersion: "1" },
      { userId: 3, sourceDirtyVersion: "1" },
    ]);
    for (const candidate of candidates)
      await candidatePersistence.upsert(candidate);

    const normalized = V3UserProfileSearchRequestSchema.parse({
      filter: {
        field: "user.mobile",
        op: "in",
        value: ["13800000002", "13800000002"],
      },
    });
    const formalWithoutBobMobile = await query.search({
      filter: {
        and: [
          {
            field: "user.status",
            op: "in",
            value: [UserStatus.Pause, UserStatus.Pause, UserStatus.Enable],
          },
          { field: "user.userType", op: "eq", value: UserType.Formal },
          {
            not: {
              field: "user.mobile",
              op: "eq",
              value: "13800000002",
            },
          },
        ],
      },
    });
    const aliceOrBob = await query.search({
      filter: {
        or: [
          { field: "user.name", op: "eq", value: "Alice" },
          { field: "user.username", op: "eq", value: "bob" },
        ],
      },
    });
    const wrongCase = await query.search({
      filter: { field: "user.name", op: "eq", value: "alice" },
    });
    const nullableIn = await query.search(normalized);

    expect(normalized.filter).toEqual({
      field: "user.mobile",
      op: "in",
      value: ["13800000002"],
    });
    expect(formalWithoutBobMobile.map(detail => detail.id)).toEqual([1]);
    expect(aliceOrBob.map(detail => detail.id)).toEqual([1, 2]);
    expect(wrongCase).toEqual([]);
    expect(nullableIn.map(detail => detail.id)).toEqual([2]);
  });

  test("preserves a legal 255-character wxId while enforcing the 128-character query budget", async () => {
    const wxId = "w".repeat(255);
    await harness!.db.insert(users).values(user({
      id: 1,
      subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f881",
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId,
      userType: UserType.Formal,
      status: UserStatus.Enable,
    }));
    const { builder, candidatePersistence, query } = createTracer();

    const candidate = await builder.buildOne({ userId: 1, sourceDirtyVersion: "1" });
    expect(candidate?.searchDoc.user.wxId).toBe(wxId);
    await candidatePersistence.upsert(candidate!);
    const error = await query.search({
      filter: { field: "user.wxId", op: "eq", value: "w".repeat(129) },
    }).catch(error => error);

    expect(error).toMatchObject({
      code: ApiErrorCode.ValidationFailed,
      httpStatus: 422,
      name: "V3UserProfileFilterValidationError",
    });
  });

  test("strictly rejects legacy, empty, unknown, and wrongly typed expressions", async () => {
    const { query } = createTracer();
    const invalidRequests = [
      { filter: { all: [] } },
      { filter: { any: [] } },
      { filter: { nested: "user", where: { field: "username", op: "eq", value: "alice" } } },
      { filter: { and: [] } },
      { filter: { or: [] } },
      { filter: { field: "user.id", op: "eq", value: 1 } },
      { filter: { field: "user.username", op: "contains", value: "alice" } },
      { filter: { field: "user.username", op: "eq", value: 123 } },
      { filter: { field: "user.status", op: "eq", value: "1" } },
      { filter: { field: "user.mobile", op: "eq", value: null } },
      { filter: { field: "user.userType", op: "in", value: [] } },
      { filter: { field: "user.name", op: "eq", value: "Alice", unexpected: true } },
      { filter: nestedNot(9) },
      {
        filter: {
          and: Array.from({ length: 17 }, () => ({
            field: "user.username",
            op: "eq",
            value: "alice",
          })),
        },
      },
      { filter: filterWithNodeCount65() },
      { filter: {} },
    ];

    for (const request of invalidRequests) {
      const error = await query.search(request).catch(error => error);
      expect(error).toMatchObject({
        code: ApiErrorCode.ValidationFailed,
        httpStatus: 422,
        name: "V3UserProfileFilterValidationError",
      });
    }
  });

  test("accepts the exact depth, node, child, distinct-value, and string budget boundaries", async () => {
    const { query } = createTracer();
    const boundaryFilters = [
      nestedNot(8),
      filterWithNodeCount64(),
      {
        and: Array.from({ length: 16 }, () => ({
          field: "user.username",
          op: "eq",
          value: "alice",
        })),
      },
      {
        field: "user.username",
        op: "in",
        value: Array.from({ length: 50 }, (_, index) => `user-${index}`),
      },
      {
        field: "user.name",
        op: "eq",
        value: "n".repeat(128),
      },
      {
        field: "user.username",
        op: "in",
        value: Array.from({ length: 500 }).fill("alice"),
      },
    ];

    for (const filter of boundaryFilters)
      expect(await query.search({ filter })).toEqual([]);
  });

  test("fails the base query when a matched persisted Search Document is malformed", async () => {
    await harness!.db.insert(users).values(user({
      id: 1,
      subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f881",
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      status: UserStatus.Enable,
    }));
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceDirtyVersion: "1" });
    await candidatePersistence.upsert(candidate!);
    await harness!.db
      .update(userProfiles)
      .set({
        searchDoc: {
          user: candidate!.searchDoc.user,
        },
      })
      .where(eq(userProfiles.userId, 1));

    const error = await query.searchBase({
      filter: {
        field: "user.username",
        op: "eq",
        value: "alice",
      },
    }).catch(error => error);
    expect(error).toMatchObject({
      code: ApiErrorCode.UserSearchUnavailable,
      httpStatus: 503,
      name: "V3UserProfileDocumentIntegrityError",
    });
  });

  test("returns typed base facts without reading a malformed persisted Detail", async () => {
    await harness!.db.insert(users).values(user({
      id: 1,
      subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f881",
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      status: UserStatus.Enable,
    }));
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceDirtyVersion: "1" });
    await candidatePersistence.upsert(candidate!);
    await harness!.db
      .update(userProfiles)
      .set({
        detail: { leaked: "not-a-profile-detail" },
        name: "Typed Bob",
        subjectIdentifier: "87b69425-6d95-4a36-93c8-95327869318e",
        username: "typed-bob",
      })
      .where(eq(userProfiles.userId, 1));

    const filter = {
      filter: { field: "user.username", op: "eq", value: "alice" },
    } as const;
    const bases = await query.searchBase(filter);
    const error = await query.search(filter).catch(error => error);

    expect(bases).toEqual([{
      mobile: null,
      name: "Typed Bob",
      subjectIdentifier: "87b69425-6d95-4a36-93c8-95327869318e",
      username: "typed-bob",
      wxId: null,
    }]);
    expect(error).toMatchObject({
      code: ApiErrorCode.UserSearchUnavailable,
      httpStatus: 503,
      name: "V3UserProfileDocumentIntegrityError",
    });
  });

  test("maps a real PostgreSQL statement timeout to one sanitized unavailable error", async () => {
    await harness!.db.insert(users).values(user({
      id: 1,
      subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f880",
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      status: UserStatus.Enable,
    }));
    const { builder, candidatePersistence } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceDirtyVersion: "1" });
    await candidatePersistence.upsert(candidate!);

    const schemaRows = await harness!.sql<{ schemaName: string }[]>`
      SELECT current_schema() AS "schemaName"
    `;
    const schemaName = schemaRows[0]?.schemaName;
    if (schemaName === undefined)
      throw new Error("PostgreSQL test schema is unavailable");
    const timeoutSql = postgres(
      process.env.IAM_USER_PROFILE_TEST_DATABASE_URL!,
      {
        connection: {
          application_name: "iam-user-profile-v3-timeout-test",
          search_path: schemaName,
          statement_timeout: 50,
        },
        max: 1,
      },
    );
    const timeoutQuery = createV3UserProfileQueryService({
      profileRepository: createV3UserProfileQueryRepository(
        drizzle({ client: timeoutSql, relations }),
      ),
    });
    let releaseLock!: () => void;
    let reportLocked!: () => void;
    const releaseGate = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      reportLocked = resolve;
    });
    const tableLock = harness!.sql.begin(async (tx) => {
      await tx.unsafe("LOCK TABLE user_profile IN ACCESS EXCLUSIVE MODE");
      reportLocked();
      await releaseGate;
    });

    await locked;
    try {
      const error = await timeoutQuery.search({
        filter: {
          field: "user.username",
          op: "eq",
          value: "alice",
        },
      }).catch(error => error);

      expect(error).toMatchObject({
        code: ApiErrorCode.UserSearchUnavailable,
        httpStatus: 503,
        name: "V3UserProfileSearchUnavailableError",
        message: "用户搜索暂时不可用",
      });
      expect(error).not.toHaveProperty("cause");
      expect(JSON.stringify(error)).not.toContain("statement timeout");
    }
    finally {
      releaseLock();
      await tableLock;
      await timeoutSql.end();
    }
  });

  test("returns 500 profiles in user ID order and rejects the 501st match without a partial result", async () => {
    await harness!.db.insert(users).values(Array.from({ length: 501 }, (_, index) => user({
      id: index + 1,
      subjectIdentifier: `00000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
      username: `user-${index + 1}`,
      name: `User ${index + 1}`,
      mobile: null,
      wxId: null,
      userType: index === 500 ? UserType.External : UserType.Formal,
      status: UserStatus.Enable,
    })));
    const { builder, candidatePersistence, query } = createTracer();
    const candidates = await builder.buildMany(Array.from({ length: 501 }, (_, index) => ({
      userId: index + 1,
      sourceDirtyVersion: "1",
    })));
    for (const candidate of candidates.reverse())
      await candidatePersistence.upsert(candidate);

    const exactLimit = await query.search({
      filter: { field: "user.userType", op: "eq", value: UserType.Formal },
    });
    expect(exactLimit.map(detail => detail.id)).toEqual(
      Array.from({ length: 500 }, (_, index) => index + 1),
    );

    const error = await query.search({
      filter: {
        field: "user.userType",
        op: "in",
        value: [UserType.Formal, UserType.External],
      },
    }).catch(error => error);

    expect(error).toMatchObject({
      code: ApiErrorCode.UserSearchResultTooLarge,
      httpStatus: 422,
      name: "V3UserProfileSearchResultTooLargeError",
    });
  }, 15_000);
});

function createTracer() {
  const builder = createV3UserProfileBuilder({
    db: harness!.db,
    roleAssignmentResolver: createRoleAssignmentResolver(harness!.db),
    responsibilityResolver: createOrganizationResponsibilityResolver(harness!.db),
    clock: { nowDate: () => now },
    config: { batchSize: 100 },
  });
  return {
    builder,
    candidatePersistence: createUserProfileRowRepository(harness!.db),
    query: createV3UserProfileQueryService({
      profileRepository: createV3UserProfileQueryRepository(harness!.db),
    }),
  };
}

function user(input: {
  id: number;
  subjectIdentifier: string;
  username: string;
  name: string;
  mobile: string | null;
  wxId: string | null;
  userType: UserType;
  status: UserStatus;
}) {
  return {
    ...input,
    orderNum: input.id * 10,
  };
}

function nestedNot(depth: number): unknown {
  if (depth === 1)
    return { field: "user.username", op: "eq", value: "alice" };
  return { not: nestedNot(depth - 1) };
}

function filterWithNodeCount65() {
  return {
    and: Array.from({ length: 4 }, () => ({
      and: Array.from({ length: 15 }, () => ({
        field: "user.username",
        op: "eq",
        value: "alice",
      })),
    })),
  };
}

function filterWithNodeCount64() {
  return {
    and: [15, 15, 15, 14].map(childCount => ({
      and: Array.from({ length: childCount }, () => ({
        field: "user.username",
        op: "eq",
        value: "alice",
      })),
    })),
  };
}

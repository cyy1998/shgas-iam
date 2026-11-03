import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import process from "node:process";
import { ApiErrorCode, UserDocumentSchema, UserStatus, UserType } from "@iam/contracts";
import { relations } from "@iam/db/relations";
import { userDocuments, users } from "@iam/db/schema";
import { createFilterEngine, searchCollection, searchObject, searchScalar } from "@iam/filter-engine";
import { createOrganizationResponsibilityResolver } from "@iam/organization-responsibility-resolution";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import {
  createUserDocumentSearchRepository,
  createUserDocumentSearchService,
  USER_DOCUMENT_SCHEMA_VERSION,
  UserDocumentSearchRequestSchema,
} from "../../src/index";
import { createUserDocumentRowRepository } from "../../src/publication/user-document-row.repository";
import { createUserDocumentBuilder } from "../../src/worker";
import type { PostgresTestHarness } from "../support/postgres-test-harness";
import { createPostgresTestHarness } from "../support/postgres-test-harness";

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

test("the shared Filter engine compiles caller-defined paths against each supplied JSONB expression", async () => {
  const organizationFields = {
    identifier: searchScalar(z.string(), z.string()),
    chain: searchCollection({ identifier: searchScalar(z.string(), z.string()) }),
  };
  const engine = createFilterEngine(
    searchObject({
      record: searchObject(organizationFields),
      entries: searchCollection({
        code: searchScalar(z.string(), z.string()),
        active: searchScalar(z.boolean(), z.boolean()),
      }),
    }),
  );
  const first = {
    record: { identifier: "child", chain: [{ identifier: "root" }, { identifier: "child" }] },
    entries: [
      { code: "A", active: false },
      { code: "B", active: true },
    ],
  };
  const second = {
    record: { identifier: "root", chain: [{ identifier: "root" }] },
    entries: [{ code: "A", active: true }],
  };
  const filter = engine.filterSchema.parse({
    and: [
      { exists: { path: "record.chain", where: { field: "identifier", op: "eq", value: "root" } } },
      {
        exists: {
          path: "entries",
          where: {
            and: [
              { field: "code", op: "eq", value: "A" },
              { field: "active", op: "eq", value: true },
            ],
          },
        },
      },
    ],
  });
  const rows = await harness!.db.execute(sql`SELECT
    ${engine.compile(filter, sql`${JSON.stringify(first)}::jsonb`)} AS first,
    ${engine.compile(filter, sql`${JSON.stringify(second)}::jsonb`)} AS second
  `);
  expect([...rows]).toEqual([{ first: false, second: true }]);
});

describe("User Document v4 User scalar tracer", () => {
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

    const candidate = await builder.buildOne({ userId: 1, sourceVersion: "1" });
    expect(candidate).not.toBeNull();
    expect(candidate?.schemaVersion).toBe(USER_DOCUMENT_SCHEMA_VERSION);
    expect(candidate?.document).toEqual({
      subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId: "wx-alice",
      userType: UserType.Formal,
      status: UserStatus.Pause,
      employments: [],
    });
    await candidatePersistence.upsert(candidate!);

    const persisted = await harness!.db
      .select({ schemaVersion: userDocuments.schemaVersion })
      .from(userDocuments)
      .where(eq(userDocuments.userId, 1));
    const { items: bases } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: {
          field: "subjectIdentifier",
          op: "eq",
          value: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
        },
      },
      "internal",
    );

    expect(persisted).toEqual([{ schemaVersion: USER_DOCUMENT_SCHEMA_VERSION }]);
    expect(bases).toEqual([{ ...candidate!.document!, employments: [] }]);
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
      { userId: 1, sourceVersion: "1" },
      { userId: 2, sourceVersion: "1" },
      { userId: 3, sourceVersion: "1" },
    ]);
    for (const candidate of candidates) await candidatePersistence.upsert(candidate);

    const normalized = UserDocumentSearchRequestSchema.parse({
      filter: {
        field: "mobile",
        op: "in",
        value: ["13800000002", "13800000002"],
      },
    });
    const { items: formalWithoutBobMobile } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: {
          and: [
            {
              field: "status",
              op: "in",
              value: [UserStatus.Pause, UserStatus.Pause, UserStatus.Enable],
            },
            { field: "userType", op: "eq", value: UserType.Formal },
            {
              not: {
                field: "mobile",
                op: "eq",
                value: "13800000002",
              },
            },
          ],
        },
      },
      "internal",
    );
    const { items: aliceOrBob } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: {
          or: [
            { field: "name", op: "eq", value: "Alice" },
            { field: "username", op: "eq", value: "bob" },
          ],
        },
      },
      "internal",
    );
    const { items: wrongCase } = await query.searchDocuments(
      { select: Object.keys(UserDocumentSchema.shape), filter: { field: "name", op: "eq", value: "alice" } },
      "internal",
    );
    const { items: nullableIn } = await query.searchDocuments(
      { ...normalized, select: Object.keys(UserDocumentSchema.shape) },
      "internal",
    );

    expect(normalized.filter).toEqual({
      field: "mobile",
      op: "in",
      value: ["13800000002"],
    });
    expect(formalWithoutBobMobile.map((base) => base.username)).toEqual(["alice"]);
    expect(aliceOrBob.map((base) => base.username)).toEqual(["alice", "bob"]);
    expect(wrongCase).toEqual([]);
    expect(nullableIn.map((base) => base.username)).toEqual(["bob"]);
  });

  test("preserves a legal 255-character wxId while enforcing the 128-character query budget", async () => {
    const wxId = "w".repeat(255);
    await harness!.db.insert(users).values(
      user({
        id: 1,
        subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f881",
        username: "alice",
        name: "Alice",
        mobile: null,
        wxId,
        userType: UserType.Formal,
        status: UserStatus.Enable,
      }),
    );
    const { builder, candidatePersistence, query } = createTracer();

    const candidate = await builder.buildOne({ userId: 1, sourceVersion: "1" });
    expect(candidate?.document?.wxId).toBe(wxId);
    await candidatePersistence.upsert(candidate!);
    const error = await query
      .searchDocuments(
        { select: Object.keys(UserDocumentSchema.shape), filter: { field: "wxId", op: "eq", value: "w".repeat(129) } },
        "internal",
      )
      .catch((error) => error);

    expect(error).toMatchObject({
      code: ApiErrorCode.ValidationFailed,
      httpStatus: 422,
      name: "UserDocumentFilterValidationError",
    });
  });

  test("accepts the exact depth, node, child, distinct-value, and string budget boundaries", async () => {
    const { query } = createTracer();
    const boundaryFilters = [
      nestedNot(8),
      filterWithNodeCount64(),
      {
        and: Array.from({ length: 16 }, () => ({
          field: "username",
          op: "eq",
          value: "alice",
        })),
      },
      {
        field: "username",
        op: "in",
        value: Array.from({ length: 50 }, (_, index) => `user-${index}`),
      },
      {
        field: "name",
        op: "eq",
        value: "n".repeat(128),
      },
      {
        field: "username",
        op: "in",
        value: Array.from({ length: 500 }).fill("alice"),
      },
    ];

    for (const filter of boundaryFilters) {
      const { items: bases } = await query.searchDocuments(
        { select: Object.keys(UserDocumentSchema.shape), filter },
        "internal",
      );
      expect(bases).toEqual([]);
    }
  });

  test("fails the base query when a matched persisted Search Document is malformed", async () => {
    await harness!.db.insert(users).values(
      user({
        id: 1,
        subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f881",
        username: "alice",
        name: "Alice",
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status: UserStatus.Enable,
      }),
    );
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceVersion: "1" });
    await candidatePersistence.upsert(candidate!);
    const { employments: _employments, ...malformedDocument } = candidate!.document!;
    await harness!.db
      .update(userDocuments)
      .set({
        document: malformedDocument,
      })
      .where(eq(userDocuments.userId, 1));

    const error = await query
      .searchDocuments(
        {
          select: Object.keys(UserDocumentSchema.shape),
          filter: {
            field: "username",
            op: "eq",
            value: "alice",
          },
        },
        "internal",
      )
      .catch((error) => error);
    expect(error).toMatchObject({
      code: ApiErrorCode.UserSearchUnavailable,
      httpStatus: 503,
      name: "UserDocumentDocumentIntegrityError",
    });
  });

  test("maps a real PostgreSQL statement timeout to one sanitized unavailable error", async () => {
    await harness!.db.insert(users).values(
      user({
        id: 1,
        subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f880",
        username: "alice",
        name: "Alice",
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status: UserStatus.Enable,
      }),
    );
    const { builder, candidatePersistence } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceVersion: "1" });
    await candidatePersistence.upsert(candidate!);

    const schemaRows = await harness!.sql<{ schemaName: string }[]>`
      SELECT current_schema() AS "schemaName"
    `;
    const schemaName = schemaRows[0]?.schemaName;
    if (schemaName === undefined) throw new Error("PostgreSQL test schema is unavailable");
    const timeoutSql = postgres(process.env.IAM_USER_DOCUMENT_TEST_DATABASE_URL!, {
      connection: {
        application_name: "iam-user-document-timeout-test",
        search_path: schemaName,
        statement_timeout: 50,
      },
      max: 1,
    });
    const timeoutQuery = createUserDocumentSearchService({
      documentRepository: createUserDocumentSearchRepository(drizzle({ client: timeoutSql, relations })),
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
      await tx.unsafe("LOCK TABLE user_document IN ACCESS EXCLUSIVE MODE");
      reportLocked();
      await releaseGate;
    });

    await locked;
    try {
      const error = await timeoutQuery
        .searchDocuments(
          {
            select: Object.keys(UserDocumentSchema.shape),
            filter: {
              field: "username",
              op: "eq",
              value: "alice",
            },
          },
          "internal",
        )
        .catch((error) => error);

      expect(error).toMatchObject({
        code: ApiErrorCode.UserSearchUnavailable,
        httpStatus: 503,
        name: "UserDocumentSearchUnavailableError",
        message: "用户搜索暂时不可用",
      });
      expect(error).not.toHaveProperty("cause");
      expect(JSON.stringify(error)).not.toContain("statement timeout");
    } finally {
      releaseLock();
      await tableLock;
      await timeoutSql.end();
    }
  });

  test("returns 500 profiles in user ID order and rejects the 501st match without a partial result", async () => {
    await harness!.db.insert(users).values(
      Array.from({ length: 501 }, (_, index) =>
        user({
          id: index + 1,
          subjectIdentifier: `00000000-0000-4000-8000-${(index + 1).toString().padStart(12, "0")}`,
          username: `user-${index + 1}`,
          name: `User ${index + 1}`,
          mobile: null,
          wxId: null,
          userType: index === 500 ? UserType.External : UserType.Formal,
          status: UserStatus.Enable,
        }),
      ),
    );
    const { builder, candidatePersistence, query } = createTracer();
    const candidates = await builder.buildMany(
      Array.from({ length: 501 }, (_, index) => ({
        userId: index + 1,
        sourceVersion: "1",
      })),
    );
    for (const candidate of candidates.reverse()) await candidatePersistence.upsert(candidate);

    const { items: exactLimit } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: { field: "userType", op: "eq", value: UserType.Formal },
      },
      "internal",
    );
    expect(exactLimit.map((base) => base.username)).toEqual(
      Array.from({ length: 500 }, (_, index) => `user-${index + 1}`),
    );

    const error = await query
      .searchDocuments(
        {
          select: Object.keys(UserDocumentSchema.shape),
          filter: {
            field: "userType",
            op: "in",
            value: [UserType.Formal, UserType.External],
          },
        },
        "internal",
      )
      .catch((error) => error);

    expect(error).toMatchObject({
      code: ApiErrorCode.UserSearchResultTooLarge,
      httpStatus: 422,
      name: "UserDocumentSearchResultTooLargeError",
    });
  }, 15_000);
});

function createTracer() {
  const builder = createUserDocumentBuilder({
    db: harness!.db,
    roleAssignmentResolver: createRoleAssignmentResolver(harness!.db),
    responsibilityResolver: createOrganizationResponsibilityResolver(harness!.db),
    clock: { nowDate: () => now },
    config: { batchSize: 100 },
  });
  return {
    builder,
    candidatePersistence: createUserDocumentRowRepository(harness!.db),
    query: createUserDocumentSearchService({
      documentRepository: createUserDocumentSearchRepository(harness!.db),
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
  if (depth === 1) return { field: "username", op: "eq", value: "alice" };
  return { not: nestedNot(depth - 1) };
}

function filterWithNodeCount64() {
  return {
    and: [15, 15, 15, 14].map((childCount) => ({
      and: Array.from({ length: childCount }, () => ({
        field: "username",
        op: "eq",
        value: "alice",
      })),
    })),
  };
}

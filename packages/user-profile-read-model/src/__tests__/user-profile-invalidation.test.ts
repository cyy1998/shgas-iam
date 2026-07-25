import { RoleAssignmentTargetType } from "@iam/contracts";
import { employments, organizationClosures, roleAssignments } from "@iam/db/schema";
import { describe, expect, mock, test } from "bun:test";
import { createUserProfileInvalidation, createUserProfileJobProducer } from "../producer";

const now = new Date("2026-07-25T08:00:00.000Z");

type AffectedUserQuery = "employment" | "organization" | "position" | "role";

interface FixtureOptions {
  affectedUserError?: AffectedUserQuery;
  affectedUsers?: Partial<Record<AffectedUserQuery, readonly number[]>>;
  enqueueError?: Error;
  persistError?: Error;
}

function createFixture(options: FixtureOptions = {}) {
  const persistedBatches: Array<Array<{
    userId: number;
    reasonCodes: string[];
    dirtyAt: Date;
  }>> = [];
  const dirtyVersions = new Map<number, number>();
  const db = {
    select: mock(() => {
      const queriedTables = new Set<unknown>();
      const query = {
        from: mock((table: unknown) => {
          queriedTables.add(table);
          return query;
        }),
        innerJoin: mock((table: unknown) => {
          queriedTables.add(table);
          return query;
        }),
        where: mock(async (condition: unknown) => {
          const affectedUserQuery = classifyAffectedUserQuery(queriedTables, condition);
          if (options.affectedUserError === affectedUserQuery)
            throw new Error("affected-user resolution failed");

          return (options.affectedUsers?.[affectedUserQuery] ?? []).map(userId => ({ userId }));
        }),
      };
      return query;
    }),
    insert: mock(() => ({
      values: (values: Array<{ userId: number; reasonCodes: string[]; dirtyAt: Date }>) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            if (options.persistError !== undefined)
              throw options.persistError;

            persistedBatches.push(values);
            return values.map((value) => {
              const dirtyVersion = (dirtyVersions.get(value.userId) ?? 0) + 1;
              dirtyVersions.set(value.userId, dirtyVersion);
              return {
                ...value,
                dirtyVersion: String(dirtyVersion),
              };
            });
          },
        }),
      }),
    })),
  };
  const queuedBatches: unknown[][] = [];
  const queue = {
    addBulk: mock(async (jobs: Array<{ opts: { jobId: string } }>) => {
      queuedBatches.push(jobs);
      if (options.enqueueError !== undefined)
        throw options.enqueueError;

      return jobs.map(job => ({ id: job.opts.jobId }));
    }),
  };
  const afterCommitTasks: Array<() => Promise<void> | void> = [];
  const lifecycle = {
    afterCommit: {
      required: mock((_name: string, _callback: () => Promise<void> | void) => undefined),
      bestEffort: mock((_name: string, callback: () => Promise<void> | void) => {
        afterCommitTasks.push(callback);
      }),
    },
    observability: {
      requestId: "req-7",
      traceId: "trace-7",
    },
  };
  const invalidation = createUserProfileInvalidation({
    db: db as never,
    jobProducer: createUserProfileJobProducer(queue),
    lifecycle,
    clock: {
      nowDate: () => now,
    },
  });

  return {
    afterCommitTasks,
    invalidation,
    persistedBatches,
    queuedBatches,
  };
}

function classifyAffectedUserQuery(queriedTables: ReadonlySet<unknown>, condition: unknown): AffectedUserQuery {
  if (queriedTables.has(roleAssignments))
    return "role";
  if (queriedTables.has(organizationClosures))
    return "organization";
  if (queriedTables.has(employments) && sqlReferencesColumn(condition, employments.posId))
    return "position";
  if (queriedTables.has(employments) && sqlReferencesColumn(condition, employments.id))
    return "employment";
  throw new Error("Unexpected affected-user query");
}

function sqlReferencesColumn(expression: unknown, column: unknown): boolean {
  if (expression === column)
    return true;
  if (Array.isArray(expression))
    return expression.some(item => sqlReferencesColumn(item, column));
  if (expression === null || typeof expression !== "object")
    return false;

  const queryChunks = (expression as { queryChunks?: readonly unknown[] }).queryChunks;
  return queryChunks?.some(chunk => sqlReferencesColumn(chunk, column)) ?? false;
}

describe("UserProfileInvalidation", () => {
  test("records a user change and wakes its versioned rebuild after commit", async () => {
    const fixture = createFixture();

    await expect(fixture.invalidation.recordChanges([
      { kind: "user", userId: 7 },
    ])).resolves.toBeUndefined();

    expect(fixture.persistedBatches.map(batch => batch.map(row => ({
      userId: row.userId,
      reasonCodes: row.reasonCodes,
      dirtyAt: row.dirtyAt,
    })))).toEqual([[
      {
        userId: 7,
        reasonCodes: ["user-updated"],
        dirtyAt: now,
      },
    ]]);
    expect(fixture.queuedBatches).toEqual([]);

    await fixture.afterCommitTasks[0]!();

    expect(fixture.queuedBatches).toEqual([[
      {
        name: "rebuild-user-profile",
        data: {
          userId: 7,
          dirtyVersion: "1",
          reason: "user-updated",
          requestedAt: "2026-07-25T08:00:00.000Z",
          requestId: "req-7",
          traceId: "trace-7",
        },
        opts: {
          jobId: "rebuild-user-profile|7|1",
        },
      },
    ]]);
  });

  test("records an employment change with its canonical reason", async () => {
    const fixture = createFixture();

    await fixture.invalidation.recordChanges([
      { kind: "employment", userId: 12 },
    ]);
    await fixture.afterCommitTasks[0]!();

    expect(fixture.persistedBatches.map(batch => batch.map(row => ({
      userId: row.userId,
      reasonCodes: row.reasonCodes,
    })))).toEqual([[
      {
        userId: 12,
        reasonCodes: ["employment-updated"],
      },
    ]]);
    expect(fixture.queuedBatches).toEqual([[
      {
        name: "rebuild-user-profile",
        data: {
          userId: 12,
          dirtyVersion: "1",
          reason: "employment-updated",
          requestedAt: "2026-07-25T08:00:00.000Z",
          requestId: "req-7",
          traceId: "trace-7",
        },
        opts: {
          jobId: "rebuild-user-profile|12|1",
        },
      },
    ]]);
  });

  test("records an organization change for every affected user in stable order", async () => {
    const fixture = createFixture({
      affectedUsers: {
        organization: [9, 3, 9],
      },
    });

    await fixture.invalidation.recordChanges([
      { kind: "organization", organizationId: 40 },
    ]);

    expect(fixture.persistedBatches.map(batch => batch.map(row => ({
      userId: row.userId,
      reasonCodes: row.reasonCodes,
    })))).toEqual([[
      {
        userId: 3,
        reasonCodes: ["organization-updated"],
      },
      {
        userId: 9,
        reasonCodes: ["organization-updated"],
      },
    ]]);
  });

  test("records a position change with its canonical reason", async () => {
    const fixture = createFixture({
      affectedUsers: {
        position: [12, 4],
      },
    });

    await fixture.invalidation.recordChanges([
      { kind: "position", positionId: 50 },
    ]);

    expect(fixture.persistedBatches.map(batch => batch.map(row => ({
      userId: row.userId,
      reasonCodes: row.reasonCodes,
    })))).toEqual([[
      {
        userId: 4,
        reasonCodes: ["position-updated"],
      },
      {
        userId: 12,
        reasonCodes: ["position-updated"],
      },
    ]]);
  });

  test("records a role change for the resolver's conservative affected users", async () => {
    const fixture = createFixture({
      affectedUsers: {
        role: [8, 2, 5, 3],
      },
    });

    await fixture.invalidation.recordChanges([
      { kind: "role", roleId: 60 },
    ]);

    expect(fixture.persistedBatches.map(batch => batch.map(row => ({
      userId: row.userId,
      reasonCodes: row.reasonCodes,
    })))).toEqual([[
      {
        userId: 2,
        reasonCodes: ["role-updated"],
      },
      {
        userId: 3,
        reasonCodes: ["role-updated"],
      },
      {
        userId: 5,
        reasonCodes: ["role-updated"],
      },
      {
        userId: 8,
        reasonCodes: ["role-updated"],
      },
    ]]);
  });

  test("records an organization-target role-assignment change with the Role reason", async () => {
    const fixture = createFixture({
      affectedUsers: {
        organization: [14, 6],
      },
    });

    await fixture.invalidation.recordChanges([
      {
        kind: "role-assignment",
        targetType: RoleAssignmentTargetType.Organization,
        targetId: 70,
      },
    ]);

    expect(fixture.persistedBatches.map(batch => batch.map(row => ({
      userId: row.userId,
      reasonCodes: row.reasonCodes,
    })))).toEqual([[
      {
        userId: 6,
        reasonCodes: ["role-updated"],
      },
      {
        userId: 14,
        reasonCodes: ["role-updated"],
      },
    ]]);
  });

  test("records a position-target role-assignment change with the Role reason", async () => {
    const fixture = createFixture({
      affectedUsers: {
        position: [15, 7],
      },
    });

    await fixture.invalidation.recordChanges([
      {
        kind: "role-assignment",
        targetType: RoleAssignmentTargetType.Position,
        targetId: 80,
      },
    ]);

    expect(fixture.persistedBatches.map(batch => batch.map(row => ({
      userId: row.userId,
      reasonCodes: row.reasonCodes,
    })))).toEqual([[
      {
        userId: 7,
        reasonCodes: ["role-updated"],
      },
      {
        userId: 15,
        reasonCodes: ["role-updated"],
      },
    ]]);
  });

  test("records an employment-target role-assignment change with the Role reason", async () => {
    const fixture = createFixture({
      affectedUsers: {
        employment: [16],
      },
    });

    await fixture.invalidation.recordChanges([
      {
        kind: "role-assignment",
        targetType: RoleAssignmentTargetType.Employment,
        targetId: 90,
      },
    ]);

    expect(fixture.persistedBatches.map(batch => batch.map(row => ({
      userId: row.userId,
      reasonCodes: row.reasonCodes,
    })))).toEqual([[
      {
        userId: 16,
        reasonCodes: ["role-updated"],
      },
    ]]);
  });

  test("merges duplicate changes for one user into one canonical dirty fact", async () => {
    const fixture = createFixture();

    await fixture.invalidation.recordChanges([
      { kind: "employment", userId: 9 },
      { kind: "user", userId: 9 },
      { kind: "employment", userId: 9 },
    ]);
    await fixture.afterCommitTasks[0]!();

    expect(fixture.persistedBatches.map(batch => batch.map(row => ({
      userId: row.userId,
      reasonCodes: row.reasonCodes,
    })))).toEqual([[
      {
        userId: 9,
        reasonCodes: ["user-updated", "employment-updated"],
      },
    ]]);
    expect(fixture.queuedBatches).toEqual([[
      {
        name: "rebuild-user-profile",
        data: {
          userId: 9,
          dirtyVersion: "1",
          reason: "user-updated",
          requestedAt: "2026-07-25T08:00:00.000Z",
          requestId: "req-7",
          traceId: "trace-7",
        },
        opts: {
          jobId: "rebuild-user-profile|9|1",
        },
      },
    ]]);
  });

  test("merges overlapping direct, scope, and assignment changes by user and canonical reason", async () => {
    const fixture = createFixture({
      affectedUsers: {
        organization: [9, 2, 9],
        position: [9, 4],
        role: [9, 5],
        employment: [9],
      },
    });

    await fixture.invalidation.recordChanges([
      { kind: "user", userId: 9 },
      { kind: "organization", organizationId: 40 },
      { kind: "position", positionId: 50 },
      { kind: "role", roleId: 60 },
      {
        kind: "role-assignment",
        targetType: RoleAssignmentTargetType.Organization,
        targetId: 70,
      },
      {
        kind: "role-assignment",
        targetType: RoleAssignmentTargetType.Position,
        targetId: 80,
      },
      {
        kind: "role-assignment",
        targetType: RoleAssignmentTargetType.Employment,
        targetId: 90,
      },
    ]);

    expect(fixture.persistedBatches.map(batch => batch.map(row => ({
      userId: row.userId,
      reasonCodes: row.reasonCodes,
    })))).toEqual([[
      {
        userId: 2,
        reasonCodes: ["organization-updated", "role-updated"],
      },
      {
        userId: 4,
        reasonCodes: ["position-updated", "role-updated"],
      },
      {
        userId: 5,
        reasonCodes: ["role-updated"],
      },
      {
        userId: 9,
        reasonCodes: ["user-updated", "organization-updated", "position-updated", "role-updated"],
      },
    ]]);

    await fixture.afterCommitTasks[0]!();

    expect(fixture.queuedBatches.map(batch => batch.map((job: any) => ({
      userId: job.data.userId,
      reason: job.data.reason,
    })))).toEqual([[
      { userId: 2, reason: "organization-updated" },
      { userId: 4, reason: "position-updated" },
      { userId: 5, reason: "role-updated" },
      { userId: 9, reason: "user-updated" },
    ]]);
  });

  test("ignores empty changes and invalid direct user IDs", async () => {
    const fixture = createFixture();

    await fixture.invalidation.recordChanges([]);
    await fixture.invalidation.recordChanges([
      { kind: "user", userId: 0 },
      { kind: "employment", userId: -2 },
      { kind: "user", userId: 1.5 },
      { kind: "employment", userId: Number.NaN },
      { kind: "user", userId: Number.POSITIVE_INFINITY },
    ]);

    expect(fixture.persistedBatches).toEqual([]);
    expect(fixture.afterCommitTasks).toEqual([]);
    expect(fixture.queuedBatches).toEqual([]);
  });

  test("ignores positive integers that cannot identify a user safely", async () => {
    const fixture = createFixture();

    await fixture.invalidation.recordChanges([
      { kind: "user", userId: Number.MAX_SAFE_INTEGER + 1 },
    ]);

    expect({
      persistedBatches: fixture.persistedBatches,
      afterCommitTasks: fixture.afterCommitTasks,
    }).toEqual({
      persistedBatches: [],
      afterCommitTasks: [],
    });
  });

  test("does not persist or wake a valid scope with no affected users", async () => {
    const fixture = createFixture({
      affectedUsers: {
        organization: [],
      },
    });

    await fixture.invalidation.recordChanges([
      { kind: "organization", organizationId: 40 },
    ]);

    expect({
      persistedBatches: fixture.persistedBatches,
      afterCommitTasks: fixture.afterCommitTasks,
      queuedBatches: fixture.queuedBatches,
    }).toEqual({
      persistedBatches: [],
      afterCommitTasks: [],
      queuedBatches: [],
    });
  });

  test("advances each affected user once in stable user ID order", async () => {
    const fixture = createFixture();

    await fixture.invalidation.recordChanges([
      { kind: "employment", userId: 20 },
      { kind: "user", userId: 3 },
      { kind: "employment", userId: 3 },
      { kind: "user", userId: 11 },
      { kind: "user", userId: 20 },
    ]);
    await fixture.afterCommitTasks[0]!();

    expect({
      persisted: fixture.persistedBatches.map(batch => batch.map(row => ({
        userId: row.userId,
        reasonCodes: row.reasonCodes,
      }))),
      queued: fixture.queuedBatches.map(batch => batch.map((job: any) => ({
        userId: job.data.userId,
        dirtyVersion: job.data.dirtyVersion,
        jobId: job.opts.jobId,
      }))),
    }).toEqual({
      persisted: [[
        {
          userId: 3,
          reasonCodes: ["user-updated", "employment-updated"],
        },
        {
          userId: 11,
          reasonCodes: ["user-updated"],
        },
        {
          userId: 20,
          reasonCodes: ["user-updated", "employment-updated"],
        },
      ]],
      queued: [[
        {
          userId: 3,
          dirtyVersion: "1",
          jobId: "rebuild-user-profile|3|1",
        },
        {
          userId: 11,
          dirtyVersion: "1",
          jobId: "rebuild-user-profile|11|1",
        },
        {
          userId: 20,
          dirtyVersion: "1",
          jobId: "rebuild-user-profile|20|1",
        },
      ]],
    });
  });

  test("batches multiple calls into one callback with only each user's latest version", async () => {
    const fixture = createFixture();

    await fixture.invalidation.recordChanges([
      { kind: "user", userId: 20 },
    ]);
    await fixture.invalidation.recordChanges([
      { kind: "employment", userId: 20 },
      { kind: "user", userId: 3 },
    ]);
    await fixture.invalidation.recordChanges([
      { kind: "user", userId: 11 },
    ]);

    expect(fixture.afterCommitTasks).toHaveLength(1);
    expect(fixture.queuedBatches).toEqual([]);

    await fixture.afterCommitTasks[0]!();

    expect(fixture.queuedBatches.map(batch => batch.map((job: any) => ({
      userId: job.data.userId,
      dirtyVersion: job.data.dirtyVersion,
      reason: job.data.reason,
      jobId: job.opts.jobId,
    })))).toEqual([[
      {
        userId: 3,
        dirtyVersion: "1",
        reason: "user-updated",
        jobId: "rebuild-user-profile|3|1",
      },
      {
        userId: 11,
        dirtyVersion: "1",
        reason: "user-updated",
        jobId: "rebuild-user-profile|11|1",
      },
      {
        userId: 20,
        dirtyVersion: "2",
        reason: "employment-updated",
        jobId: "rebuild-user-profile|20|2",
      },
    ]]);
  });

  test("propagates dirty persistence failures before registering delivery", async () => {
    const persistError = new Error("dirty write failed");
    const fixture = createFixture({ persistError });

    await expect(fixture.invalidation.recordChanges([
      { kind: "user", userId: 7 },
    ])).rejects.toBe(persistError);

    expect({
      persistedBatches: fixture.persistedBatches,
      afterCommitTasks: fixture.afterCommitTasks,
      queuedBatches: fixture.queuedBatches,
    }).toEqual({
      persistedBatches: [],
      afterCommitTasks: [],
      queuedBatches: [],
    });
  });

  test("propagates affected-user resolution failures before persisting or registering delivery", async () => {
    const fixture = createFixture({
      affectedUsers: {
        organization: [7],
      },
      affectedUserError: "organization",
    });

    await expect(fixture.invalidation.recordChanges([
      { kind: "user", userId: 3 },
      { kind: "organization", organizationId: 40 },
    ])).rejects.toThrow("affected-user resolution failed");

    expect({
      persistedBatches: fixture.persistedBatches,
      afterCommitTasks: fixture.afterCommitTasks,
      queuedBatches: fixture.queuedBatches,
    }).toEqual({
      persistedBatches: [],
      afterCommitTasks: [],
      queuedBatches: [],
    });
  });

  test("defers rebuild enqueue failures to the best-effort callback", async () => {
    const enqueueError = new Error("queue unavailable");
    const fixture = createFixture({ enqueueError });

    await expect(fixture.invalidation.recordChanges([
      { kind: "employment", userId: 7 },
    ])).resolves.toBeUndefined();

    await expect(fixture.afterCommitTasks[0]!()).rejects.toBe(enqueueError);
    expect(fixture.persistedBatches.map(batch => batch.map(row => ({
      userId: row.userId,
      reasonCodes: row.reasonCodes,
    })))).toEqual([[
      {
        userId: 7,
        reasonCodes: ["employment-updated"],
      },
    ]]);
  });
});

import type { SQL } from "drizzle-orm";
import { UserProfileDirtyReason, UserProfileDirtyStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { formatDirtyVersion } from "../dirty-version";
import { createUserProfileDirtyRepository, mergeUserProfileDirtyReasons } from "../dirty.repository";

describe("user profile dirty repository", () => {
  test("merges reason codes deterministically", () => {
    expect(mergeUserProfileDirtyReasons(
      [UserProfileDirtyReason.UserUpdated, UserProfileDirtyReason.EmploymentUpdated],
      [UserProfileDirtyReason.UserUpdated, UserProfileDirtyReason.PositionUpdated],
    )).toEqual([
      UserProfileDirtyReason.UserUpdated,
      UserProfileDirtyReason.EmploymentUpdated,
      UserProfileDirtyReason.PositionUpdated,
    ]);
  });

  test("bulk upsert collapses duplicate user inputs before writing", async () => {
    const returning = mock(async () => []);
    const onConflictDoUpdate = mock(() => ({ returning }));
    const values = mock(() => ({ onConflictDoUpdate }));
    const insert = mock(() => ({ values }));
    const repository = createUserProfileDirtyRepository({ insert } as never);
    const firstDirtyAt = new Date("2026-07-01T00:00:00.000Z");
    const secondDirtyAt = new Date("2026-07-01T00:01:00.000Z");

    await repository.markManyDirty([
      {
        userId: 1,
        reasonCodes: [UserProfileDirtyReason.UserUpdated],
        dirtyAt: firstDirtyAt,
      },
      {
        userId: 1,
        reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
        dirtyAt: secondDirtyAt,
      },
    ]);

    expect(values).toHaveBeenCalledWith([{
      userId: 1,
      status: UserProfileDirtyStatus.Pending,
      reasonCodes: [UserProfileDirtyReason.UserUpdated, UserProfileDirtyReason.EmploymentUpdated],
      dirtyAt: secondDirtyAt,
      processingStartedAt: null,
      processedAt: null,
      attempts: 0,
      lastError: null,
      lastJobId: "rebuild-user-profile|1|1",
    }]);
    expect(onConflictDoUpdate).toHaveBeenCalled();
    expect(returning).toHaveBeenCalled();
  });

  test("casts rebuild job name when building conflict last job id SQL", async () => {
    const returning = mock(async () => []);
    const onConflictDoUpdate = mock(() => ({ returning }));
    const values = mock(() => ({ onConflictDoUpdate }));
    const insert = mock(() => ({ values }));
    const repository = createUserProfileDirtyRepository({ insert } as never);

    await repository.markManyDirty([{
      userId: 1,
      reasonCodes: [UserProfileDirtyReason.Backfill],
      dirtyAt: new Date("2026-07-01T00:00:00.000Z"),
    }]);

    const [conflictOptions] = onConflictDoUpdate.mock.calls[0] as unknown as [{ set: { lastJobId: SQL } }];
    const query = new PgDialect().sqlToQuery(conflictOptions.set.lastJobId);

    expect(query.sql).toContain("concat($1::text, '|'");
    expect(query.params[0]).toBe("rebuild-user-profile");
  });

  test("formats dirty versions as positive decimal strings", () => {
    expect(formatDirtyVersion("42")).toBe("42");
    expect(formatDirtyVersion(42)).toBe("42");
    expect(formatDirtyVersion(42n)).toBe("42");
    expect(() => formatDirtyVersion("0")).toThrow("dirtyVersion must be a positive decimal string");
    expect(() => formatDirtyVersion(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "dirtyVersion number must be a positive safe integer",
    );
  });
});

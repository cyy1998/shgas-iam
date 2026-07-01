import { UserProfileDirtyReason, UserProfileDirtyStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
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
        lastJobId: "job-older",
      },
      {
        userId: 1,
        reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
        dirtyAt: secondDirtyAt,
        lastJobId: "job-newer",
      },
    ]);

    expect(values).toHaveBeenCalledWith([{
      userId: 1,
      status: UserProfileDirtyStatus.Pending,
      reasonCodes: [UserProfileDirtyReason.UserUpdated, UserProfileDirtyReason.EmploymentUpdated],
      dirtyAt: secondDirtyAt,
      processingStartedAt: null,
      processedAt: null,
      lastError: null,
      lastJobId: "job-newer",
    }]);
    expect(onConflictDoUpdate).toHaveBeenCalled();
    expect(returning).toHaveBeenCalled();
  });
});

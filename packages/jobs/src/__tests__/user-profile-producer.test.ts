import { UserProfileDirtyReason, UserProfileJobName, UserProfileScopeType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createUserProfileJobProducer } from "../user-profile";

function createQueue() {
  return {
    add: mock(async (_name: string, _payload: unknown, options: { jobId: string }) => ({
      id: options.jobId,
    })),
  };
}

describe("createUserProfileJobProducer", () => {
  test("validates rebuild payloads and uses deterministic user job ids", async () => {
    const queue = createQueue();
    const producer = createUserProfileJobProducer(queue as never);

    await expect(producer.enqueueRebuildJob({
      userId: 123,
      reason: UserProfileDirtyReason.UserUpdated,
      requestedAt: "2026-07-01T00:00:00.000Z",
    })).resolves.toEqual({ jobId: "rebuild-user-profile:123" });

    expect(producer.buildRebuildJobId(123)).toBe("rebuild-user-profile:123");
    expect(queue.add).toHaveBeenCalledWith(
      UserProfileJobName.RebuildUserProfile,
      {
        userId: 123,
        reason: UserProfileDirtyReason.UserUpdated,
        requestedAt: "2026-07-01T00:00:00.000Z",
      },
      { jobId: "rebuild-user-profile:123" },
    );
  });

  test("rejects invalid payloads before enqueueing", async () => {
    const queue = createQueue();
    const producer = createUserProfileJobProducer(queue as never);

    await expect(producer.enqueueRebuildJob({
      userId: 0,
      reason: UserProfileDirtyReason.UserUpdated,
    })).rejects.toThrow();

    expect(queue.add).not.toHaveBeenCalled();
  });

  test("uses deterministic scope expansion job ids", async () => {
    const queue = createQueue();
    const producer = createUserProfileJobProducer(queue as never);

    await expect(producer.enqueueScopeExpansionJob({
      scopeType: UserProfileScopeType.UserIds,
      userIds: [3, 1, 3],
      bucket: "2026-07-01T00:00",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({
      jobId: "expand-user-profile-scope:user-ids:1,3:2026-07-01T00:00",
    });

    expect(queue.add).toHaveBeenCalledWith(
      UserProfileJobName.ExpandUserProfileScope,
      {
        scopeType: UserProfileScopeType.UserIds,
        userIds: [3, 1, 3],
        bucket: "2026-07-01T00:00",
        reason: UserProfileDirtyReason.UserUpdated,
      },
      { jobId: "expand-user-profile-scope:user-ids:1,3:2026-07-01T00:00" },
    );
  });
});

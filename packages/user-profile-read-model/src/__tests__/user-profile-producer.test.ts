import { UserProfileDirtyReason, UserProfileJobName, UserProfileScopeType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createUserProfileJobProducer } from "../user-profile-job.producer";

function createQueue() {
  return {
    add: mock(async (_name: string, _payload: unknown, options: { jobId: string }) => ({
      id: options.jobId,
    })),
    addBulk: mock(async (jobs: Array<{ opts: { jobId: string } }>) => jobs.map(job => ({
      id: job.opts.jobId,
    }))),
  };
}

describe("createUserProfileJobProducer", () => {
  test("validates rebuild payloads and uses deterministic user job ids", async () => {
    const queue = createQueue();
    const producer = createUserProfileJobProducer(queue as never);

    await expect(producer.enqueueRebuildJob({
      userId: 123,
      dirtyVersion: "42",
      reason: UserProfileDirtyReason.UserUpdated,
      requestedAt: "2026-07-01T00:00:00.000Z",
    })).resolves.toEqual({ jobId: "rebuild-user-profile|123|42" });

    expect(producer.buildRebuildJobId(123, "42")).toBe("rebuild-user-profile|123|42");
    expect(queue.add).toHaveBeenCalledWith(
      UserProfileJobName.RebuildUserProfile,
      {
        userId: 123,
        dirtyVersion: "42",
        reason: UserProfileDirtyReason.UserUpdated,
        requestedAt: "2026-07-01T00:00:00.000Z",
      },
      { jobId: "rebuild-user-profile|123|42" },
    );
  });

  test("validates and bulk-enqueues rebuild payloads with versioned job ids", async () => {
    const queue = createQueue();
    const producer = createUserProfileJobProducer(queue as never);

    await expect(producer.enqueueRebuildJobs([
      { userId: 123, dirtyVersion: "42", reason: UserProfileDirtyReason.UserUpdated },
      { userId: 123, dirtyVersion: "43", reason: UserProfileDirtyReason.UserUpdated },
    ])).resolves.toEqual({
      enqueued: 2,
      jobIds: ["rebuild-user-profile|123|42", "rebuild-user-profile|123|43"],
    });

    expect(queue.addBulk).toHaveBeenCalledWith([
      {
        name: UserProfileJobName.RebuildUserProfile,
        data: { userId: 123, dirtyVersion: "42", reason: UserProfileDirtyReason.UserUpdated },
        opts: { jobId: "rebuild-user-profile|123|42" },
      },
      {
        name: UserProfileJobName.RebuildUserProfile,
        data: { userId: 123, dirtyVersion: "43", reason: UserProfileDirtyReason.UserUpdated },
        opts: { jobId: "rebuild-user-profile|123|43" },
      },
    ]);
  });

  test("rejects invalid payloads before enqueueing", async () => {
    const queue = createQueue();
    const producer = createUserProfileJobProducer(queue as never);

    await expect(producer.enqueueRebuildJob({
      userId: 0,
      dirtyVersion: "1",
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
      jobId: "expand-user-profile-scope|user-ids|1%2C3|2026-07-01T00%3A00",
    });

    expect(queue.add).toHaveBeenCalledWith(
      UserProfileJobName.ExpandUserProfileScope,
      {
        scopeType: UserProfileScopeType.UserIds,
        userIds: [3, 1, 3],
        bucket: "2026-07-01T00:00",
        reason: UserProfileDirtyReason.UserUpdated,
      },
      { jobId: "expand-user-profile-scope|user-ids|1%2C3|2026-07-01T00%3A00" },
    );
  });
});

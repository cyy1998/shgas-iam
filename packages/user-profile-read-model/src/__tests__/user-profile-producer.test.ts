import type { RebuildUserProfileJobPayload, UserProfileJobName } from "@iam/contracts";
import type { JobQueue } from "@iam/jobs";
import type { UserProfileRebuildJobQueuePort } from "../user-profile-job.producer";
import { UserProfileDirtyReason } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createUserProfileJobProducer } from "../user-profile-job.producer";

type Assert<T extends true> = T;
type _BullMqQueueSatisfiesProducerPort = Assert<
  JobQueue<
    RebuildUserProfileJobPayload,
    unknown,
    UserProfileJobName
  > extends UserProfileRebuildJobQueuePort
    ? true
    : false
>;

function createQueue() {
  return {
    addBulk: mock(async (jobs: Array<{ opts: { jobId: string } }>) => jobs.map(job => ({
      id: job.opts.jobId,
    }))),
  };
}

describe("createUserProfileJobProducer", () => {
  test("validates and bulk-enqueues rebuild payloads with versioned job ids", async () => {
    const queue = createQueue();
    const producer = createUserProfileJobProducer(queue);

    await expect(producer.enqueueRebuildJobs([
      {
        userId: 123,
        dirtyVersion: "42",
        reason: UserProfileDirtyReason.UserUpdated,
        requestedAt: "2026-07-25T10:30:00.000Z",
        requestId: "request-42",
        traceId: "trace-42",
      },
      { userId: 123, dirtyVersion: "43", reason: UserProfileDirtyReason.UserUpdated },
    ])).resolves.toEqual({
      enqueued: 2,
      jobIds: ["rebuild-user-profile|123|42", "rebuild-user-profile|123|43"],
    });

    expect(queue.addBulk).toHaveBeenCalledWith([
      {
        name: "rebuild-user-profile",
        data: {
          userId: 123,
          dirtyVersion: "42",
          reason: "user-updated",
          requestedAt: "2026-07-25T10:30:00.000Z",
          requestId: "request-42",
          traceId: "trace-42",
        },
        opts: { jobId: "rebuild-user-profile|123|42" },
      },
      {
        name: "rebuild-user-profile",
        data: { userId: 123, dirtyVersion: "43", reason: "user-updated" },
        opts: { jobId: "rebuild-user-profile|123|43" },
      },
    ]);
  });

  test("rejects invalid payloads before enqueueing", async () => {
    const queue = createQueue();
    const producer = createUserProfileJobProducer(queue);

    await expect(producer.enqueueRebuildJobs([{
      userId: 0,
      dirtyVersion: "1",
      reason: UserProfileDirtyReason.UserUpdated,
    }])).rejects.toThrow();

    expect(queue.addBulk).not.toHaveBeenCalled();
  });
});

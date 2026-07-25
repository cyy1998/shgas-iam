import type {
  RebuildUserProfileJobPayload,
} from "@iam/contracts";
import {
  RebuildUserProfileJobPayloadSchema,
  UserProfileJobName,
} from "@iam/contracts";
import { buildUserVersionJobId } from "@iam/jobs";

export interface UserProfileRebuildJobQueuePort {
  addBulk: (
    jobs: Array<{
      name: UserProfileJobName.RebuildUserProfile;
      data: RebuildUserProfileJobPayload;
      opts: { jobId: string };
    }>,
  ) => Promise<Array<{ id?: string }>>;
}

const REBUILD_ADD_BULK_CHUNK_SIZE = 500;

export function createUserProfileJobProducer(queue: UserProfileRebuildJobQueuePort) {
  async function enqueueRebuildJobs(inputs: RebuildUserProfileJobPayload[]) {
    const payloads = inputs.map(input => RebuildUserProfileJobPayloadSchema.parse(input));
    const jobs = payloads.map(payload => ({
      name: UserProfileJobName.RebuildUserProfile,
      data: payload,
      opts: { jobId: buildRebuildJobId(payload.userId, payload.dirtyVersion) },
    }));
    const addedJobs = [];

    for (let index = 0; index < jobs.length; index += REBUILD_ADD_BULK_CHUNK_SIZE) {
      addedJobs.push(...await queue.addBulk(jobs.slice(index, index + REBUILD_ADD_BULK_CHUNK_SIZE)));
    }

    return {
      enqueued: addedJobs.length,
      jobIds: addedJobs.map((job, index) => job.id ?? jobs[index]!.opts.jobId),
    };
  }

  return {
    enqueueRebuildJobs,
  };
}

export type UserProfileJobProducer = ReturnType<typeof createUserProfileJobProducer>;

function buildRebuildJobId(userId: number, dirtyVersion: string) {
  return buildUserVersionJobId(UserProfileJobName.RebuildUserProfile, userId, dirtyVersion);
}

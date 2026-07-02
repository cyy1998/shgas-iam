import type {
  ExpandUserProfileScopeJobPayload,
  RebuildUserProfileJobPayload,
  UserProfileJobPayload,
} from "@iam/contracts";
import type { JobQueue } from "@iam/jobs";
import {
  ExpandUserProfileScopeJobPayloadSchema,
  RebuildUserProfileJobPayloadSchema,
  UserProfileJobName,
} from "@iam/contracts";
import { buildScopeBucketJobId, buildUserVersionJobId } from "@iam/jobs";

export type UserProfileJobQueue = JobQueue<UserProfileJobPayload, unknown, UserProfileJobName>;

const REBUILD_ADD_BULK_CHUNK_SIZE = 500;

export function createUserProfileJobProducer(queue: UserProfileJobQueue) {
  function buildRebuildJobId(userId: number, dirtyVersion: string) {
    return buildUserVersionJobId(UserProfileJobName.RebuildUserProfile, userId, dirtyVersion);
  }

  function buildScopeExpansionJobId(input: ExpandUserProfileScopeJobPayload) {
    return buildScopeExpansionJobIdFromPayload(input);
  }

  async function enqueueRebuildJob(input: RebuildUserProfileJobPayload) {
    const payload = RebuildUserProfileJobPayloadSchema.parse(input);
    const jobId = buildRebuildJobId(payload.userId, payload.dirtyVersion);
    const job = await queue.add(UserProfileJobName.RebuildUserProfile, payload, { jobId });
    return { jobId: job.id ?? jobId };
  }

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

  async function enqueueScopeExpansionJob(input: ExpandUserProfileScopeJobPayload) {
    const payload = ExpandUserProfileScopeJobPayloadSchema.parse(input);
    const jobId = buildScopeExpansionJobId(payload);
    const job = await queue.add(UserProfileJobName.ExpandUserProfileScope, payload, { jobId });
    return { jobId: job.id ?? jobId };
  }

  return {
    buildRebuildJobId,
    buildScopeExpansionJobId,
    enqueueRebuildJob,
    enqueueRebuildJobs,
    enqueueScopeExpansionJob,
  };
}

export type UserProfileJobProducer = ReturnType<typeof createUserProfileJobProducer>;

function buildScopeExpansionJobIdFromPayload(input: ExpandUserProfileScopeJobPayload) {
  if ("scopeId" in input) {
    return buildScopeBucketJobId({
      jobName: UserProfileJobName.ExpandUserProfileScope,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      bucket: input.bucket,
    });
  }
  if ("userIds" in input) {
    return buildScopeBucketJobId({
      jobName: UserProfileJobName.ExpandUserProfileScope,
      scopeType: input.scopeType,
      scopeId: [...new Set(input.userIds)].sort((left, right) => left - right).join(","),
      bucket: input.bucket,
    });
  }
  return buildScopeBucketJobId({
    jobName: UserProfileJobName.ExpandUserProfileScope,
    scopeType: input.scopeType,
    scopeId: "all",
    bucket: input.bucket,
  });
}

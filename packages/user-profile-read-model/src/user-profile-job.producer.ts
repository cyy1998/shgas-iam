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
import { buildScopeBucketJobId, buildUserJobId } from "@iam/jobs";

export type UserProfileJobQueue = JobQueue<UserProfileJobPayload, unknown, UserProfileJobName>;

export function createUserProfileJobProducer(queue: UserProfileJobQueue) {
  function buildRebuildJobId(userId: number) {
    return buildUserJobId(UserProfileJobName.RebuildUserProfile, userId);
  }

  function buildScopeExpansionJobId(input: ExpandUserProfileScopeJobPayload) {
    return buildScopeExpansionJobIdFromPayload(input);
  }

  async function enqueueRebuildJob(input: RebuildUserProfileJobPayload) {
    const payload = RebuildUserProfileJobPayloadSchema.parse(input);
    const jobId = buildRebuildJobId(payload.userId);
    const job = await queue.add(UserProfileJobName.RebuildUserProfile, payload, { jobId });
    return { jobId: job.id ?? jobId };
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

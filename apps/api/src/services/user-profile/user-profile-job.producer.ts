import type {
  ExpandUserProfileScopeJobPayload,
  RebuildUserProfileJobPayload,
  UserProfileJobPayload,
} from "@iam/contracts";
import type { JobQueue } from "@iam/jobs";
import { UserProfileJobName } from "@iam/contracts";
import { buildScopeBucketJobId, buildUserJobId } from "@iam/jobs";

export type UserProfileJobQueue = JobQueue<UserProfileJobPayload, unknown, UserProfileJobName>;

export function createUserProfileJobProducer(queue: UserProfileJobQueue) {
  function buildRebuildJobId(userId: number) {
    return buildUserJobId(UserProfileJobName.RebuildUserProfile, userId);
  }

  async function enqueueRebuildJob(input: RebuildUserProfileJobPayload) {
    const jobId = buildRebuildJobId(input.userId);
    const job = await queue.add(UserProfileJobName.RebuildUserProfile, input, { jobId });
    return { jobId: job.id ?? jobId };
  }

  async function enqueueScopeExpansionJob(input: ExpandUserProfileScopeJobPayload) {
    const jobId = buildScopeExpansionJobId(input);
    const job = await queue.add(UserProfileJobName.ExpandUserProfileScope, input, { jobId });
    return { jobId: job.id ?? jobId };
  }

  return {
    buildRebuildJobId,
    enqueueRebuildJob,
    enqueueScopeExpansionJob,
  };
}

export type UserProfileJobProducer = ReturnType<typeof createUserProfileJobProducer>;

function buildScopeExpansionJobId(input: ExpandUserProfileScopeJobPayload) {
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
      scopeId: input.userIds.join(","),
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

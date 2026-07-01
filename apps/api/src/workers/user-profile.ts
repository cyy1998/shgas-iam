/* eslint-disable antfu/no-top-level-await */
import type { UserProfileJobPayload } from "@iam/contracts";
import { createUserProfileWorkerComposition } from "@api/composition/user-profile-worker";
import {
  ExpandUserProfileScopeJobPayloadSchema,
  RebuildUserProfileJobPayloadSchema,
  USER_PROFILE_QUEUE_NAME,
  UserProfileJobName,
} from "@iam/contracts";
import { createJobWorker } from "@iam/jobs";

const composition = await createUserProfileWorkerComposition();
const worker = createJobWorker<UserProfileJobPayload, unknown, UserProfileJobName>({
  name: USER_PROFILE_QUEUE_NAME,
  redis: composition.runtime.config.env.redis,
  concurrency: composition.runtime.config.userProfile.workerConcurrency,
  processor: async (job) => {
    switch (job.name) {
      case UserProfileJobName.RebuildUserProfile:
        return await composition.workerService.processRebuildUserProfile(
          RebuildUserProfileJobPayloadSchema.parse(job.data),
          { jobId: job.id },
        );
      case UserProfileJobName.ExpandUserProfileScope:
        return await composition.workerService.processExpandUserProfileScope(
          ExpandUserProfileScopeJobPayloadSchema.parse(job.data),
        );
    }
  },
});

worker.on("completed", (job) => {
  composition.logger.info({ jobId: job.id, jobName: job.name }, "user profile job completed");
});

worker.on("failed", (job, error) => {
  composition.logger.error({ err: error, jobId: job?.id, jobName: job?.name }, "user profile job failed");
});

async function shutdown(signal: string) {
  composition.logger.info({ signal }, "stopping user profile worker");
  await worker.close();
  await composition.queue.close();
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

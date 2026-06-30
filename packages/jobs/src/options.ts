import type { JobsOptions } from "bullmq";

export const DEFAULT_QUEUE_PREFIX = "iam";

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1_000,
  },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
} as const satisfies JobsOptions;

export function resolveDefaultJobOptions(overrides: JobsOptions = {}): JobsOptions {
  return {
    ...DEFAULT_JOB_OPTIONS,
    ...overrides,
  };
}

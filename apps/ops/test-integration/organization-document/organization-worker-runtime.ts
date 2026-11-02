import Redis from "ioredis";
import type { OpsLogger } from "../../src/composition/runtime";
import { parseOrganizationDocumentBackfillCommandEnv } from "../../src/env";

export function createOrganizationFixtureRuntime(source: NodeJS.ProcessEnv, logger: OpsLogger) {
  const env = parseOrganizationDocumentBackfillCommandEnv(source);
  return {
    redis: new Redis(env.redis),
    logger,
    clock: { now: Date.now, nowDate: () => new Date() },
    config: { redis: env.redis, organizationDocument: { concurrency: 2, ...env.organizationDocument } },
  };
}

import Redis from "ioredis";
import {
  cleanupLegacySessionKeys,
  parseLegacySessionCleanupArgs,
} from "../src/session/kernel/cleanup/legacy-cleanup";

const logger = {
  info(data: Record<string, unknown>) {
    process.stdout.write(`${JSON.stringify(data)}\n`);
  },
  warn(data: Record<string, unknown>) {
    console.warn(JSON.stringify(data));
  },
};

try {
  const options = parseLegacySessionCleanupArgs(process.argv.slice(2));
  const redis = process.env.IAM_REDIS_HOST === undefined && process.env.REDIS_URL !== undefined
    ? new Redis(process.env.REDIS_URL)
    : new Redis({
        host: process.env.IAM_REDIS_HOST ?? "localhost",
        port: Number(process.env.IAM_REDIS_PORT ?? process.env.REDIS_PORT ?? 6379),
        password: process.env.IAM_REDIS_PASSWORD || process.env.REDIS_PASSWORD || undefined,
        db: Number(process.env.IAM_REDIS_DB ?? process.env.REDIS_DB ?? 0),
      });

  try {
    const result = await cleanupLegacySessionKeys(redis, {
      ...options,
      logger,
    });
    const matched = Object.values(result.patternCounts)
      .reduce((total, count) => total + (count ?? 0), 0);
    const deleted = Object.values(result.deletedCounts)
      .reduce((total, count) => total + (count ?? 0), 0);
    process.stdout.write(
      `Legacy cleanup ${result.profile} ${result.mode} ${result.result}: matched ${matched}, deleted ${deleted}.\n`,
    );
    process.exitCode = result.result === "completed" ? 0 : 1;
  }
  finally {
    await redis.quit();
  }
}
catch (error) {
  logger.warn({
    event: "session_kernel.cleanup_legacy_keys.failed",
    sourceApp: "iam-release-tooling",
    mode: "dry-run",
    errorName: error instanceof Error ? error.name : "Error",
    errorMessage: error instanceof Error ? error.message : String(error),
    result: "failed",
  });
  process.exitCode = 1;
}

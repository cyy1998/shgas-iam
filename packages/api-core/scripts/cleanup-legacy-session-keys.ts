import Redis from "ioredis";
import {
  cleanupLegacySessionKeys,
  parseLegacySessionCleanupArgs,
} from "../src/session/kernel/legacy-cleanup";

const logger = {
  info(data: Record<string, unknown>) {
    console.log(JSON.stringify(data));
  },
  warn(data: Record<string, unknown>) {
    console.warn(JSON.stringify(data));
  },
};

try {
  const options = parseLegacySessionCleanupArgs(process.argv.slice(2));
  const redis = new Redis({
    host: process.env.REDIS_URL ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
  });

  try {
    const result = await cleanupLegacySessionKeys(redis, {
      ...options,
      logger,
    });
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

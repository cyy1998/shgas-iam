import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createProcessSmokeEnvironment,
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import Redis from "ioredis";

const cleanupRedisUrlEnvironmentName = "IAM_API_CORE_CLEANUP_TEST_REDIS_URL";
// Keep this owner inventory aligned with the Redis URLs passed through by the
// test:integration:redis and test:integration:composition Turbo tasks.
// The cleanup URL is the resource being validated, so it is intentionally excluded.
const callerOwnedRedisTestUrlEnvironmentNames = [
  "IAM_ADMIN_API_TEST_REDIS_URL",
  "IAM_API_CORE_TEST_REDIS_URL",
  "IAM_API_TEST_REDIS_URL",
  "IAM_OIDC_PROVIDER_TEST_REDIS_URL",
  "IAM_USER_PROFILE_TEST_REDIS_URL",
] as const;
const apiCoreRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function createCustomSsoCleanupRedisHarness(
  resource = resolveCustomSsoCleanupRedisResource(process.env),
) {
  const observer = new Redis(resource.url, {
    connectTimeout: 2_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
  });
  const fixtureKeys = new Set<string>();

  try {
    await observer.connect();
    await observer.ping();
    const initialInventory = await inventoryRedis(observer);
    if (initialInventory.size > 0) {
      throw new Error(
        `${cleanupRedisUrlEnvironmentName} must identify an empty exclusive disposable Redis logical DB; found ${initialInventory.size} existing key(s)`,
      );
    }
  }
  catch (error) {
    observer.disconnect();
    throw error;
  }

  return {
    async assertFlushCommandsDenied() {
      for (const command of ["FLUSHDB", "FLUSHALL"] as const)
        await assertAclDryRunDenied(observer, resource.username, command);
    },
    async close() {
      const errors: unknown[] = [];
      try {
        if (fixtureKeys.size > 0)
          await observer.unlink(...fixtureKeys);
        const remaining = await inventoryRedis(observer);
        if (remaining.size > 0) {
          throw new Error(
            `Custom SSO cleanup Redis test left ${remaining.size} unexpected key(s) in the exclusive logical DB`,
          );
        }
      }
      catch (error) {
        errors.push(error);
      }

      try {
        await observer.quit();
      }
      catch (error) {
        observer.disconnect();
        errors.push(error);
      }

      if (errors.length > 0)
        throw new AggregateError(errors, "Failed to close Custom SSO cleanup Redis harness");
    },
    async inventory() {
      return await inventoryRedis(observer);
    },
    async runCleanup(
      mode: "--apply" | "--dry-run" | "--verify",
      expectedExitCode: number,
    ) {
      return await withOwnedTemporaryDirectory({
        prefix: "iam-custom-sso-cleanup-redis-",
        cleanupTimeoutMs: 5_000,
        run: async temporaryDirectory => await runProcessCommandSmoke({
          label: `Custom SSO cleanup Redis ${mode}`,
          completionTimeoutMs: 10_000,
          cleanupTimeoutMs: 5_000,
          expectedExitCode,
          start: () => spawnOwnedProcessTree({
            executable: process.execPath,
            args: [
              "--no-env-file",
              "run",
              "session:cleanup-custom-sso-cutover",
              "--",
              mode,
              "--batch-size",
              "2",
            ],
            cwd: apiCoreRoot,
            env: createProcessSmokeEnvironment({
              source: process.env,
              temporaryDirectory,
              overrides: {
                REDIS_URL: resource.url,
                FORCE_COLOR: "0",
                NO_COLOR: "1",
              },
            }),
          }),
        }),
      });
    },
    async seed(entries: ReadonlyMap<string, string>) {
      if (entries.size === 0)
        throw new Error("Custom SSO cleanup Redis fixture must contain at least one key");
      for (const key of entries.keys())
        fixtureKeys.add(key);
      await observer.mset(...[...entries].flatMap(([key, value]) => [key, value]));
    },
  };
}

export function resolveCustomSsoCleanupRedisResource(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const redisUrl = environment[cleanupRedisUrlEnvironmentName];
  if (!redisUrl) {
    throw new Error(
      `${cleanupRedisUrlEnvironmentName} must point to a caller-provided exclusive disposable Redis logical DB; no fallback is allowed`,
    );
  }

  const parsed = parseRedisUrl(cleanupRedisUrlEnvironmentName, redisUrl);
  const cleanupIdentity = redisLogicalDbIdentity(
    cleanupRedisUrlEnvironmentName,
    parsed,
  );
  for (const environmentName of callerOwnedRedisTestUrlEnvironmentNames) {
    const callerOwnedRedisTestUrl = environment[environmentName];
    if (callerOwnedRedisTestUrl === undefined)
      continue;
    assertDifferentRedisLogicalDb(
      cleanupIdentity,
      redisLogicalDbIdentity(
        environmentName,
        parseRedisUrl(environmentName, callerOwnedRedisTestUrl),
      ),
      environmentName,
    );
  }
  const runtimeRedisUrl = environment.REDIS_URL;
  if (runtimeRedisUrl !== undefined) {
    assertDifferentRedisLogicalDb(
      cleanupIdentity,
      redisLogicalDbIdentity(
        "REDIS_URL",
        parseRedisUrl("REDIS_URL", runtimeRedisUrl),
      ),
      "REDIS_URL",
    );
  }
  const runtimeHostIdentity = readRuntimeHostRedisLogicalDbIdentity(environment);
  if (runtimeHostIdentity !== undefined) {
    assertDifferentRedisLogicalDb(
      cleanupIdentity,
      runtimeHostIdentity,
      "IAM_REDIS_HOST/IAM_REDIS_PORT/IAM_REDIS_DB",
    );
  }

  return {
    url: redisUrl,
    username: parsed.username.length === 0
      ? "default"
      : decodeURIComponent(parsed.username),
  };
}

type RedisLogicalDbIdentity = {
  database: number;
  hostname: string;
  port: number;
};

function parseRedisUrl(environmentName: string, redisUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  }
  catch {
    throw new Error(`${environmentName} must be a valid Redis URL`);
  }
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:")
    throw new Error(`${environmentName} must use the redis or rediss protocol`);
  if (canonicalizeRedisHostname(parsed.hostname) === "")
    throw new Error(`${environmentName} must identify a Redis hostname`);
  if (parsed.search !== "") {
    throw new Error(
      `${environmentName} must not contain query parameters because connection identity must be unambiguous`,
    );
  }
  return parsed;
}

function redisLogicalDbIdentity(
  environmentName: string,
  parsed: URL,
): RedisLogicalDbIdentity {
  const databaseText = decodeURIComponent(parsed.pathname.slice(1));
  const database = databaseText === "" ? 0 : Number(databaseText);
  if (
    (databaseText !== "" && !/^\d+$/u.test(databaseText))
    || !Number.isSafeInteger(database)
  ) {
    throw new Error(`${environmentName} must select a non-negative integer logical DB`);
  }
  return {
    database,
    hostname: canonicalizeRedisHostname(parsed.hostname),
    port: parsed.port === "" ? 6379 : Number(parsed.port),
  };
}

function readRuntimeHostRedisLogicalDbIdentity(
  environment: Readonly<Record<string, string | undefined>>,
): RedisLogicalDbIdentity | undefined {
  const runtimeTupleIsVisible = environment.IAM_REDIS_HOST !== undefined
    || (
      environment.REDIS_URL === undefined
      && [
        environment.IAM_REDIS_PORT,
        environment.REDIS_PORT,
        environment.IAM_REDIS_DB,
        environment.REDIS_DB,
      ].some(value => value !== undefined)
    );
  if (!runtimeTupleIsVisible)
    return undefined;
  const hostname = environment.IAM_REDIS_HOST ?? "localhost";
  const port = parseRuntimeInteger(
    "IAM_REDIS_PORT/REDIS_PORT",
    environment.IAM_REDIS_PORT ?? environment.REDIS_PORT ?? "6379",
    { minimum: 1, maximum: 65_535 },
  );
  const database = parseRuntimeInteger(
    "IAM_REDIS_DB/REDIS_DB",
    environment.IAM_REDIS_DB ?? environment.REDIS_DB ?? "0",
    { minimum: 0 },
  );
  const normalizedHostname = canonicalizeRedisHostname(hostname);
  if (normalizedHostname === "")
    throw new Error("IAM_REDIS_HOST must identify a Redis hostname when set");
  return { database, hostname: normalizedHostname, port };
}

function canonicalizeRedisHostname(hostname: string) {
  let normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]"))
    normalized = normalized.slice(1, -1);
  return normalized.replace(/\.$/u, "");
}

function parseRuntimeInteger(
  environmentName: string,
  value: string,
  bounds: { minimum: number; maximum?: number },
) {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed)
    || parsed < bounds.minimum
    || (bounds.maximum !== undefined && parsed > bounds.maximum)
  ) {
    throw new Error(`${environmentName} must be an integer in the supported range`);
  }
  return parsed;
}

function assertDifferentRedisLogicalDb(
  cleanupIdentity: RedisLogicalDbIdentity,
  candidateIdentity: RedisLogicalDbIdentity,
  candidateEnvironmentName: string,
) {
  if (
    cleanupIdentity.hostname === candidateIdentity.hostname
    && cleanupIdentity.port === candidateIdentity.port
    && cleanupIdentity.database === candidateIdentity.database
  ) {
    throw new Error(
      `${cleanupRedisUrlEnvironmentName} must not identify the same Redis logical DB as ${candidateEnvironmentName}`,
    );
  }
}

async function assertAclDryRunDenied(
  redis: Redis,
  username: string,
  command: "FLUSHALL" | "FLUSHDB",
) {
  try {
    const result = await redis.call("ACL", "DRYRUN", username, command);
    if (typeof result === "string" && isAclDenial(result, command))
      return;
    throw new Error(
      `Cleanup Redis ACL permits ${command}; ACL DRYRUN returned ${String(result)}`,
    );
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("Cleanup Redis ACL permits "))
      throw error;
    if (!isAclDenial(message, command)) {
      throw new Error(
        `Cleanup Redis ACL denial for ${command} could not be proven with ACL DRYRUN: ${sanitizeAclError(message)}`,
        { cause: error },
      );
    }
  }
}

function isAclDenial(message: string, command: "FLUSHALL" | "FLUSHDB") {
  return /no permissions|noperm/iu.test(message)
    && message.toLowerCase().includes(command.toLowerCase());
}

async function inventoryRedis(redis: Redis) {
  const keySet = new Set<string>();
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "COUNT", 100);
    cursor = nextCursor;
    for (const key of keys)
      keySet.add(key);
  } while (cursor !== "0");

  const keys = [...keySet].sort();
  if (keys.length === 0)
    return new Map<string, string>();
  const values = await redis.mget(...keys);
  return new Map(keys.map((key, index) => [key, values[index] ?? ""]));
}

function sanitizeAclError(message: string) {
  return message
    .replace(/redis:\/\/\S+/giu, "redis://[REDACTED]")
    .replace(/[\w-]{32,}/gu, "[REDACTED_VALUE]");
}

import type Redis from "ioredis";
import type postgres from "postgres";
import type { z } from "zod";
import type { baselineSchema, redisEntrySchema } from "./recovery";
import { createHash } from "node:crypto";
import { createClientSnapshotVerifier } from "@iam/api-core/client-snapshot/maintenance";
import { createOfflineGrantVerifier, createUnifiedCustomSsoVerifier } from "@iam/custom-sso/maintenance";
import { createOidcVerifier } from "@iam/oidc/maintenance";
import { createOfflineOidcVerifier } from "@iam/oidc/offline-maintenance";
import { createOfflineSessionVerifier, createUnifiedSessionVerifier } from "@iam/session-kernel/maintenance";
import { digest } from "./recovery";

const clientMigrationColumns = ["oidc_enabled", "oidc_config", "oidc_secret_hash", "oidc_config_version", "custom_sso_enabled", "custom_sso_config", "custom_sso_secret_hash", "custom_sso_config_version", "sso_enabled", "sso_config", "sso_secret", "sso_credential_id", "sso_secret_updated_at"];

export async function postgresBaseline(sql: postgres.Sql) {
  return await sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async (tx) => {
    const hash = createHash("sha256");
    const tables = await tx<{ name: string }[]>`SELECT tablename AS name FROM pg_tables
      WHERE schemaname=current_schema() AND tablename <> '__drizzle_migrations' ORDER BY tablename`;
    for (const { name } of tables) {
      hash.update(JSON.stringify(name));
      // Sort canonical JSON, then stream so audit/profile history is not materialized in memory.
      const query = name === "client"
        ? tx`SELECT (to_jsonb(t) - ${clientMigrationColumns}::text[])::text AS facts FROM ${tx(name)} t ORDER BY 1`
        : tx`SELECT to_jsonb(t)::text AS facts FROM ${tx(name)} t ORDER BY 1`;
      for await (const rows of query.cursor(500)) {
        for (const row of rows)
          hash.update(JSON.stringify(row.facts));
      }
    }
    return hash.digest("hex");
  });
}

/** Ask the owners for their exact inventory, rather than copying their key patterns. */
async function ownedRedisKeys(redis: Redis, signal: AbortSignal) {
  const keys = new Set<string>();
  const scan = { async scan(cursor: string, match: "MATCH", pattern: string, count: "COUNT", limit: string) {
    signal.throwIfAborted();
    const page = await redis.scan(cursor, match, pattern, count, limit);
    for (const key of page[1]) keys.add(digest(key));
    if (keys.size > 1_000_000)
      throw new Error("Inventory bound exceeded");
    return page;
  } };
  await createOfflineSessionVerifier(scan, "sess:v2:").verify(signal);
  await createOfflineGrantVerifier(scan).verify(signal);
  await createOfflineOidcVerifier(scan).verify(signal);
  await createUnifiedSessionVerifier(scan, "iam:session").verify(signal);
  await createUnifiedCustomSsoVerifier(scan, "iam:session").verify(signal);
  await createOidcVerifier(scan, "iam:oidc").verify(signal);
  await createClientSnapshotVerifier(scan).verifyAllAfterRedisRestore({ protocolTrafficStopped: true });
  return keys;
}

export async function redisBaseline(redis: Redis, signal: AbortSignal) {
  const owned = await ownedRedisKeys(redis, signal);
  const retained: Record<string, z.infer<typeof redisEntrySchema>> = {};
  let cursor = "0";
  do {
    signal.throwIfAborted();
    const page = await redis.scan(cursor, "COUNT", 500);
    cursor = page[0];
    for (const key of page[1]) {
      const identity = digest(key);
      if (owned.has(identity))
        continue;
      // Observe value and absolute expiry atomically, without renewing any TTL.
      const value = await redis.eval("local d=redis.call('DUMP',KEYS[1]); if not d then return nil end; return {redis.sha1hex(d),redis.call('PEXPIRETIME',KEYS[1])}", 1, key);
      if (value === null)
        continue;
      if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "string" || typeof value[1] !== "number")
        throw new Error("Invalid preservation observation");
      retained[identity] = { digest: digest(value[0]), expiresAt: value[1] };
    }
    if (Object.keys(retained).length > 100_000)
      throw new Error("Preservation inventory bound exceeded");
  } while (cursor !== "0");
  return retained;
}

export async function verifyPreservation(sql: postgres.Sql, redis: Redis, baseline: z.infer<typeof baselineSchema>, signal: AbortSignal) {
  if (await postgresBaseline(sql) !== baseline.postgres)
    throw new Error("Non-target PostgreSQL facts changed");
  const after = await redisBaseline(redis, signal);
  const time = await redis.time();
  const now = Number(time[0]) * 1000 + Math.floor(Number(time[1]) / 1000);
  let expired = 0;
  for (const [key, before] of Object.entries(baseline.redis)) {
    const current = after[key];
    if (!current && before.expiresAt >= 0 && before.expiresAt <= now) {
      expired++;
      continue;
    }
    if (!current || current.digest !== before.digest || current.expiresAt !== before.expiresAt)
      throw new Error("Non-target Redis facts changed");
  }
  if (Object.keys(after).some(key => !(key in baseline.redis)))
    throw new Error("Unexpected non-target Redis state");
  return { retained: Object.keys(after).length, naturallyExpired: expired };
}

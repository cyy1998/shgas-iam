import { EventEmitter } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireDedicatedPostgresTestUrl, requireExternalTestUrl } from "@iam/api-core/testing/external-test-resources";
import { expect, test } from "bun:test";
import Redis from "ioredis";
import postgres from "postgres";
import { withOidcConformanceLifecycle } from "./oidc-conformance-lifecycle.fixture";
import { createOidcConformanceCandidate } from "./oidc-conformance.fixture";

for (const interruptedPhase of ["postgres-ready", "redis-seeded", "api-ready", "cleanup"]) {
  test(`conformance signal at ${interruptedPhase} closes actual partial PostgreSQL/Redis/API resources`, async () => {
    const databaseUrl = requireExternalTestUrl({ environment: process.env, lane: "API composition", name: "IAM_API_TEST_DATABASE_URL" });
    requireDedicatedPostgresTestUrl({ name: "IAM_API_TEST_DATABASE_URL", value: databaseUrl, forbidden: [{ name: "IAM_API_DATABASE_URL", value: process.env.IAM_API_DATABASE_URL }] });
    const redisUrl = requireExternalTestUrl({ environment: process.env, lane: "API composition", name: "IAM_API_TEST_REDIS_URL" });
    const sql = postgres(databaseUrl, { max: 1 });
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    const signals = new EventEmitter();
    const directory = await mkdtemp(join(tmpdir(), "iam195-interruption-"));
    const logPath = join(directory, "api.log");
    const failures: unknown[] = [];
    try {
      const schemasBefore = await sql`SELECT nspname FROM pg_namespace ORDER BY nspname`;
      const keysBefore = await redis.dbsize();
      let reachedDriver = false;
      let failure: unknown;
      try {
        await withOidcConformanceLifecycle(async (lifecycle) => {
          await createOidcConformanceCandidate({
            redirectUris: ["https://rp.example/callback"],
            postLogoutRedirectUris: [],
            logPath,
            lifecycle,
          });
          await lifecycle.checkpoint("before-driver-start");
          reachedDriver = true;
        }, {
          signals,
          observePhase(phase) {
            if (phase === interruptedPhase) {
              signals.emit("SIGINT");
              signals.emit("SIGTERM");
              signals.emit("SIGINT");
            }
          },
        });
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AggregateError);
      expect(reachedDriver).toBe(interruptedPhase === "cleanup");
      expect(signals.listenerCount("SIGINT")).toBe(0);
      expect(signals.listenerCount("SIGTERM")).toBe(0);
      const schemasAfter = await sql`SELECT nspname FROM pg_namespace ORDER BY nspname`;
      const keysAfter = await redis.dbsize();
      expect(schemasAfter).toEqual(schemasBefore);
      expect(keysAfter).toBe(keysBefore);
      const owner = JSON.parse(await readFile(`${logPath}.owner.json`, "utf8"));
      let directoryExists = true;
      try {
        await stat(owner.temporaryDirectory);
      }
      catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT")
          throw error;
        directoryExists = false;
      }
      expect(directoryExists).toBe(false);
      if (owner.port) {
        let reachable = false;
        try {
          await fetch(`http://127.0.0.1:${owner.port}/ready`, { signal: AbortSignal.timeout(1000) });
          reachable = true;
        }
        catch { /* Expected: the real child HTTP listener has been closed. */ }
        expect(reachable).toBe(false);
      }
    }
    catch (error) {
      failures.push(error);
    }
    finally {
      for (const cleanup of [() => redis.disconnect(), () => sql.end({ timeout: 1 })]) {
        try {
          await cleanup();
        }
        catch (error) {
          failures.push(error);
        }
      }
      if (failures.length) {
        try {
          const evidence = fileURLToPath(new URL(`../../test-results/conformance-interruption/${basename(directory)}/`, import.meta.url));
          await mkdir(evidence, { recursive: true });
          await cp(directory, evidence, { recursive: true });
        }
        catch (error) {
          failures.push(error);
        }
      }
      try {
        await rm(directory, { recursive: true, force: true });
      }
      catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, "Conformance interruption regression or cleanup failed");
  }, 45000);
}

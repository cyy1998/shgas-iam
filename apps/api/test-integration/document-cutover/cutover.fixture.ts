/**
 * @iam/api; Spec #283 / #294 one-off cross-artifact acceptance; review removal by 2026-11-26.
 * Explicit opt-in only. No online multi-generation reader or response compatibility layer.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { inspect } from "node:util";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import { ClientStatus } from "@iam/contracts";
import { createJobQueue } from "@iam/jobs";
import type { SubjectAccessOperation } from "@iam/subject-access";
import { parseDedicatedRedisTestUrl, resetExclusiveRedisTestDatabase } from "@iam/test-support/external-test-resources";
import {
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  FatalReadinessError,
  runProcessCommandSmoke,
  runProcessSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/test-support/process-smoke-harness";
import Redis from "ioredis";
import { z } from "zod";
import { requireManagedApiResources, runManagedApiFixture } from "../oidc/managed-api-resources.fixture";
import { createEntryEnvironment } from "../support/api-env.fixture";
import { check, requiredText, same } from "./check.fixture";
import { createOldProtocolState, protocol, verifyNewProtocolState } from "./protocol.fixture";
import {
  BASELINE_COMMIT,
  clients,
  createCutoverDatabase,
  loginKeys,
  readBaseline,
  readCandidate,
  requireCandidate,
  seedSource,
  sourceFingerprint,
} from "./source.fixture";

const configSchema = z
  .object({
    baselineManifest: z.string(),
    candidateManifest: z.string(),
    outputDirectory: z.string(),
    candidate: z.string().regex(/^[a-f0-9]{40}$/u),
  })
  .strict();
let failureDirectory: string | undefined;
async function main() {
  const path = requiredText(process.argv[2], "Expected explicit Document cutover configuration");
  const config = configSchema.parse(JSON.parse(await readFile(path, "utf8")));
  failureDirectory = resolve(config.outputDirectory);
  await mkdir(failureDirectory, { recursive: true });
  // Preflight runs before the resource owner is allowed to create an environment.
  await requireCandidate(config.candidate);
  const baseline = await readBaseline(config.baselineManifest);
  const candidate = await readCandidate(config.candidateManifest, config.candidate);
  if (!process.argv.includes("--managed-api-resources")) {
    await runManagedApiFixture({
      args: process.argv.slice(2),
      entry: "test-integration/document-cutover/cutover.fixture.ts",
      label: "Document cross-artifact cutover",
      projectPrefix: "iam-document-cutover",
    });
    return;
  }
  await requireManagedApiResources();
  const redisUrl = requiredText(process.env.IAM_API_TEST_REDIS_URL, "Managed Redis URL missing");
  const databaseUrl = requiredText(process.env.IAM_API_TEST_DATABASE_URL, "Managed PG URL missing");
  const redisConfig = parseDedicatedRedisTestUrl({ name: "IAM_API_TEST_REDIS_URL", value: redisUrl });
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 0, retryStrategy: () => null });
  const stops: Array<() => Promise<void> | void> = [];
  const evidence: Record<string, unknown> = {
    candidate: config.candidate,
    baseline: BASELINE_COMMIT,
    resourceRunId: process.env.IAM_TEST_RESOURCE_RUN_ID,
    resourceRecord: process.env.IAM_TEST_RESOURCE_RECORD,
    startedAt: new Date().toISOString(),
    status: "incomplete",
  };
  const phases: Array<{ phase: string; passedAt: string }> = [];
  const mark = async (phase: string) => {
    phases.push({ phase, passedAt: new Date().toISOString() });
    await writeFile(join(failureDirectory!, "report.json"), JSON.stringify({ ...evidence, phases }, null, 2), {
      mode: 0o600,
    });
    console.log(`Document cutover phase passed: ${phase}`);
  };
  let executionFailure: unknown;
  try {
    await withOwnedTemporaryDirectory({
      prefix: "iam-document-cutover-",
      cleanupTimeoutMs: 5000,
      async run(temporaryDirectory) {
        const h = await createCutoverDatabase(databaseUrl, baseline.migrations, candidate.migrations);
        stops.push(h.close);
        const users = await seedSource(h);
        const subject = requiredText(users[0]?.subject_identifier, "Source subject missing");
        const old = baseline.owners;
        const customScope = await old.createUnifiedCustomSsoRedisTestScope(redisUrl, (close) => stops.push(close));
        const oidcScope = await old.createOidcRedisTestScope(redisUrl, (close) => stops.push(close));
        const namespace = customScope.namespace;
        const barrier = old.createSubjectAccessBarrier({
          store: old.createRedisSubjectAccessStore({ redis }),
          clock: { nowDate: () => new Date() },
          random: { uuid: randomUUID },
        });
        await old.createSubjectAccessBootstrap({ redis, random: { uuid: randomUUID } }).seedMany(
          users.map((user) => ({
            subjectIdentifier: user.subject_identifier,
            state: user.id < 3 ? ("enabled" as const) : ("disabled" as const),
          })),
          new Date(),
        );
        const kernel = old.createUnifiedSessionKernel<SubjectAccessOperation>({
          redis,
          namespace,
          userSessionTtlSeconds: 3600,
          clientSessionTtlSeconds: 3000,
          assertOperationActive: old.requireSubjectAccessOperation,
        });
        let operations: ReturnType<typeof old.createSubjectAccessOperations>;
        const revocation = old.createUnifiedSubjectAccessSessionRevocation(kernel, {
          run: (callback) => operations.run(callback),
        });
        operations = old.createSubjectAccessOperations({ barrier, revocation });
        const queues = new Map(
          ["user-profile", "organization-search", "user-document", "organization-document"].map((name) => [
            name,
            createJobQueue({ name, redis: redisConfig }),
          ]),
        );
        for (const queue of queues.values()) stops.push(() => queue.close());
        const sentinel = `iam:test:document-cutover:${randomUUID()}`;
        await redis.set(sentinel, "unrelated-state");
        const workerEnvironment = (legacy: boolean) =>
          createProcessSmokeEnvironment({
            source: process.env,
            temporaryDirectory,
            overrides: {
              NODE_ENV: "test",
              IAM_WORKER_DATABASE_URL: h.databaseUrl,
              // 固定旧制品仍要求拆分输入；当前候选仅接收 Redis URL。
              ...(legacy
                ? {
                    IAM_WORKER_REDIS_HOST: redisConfig.host,
                    IAM_WORKER_REDIS_PORT: String(redisConfig.port),
                    IAM_WORKER_REDIS_DB: String(redisConfig.db),
                    IAM_WORKER_REDIS_PASSWORD: redisConfig.password,
                  }
                : { IAM_WORKER_REDIS_URL: redisUrl }),
              IAM_WORKER_ENABLED_MODULES: legacy
                ? "user-profile,organization-search"
                : "user-document,organization-document",
              IAM_WORKER_HTTP_ENABLED: "false",
              IAM_WORKER_BULL_BOARD_ENABLED: "false",
              IAM_WORKER_LOG_FORMAT: "json",
              IAM_WORKER_LOG_LEVEL: "info",
              IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE: "1",
              IAM_WORKER_USER_PROFILE_CONCURRENCY: "1",
              IAM_WORKER_USER_DOCUMENT_CONCURRENCY: "1",
              FORCE_COLOR: "0",
              NO_COLOR: "1",
            },
          });
        const opsEnvironment = () =>
          createProcessSmokeEnvironment({
            source: process.env,
            temporaryDirectory,
            overrides: {
              NODE_ENV: "test",
              IAM_OPS_DATABASE_URL: h.databaseUrl,
              IAM_OPS_REDIS_URL: redisUrl,
              IAM_OPS_LOG_FORMAT: "json",
              IAM_OPS_LOG_LEVEL: "info",
              IAM_OPS_USER_DOCUMENT_BACKFILL_BATCH_SIZE: "1",
              FORCE_COLOR: "0",
              NO_COLOR: "1",
            },
          });
        let commandNumber = 0;
        async function command(
          legacy: boolean,
          kind: "user" | "organization",
          operation: "backfill" | "repair" | "verify-postgres" | "verify-redis" | "verify",
          expectedExitCode = 0,
        ) {
          const gate = operation.startsWith("verify");
          const family = legacy ? (kind === "user" ? "user-profile" : "organization-search") : `${kind}-document`;
          const executable = join(
            (legacy ? baseline : candidate).runtime,
            legacy ? `${family}-${kind === "user" && gate ? "readiness" : operation}.exe` : "iam-ops.exe",
          );
          const args =
            kind === "user" && gate
              ? [operation, "--batch-size", "1"]
              : operation === "repair"
                ? ["--limit", "100"]
                : legacy && kind === "user"
                  ? []
                  : operation === "backfill"
                    ? ["--batch-size", "1"]
                    : [];
          const result = await runProcessCommandSmoke({
            label: `${legacy ? "old" : "new"} ${family} ${operation}`,
            start: () =>
              spawnOwnedProcessTree({
                executable,
                args: legacy
                  ? args
                  : [`${kind}-document`, operation, ...(kind === "user" && gate ? args.slice(1) : args)],
                cwd: (legacy ? baseline : candidate).runtime,
                env: legacy ? workerEnvironment(true) : opsEnvironment(),
              }),
            expectedExitCode,
            completionTimeoutMs: 45000,
            cleanupTimeoutMs: 5000,
          });
          await writeFile(
            join(failureDirectory!, `${++commandNumber}-${legacy ? "old" : "new"}-${kind}-${operation}.log`),
            result.output,
            { mode: 0o600 },
          );
          if (gate)
            check(
              result.output.includes(`"status":"${expectedExitCode === 0 ? "passed" : "failed"}"`),
              "Gate did not emit a complete result",
            );
          return result;
        }
        async function completeGates(legacy: boolean) {
          await command(legacy, "user", "verify-postgres");
          await command(legacy, "user", "verify-redis");
          await command(legacy, "organization", "verify");
        }
        async function drained(legacy: boolean) {
          for (const name of legacy
            ? ["user-profile", "organization-search"]
            : ["user-document", "organization-document"]) {
            const counts = await queues.get(name)!.getJobCounts("active", "waiting", "delayed", "failed");
            if (Object.values(counts).some((count) => count !== 0)) return false;
          }
          return true;
        }
        async function consume(legacy: boolean) {
          await runProcessSmoke({
            label: `${legacy ? "old" : "new"} controlled document Worker`,
            start: () =>
              spawnOwnedProcessTree({
                executable: join((legacy ? baseline : candidate).runtime, "worker.exe"),
                args: [],
                cwd: (legacy ? baseline : candidate).runtime,
                env: workerEnvironment(legacy),
              }),
            readinessTimeoutMs: 45000,
            cleanupTimeoutMs: 5000,
            childReadinessEvidence: "worker started",
            async probe() {
              const [inventory] = legacy
                ? await h.sql`SELECT (SELECT count(*)::int FROM user_profile p JOIN user_profile_dirty d USING(user_id) WHERE p.profile_schema_version=4 AND d.status='processed' AND p.source_dirty_version=d.dirty_version) AS users,
                  (SELECT count(*)::int FROM organization_search_document p JOIN organization_search_dirty d USING(organization_id) WHERE d.status='processed' AND p.source_version=d.version) AS organizations`
                : await h.sql`SELECT (SELECT count(*)::int FROM user_document p JOIN user_document_rebuild_state d USING(user_id) WHERE p.schema_version=1 AND d.status='processed' AND p.source_version=d.version AND d.post_publication_status='processed') AS users,
                  (SELECT count(*)::int FROM organization_document p JOIN organization_document_rebuild_state d USING(organization_id) WHERE p.schema_version=1 AND d.status='processed' AND p.source_version=d.version) AS organizations`;
              return inventory?.users === 5 && inventory.organizations === 4 && (await drained(legacy))
                ? true
                : undefined;
            },
          });
          check(await drained(legacy), "Prior executors were not drained");
        }
        await command(true, "user", "backfill");
        await command(true, "organization", "backfill");
        await consume(true);
        await completeGates(true);
        await mark("fixed-old-profile4-org1-full-inventory");
        let port = 0;
        const apiEnvironment = (context: Parameters<typeof createEntryEnvironment>[0], legacy: boolean) => {
          const environment = createEntryEnvironment(context, {
            IAM_API_DATABASE_URL: h.databaseUrl,
            // 固定旧制品不识别 URL；此适配不进入当前候选的环境。
            ...(legacy
              ? {
                  IAM_API_REDIS_HOST: redisConfig.host,
                  IAM_API_REDIS_PORT: String(redisConfig.port),
                  IAM_API_REDIS_DB: String(redisConfig.db),
                  IAM_API_REDIS_PASSWORD: redisConfig.password,
                }
              : { IAM_API_REDIS_URL: redisUrl }),
            IAM_API_SESSION_KERNEL_NAMESPACE: namespace,
            IAM_API_OIDC_NAMESPACE: oidcScope.namespace,
            IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: JSON.stringify({ "entry-smoke": loginKeys.privateKey }),
            IAM_API_USER_SESSION_TTL_SECONDS: "3600",
            IAM_API_CLIENT_SESSION_TTL_SECONDS: "3000",
            IAM_API_AUTH_CODE_TTL_SECONDS: "1800",
            IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS: "1800",
            IAM_API_OIDC_AUTHORIZATION_CODE_TTL_SECONDS: "1800",
            IAM_API_OIDC_CONTINUATION_TTL_SECONDS: "1800",
            IAM_API_OIDC_TOKEN_TTL_SECONDS: "1800",
          });
          if (legacy) delete environment.IAM_API_REDIS_URL;
          return environment;
        };
        const oldApi = createProcessSmokeSuite({
          label: "fixed95dc API",
          temporaryDirectoryPrefix: "iam-document-old-api-",
          hostname: "localhost",
          maxPortAllocationAttempts: 1,
        });
        stops.push(oldApi.cleanup);
        const state = await oldApi.run({
          start(context) {
            port = context.port;
            return spawnOwnedProcessTree({
              executable: join(baseline.runtime, "api.exe"),
              args: [],
              cwd: baseline.runtime,
              env: apiEnvironment(context, true),
            });
          },
          childReadinessEvidence: (context) => `server: http://${context.hostname}:${context.port}`,
          async probe(context, signal) {
            const api = protocol(`http://${context.hostname}:${context.port}`, signal);
            if ((await api.request("/ready")).status !== 200) return undefined;
            try {
              const root = await api.login(),
                revokedRoot = await api.login(),
                codeRoot = await api.login();
              return { root, revokedRoot, protocol: await createOldProtocolState(api, root, revokedRoot, codeRoot) };
            } catch (cause) {
              throw new FatalReadinessError("Old executable credential creation failed", { cause });
            }
          },
        });
        await operations.run(async (operation) => {
          const found = await kernel.forOperation(operation).resolveUserSession(state.revokedRoot);
          check(found.status === "resolved", "Old revoked root missing");
          await kernel.forOperation(operation).revokeObservedUserSession(found.value);
        });
        async function rootRecord() {
          return await operations.run(async (operation) => {
            const found = await kernel.forOperation(operation).resolveUserSession(state.root);
            check(found.status === "resolved", "Old root missing after cutover");
            return found.value.userSession;
          });
        }
        const rootBefore = await rootRecord();
        const sessionList = () =>
          operations.run((operation) =>
            kernel
              .forOperation(operation)
              .listSessions({ kind: "clientSession", userSessionId: rootBefore.userSessionId, offset: 0, limit: 100 }),
          );
        const sessionsBefore = await sessionList();
        const oidcBefore = await oidcScope.snapshot();
        const oidcTokenBefore = await oidcScope.readToken(state.protocol.oidcToken);
        const customInventory = async () =>
          (await customScope.tokenInventory()).sort((left, right) => (left.raw ?? "").localeCompare(right.raw ?? ""));
        const customBefore = await customInventory();
        const validCustomRecords = [];
        for (const bearer of [state.protocol.customToken, state.protocol.emptyToken, state.protocol.managedToken]) {
          const token = await customScope.inspectToken(bearer);
          check(token, "Old valid Custom Token missing");
          validCustomRecords.push({ bearer, record: token.record });
        }
        const customCodeBefore = await customScope.inspectCode(clients.custom, state.protocol.customCode);
        const oidcCodeBefore = await oidcScope.readCode(clients.oidc, state.protocol.oidcCode);
        check(customCodeBefore && oidcCodeBefore, "Preserved old Codes missing");
        async function protocolInventory() {
          const keys: string[] = [];
          for (const prefix of [namespace, oidcScope.namespace]) {
            let cursor = "0";
            do {
              const page = await redis.scan(cursor, "MATCH", `${prefix}:*`, "COUNT", 100);
              cursor = page[0];
              keys.push(...page[1]);
            } while (cursor !== "0");
          }
          const result = [];
          for (const key of [...new Set(keys)].sort())
            result.push({
              key,
              value: Buffer.from((await redis.dump(key)) ?? "").toString("base64"),
              expiresAt: await redis.pexpiretime(key),
            });
          return result;
        }
        const allProtocolBefore = await protocolInventory();
        // Reproduce already-processed, structurally valid stale publications without registering new work.
        await h.sql`UPDATE organization SET org_name='Current Root' WHERE id=1`;
        await h.sql`UPDATE "user" SET name='Current Bob' WHERE id=2`;
        const [stale] = await h.sql`SELECT (SELECT count(*)::int FROM user_profile WHERE name='Bob') AS users,
          (SELECT count(*)::int FROM organization_search_document WHERE document->'organization'->>'name'='Root') AS organizations`;
        same(stale, { users: 1, organizations: 1 }, "Old processed stale inventory was not established");
        const [audit] = await h.sql<{ id: number }[]>`SELECT max(id)::int AS id FROM audit_log`;
        check(audit, "Audit inventory missing");
        const sourceBefore = await sourceFingerprint(h, audit.id);
        const journalBefore = await h.sql`SELECT id,hash,created_at FROM __drizzle_migrations ORDER BY id`;
        await mark("old-api-created-root-client-sessions-tokens-codes-continuations-stopped-drained");
        await h.migrateCurrent();
        const journalAfter = await h.sql`SELECT id,hash,created_at FROM __drizzle_migrations ORDER BY id`;
        same(journalAfter.slice(0, journalBefore.length), [...journalBefore], "Migration journal prefix changed");
        check(journalAfter.length > journalBefore.length, "Candidate did not apply its formal migrations");
        await command(false, "user", "verify-postgres", 1);
        await command(false, "user", "verify-redis", 1);
        await command(false, "organization", "verify", 1);
        same(
          await customScope.inspectCode(clients.custom, state.protocol.customCode),
          customCodeBefore,
          "Unready cutover consumed Custom Code",
        );
        same(
          await oidcScope.readCode(clients.oidc, state.protocol.oidcCode),
          oidcCodeBefore,
          "Unready cutover consumed OIDC Code",
        );
        await mark("formal-migration-pre-rebuild-all-gates-reject-codes-unconsumed");
        await command(false, "user", "backfill");
        await command(false, "organization", "backfill");
        await consume(false);
        await command(false, "user", "repair");
        await command(false, "organization", "repair");
        await consume(false);
        await completeGates(false);
        same(
          await sourceFingerprint(h, audit.id),
          sourceBefore,
          "Migration/rebuild altered source facts or credentials",
        );
        same(await rootRecord(), rootBefore, "Migration/rebuild altered root identity/deadline");
        same(await sessionList(), sessionsBefore, "Migration/rebuild altered ClientSession binding/deadline");
        same(await oidcScope.snapshot(), oidcBefore, "Migration/rebuild altered OIDC records/absolute expirations");
        same(await customInventory(), customBefore, "Migration/rebuild altered Custom records/absolute expirations");
        same(
          await protocolInventory(),
          allProtocolBefore,
          "Migration/rebuild changed protocol/session/continuation state or original Redis deadlines",
        );
        same(await redis.get(sentinel), "unrelated-state", "Migration/rebuild altered unrelated Redis state");
        await mark("all-objects-document-tombstone-outbox-state-facts-barrier-gates-passed");
        const snapshots = createClientSnapshots({
          redis,
          source: {
            loadClient: async () => {
              throw new Error("Invalidation must not load source");
            },
            loadCredential: async () => null,
          },
        });
        const newApi = createProcessSmokeSuite({
          label: "Document candidate same-origin API",
          temporaryDirectoryPrefix: "iam-document-new-api-",
          hostname: "localhost",
          allocatePort: async () => port,
          maxPortAllocationAttempts: 1,
        });
        stops.push(newApi.cleanup);
        await newApi.run({
          start: (context) =>
            spawnOwnedProcessTree({
              executable: join(candidate.runtime, "api.exe"),
              args: [],
              cwd: candidate.runtime,
              env: apiEnvironment(context, false),
            }),
          childReadinessEvidence: (context) => `server: http://${context.hostname}:${context.port}`,
          async probe(context, signal) {
            const api = protocol(`http://${context.hostname}:${context.port}`, signal);
            if ((await api.request("/ready")).status !== 200) return undefined;
            try {
              await verifyNewProtocolState(api, state.protocol, subject, state.root);
              await h.sql`UPDATE client SET status=${ClientStatus.Maintenance} WHERE client_code=${clients.custom}`;
              await snapshots.invalidateClient(clients.custom);
              check((await api.customInfo(state.protocol.customToken)).status === 503, "Maintenance allowed old Token");
              await h.sql`UPDATE client SET status=${ClientStatus.Enable} WHERE client_code=${clients.custom}`;
              await snapshots.invalidateClient(clients.custom);
              const blocking = await barrier.beginBlocking(subject);
              check((await api.customInfo(state.protocol.customToken)).status === 503, "Blocking allowed old Token");
              await barrier.rollback(blocking);
              check((await api.customInfo(state.protocol.customToken)).status === 200, "Old Token did not recover");
              return true;
            } catch (cause) {
              throw new FatalReadinessError("New artifact old-state smoke failed", { cause });
            }
          },
        });
        same(await rootRecord(), rootBefore, "Protocol delivery renewed the root");
        // Delivery may open/extend ClientSession within its original root; existing Tokens must keep their original deadline.
        const deliveredInventory = await customInventory();
        for (const { bearer, record } of validCustomRecords) {
          same(
            (await customScope.inspectToken(bearer))?.record,
            record,
            "Protocol delivery renewed or replaced a valid old Custom Token",
          );
          const original = customBefore.find((item) => item.raw && JSON.parse(item.raw).tokenId === record.tokenId);
          check(original, "Valid old Token Redis deadline missing");
          same(
            deliveredInventory.find((item) => item.raw === original.raw),
            original,
            "Protocol delivery extended valid old Custom Token Redis deadline",
          );
        }
        same(
          await oidcScope.readToken(state.protocol.oidcToken),
          oidcTokenBefore,
          "Protocol delivery renewed or replaced old OIDC Token",
        );
        await mark("new-artifact-reuses-old-state-wire4-oidc-client-isolation-and-once-consumption");
        await command(false, "user", "repair");
        await command(false, "organization", "repair");
        await consume(false);
        await completeGates(false);
        same(await sourceFingerprint(h, audit.id), sourceBefore, "Controlled smoke altered immutable source inventory");
        same(await redis.get(sentinel), "unrelated-state", "Controlled smoke altered unrelated Redis state");
        await requireCandidate(config.candidate);
        Object.assign(evidence, {
          inventoryUsers: 5,
          inventoryOrganizations: 4,
          includesEnablePauseDisableDeleted: true,
          staleProcessedUserAndOrganizationRebuilt: true,
          oldProfileSchema: 4,
          newDocumentSchema: 1,
          oldCustomWire: 3,
          newCustomWire: 4,
          sourceHmacBefore: sourceBefore,
          sourceHmacAfter: await sourceFingerprint(h, audit.id),
          migrationJournalBefore: journalBefore.length,
          migrationJournalAfter: journalAfter.length,
        });
        await mark("controlled-readers-stopped-drained-final-three-complete-gates-passed");
      },
    });
  } catch (failure) {
    executionFailure = failure;
  }
  const cleanupFailures: unknown[] = [];
  try {
    await resetExclusiveRedisTestDatabase({ redis, stopExecutors: stops });
  } catch (failure) {
    cleanupFailures.push(failure);
  }
  try {
    await redis.quit();
  } catch (failure) {
    cleanupFailures.push(failure);
  } finally {
    redis.disconnect();
  }
  if (executionFailure || cleanupFailures.length)
    throw new AggregateError(
      [...(executionFailure ? [executionFailure] : []), ...cleanupFailures],
      "Document cutover execution/cleanup failed",
    );
  evidence.status = "passed";
  await mark("fixture-executors-database-and-redis-cleaned");
}
void main().catch(async (failure) => {
  if (failureDirectory) {
    const phase = process.argv.includes("--managed-api-resources") ? "execution" : "resources";
    await writeFile(join(failureDirectory, `failure-${phase}.log`), inspect(failure, { depth: 10 }), { mode: 0o600 });
    const path = join(failureDirectory, "report.json");
    let report = {};
    try {
      report = JSON.parse(await readFile(path, "utf8"));
    } catch {
      /* Preflight failed before phase receipts. */
    }
    await writeFile(path, JSON.stringify({ ...report, status: "failed" }, null, 2), { mode: 0o600 });
  }
  console.error("Document cutover failed; inspect the controlled evidence directory");
  process.exitCode = 1;
});

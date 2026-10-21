/**
 * 一次性跨制品验收：owner=@iam/api；reason=Spec #269 保留旧协议状态；removal date=2026-11-21。
 * 显式传入固定旧制品 manifest；不进入默认 Integration，不提供线上多代读取。
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { createClientSnapshots } from "@iam/api-core/client-snapshot/composition";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import {
  parseDedicatedRedisTestUrl,
  resetExclusiveRedisTestDatabase,
} from "@iam/api-core/testing/external-test-resources";
import {
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  FatalReadinessError,
  runProcessCommandSmoke,
  runProcessSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { ClientStatus, USER_PROFILE_QUEUE_NAME } from "@iam/contracts";
import { createJobQueue } from "@iam/jobs";
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
  readBaseline,
  seedSource,
  sourceFingerprint,
} from "./source.fixture";

const configSchema = z
  .object({ baselineManifest: z.string(), outputDirectory: z.string(), candidate: z.string().min(1) })
  .strict();
const apiRoot = fileURLToPath(new URL("../../", import.meta.url));
const workerRoot = fileURLToPath(new URL("../../../worker/", import.meta.url));
const configPath = process.argv[2];
let failureDirectory: string | undefined;

async function main() {
  check(configPath, "Expected one explicit cutover config path");
  const config = configSchema.parse(JSON.parse(await readFile(configPath, "utf8")));
  failureDirectory = resolve(config.outputDirectory);
  await mkdir(failureDirectory, { recursive: true });
  if (!process.argv.includes("--managed-api-resources")) {
    await runManagedApiFixture({
      args: process.argv.slice(2),
      entry: "test-integration/privilege-retirement/cutover.fixture.ts",
      label: "Privilege retirement cutover",
      projectPrefix: "iam-privilege-cutover",
    });
    return;
  }
  await requireManagedApiResources();
  const baseline = await readBaseline(config.baselineManifest);
  const redisUrl = requiredText(process.env.IAM_API_TEST_REDIS_URL, "Managed Redis URL missing");
  const databaseUrl = requiredText(process.env.IAM_API_TEST_DATABASE_URL, "Managed PostgreSQL URL missing");
  const redisConfig = parseDedicatedRedisTestUrl({ name: "IAM_API_TEST_REDIS_URL", value: redisUrl });
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  const stops: Array<() => Promise<void> | void> = [];
  const evidence: Record<string, unknown> = {
    candidate: config.candidate,
    baseline: BASELINE_COMMIT,
    startedAt: new Date().toISOString(),
    phases: [],
  };
  const phases: Array<{ phase: string; passedAt: string }> = [];
  const mark = async (phase: string) => {
    phases.push({ phase, passedAt: new Date().toISOString() });
    await writeFile(join(config.outputDirectory, "report.json"), JSON.stringify({ ...evidence, phases }, null, 2), {
      mode: 0o600,
    });
    console.log(`cutover phase passed: ${phase}`);
  };
  try {
    await withOwnedTemporaryDirectory({
      prefix: "iam-retirement-cutover-",
      cleanupTimeoutMs: 5000,
      async run(temporaryDirectory) {
        const h = await createCutoverDatabase(databaseUrl, baseline.migrations);
        stops.push(h.close);
        const users = await seedSource(h);
        const subject = requiredText(users[0]?.subject_identifier, "Source user Subject missing");
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
        const makeKernel = (ttl = 3600) =>
          old.createUnifiedSessionKernel<SubjectAccessOperation>({
            redis,
            namespace,
            userSessionTtlSeconds: ttl,
            clientSessionTtlSeconds: 1800,
            assertOperationActive: old.requireSubjectAccessOperation,
          });
        const kernel = makeKernel();
        let operations: ReturnType<typeof old.createSubjectAccessOperations>;
        const revocation = old.createUnifiedSubjectAccessSessionRevocation(kernel, {
          run: (callback) => operations.run(callback),
        });
        operations = old.createSubjectAccessOperations({ barrier, revocation });
        async function root(ttl = 3600) {
          return await operations.run(async (operation) => {
            const permission = await operation.acquireForAuthentication(subject);
            return await makeKernel(ttl)
              .forOperation(operation)
              .createUserSession({
                subjectIdentifier: subject,
                subjectContext: operation.getSubjectContext(permission),
                amr: ["pwd"],
              });
          });
        }
        const rootSession = await root();
        const revokedRoot = await root();
        const queue = createJobQueue({ name: USER_PROFILE_QUEUE_NAME, redis: redisConfig });
        stops.push(() => queue.close());
        const sentinel = `iam:test:cutover:${randomUUID()}`;
        await redis.set(sentinel, "unrelated-state");
        const workerEnv = createProcessSmokeEnvironment({
          source: process.env,
          temporaryDirectory,
          overrides: {
            NODE_ENV: "test",
            IAM_WORKER_DATABASE_URL: h.databaseUrl,
            IAM_WORKER_REDIS_HOST: redisConfig.host,
            IAM_WORKER_REDIS_PORT: String(redisConfig.port),
            IAM_WORKER_REDIS_DB: String(redisConfig.db),
            IAM_WORKER_REDIS_PASSWORD: redisConfig.password,
            IAM_WORKER_ENABLED_MODULES: "user-profile",
            IAM_WORKER_HTTP_ENABLED: "false",
            IAM_WORKER_BULL_BOARD_ENABLED: "false",
            IAM_WORKER_LOG_FORMAT: "json",
            IAM_WORKER_LOG_LEVEL: "info",
            IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE: "1",
            IAM_WORKER_USER_PROFILE_CONCURRENCY: "1",
            FORCE_COLOR: "0",
            NO_COLOR: "1",
          },
        });
        let commandNumber = 0;
        async function command(
          oldArtifact: boolean,
          operation: "backfill" | "repair" | "verify-postgres" | "verify-redis",
          expectedExitCode = 0,
        ) {
          const readiness = operation.startsWith("verify-");
          const executable = oldArtifact
            ? join(baseline.runtime, readiness ? "user-profile-readiness.exe" : "user-profile-backfill.exe")
            : process.execPath;
          const args = oldArtifact
            ? readiness
              ? [operation, "--batch-size", "1"]
              : []
            : [
                "--no-env-file",
                "run",
                `src/commands/user-profile/user-profile-${readiness ? "readiness" : operation}.ts`,
                ...(readiness ? [operation, "--batch-size", "1"] : operation === "repair" ? ["--limit", "20"] : []),
              ];
          const result = await runProcessCommandSmoke({
            label: `${oldArtifact ? "old" : "current"} ${operation}`,
            start: () =>
              spawnOwnedProcessTree({
                executable,
                args,
                cwd: oldArtifact ? baseline.runtime : workerRoot,
                env: workerEnv,
              }),
            expectedExitCode,
            completionTimeoutMs: 30000,
            cleanupTimeoutMs: 5000,
          });
          await writeFile(
            join(config.outputDirectory, `${++commandNumber}-${oldArtifact ? "old" : "current"}-${operation}.log`),
            result.output,
            { mode: 0o600 },
          );
          if (readiness)
            check(
              result.output.includes(`"status":"${expectedExitCode === 0 ? "passed" : "failed"}"`),
              "Readiness command did not produce a complete status report",
            );
          return result;
        }
        async function consume(version: number, oldArtifact: boolean) {
          await runProcessSmoke({
            label: `${oldArtifact ? "old" : "current"} controlled Worker`,
            start: () =>
              spawnOwnedProcessTree({
                executable: oldArtifact ? join(baseline.runtime, "worker.exe") : process.execPath,
                args: oldArtifact ? [] : ["--no-env-file", "run", "src/index.ts"],
                cwd: oldArtifact ? baseline.runtime : workerRoot,
                env: workerEnv,
              }),
            readinessTimeoutMs: 30000,
            cleanupTimeoutMs: 5000,
            childReadinessEvidence: "worker started",
            async probe() {
              const [inventory] =
                await h.sql`SELECT count(*)::int AS users, count(*) FILTER(WHERE p.profile_schema_version=${version} AND d.status='processed' AND p.source_dirty_version=d.dirty_version)::int AS complete FROM "user" u LEFT JOIN user_profile p ON p.user_id=u.id LEFT JOIN user_profile_dirty d ON d.user_id=u.id`;
              const counts = await queue.getJobCounts("active", "waiting", "delayed", "failed");
              if (
                inventory?.users === 4 &&
                inventory.complete === 4 &&
                Object.values(counts).every((count) => count === 0)
              )
                return true;
              return undefined;
            },
          });
          const pending = await queue.getJobCounts("active", "waiting", "delayed", "failed");
          check(
            Object.values(pending).every((count) => count === 0),
            "Prior publisher or queue work was not drained",
          );
        }

        await command(true, "backfill");
        await consume(3, true);
        await command(true, "verify-postgres");
        await command(true, "verify-redis");
        await mark("fixed-old-profile-and-full-inventory");
        let originPort = 0;
        let expiredRootDeadline = 0;
        const apiEnvironment = (context: Parameters<typeof createEntryEnvironment>[0]) =>
          createEntryEnvironment(context, {
            IAM_API_DATABASE_URL: h.databaseUrl,
            IAM_API_REDIS_HOST: redisConfig.host,
            IAM_API_REDIS_PORT: String(redisConfig.port),
            IAM_API_REDIS_DB: String(redisConfig.db),
            IAM_API_REDIS_PASSWORD: redisConfig.password,
            IAM_API_SESSION_KERNEL_NAMESPACE: namespace,
            IAM_API_OIDC_NAMESPACE: oidcScope.namespace,
            IAM_API_USER_SESSION_TTL_SECONDS: "3600",
            IAM_API_CLIENT_SESSION_TTL_SECONDS: "1800",
            IAM_API_AUTH_CODE_TTL_SECONDS: "1200",
            IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS: "1200",
            IAM_API_OIDC_AUTHORIZATION_CODE_TTL_SECONDS: "1200",
            IAM_API_OIDC_CONTINUATION_TTL_SECONDS: "1200",
            IAM_API_OIDC_TOKEN_TTL_SECONDS: "1200",
          });
        const oldApi = createProcessSmokeSuite({
          label: "fixed baseline API",
          temporaryDirectoryPrefix: "iam-old-api-",
          hostname: "localhost",
          maxPortAllocationAttempts: 1,
        });
        stops.push(oldApi.cleanup);
        const state = await oldApi.run({
          start(context) {
            originPort = context.port;
            return spawnOwnedProcessTree({
              executable: join(baseline.runtime, "api.exe"),
              args: [],
              cwd: baseline.runtime,
              env: apiEnvironment(context),
            });
          },
          childReadinessEvidence: (context) => `server: http://${context.hostname}:${context.port}`,
          async probe(context, signal) {
            const origin = `http://${context.hostname}:${context.port}`;
            if ((await fetch(`${origin}/ready`, { signal })).status !== 200) return undefined;
            try {
              const expiringRoot = await root(5);
              expiredRootDeadline = expiringRoot.observation.userSession.expiresAt;
              return await createOldProtocolState(
                protocol(origin, signal),
                rootSession.bearer,
                expiringRoot.bearer,
                revokedRoot.bearer,
              );
            } catch (cause) {
              throw new FatalReadinessError("Fixed baseline protocol creation failed", { cause });
            }
          },
        });
        await operations.run(async (operation) => {
          const observation = await kernel.forOperation(operation).resolveUserSession(revokedRoot.bearer);
          check(observation.status === "resolved", "Old revocation fixture root missing");
          await kernel.forOperation(operation).revokeObservedUserSession(observation.value);
        });
        await mark("old-protocol-state-created-and-readers-stopped");
        const [audit] = await h.sql<{ id: number }[]>`SELECT max(id)::int AS id FROM audit_log`;
        check(audit, "Source audit inventory missing");
        const sourceBefore = await sourceFingerprint(h, audit.id);
        const oldCustomRecord = (await customScope.inspectToken(state.customToken))?.record;
        const oldCustomCode = await customScope.inspectCode(clients.custom, state.customCode);
        const oldOidcRecord = await oidcScope.readToken(state.oidcToken);
        const oldOidcCode = await oidcScope.readCode(clients.oidc, state.oidcCode);
        const oldOidcInventory = await oidcScope.snapshot();
        const oldCustomInventory = (await customScope.tokenInventory())
          .filter((entry) => entry.expiresAt > Date.now() + 60000)
          .sort((left, right) => (left.raw ?? "").localeCompare(right.raw ?? ""));
        const oldClientSessions = await operations.run((operation) =>
          kernel.forOperation(operation).listSessions({
            kind: "clientSession",
            userSessionId: rootSession.observation.userSession.userSessionId,
            offset: 0,
            limit: 100,
          }),
        );
        const oldRootRecord = await operations.run(async (operation) => {
          const result = await kernel.forOperation(operation).resolveUserSession(rootSession.bearer);
          check(result.status === "resolved", "Old root missing");
          return result.value.userSession;
        });
        await h.migrateCurrent();
        const [retired] =
          await h.sql`SELECT to_regclass(current_schema() || '.privilege') AS privilege,to_regclass(current_schema() || '.role_privilege') AS role_privilege`;
        same(retired, { privilege: null, role_privilege: null }, "Formal migration did not contract permission source");
        await command(false, "verify-postgres", 1);
        await command(false, "verify-redis", 1);
        same(
          await customScope.inspectCode(clients.custom, state.customCode),
          oldCustomCode,
          "Unready cutover consumed the preserved Custom Code",
        );
        same(
          await oidcScope.readCode(clients.oidc, state.oidcCode),
          oldOidcCode,
          "Unready cutover consumed the preserved OIDC Code",
        );
        await mark("formal-migration-old-schema-rejected-codes-unconsumed");
        // A full backfill replaces old dirty reasons before current repair or consumers run.
        await command(false, "backfill");
        await command(false, "repair");
        await consume(4, false);
        await command(false, "verify-postgres");
        await command(false, "verify-redis");
        same(await sourceFingerprint(h, audit.id), sourceBefore, "Migration or rebuilding changed a non-target fact");
        same(
          (await customScope.inspectToken(state.customToken))?.record,
          oldCustomRecord,
          "Rebuild changed old Custom Token identity or deadline",
        );
        same(await oidcScope.snapshot(), oldOidcInventory, "Rebuild changed OIDC records or absolute Redis deadlines");
        const currentCustomInventory = (await customScope.tokenInventory())
          .filter((entry) => oldCustomInventory.some((previous) => previous.raw === entry.raw))
          .sort((left, right) => (left.raw ?? "").localeCompare(right.raw ?? ""));
        same(
          currentCustomInventory,
          oldCustomInventory,
          "Rebuild changed retained Custom records or absolute Redis deadlines",
        );
        const currentClientSessions = await operations.run((operation) =>
          kernel.forOperation(operation).listSessions({
            kind: "clientSession",
            userSessionId: rootSession.observation.userSession.userSessionId,
            offset: 0,
            limit: 100,
          }),
        );
        same(currentClientSessions, oldClientSessions, "Rebuild changed ClientSession identities or deadlines");
        same(await redis.get(sentinel), "unrelated-state", "Maintenance changed unrelated Redis data");
        await mark("current-full-inventory-postgres-and-redis-gates");
        // Wait only for the owner's known natural deadline when the remaining work finished unusually quickly.
        if (expiredRootDeadline >= Date.now()) await delay(expiredRootDeadline - Date.now() + 10);
        const snapshots = createClientSnapshots({
          redis,
          source: {
            loadClient: async () => {
              throw new Error("Invalidation never reads Client source");
            },
            loadCredential: async () => null,
          },
        });
        const newApi = createProcessSmokeSuite({
          label: "new candidate API same issuer",
          temporaryDirectoryPrefix: "iam-new-api-",
          hostname: "localhost",
          allocatePort: async () => originPort,
          maxPortAllocationAttempts: 1,
        });
        stops.push(newApi.cleanup);
        await newApi.run({
          start: (context) =>
            spawnOwnedProcessTree({
              executable: process.execPath,
              args: ["--no-env-file", "run", "src/index.ts"],
              cwd: apiRoot,
              env: apiEnvironment(context),
            }),
          childReadinessEvidence: (context) => `server: http://${context.hostname}:${context.port}`,
          async probe(context, signal) {
            const origin = `http://${context.hostname}:${context.port}`;
            if ((await fetch(`${origin}/ready`, { signal })).status !== 200) return undefined;
            try {
              const api = protocol(origin, signal);
              await verifyNewProtocolState(api, state, subject, rootSession.bearer);
              await h.sql`UPDATE client SET status=${ClientStatus.Maintenance} WHERE client_code=${clients.custom}`;
              await snapshots.invalidateClient(clients.custom);
              check(
                (await api.customInfo(state.customToken)).status === 503,
                "Client Maintenance must still reject old Token access",
              );
              await h.sql`UPDATE client SET status=${ClientStatus.Enable} WHERE client_code=${clients.custom}`;
              await snapshots.invalidateClient(clients.custom);
              const blocking = await barrier.beginBlocking(subject);
              check(
                (await api.customInfo(state.customToken)).status === 503,
                "Subject Access blocking must still reject old Token access",
              );
              await barrier.rollback(blocking);
              check(
                (await api.customInfo(state.customToken)).status === 200,
                "Valid old Token must recover without re-login",
              );
              return true;
            } catch (cause) {
              throw new FatalReadinessError("New candidate old-state protocol smoke failed", { cause });
            }
          },
        });
        await mark("same-issuer-new-api-accepts-old-state-and-keeps-rejections");
        same(
          (await customScope.inspectToken(state.customToken))?.record,
          oldCustomRecord,
          "Old Custom Token was renewed by delivery",
        );
        same(await oidcScope.readToken(state.oidcToken), oldOidcRecord, "Old OIDC Token was renewed by delivery");
        const newRootRecord = await operations.run(async (operation) => {
          const result = await kernel.forOperation(operation).resolveUserSession(rootSession.bearer);
          check(result.status === "resolved", "Root was lost during cutover");
          return result.value.userSession;
        });
        same(newRootRecord, oldRootRecord, "Root identity or fixed deadline changed during cutover");
        await command(false, "repair");
        await consume(4, false);
        await command(false, "verify-postgres");
        await command(false, "verify-redis");
        same(
          await sourceFingerprint(h, audit.id),
          sourceBefore,
          "Smoke lost an existing source, credential, delegation or audit fact",
        );
        same(await redis.get(sentinel), "unrelated-state", "Smoke changed unrelated Redis data");
        Object.assign(evidence, {
          inventoryUsers: 4,
          includesDisabledAndDeleted: true,
          oldProfileVersion: 3,
          newProfileVersion: 4,
          oldWireVersion: 2,
          newWireVersion: 3,
          status: "passed",
        });
        await mark("smoke-stopped-drained-final-independent-full-gates");
      },
    });
  } finally {
    try {
      await resetExclusiveRedisTestDatabase({ redis, stopExecutors: stops });
    } finally {
      try {
        await redis.quit();
      } finally {
        redis.disconnect();
      }
    }
  }
}

void main().catch(async (error) => {
  if (failureDirectory) {
    const phase = process.argv.includes("--managed-api-resources") ? "execution" : "resources";
    await writeFile(join(failureDirectory, `failure-${phase}.log`), inspect(error, { depth: 8 }), { mode: 0o600 });
    const reportPath = join(failureDirectory, "report.json");
    let report: Record<string, unknown> = {};
    try {
      report = JSON.parse(await readFile(reportPath, "utf8"));
    } catch {
      /* No phase completed. */
    }
    await writeFile(reportPath, JSON.stringify({ ...report, status: "failed", failurePhase: phase }, null, 2));
  }
  console.error("Privilege retirement rehearsal failed; inspect the controlled evidence directory");
  process.exitCode = 1;
});

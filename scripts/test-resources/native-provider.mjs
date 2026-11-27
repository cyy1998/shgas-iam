import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { closeOwnedProcessScope, ownedProcessScopeEnvironment, spawnOwnedProcessTree } from "@iam/runtime/process";
import {
  requireDedicatedPostgresTestUrl,
  TEST_POSTGRES_URL_ENV,
} from "../../packages/test-support/src/dedicated-postgres-test-url.mjs";
import { waitForApisixAdmin } from "./apisix-admin.mjs";
import { managedCleanupCommand, saveManagedResourceRun, writeAtomicResourceRecord } from "./managed-resources.mjs";
import { runOwnedCommand } from "./owned-command.mjs";
import { parseTestRedisUrl } from "./redis-preflight.mjs";

const NATIVE_TEMP_PREFIX = "iam-test-native-";
const APISIX_CONFIG_PATH = "apps/gateway/test-integration/support/apisix.config.yaml";
const [PG_USER, PG_PASS, PG_DB, PG_BIN] = ["iam_test", "iam_test", "iam_test", "/usr/lib/postgresql/18/bin"];
const OPENRESTY_BINS = [
  "/usr/local/openresty/luajit/bin",
  "/usr/local/openresty/nginx/sbin",
  "/usr/local/openresty/bin",
];
const PROXY_KEYS = ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"];
const activeRunStates = new Map();
const runtimeRecordPath = (run) => join(run.root, run.record.artifactDirectory, "native-runtime.json");

function stripProxyEnv(env) {
  const cleaned = { ...env };
  for (const key of PROXY_KEYS) delete cleaned[key];
  const parts = (cleaned.PATH ?? "").split(":").filter(Boolean);
  const prepend = existsSync(PG_BIN) && !parts.includes(PG_BIN) ? [PG_BIN] : [];
  cleaned.PATH = [...prepend, ...parts, ...OPENRESTY_BINS.filter((d) => existsSync(d) && !parts.includes(d))].join(":");
  cleaned.NO_PROXY = cleaned.no_proxy = "127.0.0.1,localhost,::1";
  return cleaned;
}

function assertSafeTempRoot(tempRoot) {
  if (typeof tempRoot !== "string" || !isAbsolute(tempRoot) || !basename(tempRoot).startsWith(NATIVE_TEMP_PREFIX))
    throw new Error(`Refusing to operate on unexpected native temp directory: ${String(tempRoot)}`);
}

async function readLogTail(logFile, maxBytes = 64 * 1024) {
  try {
    const text = await readFile(logFile, "utf8");
    return text.length <= maxBytes ? text : text.slice(-maxBytes);
  } catch (err) {
    return err?.code === "ENOENT" ? "" : `[could not read ${logFile}: ${err.message}]`;
  }
}

async function allocateLoopbackPorts(count) {
  const servers = [];
  try {
    const ports = [];
    for (let i = 0; i < count; i++) {
      const s = createServer();
      await new Promise((res, rej) => s.once("error", rej).listen(0, "127.0.0.1", res));
      servers.push(s);
      const addr = s.address();
      if (!addr || typeof addr === "string") throw new Error("Could not allocate loopback TCP port");
      ports.push(addr.port);
    }
    return ports;
  } finally {
    await Promise.all(servers.map((s) => new Promise((r) => s.close(() => r()))));
  }
}

function unquoteYaml(raw) {
  const s = raw.trim();
  const m = (s.startsWith('"') || s.startsWith("'")) && s.match(/^(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)')/u);
  return m
    ? m[1] !== undefined
      ? JSON.parse(`"${m[1]}"`)
      : m[2].replaceAll("''", "'")
    : s.replace(/\s+#.*$/u, "").trim();
}

export function buildNativeApisixConfig(sourceYaml, { httpPort, adminPort, etcdClientPort, apisixDir }) {
  if (typeof sourceYaml !== "string" || !sourceYaml.trim())
    throw new Error("APISIX config YAML must be a non-empty string");
  const match = sourceYaml.match(
    /^([ \t]*)admin_key:[ \t]*(?:#.*)?\r?\n((?:\1[ \t]+.*\r?\n?|\1-.*\r?\n?|[ \t]*\r?\n)*)/mu,
  );
  const rawItems = (match?.[2] ?? "").split(/\r?\n/u).filter((l) => l.trim() && !l.trimStart().startsWith("#"));
  const entries = [];
  for (const line of rawItems) {
    const t = line.trim();
    if (t.startsWith("-")) entries.push({});
    const kv = t.replace(/^-\s*/u, "").match(/^([a-zA-Z0-9_]+):\s*(.+)$/u);
    if (kv && entries.length) entries.at(-1)[kv[1]] = unquoteYaml(kv[2]);
  }
  const adminKey = entries.find((e) => e.role === "admin")?.key?.trim();
  if (!adminKey) throw new Error(`Could not find admin role key in ${APISIX_CONFIG_PATH}`);
  const minIndent = Math.min(...rawItems.map((l) => l.search(/\S/u)));
  const adminKeyBlock = rawItems.map((l) => `      ${l.slice(minIndent)}`).join("\n");
  const preserved = sourceYaml
    .split(/^(?=[A-Za-z0-9_]+:)/mu)
    .filter((s) => s.trim() && !/^(?:deployment|apisix|nginx_config):/u.test(s))
    .map((s) => s.trimEnd())
    .join("\n");

  const yaml = `deployment:
  role: traditional
  role_traditional:
    config_provider: etcd
  admin:
    admin_api_version: v3
    admin_listen:
      ip: 127.0.0.1
      port: ${adminPort}
    allow_admin:
      - 127.0.0.1/32
    admin_key:
${adminKeyBlock}
  etcd:
    host:
      - "http://127.0.0.1:${etcdClientPort}"
apisix:
  node_listen:
    - ip: 127.0.0.1
      port: ${httpPort}
  enable_admin: true
  enable_ipv6: false
  enable_reuseport: false
  enable_control: false
  dns_resolver:
    - 127.0.0.1
  ssl:
    enable: false
  proxy_cache:
    zones:
      - name: disk_cache_one
        memory_size: 16m
        disk_size: 64m
        disk_path: ${JSON.stringify(join(apisixDir, "disk_cache_one"))}
        cache_levels: "1:2"
      - name: memory_cache
        memory_size: 16m
${preserved ? `${preserved}\n` : ""}nginx_config:
  error_log: logs/error.log
  error_log_level: warn
  worker_processes: 1
  worker_rlimit_nofile: 2048
  event:
    worker_connections: 1024
  main_configuration_snippet: "daemon off;"
  envs:
    - IAM_OWNED_PROCESS_MARKERS
    - IAM_OWNED_PROCESS_SCOPE_ID
    - IAM_OWNED_PROCESS_SCOPE_FILE
  http:
    enable_access_log: false
`;
  return { adminKey, yaml };
}

async function saveRuntimeMetadata(run, state) {
  const { scopeId, scopeActiveFile, tempRoot, services, daemons, extraLogFiles } = state;
  const write = () =>
    writeAtomicResourceRecord(runtimeRecordPath(run), {
      schemaVersion: 1,
      runId: run.record.runId,
      scopeId,
      scopeActiveFile,
      tempRoot,
      services: [...services],
      daemons: daemons.map(({ service, pid, pgid, logFile }) => ({ service, pid, pgid, logFile })),
      extraLogFiles: [...extraLogFiles],
    });
  const pending = (state.metadataSaveQueue ?? Promise.resolve()).then(write, write);
  state.metadataSaveQueue = pending.catch(() => {});
  await pending;
}

async function loadRuntimeMetadata(run) {
  try {
    const parsed = JSON.parse(await readFile(runtimeRecordPath(run), "utf8"));
    if (parsed?.schemaVersion !== 1 || parsed.runId !== run.record.runId)
      throw new Error(`Invalid native runtime metadata in ${runtimeRecordPath(run)}`);
    return parsed;
  } catch (err) {
    if (err?.code === "ENOENT") return undefined;
    throw err;
  }
}

async function collectNativeDiagnostics(run, metadata) {
  const sources = [
    ...(metadata?.daemons ?? []).filter((d) => d.logFile).map((d) => ({ label: d.service, path: d.logFile })),
    ...(metadata?.extraLogFiles ?? []).filter((e) => e?.path),
  ];
  const sections = (
    await Promise.all(
      sources.map(async ({ label, path }) => {
        const tail = await readLogTail(path);
        return tail ? `===== ${label} (${path}) =====\n${tail.trimEnd()}\n` : "";
      }),
    )
  ).filter(Boolean);
  if (!sections.length) return;
  const dest = join(run.root, run.record.artifactDirectory, "native-services.log");
  await writeFile(dest, sections.join("\n"), { mode: 0o600 }).catch((err) =>
    console.warn(`Warning: native service diagnostics could not be saved: ${err.message}`),
  );
}

async function spawnAndSave(ctx, service, executable, args, cwd) {
  ctx.signal?.throwIfAborted();
  const logFile = join(ctx.state.tempRoot, "logs", `${service}.log`);
  const child = spawnOwnedProcessTree({
    executable: "/bin/sh",
    args: ["-c", 'log=$1; shift; exec "$@" >>"$log" 2>&1', `iam-native-${service}`, logFile, executable, ...args],
    cwd,
    env: ctx.env,
  });
  const daemon = { service, pid: child.pid, pgid: child.pid, logFile, child, exitReason: undefined };
  daemon.exited = new Promise((resolve) => {
    child.once("error", (err) => {
      daemon.exitReason = err.message;
      resolve();
    });
    child.once("exit", (code, sig) => {
      daemon.exitReason = `exit=${code ?? "null"} signal=${sig ?? "null"}`;
      resolve();
    });
  });
  ctx.state.daemons.push(daemon);
  await saveRuntimeMetadata(ctx.run, ctx.state);
  return daemon;
}

async function pollReady(ctx, label, maxMs, daemons, check, intervalMs = 50) {
  const timeoutMs = Math.min(ctx.timeoutMs ?? maxMs, maxMs);
  const deadline = performance.now() + timeoutMs;
  let lastError;
  while (performance.now() < deadline) {
    ctx.signal?.throwIfAborted();
    for (const d of daemons) {
      if (d.exitReason !== undefined) {
        const tail = await readLogTail(d.logFile, 16 * 1024);
        throw new Error(
          `${label} failed before becoming ready: ${d.service} exited unexpectedly (${d.exitReason})${tail ? `\n${tail}` : ""}`,
        );
      }
    }
    try {
      if (await check()) return;
    } catch (err) {
      if (ctx.signal?.aborted) throw ctx.signal.reason;
      lastError = err;
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    await delay(Math.min(intervalMs, remaining), undefined, { signal: ctx.signal });
  }
  const logs = await Promise.all(
    daemons.map(async (d) => {
      const tail = await readLogTail(d.logFile, 8 * 1024);
      return tail ? `\n--- ${d.service} log ---\n${tail}` : "";
    }),
  );
  throw new Error(`${label} did not become ready within ${timeoutMs}ms${logs.join("")}`, { cause: lastError });
}

async function runCmd(ctx, label, executable, args, { cwd = ctx.state.tempRoot, env = ctx.env, maxMs = 20_000 } = {}) {
  const timeoutMs = Math.min(ctx.timeoutMs ?? maxMs, maxMs);
  const res = await runOwnedCommand({
    executable,
    args,
    cwd,
    env,
    signal: ctx.signal,
    timeoutMs,
    cleanupTimeoutMs: ctx.cleanupTimeoutMs,
  });
  if (label && res.exitCode !== 0) throw new Error(`${label} failed with exit ${res.exitCode}:\n${res.output}`);
  return res;
}

async function startNativePostgres(ctx, port) {
  const [pgDataDir, pgSocketDir, pgPassFile] = ["pgdata", "pgsocket", "pgpass"].map((n) => join(ctx.state.tempRoot, n));
  await mkdir(pgSocketDir, { recursive: true, mode: 0o700 });
  await writeFile(pgPassFile, `${PG_PASS}\n`, { mode: 0o600 });
  const initOpts = "--auth-host=scram-sha-256 --auth-local=trust --no-sync --encoding=UTF8 --locale=C.UTF-8".split(" ");
  try {
    await runCmd(
      ctx,
      "Native PostgreSQL initdb",
      "initdb",
      ["-D", pgDataDir, "-U", PG_USER, "--pwfile", pgPassFile, ...initOpts],
      { maxMs: 30_000 },
    );
  } finally {
    await rm(pgPassFile, { force: true }).catch(() => {});
  }
  const pgConf =
    "fsync=off synchronous_commit=off full_page_writes=off max_wal_size=2GB checkpoint_timeout=15min dynamic_shared_memory_type=mmap";
  const pgArgs = ["-D", pgDataDir, "-h", "127.0.0.1", "-p", String(port), "-k", pgSocketDir].concat(
    pgConf.split(" ").flatMap((c) => ["-c", c]),
  );
  const daemon = await spawnAndSave(ctx, "postgres", "postgres", pgArgs, ctx.state.tempRoot);
  const pgConn = ["-h", "127.0.0.1", "-p", String(port), "-U", PG_USER];
  await pollReady(
    ctx,
    "Native PostgreSQL",
    30_000,
    [daemon],
    async () => (await runCmd(ctx, "", "pg_isready", [...pgConn, "-d", "postgres"], { maxMs: 3000 })).exitCode === 0,
  );
  await runCmd(ctx, `Native PostgreSQL createdb ${PG_DB}`, "createdb", [...pgConn, PG_DB], {
    env: { ...ctx.env, PGPASSWORD: PG_PASS },
    maxMs: 15_000,
  });
  const postgresUrl = `postgresql://${PG_USER}:${PG_PASS}@127.0.0.1:${port}/${PG_DB}`;
  requireDedicatedPostgresTestUrl({ name: TEST_POSTGRES_URL_ENV, value: postgresUrl, environment: ctx.env });
  return postgresUrl;
}

async function startNativeRedis(ctx, port) {
  const redisDir = join(ctx.state.tempRoot, "redis");
  await mkdir(redisDir, { recursive: true });
  // Keep Redis from overwriting the scope marker when it updates its process title.
  const redisArgs = ["--bind", "127.0.0.1", "--port", String(port), "--dir", redisDir, "--save", ""].concat(
    "--databases 32 --appendonly no --set-proc-title no".split(" "),
  );
  const daemon = await spawnAndSave(ctx, "redis", "redis-server", redisArgs, redisDir);
  await pollReady(ctx, "Native Redis", 15_000, [daemon], async () => {
    const reply = await runCmd(ctx, "", "redis-cli", ["-h", "127.0.0.1", "-p", String(port), "PING"], { maxMs: 1500 });
    return reply.exitCode === 0 && reply.output.trim() === "PONG";
  });
  return parseTestRedisUrl(`redis://127.0.0.1:${port}/0`);
}

async function startNativeApisix(ctx, [etcdClientPort, etcdPeerPort, httpPort, adminPort], apisixInstallDir) {
  const [etcdDir, apisixDir] = [join(ctx.state.tempRoot, "etcd"), join(ctx.state.tempRoot, "apisix")];
  const confDir = join(apisixDir, "conf");
  await mkdir(etcdDir, { recursive: true, mode: 0o700 });
  const [clientUrl, peerUrl] = [`http://127.0.0.1:${etcdClientPort}`, `http://127.0.0.1:${etcdPeerPort}`];
  const etcdArgs = ["--name", "default", "--data-dir", etcdDir, "--initial-cluster", `default=${peerUrl}`].concat(
    `--listen-client-urls ${clientUrl} --advertise-client-urls ${clientUrl} --listen-peer-urls ${peerUrl} --initial-advertise-peer-urls ${peerUrl}`.split(
      " ",
    ),
  );
  const etcdDaemon = await spawnAndSave(ctx, "etcd", "etcd", etcdArgs, etcdDir);
  await pollReady(ctx, "Native etcd", 20_000, [etcdDaemon], async () => {
    const sig = ctx.signal ? AbortSignal.any([ctx.signal, AbortSignal.timeout(1500)]) : AbortSignal.timeout(1500);
    const res = await fetch(`${clientUrl}/health`, { signal: sig });
    if (!res.ok) throw new Error(`etcd /health returned HTTP ${res.status}: ${await res.text()}`);
    const { health } = await res.json();
    return health === "true" || health === true;
  });

  for (const dir of [confDir, join(apisixDir, "logs"), join(apisixDir, "disk_cache_one")]) {
    await mkdir(dir, { recursive: true });
  }
  for (const sub of ["apisix", "deps"]) {
    const src = join(apisixInstallDir, sub);
    if (!existsSync(src)) throw new Error(`APISIX installation directory is missing required path: ${src}`);
    await symlink(src, join(apisixDir, sub));
  }
  for (const sub of ["ui", "conf/cert"]) {
    if (existsSync(join(apisixInstallDir, sub))) await symlink(join(apisixInstallDir, sub), join(apisixDir, sub));
  }
  for (const f of ["mime.types", "debug.yaml"]) {
    if (existsSync(join(apisixInstallDir, "conf", f)))
      await copyFile(join(apisixInstallDir, "conf", f), join(confDir, f));
  }
  const sourceYaml = await readFile(join(ctx.run.root, APISIX_CONFIG_PATH), "utf8");
  const { adminKey, yaml } = buildNativeApisixConfig(sourceYaml, { httpPort, adminPort, etcdClientPort, apisixDir });
  await writeFile(join(confDir, "config.yaml"), yaml, { mode: 0o600 });
  ctx.state.extraLogFiles.push({ label: "apisix-error", path: join(apisixDir, "logs", "error.log") });

  for (const sub of ["init", "init_etcd"])
    await runCmd(ctx, `Native APISIX ${sub}`, "apisix", [sub], { cwd: apisixDir });
  const nginxConfigPath = join(confDir, "nginx.conf");
  const nginxConfig = await readFile(nginxConfigPath, "utf8");
  // OpenResty's master/worker process titles overwrite the scope marker in /proc.
  const singleProcessConfig = nginxConfig.replace(/^\s*master_process\s+(?:on|off)\s*;/mu, "");
  await writeFile(nginxConfigPath, `master_process off;\n${singleProcessConfig}`, { mode: 0o600 });
  await spawnAndSave(ctx, "apisix", "openresty", ["-p", apisixDir, "-c", nginxConfigPath], apisixDir);
  const endpoint = { adminUrl: `http://127.0.0.1:${adminPort}/apisix/admin`, adminKey };
  await waitForApisixAdmin(endpoint.adminUrl, endpoint.adminKey, {
    signal: ctx.signal,
    timeoutMs: Math.min(ctx.timeoutMs ?? 25_000, 25_000),
  });
  return endpoint;
}

export async function cleanupNativeResourceRun(run, options = {}) {
  const { respectKeep = false, diagnostics = false, cleanupTimeoutMs = 30_000 } = options;
  const state = activeRunStates.get(run.record.runId);
  if (run.record.status === "cleaned" && !state) return;
  const metadata = state ?? (await loadRuntimeMetadata(run));
  if (diagnostics || (respectKeep && run.record.keep)) await collectNativeDiagnostics(run, metadata);
  if (respectKeep && run.record.keep) {
    for (const d of state?.daemons ?? []) d.child?.unref?.();
    run.record.status = "kept";
    await saveManagedResourceRun(run);
    console.log(`[test-resources] Environment retained; cleanup: ${managedCleanupCommand(run)}`);
    return;
  }

  const started = performance.now();
  run.record.status = "cleaning";
  const failures = [];
  const capture = (fn) =>
    Promise.resolve()
      .then(fn)
      .catch((err) => {
        failures.push(err);
      });
  await capture(() => saveManagedResourceRun(run));

  if (metadata) {
    if (metadata.scopeActiveFile) await capture(() => rm(metadata.scopeActiveFile, { force: true }));
    // Nudge PostgreSQL with SIGINT (fast shutdown) before scope SIGTERM so it drops idle connections immediately.
    for (const { service, child } of state?.daemons ?? []) {
      if (service === "postgres" && child && child.exitCode === null && child.signalCode === null) {
        await capture(() => child.kill("SIGINT"));
      }
    }
    const forceAfterMs = Math.min(3000, Math.floor(cleanupTimeoutMs * 0.5));
    if (metadata.scopeId)
      await capture(() => closeOwnedProcessScope(metadata.scopeId, { timeoutMs: cleanupTimeoutMs, forceAfterMs }));
    await Promise.all(
      (state?.daemons ?? []).map((daemon) =>
        capture(async () => {
          await Promise.race([daemon.exited, delay(500)]);
          if (daemon.exitReason === undefined)
            throw new Error(`Native ${daemon.service} is still running after scope cleanup`);
        }),
      ),
    );
    if (metadata.tempRoot)
      await capture(async () => {
        assertSafeTempRoot(metadata.tempRoot);
        await rm(metadata.tempRoot, { recursive: true, force: true });
      });
  }

  activeRunStates.delete(run.record.runId);
  run.record.durations.cleanupMs = Math.round(performance.now() - started);
  if (!failures.length) await capture(() => rm(runtimeRecordPath(run), { force: true }));
  run.record.status = failures.length ? "cleanup-failed" : "cleaned";
  await capture(() => saveManagedResourceRun(run));
  if (failures.length) {
    if (!diagnostics) await collectNativeDiagnostics(run, metadata);
    throw new AggregateError(failures, `Native resource cleanup failed; recover with ${managedCleanupCommand(run)}`);
  }
}

export function createNativeResourceProvider(config = {}) {
  const apisixInstallDir = config.apisixInstallDir ?? "/usr/local/apisix";
  const tempBaseDir = config.tempBaseDir ?? tmpdir();
  return {
    name: "native",
    async prepare(neededServices, { run, env = process.env, signal, timeoutMs, cleanupTimeoutMs }) {
      signal?.throwIfAborted();
      if (!neededServices.length) {
        run.record.status = "ready";
        await saveManagedResourceRun(run);
        return {};
      }
      const started = performance.now();
      run.record.status = "initializing";
      await saveManagedResourceRun(run);

      const tempRoot = await mkdtemp(join(tempBaseDir, NATIVE_TEMP_PREFIX));
      const [scopeId, scopeActiveFile] = [randomUUID(), join(tempRoot, "scope.active")];
      const state = {
        scopeId,
        scopeActiveFile,
        tempRoot,
        services: [...neededServices],
        daemons: [],
        extraLogFiles: [],
      };
      activeRunStates.set(run.record.runId, state);
      await mkdir(join(tempRoot, "logs"), { recursive: true });
      await writeFile(scopeActiveFile, `${run.record.runId}\n`, { mode: 0o600 });
      await saveRuntimeMetadata(run, state);

      const scopedEnv = ownedProcessScopeEnvironment({ id: scopeId, activeFile: scopeActiveFile }, stripProxyEnv(env));
      const startAbort = new AbortController();
      const startSignal = signal ? AbortSignal.any([signal, startAbort.signal]) : startAbort.signal;
      const ctx = { run, state, env: scopedEnv, signal: startSignal, timeoutMs, cleanupTimeoutMs };
      const [needsPg, needsRedis, needsApisix] = ["postgres", "redis", "apisix"].map((s) => neededServices.includes(s));
      const ports = await allocateLoopbackPorts((needsPg ? 1 : 0) + (needsRedis ? 1 : 0) + (needsApisix ? 4 : 0));
      let i = 0;
      const startups = [
        needsPg ? startNativePostgres(ctx, ports[i++]) : undefined,
        needsRedis ? startNativeRedis(ctx, ports[i++]) : undefined,
        needsApisix ? startNativeApisix(ctx, ports.slice(i, i + 4), apisixInstallDir) : undefined,
      ];
      const results = await Promise.allSettled(
        startups.map((startup) =>
          startup?.catch((error) => {
            startAbort.abort(error);
            throw error;
          }),
        ),
      );
      startSignal.throwIfAborted();
      const [postgresUrl, redis, apisix] = results.map((result) => result.value);
      run.record.durations.createMs = Math.round(performance.now() - started);
      run.record.status = "ready";
      await saveManagedResourceRun(run);
      return { postgresUrl, redis, apisix };
    },
    cleanup: (run, opts = {}) =>
      cleanupNativeResourceRun(run, {
        respectKeep: true,
        cleanupTimeoutMs: opts.cleanupTimeoutMs,
        diagnostics: Boolean(opts.diagnostics),
      }),
  };
}

export const nativeResourceProvider = createNativeResourceProvider();

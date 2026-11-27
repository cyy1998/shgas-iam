import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { get as httpGet } from "node:http";
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
import { verifyApisixAdminBaseline } from "./apisix-admin.mjs";
import { managedCleanupCommand, saveManagedResourceRun, writeAtomicResourceRecord } from "./managed-resources.mjs";
import { runOwnedCommand } from "./owned-command.mjs";
import { verifyRedisDatabaseSlotSupport } from "./redis-preflight.mjs";

const NATIVE_TEMP_PREFIX = "iam-test-native-";
const NATIVE_RUNTIME_FILE = "native-runtime.json";
const DEFAULT_APISIX_INSTALL_DIR = "/usr/local/apisix";
const APISIX_CONFIG_RELATIVE_PATH = "apps/gateway/test-integration/support/apisix.config.yaml";
const POSTGRES_USER = "iam_test";
const POSTGRES_PASSWORD = "iam_test";
const POSTGRES_DB = "iam_test";
const PROXY_ENV_KEYS = ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"];
const OWNED_PROCESS_ENV_KEYS = [
  "IAM_OWNED_PROCESS_MARKERS",
  "IAM_OWNED_PROCESS_SCOPE_ID",
  "IAM_OWNED_PROCESS_SCOPE_FILE",
];

const POSTGRES_BIN_DIR = "/usr/lib/postgresql/18/bin";
const OPENRESTY_BIN_DIRS = [
  "/usr/local/openresty/luajit/bin",
  "/usr/local/openresty/nginx/sbin",
  "/usr/local/openresty/bin",
];

const activeRunStates = new Map();

function buildNativeToolPath(rawPath) {
  const parts = (rawPath ?? "").split(":").filter(Boolean);
  const prepend = existsSync(POSTGRES_BIN_DIR) && !parts.includes(POSTGRES_BIN_DIR) ? [POSTGRES_BIN_DIR] : [];
  const append = OPENRESTY_BIN_DIRS.filter((dir) => existsSync(dir) && !parts.includes(dir));
  return [...prepend, ...parts, ...append].join(":");
}

function stripProxyEnv(env) {
  const cleaned = { ...env };
  for (const key of PROXY_ENV_KEYS) delete cleaned[key];
  cleaned.PATH = buildNativeToolPath(cleaned.PATH);
  cleaned.NO_PROXY = "127.0.0.1,localhost,::1";
  cleaned.no_proxy = "127.0.0.1,localhost,::1";
  return cleaned;
}

function assertSafeTempRoot(tempRoot) {
  if (typeof tempRoot !== "string" || !isAbsolute(tempRoot) || !basename(tempRoot).startsWith(NATIVE_TEMP_PREFIX)) {
    throw new Error(`Refusing to operate on unexpected native temp directory: ${String(tempRoot)}`);
  }
}

function runtimeRecordPath(run) {
  return join(run.root, run.record.artifactDirectory, NATIVE_RUNTIME_FILE);
}

async function readLogTail(logFile, maxBytes = 64 * 1024) {
  try {
    const content = await readFile(logFile, "utf8");
    return content.length <= maxBytes ? content : content.slice(-maxBytes);
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    return `[could not read ${logFile}: ${error.message}]`;
  }
}

async function allocateLoopbackPorts(count) {
  if (count === 0) return [];
  const servers = [];
  const ports = [];
  try {
    for (let index = 0; index < count; index++) {
      const server = createServer();
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      servers.push(server);
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Could not allocate loopback TCP port");
      }
      ports.push(address.port);
    }
    return ports;
  } finally {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
  }
}

function stripInlineComment(raw) {
  let quote;
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];
    if (quote) {
      if (char === "\\" && quote === '"') {
        index++;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || /\s/u.test(raw[index - 1]))) {
      return raw.slice(0, index).trimEnd();
    }
  }
  return raw.trimEnd();
}

function parseYamlScalar(raw) {
  const value = raw.trim();
  if (value === "" || value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/u.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return JSON.parse(value);
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (/^[&*|>!{[]/u.test(value)) {
    throw new Error(`Unsupported YAML scalar syntax in APISIX config: ${value}`);
  }
  return value;
}

function splitKeyValue(text) {
  let quote;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\" && quote === '"') {
        index++;
        continue;
      }
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === ":" && (index + 1 === text.length || /\s/u.test(text[index + 1]))) {
      return {
        key: text.slice(0, index).trim(),
        rest: text.slice(index + 1).trim(),
      };
    }
  }
  return undefined;
}

export function parseSimpleYaml(source) {
  const lines = [];
  for (const rawLine of source.split(/\r?\n/u)) {
    const cleaned = stripInlineComment(rawLine);
    if (!cleaned.trim()) continue;
    const indent = cleaned.length - cleaned.trimStart().length;
    if (cleaned.slice(0, indent).includes("\t")) {
      throw new Error("YAML indentation must use spaces");
    }
    lines.push({ indent, text: cleaned.trimStart() });
  }
  if (lines.length === 0) return {};

  let cursor = 0;

  function parseBlock(minIndent) {
    const line = lines[cursor];
    if (!line || line.indent < minIndent) return {};
    if (line.text === "-" || line.text.startsWith("- ")) {
      return parseSequence(line.indent);
    }
    return parseMapping(line.indent);
  }

  function parseSequence(sequenceIndent) {
    const items = [];
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line.indent !== sequenceIndent || (line.text !== "-" && !line.text.startsWith("- "))) break;
      const remainder = line.text.slice(1).trimStart();
      cursor++;
      if (!remainder) {
        if (cursor < lines.length && lines[cursor].indent > sequenceIndent) {
          items.push(parseBlock(lines[cursor].indent));
        } else {
          items.push(null);
        }
        continue;
      }
      const pair = splitKeyValue(remainder);
      if (pair) {
        const entry = {};
        const itemIndent = sequenceIndent + 2;
        if (pair.rest) {
          entry[pair.key] = parseYamlScalar(pair.rest);
        } else if (cursor < lines.length && lines[cursor].indent > itemIndent) {
          entry[pair.key] = parseBlock(lines[cursor].indent);
        } else if (
          cursor < lines.length &&
          lines[cursor].indent === itemIndent &&
          (lines[cursor].text === "-" || lines[cursor].text.startsWith("- "))
        ) {
          entry[pair.key] = parseSequence(itemIndent);
        } else {
          entry[pair.key] = null;
        }
        if (cursor < lines.length && lines[cursor].indent === itemIndent && !lines[cursor].text.startsWith("- ")) {
          Object.assign(entry, parseMapping(itemIndent));
        }
        items.push(entry);
      } else {
        items.push(parseYamlScalar(remainder));
      }
    }
    return items;
  }

  function parseMapping(mappingIndent) {
    const map = {};
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line.indent !== mappingIndent) break;
      if (line.text === "-" || line.text.startsWith("- ")) break;
      const pair = splitKeyValue(line.text);
      if (!pair) throw new Error(`Unsupported YAML mapping entry: ${line.text}`);
      cursor++;
      if (pair.rest) {
        map[pair.key] = parseYamlScalar(pair.rest);
      } else if (cursor < lines.length && lines[cursor].indent > mappingIndent) {
        map[pair.key] = parseBlock(lines[cursor].indent);
      } else if (
        cursor < lines.length &&
        lines[cursor].indent === mappingIndent &&
        (lines[cursor].text === "-" || lines[cursor].text.startsWith("- "))
      ) {
        map[pair.key] = parseSequence(mappingIndent);
      } else {
        map[pair.key] = null;
      }
    }
    return map;
  }

  const parsed = parseBlock(0);
  if (cursor < lines.length) {
    throw new Error(`Unexpected trailing YAML content at: ${lines[cursor].text}`);
  }
  return parsed;
}

function formatYamlScalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const str = String(value);
  if (
    str === "" ||
    /^(?:true|false|null|~|-?\d+(?:\.\d+)?)$/iu.test(str) ||
    /^\s|\s$/u.test(str) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/u.test(str) ||
    /[:#\n\r\t"'\\]/u.test(str)
  ) {
    return JSON.stringify(str);
  }
  return str;
}

export function stringifySimpleYaml(value, indent = 0) {
  const prefix = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${prefix}[]`;
    return value
      .map((item) => {
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          const entries = Object.entries(item);
          if (entries.length === 0) return `${prefix}- {}`;
          const [firstKey, firstValue] = entries[0];
          const restEntries = entries.slice(1);
          const firstRendered =
            firstValue !== null && typeof firstValue === "object"
              ? `${prefix}- ${firstKey}:\n${stringifySimpleYaml(firstValue, indent + 4)}`
              : `${prefix}- ${firstKey}: ${formatYamlScalar(firstValue)}`;
          if (restEntries.length === 0) return firstRendered;
          const restRendered = stringifySimpleYaml(Object.fromEntries(restEntries), indent + 2);
          return `${firstRendered}\n${restRendered}`;
        }
        if (Array.isArray(item)) {
          return `${prefix}-\n${stringifySimpleYaml(item, indent + 2)}`;
        }
        return `${prefix}- ${formatYamlScalar(item)}`;
      })
      .join("\n");
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return `${prefix}{}`;
    return entries
      .map(([key, entryValue]) => {
        if (entryValue !== null && typeof entryValue === "object") {
          if (Array.isArray(entryValue) && entryValue.length === 0) return `${prefix}${key}: []`;
          if (!Array.isArray(entryValue) && Object.keys(entryValue).length === 0) return `${prefix}${key}: {}`;
          return `${prefix}${key}:\n${stringifySimpleYaml(entryValue, indent + 2)}`;
        }
        return `${prefix}${key}: ${formatYamlScalar(entryValue)}`;
      })
      .join("\n");
  }
  return `${prefix}${formatYamlScalar(value)}`;
}

export function buildNativeApisixConfig(sourceYaml, options) {
  const { httpPort, adminPort, etcdClientPort, apisixDir } = options;
  const parsed = parseSimpleYaml(sourceYaml);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("APISIX config YAML must parse to an object");
  }

  const deployment = { ...(parsed.deployment ?? {}) };
  const admin = { ...(deployment.admin ?? {}) };
  const adminKeys = Array.isArray(admin.admin_key) ? admin.admin_key : [];
  const adminKey = adminKeys
    .find((entry) => entry && typeof entry === "object" && entry.role === "admin" && typeof entry.key === "string")
    ?.key?.trim();
  if (!adminKey) {
    throw new Error(`Could not find admin role key in ${APISIX_CONFIG_RELATIVE_PATH}`);
  }

  admin.admin_listen = { ip: "127.0.0.1", port: adminPort };
  admin.allow_admin = ["127.0.0.1/32"];
  deployment.admin = admin;
  deployment.etcd = {
    ...(deployment.etcd ?? {}),
    host: [`http://127.0.0.1:${etcdClientPort}`],
  };

  const apisix = {
    ...(parsed.apisix ?? {}),
    node_listen: [{ ip: "127.0.0.1", port: httpPort }],
    enable_admin: true,
    enable_ipv6: false,
    enable_reuseport: false,
    enable_control: false,
    dns_resolver: parsed.apisix?.dns_resolver ?? ["127.0.0.1"],
    ssl: { enable: false },
    proxy_cache: {
      zones: [
        {
          name: "disk_cache_one",
          memory_size: "16m",
          disk_size: "64m",
          disk_path: join(apisixDir, "disk_cache_one"),
          cache_levels: "1:2",
        },
        {
          name: "memory_cache",
          memory_size: "16m",
        },
      ],
    },
  };

  const existingNginx = parsed.nginx_config && typeof parsed.nginx_config === "object" ? parsed.nginx_config : {};
  const existingSnippet =
    typeof existingNginx.main_configuration_snippet === "string" ? existingNginx.main_configuration_snippet.trim() : "";
  const existingEnvs = Array.isArray(existingNginx.envs) ? existingNginx.envs : [];
  const nginxConfig = {
    ...existingNginx,
    error_log: "logs/error.log",
    error_log_level: "warn",
    worker_processes: 1,
    worker_rlimit_nofile: 2048,
    event: {
      ...(existingNginx.event ?? {}),
      worker_connections: 1024,
    },
    main_configuration_snippet: existingSnippet ? `${existingSnippet}\ndaemon off;` : "daemon off;",
    envs: [...new Set([...existingEnvs, ...OWNED_PROCESS_ENV_KEYS])],
    http: {
      ...(existingNginx.http ?? {}),
      enable_access_log: false,
    },
  };

  const merged = {
    ...parsed,
    deployment,
    apisix,
    nginx_config: nginxConfig,
  };

  return {
    adminKey,
    yaml: `${stringifySimpleYaml(merged)}\n`,
  };
}

function readProcessStat(statContent) {
  const endOfComm = statContent.lastIndexOf(")");
  if (endOfComm === -1) return undefined;
  const fields = statContent.slice(endOfComm + 2).split(" ");
  const state = fields[0];
  const ppid = Number(fields[1]);
  const pgrp = Number(fields[2]);
  if (!Number.isInteger(ppid) || !Number.isInteger(pgrp) || state === "Z") return undefined;
  return { ppid, pgrp };
}

async function listLiveDaemonRelatedPids(daemons) {
  const targetGroups = new Set(
    daemons.map((daemon) => daemon.pgid).filter((pgid) => Number.isInteger(pgid) && pgid > 0),
  );
  const targetPids = new Set(daemons.map((daemon) => daemon.pid).filter((pid) => Number.isInteger(pid) && pid > 0));
  if (targetGroups.size === 0 && targetPids.size === 0) return [];
  const entries = await readdir("/proc");
  const matches = await Promise.all(
    entries
      .filter((entry) => /^\d+$/u.test(entry))
      .map(async (entry) => {
        const pid = Number(entry);
        if (pid === process.pid) return undefined;
        try {
          const statContent = await readFile(`/proc/${entry}/stat`, "utf8");
          const stat = readProcessStat(statContent);
          if (!stat) return undefined;
          return targetGroups.has(stat.pgrp) || targetPids.has(pid) || targetPids.has(stat.ppid)
            ? { pid, pgrp: stat.pgrp }
            : undefined;
        } catch (error) {
          if (["ENOENT", "ESRCH", "EACCES", "EPERM"].includes(error?.code)) return undefined;
          throw error;
        }
      }),
  );
  return matches.filter(Boolean);
}

function tryKill(target, signal) {
  try {
    process.kill(target, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function stopProcessGroups(daemons, options) {
  const timeoutMs = Math.max(100, options.timeoutMs ?? 15_000);
  const forceAfterMs = Math.min(options.forceAfterMs ?? 3000, timeoutMs * 0.7);
  const pgids = [...new Set(daemons.map((daemon) => daemon.pgid).filter((pgid) => Number.isInteger(pgid) && pgid > 0))];
  if (pgids.length === 0 && daemons.every((daemon) => !daemon.pid)) return;

  for (const daemon of daemons) {
    const initialSignal = daemon.service === "postgres" ? "SIGINT" : "SIGTERM";
    if (daemon.pgid) tryKill(-daemon.pgid, initialSignal);
    if (daemon.pid && daemon.pid !== daemon.pgid) tryKill(daemon.pid, initialSignal);
  }

  const started = performance.now();
  let confirmedEmpty = false;
  while (true) {
    const alive = await listLiveDaemonRelatedPids(daemons);
    if (alive.length === 0) {
      if (confirmedEmpty) return;
      confirmedEmpty = true;
      await delay(25);
      continue;
    }
    confirmedEmpty = false;
    const elapsed = performance.now() - started;
    if (elapsed >= forceAfterMs) {
      for (const pgid of pgids) tryKill(-pgid, "SIGKILL");
      for (const { pid } of alive) tryKill(pid, "SIGKILL");
    }
    if (elapsed >= timeoutMs) {
      throw new Error(
        `Native test resource process groups (${pgids.join(", ")}) did not stop within ${timeoutMs}ms; remaining PIDs: ${alive.map((item) => item.pid).join(", ")}`,
      );
    }
    await delay(25);
  }
}

async function saveRuntimeMetadata(run, state) {
  const write = () =>
    writeAtomicResourceRecord(runtimeRecordPath(run), {
      schemaVersion: 1,
      runId: run.record.runId,
      scopeId: state.scopeId,
      scopeActiveFile: state.scopeActiveFile,
      tempRoot: state.tempRoot,
      services: [...state.services],
      daemons: state.daemons.map(({ service, pid, pgid, logFile }) => ({ service, pid, pgid, logFile })),
      extraLogFiles: [...state.extraLogFiles],
    });
  const pending = (state.metadataSaveQueue ?? Promise.resolve()).then(write, write);
  state.metadataSaveQueue = pending.catch(() => {});
  await pending;
}

async function loadRuntimeMetadata(run) {
  try {
    const raw = await readFile(runtimeRecordPath(run), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.schemaVersion !== 1 || parsed.runId !== run.record.runId) {
      throw new Error(`Invalid native runtime metadata in ${runtimeRecordPath(run)}`);
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function collectNativeDiagnostics(run, metadata) {
  const logSources = [];
  for (const daemon of metadata?.daemons ?? []) {
    if (daemon.logFile) logSources.push({ label: daemon.service, path: daemon.logFile });
  }
  for (const extra of metadata?.extraLogFiles ?? []) {
    if (extra?.path) logSources.push(extra);
  }
  if (logSources.length === 0) return;

  const sections = [];
  for (const source of logSources) {
    const tail = await readLogTail(source.path);
    if (tail) {
      sections.push(`===== ${source.label} (${source.path}) =====\n${tail.trimEnd()}\n`);
    }
  }
  if (sections.length === 0) return;

  const destination = join(run.root, run.record.artifactDirectory, "native-services.log");
  try {
    await writeFile(destination, sections.join("\n"), { mode: 0o600 });
  } catch (error) {
    console.warn(`Warning: native service diagnostics could not be saved: ${error.message}`);
  }
}

function spawnNativeDaemon({ service, executable, args, cwd, env, logFile, state }) {
  const child = spawnOwnedProcessTree({
    executable: "/bin/sh",
    args: ["-c", 'log=$1; shift; exec "$@" >>"$log" 2>&1', `iam-native-${service}`, logFile, executable, ...args],
    cwd,
    env,
  });
  let exited = false;
  let exitOutcome;
  let startError;
  const exitedPromise = new Promise((resolve) => {
    child.once("error", (error) => {
      exited = true;
      startError = error;
      resolve({ error });
    });
    child.once("exit", (code, signal) => {
      exited = true;
      exitOutcome = { exitCode: code, signal };
      resolve(exitOutcome);
    });
  });

  const daemon = {
    service,
    pid: child.pid,
    pgid: child.pid,
    logFile,
    child,
    exitedPromise,
    hasExited: () => exited,
    formatExit: async () => {
      const tail = await readLogTail(logFile, 16 * 1024);
      const reason = startError
        ? startError.message
        : `exit=${exitOutcome?.exitCode ?? "null"} signal=${exitOutcome?.signal ?? "null"}`;
      return `${service} exited unexpectedly (${reason})${tail ? `\n${tail}` : ""}`;
    },
  };
  state.daemons.push(daemon);
  return daemon;
}

async function pollUntilReady({ label, timeoutMs, pollIntervalMs = 50, signal, watchedDaemons = [], check }) {
  const deadline = performance.now() + timeoutMs;
  let lastError;
  while (performance.now() < deadline) {
    signal?.throwIfAborted();
    for (const daemon of watchedDaemons) {
      if (daemon.hasExited()) {
        throw new Error(`${label} failed before becoming ready: ${await daemon.formatExit()}`);
      }
    }
    try {
      const ready = await check();
      if (ready) return;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      lastError = error;
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    await delay(Math.min(pollIntervalMs, remaining), undefined, { signal });
  }
  const logSummaries = await Promise.all(
    watchedDaemons.map(async (daemon) => {
      const tail = await readLogTail(daemon.logFile, 8 * 1024);
      return tail ? `\n--- ${daemon.service} log ---\n${tail}` : "";
    }),
  );
  throw new Error(`${label} did not become ready within ${timeoutMs}ms${logSummaries.join("")}`, {
    cause: lastError,
  });
}

function checkEtcdHealth(clientPort, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const request = httpGet(
      {
        host: "127.0.0.1",
        port: clientPort,
        path: "/health",
        timeout: timeoutMs,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode !== 200) {
            reject(new Error(`etcd /health returned HTTP ${response.statusCode}: ${body}`));
            return;
          }
          try {
            const parsed = JSON.parse(body);
            resolve(parsed?.health === "true" || parsed?.health === true);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error(`etcd /health timed out after ${timeoutMs}ms`));
    });
    request.on("error", reject);
  });
}

async function startNativePostgres({ run, state, port, env, signal, timeoutMs, cleanupTimeoutMs }) {
  const pgDataDir = join(state.tempRoot, "pgdata");
  const pgSocketDir = join(state.tempRoot, "pgsocket");
  const pgPassFile = join(state.tempRoot, "pgpass");
  const pgLogFile = join(state.tempRoot, "logs", "postgres.log");
  await mkdir(pgSocketDir, { recursive: true, mode: 0o700 });
  await writeFile(pgPassFile, `${POSTGRES_PASSWORD}\n`, { mode: 0o600 });

  let initResult;
  try {
    initResult = await runOwnedCommand({
      executable: "initdb",
      args: [
        "-D",
        pgDataDir,
        "-U",
        POSTGRES_USER,
        "--pwfile",
        pgPassFile,
        "--auth-host=scram-sha-256",
        "--auth-local=trust",
        "--no-sync",
        "--encoding=UTF8",
        "--locale=C.UTF-8",
      ],
      cwd: state.tempRoot,
      env,
      signal,
      timeoutMs: Math.min(timeoutMs ?? 30_000, 30_000),
      cleanupTimeoutMs,
    });
  } finally {
    await rm(pgPassFile, { force: true }).catch(() => {});
  }
  if (initResult.exitCode !== 0) {
    throw new Error(`Native PostgreSQL initdb failed with exit ${initResult.exitCode}:\n${initResult.output}`);
  }

  const daemon = spawnNativeDaemon({
    service: "postgres",
    executable: "postgres",
    args: [
      "-D",
      pgDataDir,
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-k",
      pgSocketDir,
      "-c",
      "fsync=off",
      "-c",
      "synchronous_commit=off",
      "-c",
      "full_page_writes=off",
      "-c",
      "max_wal_size=2GB",
      "-c",
      "checkpoint_timeout=15min",
      "-c",
      "dynamic_shared_memory_type=mmap",
    ],
    cwd: state.tempRoot,
    env,
    logFile: pgLogFile,
    state,
  });
  await saveRuntimeMetadata(run, state);

  await pollUntilReady({
    label: "Native PostgreSQL",
    timeoutMs: Math.min(timeoutMs ?? 30_000, 30_000),
    pollIntervalMs: 50,
    signal,
    watchedDaemons: [daemon],
    check: async () => {
      const ready = await runOwnedCommand({
        executable: "pg_isready",
        args: ["-h", "127.0.0.1", "-p", String(port), "-U", POSTGRES_USER, "-d", "postgres"],
        cwd: state.tempRoot,
        env,
        signal,
        timeoutMs: 3000,
        cleanupTimeoutMs,
      });
      return ready.exitCode === 0;
    },
  });

  const createDbResult = await runOwnedCommand({
    executable: "createdb",
    args: ["-h", "127.0.0.1", "-p", String(port), "-U", POSTGRES_USER, POSTGRES_DB],
    cwd: state.tempRoot,
    env: { ...env, PGPASSWORD: POSTGRES_PASSWORD },
    signal,
    timeoutMs: Math.min(timeoutMs ?? 15_000, 15_000),
    cleanupTimeoutMs,
  });
  if (createDbResult.exitCode !== 0) {
    throw new Error(
      `Native PostgreSQL createdb ${POSTGRES_DB} failed with exit ${createDbResult.exitCode}:\n${createDbResult.output}`,
    );
  }

  const postgresUrl = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${port}/${POSTGRES_DB}`;
  requireDedicatedPostgresTestUrl({
    name: TEST_POSTGRES_URL_ENV,
    value: postgresUrl,
    environment: env,
  });
  return postgresUrl;
}

async function startNativeRedis({ run, state, port, env, signal, timeoutMs }) {
  const redisDir = join(state.tempRoot, "redis");
  const redisLogFile = join(state.tempRoot, "logs", "redis.log");
  await mkdir(redisDir, { recursive: true });

  const daemon = spawnNativeDaemon({
    service: "redis",
    executable: "redis-server",
    args: [
      "--bind",
      "127.0.0.1",
      "--port",
      String(port),
      "--databases",
      "32",
      "--save",
      "",
      "--appendonly",
      "no",
      "--dir",
      redisDir,
    ],
    cwd: redisDir,
    env,
    logFile: redisLogFile,
    state,
  });
  await saveRuntimeMetadata(run, state);

  const redisUrl = `redis://127.0.0.1:${port}/0`;
  await pollUntilReady({
    label: "Native Redis",
    timeoutMs: Math.min(timeoutMs ?? 15_000, 15_000),
    pollIntervalMs: 50,
    signal,
    watchedDaemons: [daemon],
    check: async () => {
      await verifyRedisDatabaseSlotSupport(redisUrl, { signal, timeoutMs: 1500 });
      return true;
    },
  });
  return redisUrl;
}

async function stageApisixDirectory({ run, apisixDir, apisixInstallDir, httpPort, adminPort, etcdClientPort }) {
  const confDir = join(apisixDir, "conf");
  const logsDir = join(apisixDir, "logs");
  const cacheDir = join(apisixDir, "disk_cache_one");
  await Promise.all([
    mkdir(confDir, { recursive: true }),
    mkdir(logsDir, { recursive: true }),
    mkdir(cacheDir, { recursive: true }),
  ]);

  for (const name of ["apisix", "deps"]) {
    const source = join(apisixInstallDir, name);
    if (!existsSync(source)) {
      throw new Error(`APISIX installation directory is missing required path: ${source}`);
    }
    await symlink(source, join(apisixDir, name));
  }
  if (existsSync(join(apisixInstallDir, "ui"))) {
    await symlink(join(apisixInstallDir, "ui"), join(apisixDir, "ui"));
  }

  const installConfDir = join(apisixInstallDir, "conf");
  for (const fileName of ["mime.types", "debug.yaml"]) {
    const source = join(installConfDir, fileName);
    if (existsSync(source)) {
      await copyFile(source, join(confDir, fileName));
    }
  }
  if (existsSync(join(installConfDir, "cert"))) {
    await symlink(join(installConfDir, "cert"), join(confDir, "cert"));
  }

  const sourceYaml = await readFile(join(run.root, APISIX_CONFIG_RELATIVE_PATH), "utf8");
  const { adminKey, yaml } = buildNativeApisixConfig(sourceYaml, {
    httpPort,
    adminPort,
    etcdClientPort,
    apisixDir,
  });
  await writeFile(join(confDir, "config.yaml"), yaml, { mode: 0o600 });
  return { adminKey };
}

async function startNativeApisix({
  run,
  state,
  etcdClientPort,
  etcdPeerPort,
  httpPort,
  adminPort,
  apisixInstallDir,
  env,
  signal,
  timeoutMs,
  cleanupTimeoutMs,
}) {
  const etcdDir = join(state.tempRoot, "etcd");
  const apisixDir = join(state.tempRoot, "apisix");
  const etcdLogFile = join(state.tempRoot, "logs", "etcd.log");
  const apisixLogFile = join(state.tempRoot, "logs", "apisix.log");
  await mkdir(etcdDir, { recursive: true, mode: 0o700 });

  const etcdDaemon = spawnNativeDaemon({
    service: "etcd",
    executable: "etcd",
    args: [
      "--name",
      "default",
      "--data-dir",
      etcdDir,
      "--listen-client-urls",
      `http://127.0.0.1:${etcdClientPort}`,
      "--advertise-client-urls",
      `http://127.0.0.1:${etcdClientPort}`,
      "--listen-peer-urls",
      `http://127.0.0.1:${etcdPeerPort}`,
      "--initial-advertise-peer-urls",
      `http://127.0.0.1:${etcdPeerPort}`,
      "--initial-cluster",
      `default=http://127.0.0.1:${etcdPeerPort}`,
    ],
    cwd: etcdDir,
    env,
    logFile: etcdLogFile,
    state,
  });
  await saveRuntimeMetadata(run, state);

  await pollUntilReady({
    label: "Native etcd",
    timeoutMs: Math.min(timeoutMs ?? 20_000, 20_000),
    pollIntervalMs: 50,
    signal,
    watchedDaemons: [etcdDaemon],
    check: () => checkEtcdHealth(etcdClientPort),
  });

  const { adminKey } = await stageApisixDirectory({
    run,
    apisixDir,
    apisixInstallDir,
    httpPort,
    adminPort,
    etcdClientPort,
  });
  state.extraLogFiles.push({ label: "apisix-error", path: join(apisixDir, "logs", "error.log") });

  const initResult = await runOwnedCommand({
    executable: "apisix",
    args: ["init"],
    cwd: apisixDir,
    env,
    signal,
    timeoutMs: Math.min(timeoutMs ?? 20_000, 20_000),
    cleanupTimeoutMs,
  });
  if (initResult.exitCode !== 0) {
    throw new Error(`Native APISIX init failed with exit ${initResult.exitCode}:\n${initResult.output}`);
  }

  const initEtcdResult = await runOwnedCommand({
    executable: "apisix",
    args: ["init_etcd"],
    cwd: apisixDir,
    env,
    signal,
    timeoutMs: Math.min(timeoutMs ?? 20_000, 20_000),
    cleanupTimeoutMs,
  });
  if (initEtcdResult.exitCode !== 0) {
    throw new Error(`Native APISIX init_etcd failed with exit ${initEtcdResult.exitCode}:\n${initEtcdResult.output}`);
  }

  const apisixDaemon = spawnNativeDaemon({
    service: "apisix",
    executable: "openresty",
    args: ["-p", apisixDir, "-c", join(apisixDir, "conf", "nginx.conf")],
    cwd: apisixDir,
    env,
    logFile: apisixLogFile,
    state,
  });
  await saveRuntimeMetadata(run, state);

  const endpoint = {
    adminUrl: `http://127.0.0.1:${adminPort}/apisix/admin`,
    adminKey,
  };
  await pollUntilReady({
    label: "Native APISIX",
    timeoutMs: Math.min(timeoutMs ?? 25_000, 25_000),
    pollIntervalMs: 100,
    signal,
    watchedDaemons: [etcdDaemon, apisixDaemon],
    check: async () => {
      await verifyApisixAdminBaseline(endpoint, { signal, timeoutMs: 250, requestTimeoutMs: 1000, pollIntervalMs: 50 });
      return true;
    },
  });
  return endpoint;
}

export async function cleanupNativeResourceRun(run, options = {}) {
  const respectKeep = options.respectKeep ?? false;
  const diagnostics = Boolean(options.diagnostics);
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 30_000;

  const state = activeRunStates.get(run.record.runId);
  const metadata = state ?? (await loadRuntimeMetadata(run));

  if (diagnostics || (respectKeep && run.record.keep)) {
    await collectNativeDiagnostics(run, metadata);
  }

  if (respectKeep && run.record.keep) {
    for (const daemon of state?.daemons ?? []) {
      daemon.child?.unref?.();
    }
    run.record.status = "kept";
    await saveManagedResourceRun(run);
    console.log(`[test-resources] Environment retained; cleanup: ${managedCleanupCommand(run)}`);
    return;
  }

  if (run.record.status === "cleaned" && !state && !metadata) return;

  const started = performance.now();
  run.record.status = "cleaning";
  const failures = [];
  try {
    await saveManagedResourceRun(run);
  } catch (error) {
    failures.push(error);
  }

  if (metadata) {
    if (metadata.scopeActiveFile) {
      try {
        await rm(metadata.scopeActiveFile, { force: true });
      } catch (error) {
        failures.push(error);
      }
    }

    const daemonTimeoutMs = Math.max(1000, Math.floor(cleanupTimeoutMs * 0.6));
    const scopeTimeoutMs = Math.max(1000, cleanupTimeoutMs - daemonTimeoutMs);

    try {
      await stopProcessGroups(metadata.daemons ?? [], {
        timeoutMs: daemonTimeoutMs,
        forceAfterMs: Math.min(3000, Math.floor(daemonTimeoutMs * 0.5)),
      });
    } catch (error) {
      failures.push(error);
    }

    if (metadata.scopeId) {
      try {
        await closeOwnedProcessScope(metadata.scopeId, {
          timeoutMs: scopeTimeoutMs,
          forceAfterMs: Math.min(1000, Math.floor(scopeTimeoutMs * 0.5)),
        });
      } catch (error) {
        failures.push(error);
      }
    }

    if (state?.daemons?.length) {
      await Promise.all(
        state.daemons.map((daemon) => Promise.race([daemon.exitedPromise.catch(() => {}), delay(500)])),
      );
    }

    if (metadata.tempRoot) {
      try {
        assertSafeTempRoot(metadata.tempRoot);
        await rm(metadata.tempRoot, { recursive: true, force: true });
      } catch (error) {
        failures.push(error);
      }
    }
  }

  activeRunStates.delete(run.record.runId);
  run.record.durations.cleanupMs = Math.round(performance.now() - started);
  run.record.status = failures.length > 0 ? "cleanup-failed" : "cleaned";
  try {
    await saveManagedResourceRun(run);
  } catch (error) {
    failures.push(error);
  }

  if (failures.length > 0) {
    if (!diagnostics) await collectNativeDiagnostics(run, metadata);
    throw new AggregateError(failures, `Native resource cleanup failed; recover with ${managedCleanupCommand(run)}`);
  }
}

export function createNativeResourceProvider(config = {}) {
  const apisixInstallDir = config.apisixInstallDir ?? DEFAULT_APISIX_INSTALL_DIR;
  const tempBaseDir = config.tempBaseDir ?? tmpdir();

  return {
    name: "native",
    async prepare(neededServices, context) {
      const { run, env = process.env, signal, timeoutMs, cleanupTimeoutMs } = context;
      signal?.throwIfAborted();

      if (neededServices.length === 0) {
        run.record.status = "ready";
        await saveManagedResourceRun(run);
        return {};
      }

      const started = performance.now();
      run.record.status = "initializing";
      await saveManagedResourceRun(run);

      const tempRoot = await mkdtemp(join(tempBaseDir, NATIVE_TEMP_PREFIX));
      const scopeId = randomUUID();
      const scopeActiveFile = join(tempRoot, "scope.active");
      const logsDir = join(tempRoot, "logs");

      const state = {
        scopeId,
        scopeActiveFile,
        tempRoot,
        services: [...neededServices],
        daemons: [],
        extraLogFiles: [],
      };
      activeRunStates.set(run.record.runId, state);

      await mkdir(logsDir, { recursive: true });
      await writeFile(scopeActiveFile, `${run.record.runId}\n`, { mode: 0o600 });
      await saveRuntimeMetadata(run, state);

      const cleanEnv = stripProxyEnv(env);
      const scopedEnv = ownedProcessScopeEnvironment({ id: scopeId, activeFile: scopeActiveFile }, cleanEnv);

      const needsPostgres = neededServices.includes("postgres");
      const needsRedis = neededServices.includes("redis");
      const needsApisix = neededServices.includes("apisix");
      const portCount = (needsPostgres ? 1 : 0) + (needsRedis ? 1 : 0) + (needsApisix ? 4 : 0);
      const ports = await allocateLoopbackPorts(portCount);
      let nextPort = 0;
      const postgresPort = needsPostgres ? ports[nextPort++] : undefined;
      const redisPort = needsRedis ? ports[nextPort++] : undefined;
      const etcdClientPort = needsApisix ? ports[nextPort++] : undefined;
      const etcdPeerPort = needsApisix ? ports[nextPort++] : undefined;
      const apisixHttpPort = needsApisix ? ports[nextPort++] : undefined;
      const apisixAdminPort = needsApisix ? ports[nextPort++] : undefined;

      const rawEndpoints = {};
      const startJobs = [];

      if (needsPostgres) {
        startJobs.push(
          startNativePostgres({
            run,
            state,
            port: postgresPort,
            env: scopedEnv,
            signal,
            timeoutMs,
            cleanupTimeoutMs,
          }).then((postgresUrl) => {
            rawEndpoints.postgresUrl = postgresUrl;
          }),
        );
      }

      if (needsRedis) {
        startJobs.push(
          startNativeRedis({
            run,
            state,
            port: redisPort,
            env: scopedEnv,
            signal,
            timeoutMs,
          }).then((redisUrl) => {
            rawEndpoints.redisUrl = redisUrl;
          }),
        );
      }

      if (needsApisix) {
        startJobs.push(
          startNativeApisix({
            run,
            state,
            etcdClientPort,
            etcdPeerPort,
            httpPort: apisixHttpPort,
            adminPort: apisixAdminPort,
            apisixInstallDir,
            env: scopedEnv,
            signal,
            timeoutMs,
            cleanupTimeoutMs,
          }).then((apisix) => {
            rawEndpoints.apisix = apisix;
          }),
        );
      }

      await Promise.all(startJobs);

      run.record.durations.createMs = Math.round(performance.now() - started);
      run.record.status = "ready";
      await saveManagedResourceRun(run);
      return rawEndpoints;
    },
    async cleanup(run, options = {}) {
      await cleanupNativeResourceRun(run, {
        respectKeep: true,
        cleanupTimeoutMs: options.cleanupTimeoutMs,
        diagnostics: Boolean(options.diagnostics),
      });
    },
  };
}

export const nativeResourceProvider = createNativeResourceProvider();

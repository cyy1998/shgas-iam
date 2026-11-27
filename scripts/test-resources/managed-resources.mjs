import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { runOwnedCommand } from "./owned-command.mjs";

const validStatuses = ["created", "initializing", "ready", "running", "cleaning", "cleaned", "cleanup-failed", "kept"];
const validStackStatuses = ["created", "initializing", "ready", "cleaning", "cleaned", "cleanup-failed", "kept"];
const validProviders = ["docker", "native", "external"];

function runProvider(run) {
  return run.record.provider ?? "docker";
}

function requireDockerProvider(run, operation) {
  const provider = runProvider(run);
  if (provider !== "docker") {
    throw new Error(`${operation} is forbidden for resource provider "${provider}"`);
  }
}

export function repositoryPath(root, path) {
  if (typeof path !== "string" || !path) throw new Error("A repository-relative path is required");
  const normalized = relative(root, resolve(root, path));
  if (isAbsolute(path) || normalized === ".." || normalized.startsWith("../") || isAbsolute(normalized))
    throw new Error(`Path must stay inside the repository: ${path}`);
  return normalized;
}

export async function writeAtomicResourceRecord(destination, record) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, destination);
}

export async function saveManagedResourceRun(run) {
  await writeAtomicResourceRecord(join(run.root, run.recordPath), run.record);
}

export async function createManagedResourceRun(options) {
  const root = resolve(options.root);
  const provider = options.provider ?? "docker";
  if (typeof provider !== "string" || !validProviders.includes(provider)) {
    throw new Error(`Invalid managed resource provider: ${String(provider)}`);
  }
  const runId = randomUUID();
  const project = options.project ?? `${options.projectPrefix ?? "iam-integration"}-${runId.replaceAll("-", "")}`;
  if (!/^[a-z0-9][a-z0-9_-]+$/.test(project)) throw new Error("An exact Compose project name is required");
  const artifactDirectory = repositoryPath(root, options.artifactDirectory ?? `test-results/integration/${runId}`);
  const recordPath = `${artifactDirectory}/run.json`;
  const isDocker = provider === "docker";
  const record = {
    schemaVersion: 1,
    provider,
    runId,
    project,
    composeFile: isDocker ? repositoryPath(root, options.composeFile) : "",
    artifactDirectory,
    composeEnvironmentFile: isDocker ? `${artifactDirectory}/compose-environment.json` : "",
    envFile: isDocker ? `${artifactDirectory}/empty.env` : "",
    testEnvironmentFile: `${artifactDirectory}/test-environment.json`,
    services: [...(options.services ?? [])],
    removeLocalImages: options.removeLocalImages ?? false,
    keep: Boolean(options.keep),
    status: "created",
    createdAt: new Date().toISOString(),
    durations: {},
  };
  await mkdir(join(root, artifactDirectory), { recursive: true });
  if (isDocker) {
    await writeFile(
      join(root, record.composeEnvironmentFile),
      `${JSON.stringify(options.composeEnvironment ?? {}, null, 2)}\n`,
      { mode: 0o600 },
    );
    await writeFile(join(root, record.envFile), "", { mode: 0o600 });
  }
  await writeFile(join(root, record.testEnvironmentFile), "{}\n", { mode: 0o600 });
  const run = { root, recordPath, record };
  await saveManagedResourceRun(run);
  if (options.registryFile) {
    const registry = join(root, repositoryPath(root, options.registryFile));
    await mkdir(dirname(registry), { recursive: true });
    await appendFile(registry, `${JSON.stringify(recordPath)}\n`, { mode: 0o600 });
  }
  console.log(`[test-resources] provider ${provider}; run ${runId}; record ${recordPath}`);
  return run;
}

function validateComposeStack(root, stack) {
  if (!stack || typeof stack !== "object" || Array.isArray(stack)) {
    throw new Error("Invalid managed resource stack record");
  }
  if (
    typeof stack.project !== "string" ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(stack.project) ||
    !validStackStatuses.includes(stack.status) ||
    typeof stack.removeLocalImages !== "boolean" ||
    !Array.isArray(stack.services) ||
    stack.services.some((service) => typeof service !== "string")
  ) {
    throw new Error("Invalid managed resource stack record");
  }
  repositoryPath(root, stack.composeFile);
  repositoryPath(root, stack.composeEnvironmentFile);
}

export async function readManagedResourceRun(root, recordPath) {
  const path = repositoryPath(root, recordPath);
  const record = JSON.parse(await readFile(join(root, path), "utf8"));
  const provider = record.provider ?? "docker";
  if (
    record.schemaVersion !== 1 ||
    typeof provider !== "string" ||
    !validProviders.includes(provider) ||
    typeof record.runId !== "string" ||
    !record.runId ||
    typeof record.project !== "string" ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(record.project) ||
    !validStatuses.includes(record.status) ||
    typeof record.removeLocalImages !== "boolean" ||
    typeof record.createdAt !== "string" ||
    !record.durations ||
    typeof record.durations !== "object" ||
    Array.isArray(record.durations)
  )
    throw new Error("Invalid managed resource record");
  for (const field of ["artifactDirectory", "testEnvironmentFile"]) repositoryPath(root, record[field]);
  if (provider === "docker") {
    for (const field of ["composeFile", "composeEnvironmentFile", "envFile"]) repositoryPath(root, record[field]);
  } else {
    for (const field of ["composeFile", "composeEnvironmentFile", "envFile"]) {
      if (record[field] !== undefined && record[field] !== "") {
        throw new Error(`Non-docker managed resource record must not set ${field}`);
      }
    }
  }
  if (
    path !== `${record.artifactDirectory}/run.json` ||
    typeof record.keep !== "boolean" ||
    !Array.isArray(record.services) ||
    record.services.some((service) => typeof service !== "string")
  )
    throw new Error("Invalid managed resource record paths or options");
  if (record.apisix !== undefined) {
    if (provider !== "docker") throw new Error("Non-docker managed resource record must not define a Compose stack");
    validateComposeStack(root, record.apisix);
  }
  if (
    record.endpoints !== undefined &&
    (!record.endpoints || typeof record.endpoints !== "object" || Array.isArray(record.endpoints))
  ) {
    throw new Error("Invalid managed resource endpoints record");
  }
  return { root: resolve(root), recordPath: path, record };
}

export async function readManagedResourceRegistry(root, registryFile) {
  let contents;
  try {
    contents = await readFile(join(root, repositoryPath(root, registryFile)), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return [
    ...new Set(
      contents
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => repositoryPath(root, JSON.parse(line))),
    ),
  ];
}

export function managedComposeStackView(run, stack) {
  return {
    root: run.root,
    recordPath: run.recordPath,
    record: {
      ...run.record,
      project: stack.project,
      composeFile: stack.composeFile,
      composeEnvironmentFile: stack.composeEnvironmentFile,
      services: stack.services,
      removeLocalImages: stack.removeLocalImages,
    },
  };
}

export function managedComposeArguments(run, args) {
  return [
    "compose",
    "--project-name",
    run.record.project,
    "--project-directory",
    run.root,
    "--env-file",
    join(run.root, run.record.envFile),
    "--file",
    join(run.root, run.record.composeFile),
    ...args,
  ];
}

export async function runManagedComposeCommand(run, args, options = {}) {
  requireDockerProvider(run, "Docker Compose command");
  const { runCommand = runOwnedCommand, ...commandOptions } = options;
  const environment = JSON.parse(await readFile(join(run.root, run.record.composeEnvironmentFile), "utf8"));
  if (
    !environment ||
    typeof environment !== "object" ||
    Object.values(environment).some((value) => typeof value !== "string")
  )
    throw new Error("Invalid Compose environment record");
  return await runCommand({
    ...commandOptions,
    executable: "docker",
    args: managedComposeArguments(run, args),
    cwd: run.root,
    env: { ...process.env, ...environment },
  });
}

export async function startManagedResources(run, options = {}) {
  requireDockerProvider(run, "Docker Compose startup");
  run.record.status = "initializing";
  await saveManagedResourceRun(run);
  const start = performance.now();
  const result = await runManagedComposeCommand(run, ["up", "--detach", "--wait", ...run.record.services], {
    ...options,
    logFile: join(run.root, run.record.artifactDirectory, "initialize.log"),
  });
  run.record.durations.createMs = Math.round(performance.now() - start);
  if (result.exitCode !== 0)
    throw new Error(`Resource initialization failed with exit ${result.exitCode}:\n${result.output}`);
  run.record.status = "ready";
  await saveManagedResourceRun(run);
}

export async function managedServicePort(run, service, port, options = {}) {
  requireDockerProvider(run, "Docker Compose port discovery");
  const result = await runManagedComposeCommand(run, ["port", service, String(port)], options);
  const match = result.output.trim().match(/^127\.0\.0\.1:(\d+)$/);
  if (result.exitCode !== 0 || !match) throw new Error(`Could not discover ${service} loopback port: ${result.output}`);
  return Number(match[1]);
}

async function probeTcpEndpoint(host, port, signal, timeoutMs = 500) {
  return await new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const finish = (reachable) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      socket.destroy();
      resolve(reachable);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function managedContainerBridgeIp(run, service, options = {}) {
  const ps = await runManagedComposeCommand(run, ["ps", "-q", service], options);
  const containerId = ps.output.trim().split(/\r?\n/u).find(Boolean)?.trim();
  if (ps.exitCode !== 0 || !containerId) return undefined;
  const runCommand = options.runCommand ?? runOwnedCommand;
  const inspected = await runCommand({
    ...options,
    executable: "docker",
    args: ["inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{println}}{{end}}", containerId],
    cwd: run.root,
    env: process.env,
  });
  if (inspected.exitCode !== 0) return undefined;
  return inspected.output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(line));
}

/** Prefer direct Compose bridge connectivity on Linux, WSL2 and AFK, with published loopback as a fallback. */
export async function managedServiceEndpoint(run, service, port, options = {}) {
  requireDockerProvider(run, "Docker endpoint discovery");
  const containerIp = await managedContainerBridgeIp(run, service, options);
  if (containerIp && (await probeTcpEndpoint(containerIp, port, options.signal))) {
    return { host: containerIp, port };
  }
  return { host: "127.0.0.1", port: await managedServicePort(run, service, port, options) };
}

async function collectComposeStackDiagnostics(targetRun, prefix, options = {}) {
  for (const [name, args] of [
    [`${prefix}containers`, ["ps", "--all", "--format", "json"]],
    [`${prefix}services`, ["logs", "--no-color", "--tail", "150"]],
  ]) {
    try {
      const result = await runManagedComposeCommand(targetRun, args, {
        timeoutMs: 10_000,
        cleanupTimeoutMs: 5000,
        ...options,
      });
      if (result.exitCode !== 0) throw new Error(`Docker diagnostic exited ${result.exitCode}: ${result.output}`);
      await writeFile(join(targetRun.root, targetRun.record.artifactDirectory, `${name}.log`), result.output);
    } catch (error) {
      console.warn(`Warning: ${name} diagnostics failed: ${error.message}`);
    }
  }
}

export async function collectManagedResourceDiagnostics(run, options = {}) {
  if (runProvider(run) !== "docker") return;
  if (run.record.services.length > 0 || !run.record.apisix) {
    await collectComposeStackDiagnostics(run, "", options);
  }
  if (run.record.apisix && run.record.apisix.status !== "created" && run.record.apisix.status !== "cleaned") {
    await collectComposeStackDiagnostics(managedComposeStackView(run, run.record.apisix), "apisix-", options);
  }
}

export function managedCleanupCommand(run) {
  const path = `'${run.recordPath.replaceAll("'", "'\\''")}'`;
  return `pnpm test:resources:cleanup --record ${path}`;
}

async function cleanupComposeTarget(targetRun, logName, options = {}) {
  const result = await runManagedComposeCommand(
    targetRun,
    ["down", "--volumes", "--remove-orphans", ...(targetRun.record.removeLocalImages ? ["--rmi", "local"] : [])],
    {
      timeoutMs: options.timeoutMs ?? 30_000,
      cleanupTimeoutMs: 5000,
      logFile: join(targetRun.root, targetRun.record.artifactDirectory, logName),
      runCommand: options.runCommand,
    },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Exact project ${targetRun.record.project} cleanup failed with exit ${result.exitCode}:\n${result.output}`,
    );
  }
}

export async function cleanupManagedResources(run, options = {}) {
  if (options.respectKeep && run.record.keep) return;
  if (runProvider(run) !== "docker") {
    if (run.record.status === "cleaned") return;
    const start = performance.now();
    run.record.durations.cleanupMs = Math.round(performance.now() - start);
    run.record.status = "cleaned";
    await saveManagedResourceRun(run);
    return;
  }
  const apisixPending = Boolean(run.record.apisix && run.record.apisix.status !== "cleaned");
  if (run.record.status === "cleaned" && !apisixPending) return;
  const start = performance.now();
  run.record.status = "cleaning";
  if (apisixPending) run.record.apisix.status = "cleaning";
  const failures = [];
  try {
    await saveManagedResourceRun(run);
  } catch (error) {
    failures.push(error);
  }
  if (apisixPending) {
    try {
      await cleanupComposeTarget(managedComposeStackView(run, run.record.apisix), "apisix-cleanup.log", options);
      run.record.apisix.status = "cleaned";
    } catch (error) {
      run.record.apisix.status = "cleanup-failed";
      failures.push(error);
    }
  }
  if (run.record.services.length > 0 || !run.record.apisix) {
    try {
      await cleanupComposeTarget(run, "cleanup.log", options);
    } catch (error) {
      failures.push(error);
    }
  }
  run.record.durations.cleanupMs = Math.round(performance.now() - start);
  run.record.status = failures.length > 0 ? "cleanup-failed" : "cleaned";
  try {
    await saveManagedResourceRun(run);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0)
    throw new AggregateError(failures, `Resource cleanup failed; recover with ${managedCleanupCommand(run)}`);
}

export async function finishManagedResourceRun(run, options = {}) {
  const diagnose = options.diagnostics || run.record.keep;
  if (diagnose) await collectManagedResourceDiagnostics(run);
  if (run.record.keep) {
    run.record.status = "kept";
    if (run.record.apisix && run.record.apisix.status !== "cleaned") run.record.apisix.status = "kept";
    await saveManagedResourceRun(run);
    console.log(`[test-resources] Environment retained; cleanup: ${managedCleanupCommand(run)}`);
    return;
  }
  try {
    await cleanupManagedResources(run, { timeoutMs: options.cleanupTimeoutMs });
  } catch (error) {
    if (!diagnose) await collectManagedResourceDiagnostics(run);
    throw error;
  }
}

export function formatResourceFailure(error) {
  if (error instanceof AggregateError) return `${error.message}\n${error.errors.map(formatResourceFailure).join("\n")}`;
  return error instanceof Error
    ? `${error.message}${error.cause ? `\n${formatResourceFailure(error.cause)}` : ""}`
    : String(error);
}

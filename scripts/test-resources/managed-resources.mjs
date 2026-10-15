import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";
import { runOwnedCommand } from "./owned-command.mjs";

export function repositoryPath(root, path) {
  if (typeof path !== "string" || !path) throw new Error("A repository-relative path is required");
  const normalized = relative(root, resolve(root, path)).replaceAll("\\", "/");
  if (isAbsolute(path) || normalized === ".." || normalized.startsWith("../") || isAbsolute(normalized))
    throw new Error(`Path must stay inside the repository: ${path}`);
  return normalized;
}

export async function saveManagedResourceRun(run) {
  const destination = join(run.root, run.recordPath);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(run.record, null, 2)}\n`, { mode: 0o600 });
  // Windows readers may briefly deny replacement; retain atomic replacement and a bounded deadline.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temporary, destination);
      return;
    } catch (error) {
      if (process.platform !== "win32" || !["EPERM", "EACCES", "EBUSY"].includes(error.code) || attempt === 20)
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

export async function createManagedResourceRun(options) {
  const root = resolve(options.root);
  const runId = randomUUID();
  const project = options.project ?? `${options.projectPrefix ?? "iam-integration"}-${runId.replaceAll("-", "")}`;
  if (!/^[a-z0-9][a-z0-9_-]+$/.test(project)) throw new Error("An exact Compose project name is required");
  const artifactDirectory = repositoryPath(root, options.artifactDirectory ?? `test-results/integration/${runId}`);
  const recordPath = `${artifactDirectory}/run.json`;
  const record = {
    schemaVersion: 1,
    runId,
    project,
    composeFile: repositoryPath(root, options.composeFile),
    artifactDirectory,
    composeEnvironmentFile: `${artifactDirectory}/compose-environment.json`,
    envFile: `${artifactDirectory}/empty.env`,
    testEnvironmentFile: `${artifactDirectory}/test-environment.json`,
    services: [...(options.services ?? [])],
    removeLocalImages: options.removeLocalImages ?? false,
    keep: options.keep ?? false,
    status: "created",
    createdAt: new Date().toISOString(),
    durations: {},
  };
  await mkdir(join(root, artifactDirectory), { recursive: true });
  await writeFile(
    join(root, record.composeEnvironmentFile),
    `${JSON.stringify(options.composeEnvironment ?? {}, null, 2)}\n`,
    { mode: 0o600 },
  );
  await writeFile(join(root, record.envFile), "", { mode: 0o600 });
  await writeFile(join(root, record.testEnvironmentFile), "{}\n", { mode: 0o600 });
  const run = { root, recordPath, record };
  await saveManagedResourceRun(run);
  if (options.registryFile) {
    const registry = join(root, repositoryPath(root, options.registryFile));
    await mkdir(dirname(registry), { recursive: true });
    await appendFile(registry, `${JSON.stringify(recordPath)}\n`, { mode: 0o600 });
  }
  console.log(`[test-resources] run ${runId}; record ${recordPath}`);
  return run;
}

export async function readManagedResourceRun(root, recordPath) {
  const path = repositoryPath(root, recordPath);
  const record = JSON.parse(await readFile(join(root, path), "utf8"));
  const statuses = ["created", "initializing", "ready", "running", "cleaning", "cleaned", "cleanup-failed", "kept"];
  if (
    record.schemaVersion !== 1 ||
    typeof record.runId !== "string" ||
    !record.runId ||
    typeof record.project !== "string" ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(record.project) ||
    !statuses.includes(record.status) ||
    typeof record.removeLocalImages !== "boolean" ||
    typeof record.createdAt !== "string" ||
    !record.durations ||
    typeof record.durations !== "object" ||
    Array.isArray(record.durations)
  )
    throw new Error("Invalid managed resource record");
  for (const field of ["composeFile", "artifactDirectory", "composeEnvironmentFile", "envFile", "testEnvironmentFile"])
    repositoryPath(root, record[field]);
  if (
    path !== `${record.artifactDirectory}/run.json` ||
    typeof record.keep !== "boolean" ||
    !Array.isArray(record.services) ||
    record.services.some((service) => typeof service !== "string")
  )
    throw new Error("Invalid managed resource record paths or options");
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
  const result = await runManagedComposeCommand(run, ["port", service, String(port)], options);
  const match = result.output.trim().match(/^127\.0\.0\.1:(\d+)$/);
  if (result.exitCode !== 0 || !match) throw new Error(`Could not discover ${service} loopback port: ${result.output}`);
  return Number(match[1]);
}

export async function collectManagedResourceDiagnostics(run, options = {}) {
  for (const [name, args] of [
    ["containers", ["ps", "--all", "--format", "json"]],
    ["services", ["logs", "--no-color", "--tail", "150"]],
  ]) {
    try {
      const result = await runManagedComposeCommand(run, args, {
        timeoutMs: 10_000,
        cleanupTimeoutMs: 5000,
        ...options,
      });
      if (result.exitCode !== 0) throw new Error(`Docker diagnostic exited ${result.exitCode}: ${result.output}`);
      await writeFile(join(run.root, run.record.artifactDirectory, `${name}.log`), result.output);
    } catch (error) {
      console.warn(`Warning: ${name} diagnostics failed: ${error.message}`);
    }
  }
}

export function managedCleanupCommand(run) {
  const path =
    process.platform === "win32"
      ? `'${run.recordPath.replaceAll("'", "''")}'`
      : `'${run.recordPath.replaceAll("'", "'\\''")}'`;
  return `pnpm test:resources:cleanup --record ${path}`;
}

export async function cleanupManagedResources(run, options = {}) {
  if (options.respectKeep && run.record.keep) return;
  if (run.record.status === "cleaned") return;
  const start = performance.now();
  run.record.status = "cleaning";
  const failures = [];
  try {
    await saveManagedResourceRun(run);
  } catch (error) {
    failures.push(error);
  }
  try {
    const result = await runManagedComposeCommand(
      run,
      ["down", "--volumes", "--remove-orphans", ...(run.record.removeLocalImages ? ["--rmi", "local"] : [])],
      {
        timeoutMs: options.timeoutMs ?? 30_000,
        cleanupTimeoutMs: 5000,
        logFile: join(run.root, run.record.artifactDirectory, "cleanup.log"),
        runCommand: options.runCommand,
      },
    );
    if (result.exitCode !== 0)
      throw new Error(
        `Exact project ${run.record.project} cleanup failed with exit ${result.exitCode}:\n${result.output}`,
      );
  } catch (error) {
    failures.push(error);
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
  await collectManagedResourceDiagnostics(run);
  if (run.record.keep) {
    run.record.status = "kept";
    await saveManagedResourceRun(run);
    console.log(`[test-resources] Environment retained; cleanup: ${managedCleanupCommand(run)}`);
  } else await cleanupManagedResources(run, { timeoutMs: options.cleanupTimeoutMs });
}

export function formatResourceFailure(error) {
  if (error instanceof AggregateError) return `${error.message}\n${error.errors.map(formatResourceFailure).join("\n")}`;
  return error instanceof Error
    ? `${error.message}${error.cause ? `\n${formatResourceFailure(error.cause)}` : ""}`
    : String(error);
}

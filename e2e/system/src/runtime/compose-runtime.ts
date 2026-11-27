import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";
import {
  type OwnedCommandOptions,
  type OwnedCommandResult,
  runOwnedCommand,
} from "../../../../scripts/owned-command.mjs";

const composeFile = "e2e/system/docker-compose.e2e.yml";
const projectPattern = /^iam-e2e-[a-f0-9]{32}$/u;

type ComposeRecord = {
  schemaVersion: 1;
  project: string;
  artifactDirectory: string;
  removeLocalImages: boolean;
  keep: boolean;
};

export type E2EComposeRun = { root: string; recordPath: string; record: ComposeRecord };
type ComposeCommandOptions = Omit<OwnedCommandOptions, "executable" | "args" | "cwd" | "env"> & {
  runCommand?: (options: OwnedCommandOptions) => Promise<OwnedCommandResult>;
};

export async function writeAtomicResourceRecord(destination: string, record: unknown) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, destination);
}

export async function createE2EComposeRun(options: {
  root: string;
  project: string;
  artifactDirectory: string;
  removeLocalImages: boolean;
  keep: boolean;
  composeEnvironment: Record<string, string>;
}): Promise<E2EComposeRun> {
  const { root, project, artifactDirectory, removeLocalImages, keep, composeEnvironment } = options;
  const recordPath = `${artifactDirectory}/run.json`;
  const record = { schemaVersion: 1, project, artifactDirectory, removeLocalImages, keep } as const;
  await mkdir(join(root, artifactDirectory), { recursive: true, mode: 0o700 });
  await writeAtomicResourceRecord(join(root, artifactDirectory, "compose-environment.json"), composeEnvironment);
  await writeFile(join(root, artifactDirectory, "empty.env"), "", { mode: 0o600 });
  await writeAtomicResourceRecord(join(root, recordPath), record);
  return { root, recordPath, record };
}

export async function readE2EComposeRun(root: string, recordPath: string): Promise<E2EComposeRun> {
  if (!/^test-results\/e2e\/iam-e2e-[a-f0-9]{32}\/run\.json$/u.test(recordPath))
    throw new Error("An exact E2E Compose record path is required");
  const record: ComposeRecord = JSON.parse(await readFile(join(root, recordPath), "utf8"));
  if (
    record.schemaVersion !== 1 ||
    !projectPattern.test(record.project) ||
    record.artifactDirectory !== `test-results/e2e/${record.project}` ||
    recordPath !== `${record.artifactDirectory}/run.json` ||
    typeof record.removeLocalImages !== "boolean" ||
    typeof record.keep !== "boolean"
  )
    throw new Error("Invalid E2E Compose record");
  return { root, recordPath, record };
}

export async function runComposeCommand(
  run: E2EComposeRun,
  args: readonly string[],
  options: ComposeCommandOptions = {},
) {
  const { runCommand = runOwnedCommand, ...commandOptions } = options;
  const artifacts = join(run.root, run.record.artifactDirectory);
  const environment = JSON.parse(await readFile(join(artifacts, "compose-environment.json"), "utf8"));
  if (
    !environment ||
    typeof environment !== "object" ||
    Array.isArray(environment) ||
    Object.values(environment).some((value) => typeof value !== "string")
  )
    throw new Error("Invalid E2E Compose environment");

  return await runCommand({
    ...commandOptions,
    executable: "docker",
    args: [
      "compose",
      "--project-name",
      run.record.project,
      "--project-directory",
      run.root,
      "--env-file",
      join(artifacts, "empty.env"),
      "--file",
      join(run.root, composeFile),
      ...args,
    ],
    cwd: run.root,
    env: { ...process.env, ...environment },
  });
}

async function probeEndpoint(host: string, port: number, signal?: AbortSignal) {
  return await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port, signal, timeout: 500 });
    const finish = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

export async function resolveComposeEndpoint(
  run: E2EComposeRun,
  service: string,
  port: number,
  options: Pick<OwnedCommandOptions, "signal" | "timeoutMs">,
) {
  // Prefer bridge connectivity on Linux and use the published port when the bridge is unreachable.
  const ps = await runComposeCommand(run, ["ps", "-q", service], options);
  const container = ps.output.trim().split(/\r?\n/u).find(Boolean);
  if (ps.exitCode === 0 && container) {
    const inspected = await runOwnedCommand({
      ...options,
      executable: "docker",
      args: ["inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{println}}{{end}}", container],
      cwd: run.root,
    });
    const host = inspected.output
      .trim()
      .split(/\s+/u)
      .find((line) => /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(line));
    if (inspected.exitCode === 0 && host && (await probeEndpoint(host, port, options.signal))) return { host, port };
  }
  const published = await runComposeCommand(run, ["port", service, String(port)], options);
  const match = published.output.trim().match(/^127\.0\.0\.1:(\d+)$/u);
  if (published.exitCode !== 0 || !match)
    throw new Error(`Could not discover ${service} loopback port: ${published.output}`);
  return { host: "127.0.0.1", port: Number(match[1]) };
}

export async function cleanupComposeRun(run: E2EComposeRun, { timeoutMs }: { timeoutMs: number }) {
  const { project, artifactDirectory, removeLocalImages } = run.record;
  const result = await runComposeCommand(run, ["down", "--volumes", "--remove-orphans"], {
    timeoutMs,
    logFile: join(run.root, artifactDirectory, "cleanup.log"),
  });
  if (result.exitCode !== 0) throw new Error(`Exact project ${project} cleanup failed:\n${result.output}`);
  if (!removeLocalImages) return;

  const docker = async (args: string[]) => {
    const result = await runOwnedCommand({ executable: "docker", args, cwd: run.root, timeoutMs });
    if (result.exitCode !== 0) throw new Error(`Image cleanup for ${project} failed:\n${result.output}`);
    return result.output.trim();
  };
  // Keep the :local aliases for --skip-build.
  const imageList = await docker([
    "image",
    "ls",
    "--filter",
    `reference=iam-e2e-*:${project}`,
    "--format",
    "{{.Repository}}:{{.Tag}}",
  ]);
  const tags = imageList.split(/\r?\n/u).filter((tag) => tag.startsWith("iam-e2e-") && tag.endsWith(`:${project}`));
  if (tags.length) await docker(["image", "rm", ...tags]);
}

export async function finishE2EComposeRun(
  run: E2EComposeRun,
  options: { cleanupTimeoutMs: number; diagnostics: boolean },
) {
  const cleanup = `pnpm --filter @iam/e2e-system runtime:cleanup --project ${run.record.project}`;
  async function diagnose() {
    for (const [name, args] of [
      ["containers", ["ps", "--all", "--format", "json"]],
      ["services", ["logs", "--no-color", "--tail", "150"]],
    ] as const) {
      try {
        const result = await runComposeCommand(run, args, { timeoutMs: 10_000 });
        await writeFile(join(run.root, run.record.artifactDirectory, `${name}.log`), result.output);
      } catch (error) {
        console.warn(`E2E ${name} diagnostics failed`, error);
      }
    }
  }

  const captureDiagnostics = options.diagnostics || run.record.keep;
  if (captureDiagnostics) await diagnose();
  if (run.record.keep) {
    console.log(`[e2e] Environment retained. Cleanup command: ${cleanup}`);
    return;
  }
  try {
    await cleanupComposeRun(run, { timeoutMs: options.cleanupTimeoutMs });
  } catch (error) {
    if (!captureDiagnostics) await diagnose();
    throw new Error(`E2E cleanup failed. Recover with ${cleanup}`, { cause: error });
  }
}

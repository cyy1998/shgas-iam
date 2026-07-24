import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type EslintDiagnosticSnapshot = {
  checkedFileCount: number;
  checkedFileSetHash: string;
  diagnosticKeys: string[];
  errorCount: number;
  exitCode: number;
  warningCount: number;
};

type EslintConsumer = {
  args: string[];
  config: string;
  manifest: string;
  name: string;
  workspace: string;
};

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name: string;
  scripts?: Record<string, string>;
};

type EslintJsonMessage = {
  messageId?: string;
  ruleId: string | null;
  severity: number;
};

type EslintJsonResult = {
  errorCount: number;
  filePath: string;
  messages: EslintJsonMessage[];
  warningCount: number;
};

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(moduleDirectory, "../..");
const configOwner = "@iam/eslint-config";

export async function collectEslintDiagnosticSnapshots(concurrency = 2) {
  const eslintConsumers = await discoverEslintConsumers();
  const snapshots = new Map<string, EslintDiagnosticSnapshot>();
  const failures: unknown[] = [];
  let nextConsumerIndex = 0;

  async function worker() {
    while (nextConsumerIndex < eslintConsumers.length) {
      const consumer = eslintConsumers[nextConsumerIndex++];
      try {
        snapshots.set(consumer.name, await runEslintConsumer(consumer));
      }
      catch (error) {
        failures.push(error);
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(concurrency, eslintConsumers.length) },
    () => worker(),
  ));

  if (failures.length > 0)
    throw new AggregateError(failures, "One or more ESLint consumer checks failed");

  return Object.fromEntries(
    eslintConsumers.map(consumer => [consumer.name, snapshots.get(consumer.name)!]),
  );
}

export async function readWorkspaceManifest(consumer: EslintConsumer) {
  return readPackageManifest(consumer.manifest);
}

export async function readConsumerConfigImports(consumer: EslintConsumer) {
  const source = await readFile(resolve(repoRoot, consumer.config), "utf8");
  return [...source.matchAll(/\bfrom\s+["']([^"']+)["']/gu)]
    .map(match => match[1])
    .sort();
}

export async function discoverEslintConsumers(): Promise<EslintConsumer[]> {
  const rootManifest = await readPackageManifest("package.json");
  const rootLintScript = rootManifest.scripts?.["lint:root"] ?? rootManifest.scripts?.lint;
  if (!rootLintScript)
    throw new Error("Root package has no lint:root or lint script");

  const workspacePaths = [
    ...await listWorkspaceDirectories("apps"),
    ...await listWorkspaceDirectories("packages"),
    "gateway",
  ];
  const workspaceConsumers = (await Promise.all(workspacePaths.map(async (workspace) => {
    const manifest = await readPackageManifest(`${workspace}/package.json`);
    if (manifest.name === configOwner)
      return undefined;

    const lintScript = manifest.scripts?.["lint:eslint"] ?? manifest.scripts?.lint;
    if (!lintScript)
      throw new Error(`${manifest.name} has no lint or lint:eslint script`);

    return {
      args: extractEslintArgs(lintScript, manifest.name),
      config: await findWorkspaceConfig(workspace, manifest.name),
      manifest: `${workspace}/package.json`,
      name: manifest.name,
      workspace,
    };
  }))).filter(consumer => consumer !== undefined);

  return [
    {
      args: extractEslintArgs(rootLintScript, "root"),
      config: "eslint.root.config.mjs",
      manifest: "package.json",
      name: "root",
      workspace: ".",
    },
    ...workspaceConsumers.sort((left, right) => left.name.localeCompare(right.name)),
  ];
}

async function runEslintConsumer(consumer: EslintConsumer): Promise<EslintDiagnosticSnapshot> {
  const eslintBinary = resolve(repoRoot, "node_modules/.bin/eslint");
  const result = await spawnProcess(
    eslintBinary,
    [...consumer.args, "--format", "json"],
    resolve(repoRoot, consumer.workspace),
  );

  let reports: EslintJsonResult[];
  try {
    reports = JSON.parse(result.stdout) as EslintJsonResult[];
  }
  catch (error) {
    throw new Error(
      `${consumer.name} did not emit ESLint JSON (exit ${result.exitCode}): ${result.stderr}`,
      { cause: error },
    );
  }

  const checkedFiles = reports
    .map(report => relative(repoRoot, report.filePath).replaceAll("\\", "/"))
    .sort();
  const diagnosticKeys = new Set<string>();
  let errorCount = 0;
  let warningCount = 0;

  for (const report of reports) {
    errorCount += report.errorCount;
    warningCount += report.warningCount;
    for (const message of report.messages) {
      diagnosticKeys.add([
        message.severity,
        message.ruleId ?? "fatal",
        message.messageId ?? "",
      ].join(":"));
    }
  }

  return {
    checkedFileCount: checkedFiles.length,
    checkedFileSetHash: createHash("sha256").update(checkedFiles.join("\n")).digest("hex"),
    diagnosticKeys: [...diagnosticKeys].sort(),
    errorCount,
    exitCode: result.exitCode,
    warningCount,
  };
}

function spawnProcess(command: string, args: string[], cwd: string) {
  return new Promise<{ exitCode: number; stderr: string; stdout: string }>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolvePromise({
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function findWorkspaceConfig(workspace: string, name: string) {
  for (const filename of ["eslint.config.js", "eslint.config.mjs"]) {
    const configPath = `${workspace}/${filename}`;
    try {
      await readFile(resolve(repoRoot, configPath), "utf8");
      return configPath;
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw error;
    }
  }

  throw new Error(`${name} has no ESLint flat config`);
}

async function listWorkspaceDirectories(parent: string) {
  const entries = await readdir(resolve(repoRoot, parent), { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => `${parent}/${entry.name}`)
    .sort();
}

async function readPackageManifest(path: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(resolve(repoRoot, path), "utf8")) as PackageManifest;
}

function extractEslintArgs(script: string, name: string) {
  const directCommand = script
    .split("&&")
    .map(command => command.trim())
    .find(command => command.startsWith("eslint "));
  if (!directCommand)
    throw new Error(`${name} lint entry does not contain a direct ESLint command`);

  const commandBody = directCommand.slice("eslint ".length).trim();
  if (/["'\\]/u.test(commandBody))
    throw new Error(`${name} lint entry requires unsupported shell quoting`);

  return commandBody.split(/\s+/u);
}

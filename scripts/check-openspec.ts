import { join } from "node:path";

import { runArchiveIntegrityCli } from "./check-openspec-archive-integrity";

const repoRoot = join(import.meta.dirname, "..");

export type OpenSpecCheckProcessResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type OpenSpecCheckDependencies = {
  readGitPaths: () => Promise<{
    staged: string[];
    unstaged: string[];
    untracked: string[];
  }>;
  runArchiveIntegrity: () => Promise<OpenSpecCheckProcessResult>;
  runStrictValidation: () => Promise<OpenSpecCheckProcessResult>;
};

export type StagedOpenSpecScope = {
  allowed: boolean;
  conflicts: string[];
  shouldRun: boolean;
};

export function classifyStagedOpenSpecScope(paths: {
  staged: readonly string[];
  unstaged: readonly string[];
  untracked: readonly string[];
}): StagedOpenSpecScope {
  const shouldRun = paths.staged.some(isOpenSpecSensitivePath);
  const conflicts = shouldRun
    ? [...new Set([...paths.unstaged, ...paths.untracked]
      .filter(isOpenSpecSensitivePath)
      .map(path => path.replaceAll("\\", "/").replace(/^\.\//, "")))]
        .sort()
    : [];

  return {
    allowed: conflicts.length === 0,
    conflicts,
    shouldRun,
  };
}

export function isOpenSpecSensitivePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.startsWith("openspec/")) return true;
  if (/^scripts\/(?:__tests__\/)?check-openspec(?:-[^/]+)?\.(?:ts|mjs)$/.test(normalized)) return true;
  if (normalized === "scripts/__tests__/install-git-hooks.test.ts"
    || normalized === "scripts/__tests__/nano-staged-config.test.ts"
    || normalized === "scripts/__tests__/precommit-integration.test.ts"
    || normalized === "scripts/install-git-hooks.mjs") return true;

  return new Set([
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "nano-staged.mjs",
  ]).has(normalized);
}

export async function runOpenSpecChecks(options: {
  staged?: boolean;
  dependencies?: OpenSpecCheckDependencies;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
} = {}): Promise<number> {
  const dependencies = options.dependencies ?? createDefaultDependencies();
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;

  if (options.staged) {
    let paths: Awaited<ReturnType<OpenSpecCheckDependencies["readGitPaths"]>>;
    try {
      paths = await dependencies.readGitPaths();
    }
    catch (error) {
      stderr(`OpenSpec staged scope check failed: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }

    const scope = classifyStagedOpenSpecScope(paths);
    if (!scope.shouldRun) {
      stdout("OpenSpec staged check skipped: no sensitive staged paths.");
      return 0;
    }
    if (!scope.allowed) {
      stderr("OpenSpec staged check blocked: sensitive unstaged or untracked paths remain outside the staged snapshot:");
      for (const conflict of scope.conflicts) stderr(`- ${conflict}`);
      stderr("Stage, commit, or set aside those paths explicitly, then retry. The guard did not modify the working tree or index.");
      return 1;
    }
  }

  const strict = await dependencies.runStrictValidation();
  emitCheckResult("OpenSpec strict validation", strict, stdout, stderr);

  const archives = await dependencies.runArchiveIntegrity();
  emitCheckResult("OpenSpec archive integrity", archives, stdout, stderr);

  return strict.exitCode === 0 && archives.exitCode === 0 ? 0 : 1;
}

function createDefaultDependencies(): OpenSpecCheckDependencies {
  return {
    readGitPaths: async () => ({
      staged: await readGitPathList(["diff", "--cached", "--name-only", "-z"]),
      unstaged: await readGitPathList(["diff", "--name-only", "-z"]),
      untracked: await readGitPathList(["ls-files", "--others", "--exclude-standard", "-z"]),
    }),
    runArchiveIntegrity: async () => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const exitCode = runArchiveIntegrityCli({
        stderr: message => stderr.push(message),
        stdout: message => stdout.push(message),
      });
      return { exitCode, stderr: stderr.join("\n"), stdout: stdout.join("\n") };
    },
    runStrictValidation: () => runProcess([
      "pnpm",
      "exec",
      "openspec",
      "validate",
      "--all",
      "--strict",
      "--no-interactive",
    ]),
  };
}

async function readGitPathList(args: string[]): Promise<string[]> {
  const result = await runProcess(["git", ...args]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} exited with ${result.exitCode}`);
  }
  return result.stdout.split("\0").filter(Boolean);
}

async function runProcess(command: string[]): Promise<OpenSpecCheckProcessResult> {
  const process = Bun.spawn({
    cmd: command,
    cwd: repoRoot,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stderr, stdout };
}

function emitCheckResult(
  label: string,
  result: OpenSpecCheckProcessResult,
  stdout: (message: string) => void,
  stderr: (message: string) => void,
): void {
  if (result.stdout.trim()) stdout(`${label}:\n${result.stdout.trimEnd()}`);
  if (result.stderr.trim()) stderr(`${label}:\n${result.stderr.trimEnd()}`);
  if (result.exitCode !== 0 && !result.stdout.trim() && !result.stderr.trim()) {
    stderr(`${label} failed with exit code ${result.exitCode}.`);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const unknownArgs = args.filter(arg => arg !== "--staged");
  if (unknownArgs.length > 0) {
    console.error(`Unknown arguments: ${unknownArgs.join(", ")}`);
    process.exit(1);
  }
  process.exit(await runOpenSpecChecks({ staged: args.includes("--staged") }));
}

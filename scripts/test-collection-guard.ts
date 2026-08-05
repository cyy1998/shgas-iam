import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";

const integrationProfiles = [
  "browser",
  "component",
  "composition",
  "postgres",
  "process",
  "redis",
] as const;
const canonicalTasks = [
  "test:unit",
  ...integrationProfiles.map(profile => `test:integration:${profile}`),
  "test:e2e",
];
export interface TestCollectionCommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface TestCollectionCommandRunner {
  run: (command: string[], cwd: string) => Promise<TestCollectionCommandResult>;
}

export interface TestCollectionIssue {
  code:
    | "adapter-failure"
    | "duplicate-collection"
    | "missing-collection"
    | "path-naming-mismatch"
    | "task-unreachable";
  message: string;
}

interface WorkspaceManifest {
  directory: string;
  name: string;
  scripts: Record<string, string>;
}

const defaultCommandRunner: TestCollectionCommandRunner = {
  async run(command, cwd) {
    const child = Bun.spawn(command, {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      stderr: "pipe",
      stdout: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stderr, stdout };
  },
};

function normalizePath(path: string) {
  return path.replaceAll("\\", "/");
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as {
    name?: string;
    scripts?: Record<string, string>;
  };
}

function readWorkspaceManifests(repoRoot: string) {
  const manifests: WorkspaceManifest[] = [];
  for (const parent of ["apps", "packages"]) {
    const parentRoot = join(repoRoot, parent);
    if (!existsSync(parentRoot))
      continue;
    for (const entry of readdirSync(parentRoot, { withFileTypes: true })) {
      const manifestPath = join(parentRoot, entry.name, "package.json");
      if (!entry.isDirectory() || !existsSync(manifestPath))
        continue;
      const manifest = readJson(manifestPath);
      if (manifest.name) {
        manifests.push({
          directory: join(parentRoot, entry.name),
          name: manifest.name,
          scripts: manifest.scripts ?? {},
        });
      }
    }
  }
  const gatewayManifest = join(repoRoot, "gateway", "package.json");
  if (existsSync(gatewayManifest)) {
    const manifest = readJson(gatewayManifest);
    if (manifest.name) {
      manifests.push({
        directory: join(repoRoot, "gateway"),
        name: manifest.name,
        scripts: manifest.scripts ?? {},
      });
    }
  }
  return manifests.sort((left, right) => left.name.localeCompare(right.name));
}

function listFiles(root: string, pattern: string) {
  if (!existsSync(root))
    return [];
  return [...new Bun.Glob(pattern).scanSync({ cwd: root })]
    .map(file => normalizePath(file))
    .sort();
}

function listTestCandidates(workspace: WorkspaceManifest, repoRoot: string) {
  return [
    ...listFiles(workspace.directory, "**/*.test.{mjs,ts,tsx}"),
    ...listFiles(workspace.directory, "**/*.spec.ts"),
  ].map(file => normalizePath(join(relative(repoRoot, workspace.directory), file)));
}

function addCollection(
  collections: Map<string, string[]>,
  repoPath: string,
  collection: string,
) {
  const owners = collections.get(repoPath) ?? [];
  owners.push(collection);
  collections.set(repoPath, owners);
}

function listBunCollectionFiles(
  workspace: WorkspaceManifest,
  repoRoot: string,
  command: string,
) {
  const roots = command.split(/\s+/u)
    .slice(2)
    .filter(token => !token.startsWith("-"));
  if (roots.length === 0)
    throw new Error(`Bun command has no narrow test root: ${command}`);
  return roots.flatMap((root) => {
    const absoluteRoot = resolve(workspace.directory, root);
    if (existsSync(absoluteRoot) && statSync(absoluteRoot).isFile())
      return [normalizePath(relative(repoRoot, absoluteRoot))];
    const rootPrefix = normalizePath(relative(workspace.directory, absoluteRoot));
    return listFiles(absoluteRoot, "**/*.test.{mjs,ts,tsx}").map(file => normalizePath(join(
      relative(repoRoot, workspace.directory),
      rootPrefix === "." ? "" : rootPrefix,
      file,
    )));
  });
}

function collectPlaywrightFiles(suites: Array<{ file?: string; suites?: unknown[] }>, files: Set<string>) {
  for (const suite of suites) {
    if (suite.file)
      files.add(normalizePath(suite.file));
    collectPlaywrightFiles(
      (suite.suites ?? []) as Array<{ file?: string; suites?: unknown[] }>,
      files,
    );
  }
}

async function listRunnerCollectionFiles(
  workspace: WorkspaceManifest,
  repoRoot: string,
  command: string,
  runner: TestCollectionCommandRunner,
) {
  if (command.startsWith("bun test "))
    return listBunCollectionFiles(workspace, repoRoot, command);

  if (command.startsWith("vitest run ")) {
    const config = /--config\s+(?<config>\S+)/u.exec(command)?.groups?.config;
    if (!config)
      throw new Error(`Vitest command has no config: ${command}`);
    const vitest = join(workspace.directory, "node_modules", "vitest", "vitest.mjs");
    const result = await runner.run([
      "node",
      vitest,
      "list",
      "--config",
      config,
      "--filesOnly",
      "--json",
      "--staticParse",
    ], workspace.directory);
    if (result.exitCode !== 0) {
      throw new Error(
        `Vitest ${workspace.name} ${config} exited ${result.exitCode}: ${result.stderr || result.stdout}`,
      );
    }
    const parsed = JSON.parse(result.stdout) as Array<{ file: string }>;
    return parsed.map(({ file }) => normalizePath(relative(repoRoot, file))).sort();
  }

  if (command.includes("playwright test")) {
    const playwright = join(
      workspace.directory,
      "node_modules",
      "@playwright",
      "test",
      "cli.js",
    );
    const result = await runner.run(
      ["node", playwright, "test", "--list", "--reporter=json"],
      workspace.directory,
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `Playwright ${workspace.name} exited ${result.exitCode}: ${result.stderr || result.stdout}`,
      );
    }
    const parsed = JSON.parse(result.stdout) as {
      config: { rootDir: string };
      suites: Array<{ file?: string; suites?: unknown[] }>;
    };
    const files = new Set<string>();
    collectPlaywrightFiles(parsed.suites, files);
    return [...files]
      .map(file => normalizePath(relative(
        repoRoot,
        resolve(parsed.config.rootDir, file),
      )))
      .sort();
  }

  throw new Error(`Unsupported canonical runner command for ${workspace.name}: ${command}`);
}

function expectedCollectionForPath(repoPath: string, workspacePath: string) {
  const relativePath = workspacePath
    ? repoPath.slice(workspacePath.length + 1)
    : repoPath;
  const integration = /^test-integration\/(?<profile>[^/]+)\/(?<file>.+)$/u.exec(relativePath);
  if (integration?.groups) {
    const { file, profile } = integration.groups;
    if (!integrationProfiles.includes(profile as typeof integrationProfiles[number]))
      return undefined;
    if (profile === "browser")
      return file.endsWith(".spec.ts") ? "test:integration:browser" : undefined;
    return /\.integration\.test\.(?:ts|tsx)$/u.test(file)
      ? `test:integration:${profile}`
      : undefined;
  }
  if (relativePath.startsWith("e2e/system/"))
    return relativePath.endsWith(".spec.ts") ? "test:e2e" : undefined;
  if (/\.integration\.test\.(?:ts|tsx)$/u.test(relativePath) || relativePath.endsWith(".spec.ts"))
    return undefined;
  if (
    relativePath.startsWith("src/")
    || relativePath.startsWith("test/")
    || relativePath.startsWith("scripts/__tests__/")
  ) {
    return "test:unit";
  }
  return undefined;
}

function addExpectedTask(
  tasksByRootCommand: Map<string, Set<string>>,
  rootCommand: string,
  taskId: string,
) {
  const tasks = tasksByRootCommand.get(rootCommand) ?? new Set<string>();
  tasks.add(taskId);
  tasksByRootCommand.set(rootCommand, tasks);
}

function parseRootTurboTasks(command: string) {
  const tokens = command.trim().split(/\s+/u);
  if (tokens[0] !== "turbo")
    return undefined;
  const taskTokens = tokens.slice(tokens[1] === "run" ? 2 : 1);
  const firstOption = taskTokens.findIndex(token => token.startsWith("-"));
  return (firstOption === -1 ? taskTokens : taskTokens.slice(0, firstOption))
    .filter(Boolean);
}

function adapterFailure(message: string): TestCollectionIssue[] {
  return [{ code: "adapter-failure", message }];
}

export async function analyzeTestCollections(
  repoRoot: string,
  runner: TestCollectionCommandRunner = defaultCommandRunner,
): Promise<TestCollectionIssue[]> {
  const workspaces = readWorkspaceManifests(repoRoot);
  const rootManifest = readJson(join(repoRoot, "package.json"));
  const collections = new Map<string, string[]>();
  const candidates = new Map<string, string | undefined>();
  const expectedTasksByRootCommand = new Map<string, Set<string>>();
  const issues: TestCollectionIssue[] = [];

  try {
    for (const workspace of workspaces) {
      const workspacePath = normalizePath(relative(repoRoot, workspace.directory));
      for (const repoPath of listTestCandidates(workspace, repoRoot))
        candidates.set(repoPath, expectedCollectionForPath(repoPath, workspacePath));
      for (const task of canonicalTasks) {
        const command = workspace.scripts[task];
        if (!command)
          continue;
        addExpectedTask(
          expectedTasksByRootCommand,
          task,
          `${workspace.name}#${task}`,
        );
        for (const repoPath of await listRunnerCollectionFiles(
          workspace,
          repoRoot,
          command,
          runner,
        ))
          addCollection(collections, repoPath, `${workspace.name}#${task}`);
      }
    }

    const rootScripts = rootManifest.scripts ?? {};
    for (const file of listFiles(repoRoot, "scripts/__tests__/*.test.{mjs,ts,tsx}"))
      candidates.set(file, expectedCollectionForPath(file, ""));
    for (const file of listFiles(repoRoot, "e2e/system/**/*.spec.ts"))
      candidates.set(file, expectedCollectionForPath(file, ""));

    if (rootScripts["test:unit:root"]) {
      addExpectedTask(expectedTasksByRootCommand, "test:unit", "//#test:unit:root");
      const rootWorkspace = {
        directory: repoRoot,
        name: rootManifest.name ?? "//",
        scripts: rootScripts,
      };
      for (const file of listBunCollectionFiles(
        rootWorkspace,
        repoRoot,
        rootScripts["test:unit:root"],
      ))
        addCollection(collections, file, `${rootManifest.name}#test:unit:root`);
    }

    if (rootScripts["test:e2e:root"]) {
      addExpectedTask(expectedTasksByRootCommand, "test:e2e", "//#test:e2e:root");
      const rootWorkspace = {
        directory: repoRoot,
        name: rootManifest.name ?? "//",
        scripts: rootScripts,
      };
      for (const file of listBunCollectionFiles(
        rootWorkspace,
        repoRoot,
        rootScripts["test:e2e:root"],
      ))
        addCollection(collections, file, `${rootManifest.name}#test:e2e:root`);
    }

    const turboBin = join(repoRoot, "node_modules", "turbo", "bin", "turbo");
    for (const [rootCommand, expectedTasks] of expectedTasksByRootCommand) {
      const rootScript = rootScripts[rootCommand];
      const declaredTasks = rootScript ? parseRootTurboTasks(rootScript) : undefined;
      if (!declaredTasks || declaredTasks.length === 0) {
        for (const task of expectedTasks) {
          issues.push({
            code: "task-unreachable",
            message: `${task} is declared but root ${rootCommand} is missing or is not a Turbo command`,
          });
        }
        continue;
      }
      const undeclaredTasks = [...expectedTasks].filter((taskId) => {
        const taskName = taskId.slice(taskId.indexOf("#") + 1);
        return !declaredTasks.includes(taskName);
      });
      for (const task of undeclaredTasks) {
        issues.push({
          code: "task-unreachable",
          message: `${task} is not selected by public root command ${rootCommand}: ${rootScript}`,
        });
      }

      const turboResult = await runner.run([
        "node",
        turboBin,
        "run",
        ...declaredTasks,
        "--dry=json",
        "--no-daemon",
      ], repoRoot);
      if (turboResult.exitCode !== 0) {
        return adapterFailure(
          `Turbo dry-run for root ${rootCommand} exited ${turboResult.exitCode}: ${turboResult.stderr || turboResult.stdout}`,
        );
      }
      const dryRun = JSON.parse(turboResult.stdout) as { tasks: Array<{ taskId: string }> };
      const reachableTasks = new Set(dryRun.tasks.map(task => task.taskId));
      for (const task of expectedTasks) {
        if (!reachableTasks.has(task)) {
          issues.push({
            code: "task-unreachable",
            message: `${task} is unreachable through public root command ${rootCommand}`,
          });
        }
      }
    }

    for (const [repoPath, expected] of candidates) {
      const actual = collections.get(repoPath) ?? [];
      if (!expected) {
        issues.push({
          code: "path-naming-mismatch",
          message: `${repoPath} does not match a canonical Unit, Integration profile, or e2e/system path and naming contract`,
        });
      }
      if (actual.length === 0) {
        issues.push({
          code: "missing-collection",
          message: `${repoPath} expected ${expected ?? "a canonical owner"} but is not collected`,
        });
      }
      if (actual.length > 1) {
        issues.push({
          code: "duplicate-collection",
          message: `${repoPath} is collected by ${actual.join(", ")}`,
        });
      }
      const actualMatchesExpected = actual[0]?.endsWith(`#${expected}`)
        || (expected === "test:unit" && actual[0]?.endsWith("#test:unit:root"))
        || (expected === "test:e2e" && actual[0]?.endsWith("#test:e2e:root"));
      if (expected && actual.length === 1 && !actualMatchesExpected) {
        issues.push({
          code: "path-naming-mismatch",
          message: `${repoPath} expected ${expected} but is collected by ${actual[0]}`,
        });
      }
    }
    for (const [repoPath, actual] of collections) {
      if (!candidates.has(repoPath)) {
        issues.push({
          code: "path-naming-mismatch",
          message: `${repoPath} is collected by ${actual.join(", ")} but is not a canonical test candidate`,
        });
      }
    }
    return issues.sort((left, right) => left.message.localeCompare(right.message));
  }
  catch (error) {
    return adapterFailure(error instanceof Error ? error.message : String(error));
  }
}

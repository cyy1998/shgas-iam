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
const workspaceLocalE2eJourneyOwners = {
  "admin:journey": {
    command: "bun src/cli.ts admin",
    selector: "admin",
  },
  "oidc:journey": {
    command: "bun src/cli.ts oidc",
    selector: "oidc",
  },
} as const;
const fullSystemE2eCommand = "bun src/cli.ts e2e";
interface TestCollectionCommandOptions {
  env?: Record<string, string>;
}
export interface TestCollectionCommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface TestCollectionCommandRunner {
  run: (
    command: string[],
    cwd: string,
    options?: TestCollectionCommandOptions,
  ) => Promise<TestCollectionCommandResult>;
}

export interface TestCollectionIssue {
  code:
    | "adapter-failure"
    | "duplicate-collection"
    | "missing-collection"
    | "path-naming-mismatch"
    | "task-unreachable"
    | "unsupported-owner";
  message: string;
}

interface WorkspaceManifest {
  directory: string;
  name: string;
  scripts: Record<string, string>;
}

const defaultCommandRunner: TestCollectionCommandRunner = {
  async run(command, cwd, options) {
    const child = Bun.spawn(command, {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        ...options?.env,
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
  const e2eSystemManifest = join(repoRoot, "e2e", "system", "package.json");
  if (existsSync(e2eSystemManifest)) {
    const manifest = readJson(e2eSystemManifest);
    if (manifest.name) {
      manifests.push({
        directory: join(repoRoot, "e2e", "system"),
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
  task?: string,
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

  const workspaceLocalJourney = parseWorkspaceLocalJourney(command, task);
  const fullSystemE2e = task === "test:e2e" && command === fullSystemE2eCommand;
  if (command.includes("playwright test") || workspaceLocalJourney || fullSystemE2e) {
    const playwright = join(
      workspace.directory,
      "node_modules",
      "@playwright",
      "test",
      "cli.js",
    );
    const files = new Set<string>();
    let rootDirectory = workspace.directory;
    const selectors = fullSystemE2e
      ? ["admin", "oidc"]
      : [workspaceLocalJourney];
    for (const selector of selectors) {
      const args = ["node", playwright, "test"];
      if (selector)
        args.push("--config", "playwright.config.ts");
      args.push("--list", "--reporter=json");
      const result = await runner.run(args, workspace.directory, selector
        ? {
            env: {
              IAM_E2E_ORIGIN: "http://127.0.0.1:49151",
              IAM_E2E_JOURNEY: selector,
              IAM_E2E_PLAYWRIGHT_OUTPUT_DIR: join(
                workspace.directory,
                "test-results",
                "collection-guard",
              ),
            },
          }
        : undefined);
      if (result.exitCode !== 0) {
        throw new Error(
          `Playwright ${workspace.name} exited ${result.exitCode}: ${result.stderr || result.stdout}`,
        );
      }
      const parsed = JSON.parse(result.stdout) as {
        config: { rootDir: string };
        suites: Array<{ file?: string; suites?: unknown[] }>;
      };
      rootDirectory = parsed.config.rootDir;
      collectPlaywrightFiles(parsed.suites, files);
    }
    return [...files]
      .map(file => normalizePath(relative(
        repoRoot,
        resolve(rootDirectory, file),
      )))
      .sort();
  }

  throw new Error(`Unsupported canonical runner command for ${workspace.name}: ${command}`);
}

function parseWorkspaceLocalJourney(command: string, task?: string) {
  const owner = task === undefined
    ? undefined
    : workspaceLocalE2eJourneyOwner(task);
  if (!owner)
    return undefined;
  if (command !== owner.command) {
    throw new Error(
      `${task} must use the documented workspace-local command ${owner.command}`,
    );
  }
  return owner.selector;
}

function workspaceLocalE2eJourneyOwner(task: string) {
  if (!Object.hasOwn(workspaceLocalE2eJourneyOwners, task))
    return undefined;
  return workspaceLocalE2eJourneyOwners[
    task as keyof typeof workspaceLocalE2eJourneyOwners
  ];
}

function expectedCollectionForPath(repoPath: string, workspacePath: string) {
  const relativePath = workspacePath
    ? repoPath.slice(workspacePath.length + 1)
    : repoPath;
  if (workspacePath === "e2e/system" && relativePath.endsWith(".spec.ts"))
    return "test:e2e";
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
  const workspaceLocalE2eOwners = new Set<string>();
  const issues: TestCollectionIssue[] = [];

  try {
    for (const workspace of workspaces) {
      const workspacePath = normalizePath(relative(repoRoot, workspace.directory));
      for (const repoPath of listTestCandidates(workspace, repoRoot))
        candidates.set(repoPath, expectedCollectionForPath(repoPath, workspacePath));
      const declaredWorkspaceLocalE2eTasks = workspacePath === "e2e/system"
        ? Object.keys(workspace.scripts).filter(task => task.endsWith(":journey"))
        : [];
      for (const task of declaredWorkspaceLocalE2eTasks) {
        if (!workspaceLocalE2eJourneyOwner(task)) {
          issues.push({
            code: "unsupported-owner",
            message: `${workspace.name}#${task} is not a documented workspace-local E2E journey owner`,
          });
        }
      }
      const workspaceLocalE2eTasks = declaredWorkspaceLocalE2eTasks
        .filter(task => workspaceLocalE2eJourneyOwner(task));
      const tasks = workspacePath === "e2e/system"
        ? [
            ...canonicalTasks,
            ...(workspace.scripts["test:e2e"] ? [] : workspaceLocalE2eTasks),
          ]
        : canonicalTasks;
      for (const task of tasks) {
        const command = workspace.scripts[task];
        if (!command)
          continue;
        if (canonicalTasks.includes(task)) {
          addExpectedTask(
            expectedTasksByRootCommand,
            task,
            `${workspace.name}#${task}`,
          );
        }
        else {
          workspaceLocalE2eOwners.add(`${workspace.name}#${task}`);
        }
        for (const repoPath of await listRunnerCollectionFiles(
          workspace,
          repoRoot,
          command,
          runner,
          task,
        ))
          addCollection(collections, repoPath, `${workspace.name}#${task}`);
      }
    }

    const rootScripts = rootManifest.scripts ?? {};
    for (const file of listFiles(repoRoot, "scripts/__tests__/*.test.{mjs,ts,tsx}"))
      candidates.set(file, expectedCollectionForPath(file, ""));
    for (const file of listFiles(repoRoot, "e2e/system/**/*.spec.ts")) {
      if (!candidates.has(file))
        candidates.set(file, expectedCollectionForPath(file, ""));
    }

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
        || (expected === "test:e2e" && actual[0]?.endsWith("#test:e2e:root"))
        || (expected === "test:e2e"
          && actual[0] !== undefined
          && workspaceLocalE2eOwners.has(actual[0]));
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

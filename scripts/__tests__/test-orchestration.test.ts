import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";

const repoRoot = join(import.meta.dirname, "..", "..");
const adminApiRoot = join(repoRoot, "apps", "admin-api");
const apiRoot = join(repoRoot, "apps", "api");
const apiCoreRoot = join(repoRoot, "packages", "api-core");
const oidcRoot = join(repoRoot, "apps", "oidc-provider");
const workerRoot = join(repoRoot, "apps", "worker");
const pnpmRecorderScript = join(
  repoRoot,
  "scripts",
  "__tests__",
  "fixtures",
  "pnpm-recorder.mjs",
);
const turboBin = join(repoRoot, "node_modules", "turbo", "bin", "turbo");
const verifyScript = join(repoRoot, "scripts", "verify.mjs");

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readNumericConstant(source: string, constantName: string) {
  const assignment = new RegExp(
    `const ${constantName} = (?<value>[\\d_]+);`,
    "u",
  ).exec(source);
  const value = assignment?.groups?.value;
  if (value === undefined)
    throw new Error(`missing numeric constant ${constantName}`);
  return Number(value.replaceAll("_", ""));
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readWorkspacePackages() {
  const manifestPaths = [
    ...new Bun.Glob("apps/*/package.json").scanSync({ cwd: repoRoot }),
    ...new Bun.Glob("packages/*/package.json").scanSync({ cwd: repoRoot }),
    "gateway/package.json",
  ];
  return manifestPaths.map(manifestPath => ({
    manifestPath,
    packageJson: readJson(join(repoRoot, manifestPath)),
  }));
}

async function readVitestTestConfig(workspace: string, configFile = "vitest.config.ts") {
  const module = await import(pathToFileURL(join(repoRoot, workspace, configFile)).href);
  return module.default.test as {
    exclude?: string[];
    fileParallelism?: boolean;
    include?: string[];
    maxWorkers?: number | string;
    testTimeout?: number;
  };
}

async function listOidcTestFiles(configFile: string) {
  const vitestBin = join(oidcRoot, "node_modules", "vitest", "vitest.mjs");
  const child = Bun.spawn(
    [
      "node",
      vitestBin,
      "list",
      "--config",
      configFile,
      "--filesOnly",
      "--json",
      "--staticParse",
    ],
    {
      cwd: oidcRoot,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `Vitest collection failed with ${exitCode}:\n${stdout}${stderr}`,
    );
  }
  const tests = JSON.parse(stdout) as Array<{ file: string }>;
  return [...new Set(tests.map(({ file }) => file
    .replaceAll("\\", "/")
    .split("/apps/oidc-provider/")[1]))].sort();
}

function createTransitFixture() {
  const root = mkdtempSync(join(tmpdir(), "iam-turbo-transit-"));
  const dependencyRoot = join(root, "packages", "dependency");
  const consumerRoot = join(root, "packages", "consumer");
  mkdirSync(join(dependencyRoot, "src"), { recursive: true });
  mkdirSync(join(consumerRoot, "src"), { recursive: true });

  writeJson(join(root, "package.json"), {
    name: "test-orchestration-fixture",
    private: true,
    packageManager: "pnpm@11.14.0",
  });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
  writeFileSync(
    join(root, "pnpm-lock.yaml"),
    "lockfileVersion: '9.0'\n\nimporters:\n  .: {}\n  packages/consumer:\n    dependencies:\n      '@fixture/dependency':\n        specifier: workspace:*\n        version: link:../dependency\n  packages/dependency: {}\n",
    "utf8",
  );
  writeFileSync(join(root, "turbo.json"), readFileSync(join(repoRoot, "turbo.json"), "utf8"), "utf8");
  writeJson(join(dependencyRoot, "package.json"), {
    name: "@fixture/dependency",
    scripts: { test: "node -e \"\"" },
  });
  writeJson(join(consumerRoot, "package.json"), {
    name: "@fixture/consumer",
    scripts: { test: "node -e \"\"" },
    dependencies: { "@fixture/dependency": "workspace:*" },
  });
  writeFileSync(join(dependencyRoot, "src", "value.ts"), "export const value = 1;\n", "utf8");
  writeFileSync(join(consumerRoot, "src", "consumer.ts"), "export const consumer = true;\n", "utf8");
  return { root, dependencySource: join(dependencyRoot, "src", "value.ts") };
}

function runConsumerTestDryRun(root: string) {
  const result = Bun.spawnSync([
    process.execPath,
    turboBin,
    "run",
    "test",
    "--filter=@fixture/consumer",
    "--dry=json",
    "--no-daemon",
  ], {
    cwd: root,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Turbo dry-run failed with ${result.exitCode}:\n${result.stdout.toString()}${result.stderr.toString()}`,
    );
  }
  return JSON.parse(result.stdout.toString());
}

function runPackageSmokeDryRun(packageName: string) {
  const result = Bun.spawnSync([
    process.execPath,
    turboBin,
    "run",
    "test:smoke",
    `--filter=${packageName}`,
    "--dry=json",
    "--no-daemon",
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Turbo ${packageName} smoke dry-run failed with ${result.exitCode}:\n${result.stdout.toString()}${result.stderr.toString()}`,
    );
  }
  return JSON.parse(result.stdout.toString());
}

function runVerifyWithRecorder(failCommand?: string) {
  const root = mkdtempSync(join(tmpdir(), "iam-verify-recorder-"));
  const log = join(root, "commands.log");
  const env = {
    ...process.env,
    FORCE_COLOR: "0",
    IAM_VERIFY_COMMAND_LOG: log,
    NO_COLOR: "1",
    npm_execpath: pnpmRecorderScript,
  };
  delete env.IAM_VERIFY_FAIL_COMMAND;
  if (failCommand !== undefined)
    env.IAM_VERIFY_FAIL_COMMAND = failCommand;

  try {
    const result = Bun.spawnSync(["node", verifyScript], {
      cwd: repoRoot,
      env,
    });
    return {
      commands: readFileSync(log, "utf8").trim().split("\n"),
      exitCode: result.exitCode,
    };
  }
  finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("test orchestration", () => {
  test("exposes test lanes and keeps root guards lightweight", () => {
    const rootPackage = readJson(join(repoRoot, "package.json"));
    const turbo = readJson(join(repoRoot, "turbo.json"));

    expect(rootPackage.scripts.test).toBe("turbo test --concurrency=2");
    expect(rootPackage.scripts["test:smoke"]).toBe("turbo test:smoke --concurrency=1");
    expect(rootPackage.scripts.verify).toBe("node scripts/verify.mjs");
    expect(rootPackage.scripts["check:architecture"]).toBe("bun scripts/check-architecture.ts");
    expect(rootPackage.scripts["lint:root"]).toBe(
      "eslint --config eslint.root.config.mjs scripts eslint.root.config.mjs eslint.frontend.config.mjs stylelint.frontend.config.mjs",
    );
    expect(rootPackage.scripts["check:workflow"]).toBeUndefined();
    expect(rootPackage.scripts["test:workflow"]).toBeUndefined();
    expect(existsSync(join(repoRoot, "scripts", "check-workflow.ts"))).toBe(false);
    expect(existsSync(join(repoRoot, "scripts", "__tests__", "check-workflow.test.ts"))).toBe(false);
    expect(readFileSync(join(repoRoot, ".husky", "pre-commit"), "utf8"))
      .toBe("git diff --cached --check\n");
    expect(turbo.tasks.transit).toEqual({
      dependsOn: ["^transit"],
    });
    expect(turbo.tasks.test).toEqual({
      dependsOn: ["transit"],
    });
    expect(turbo.tasks["test:smoke"]).toEqual({
      dependsOn: ["transit"],
      cache: false,
    });
    expect(turbo.tasks["test:postgres"]).toEqual({
      dependsOn: ["transit"],
      cache: false,
    });
    expect(turbo.tasks.e2e).toEqual({
      cache: false,
    });
    expect(turbo.tasks["test:coverage"]).toEqual({
      dependsOn: ["transit"],
      outputs: ["coverage/**"],
    });
    expect(turbo.concurrency).toBeUndefined();
  });

  test("propagates dependency source hashes without executing dependency tests", () => {
    const fixture = createTransitFixture();
    try {
      const before = runConsumerTestDryRun(fixture.root);
      writeFileSync(fixture.dependencySource, "export const value = 2;\n", "utf8");
      const after = runConsumerTestDryRun(fixture.root);

      expect(before.tasks.filter((task: { task: string }) => task.task === "test")
        .map((task: { taskId: string }) => task.taskId))
        .toEqual(["@fixture/consumer#test"]);
      const beforeHash = before.tasks.find((task: { taskId: string }) =>
        task.taskId === "@fixture/consumer#test").hash;
      const afterHash = after.tasks.find((task: { taskId: string }) =>
        task.taskId === "@fixture/consumer#test").hash;
      expect(beforeHash).not.toBe(afterHash);
    }
    finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  test("keeps package-local runner budgets explicit without a root Vitest workspace", async () => {
    const rootPackage = readJson(join(repoRoot, "package.json"));
    const oidcPackage = readJson(join(oidcRoot, "package.json"));

    expect(rootPackage.scripts.test).not.toContain("vitest");
    expect(existsSync(join(repoRoot, "vitest.config.ts"))).toBe(false);
    expect(existsSync(join(repoRoot, "vitest.workspace.ts"))).toBe(false);
    expect(oidcPackage.scripts.test).toBe("vitest run --config vitest.config.ts");
    expect(oidcPackage.scripts["test:smoke"])
      .toBe("vitest run --config vitest.smoke.config.ts");

    for (const workspace of ["apps/admin", "apps/sso", "apps/oidc-provider"]) {
      const config = await readVitestTestConfig(workspace);
      expect(config.maxWorkers).toBe("25%");
      expect(config.testTimeout).toBe(10_000);
      expect(config.exclude).toContain("**/*.smoke.test.{ts,tsx}");
    }

    const smokeConfig = await readVitestTestConfig(
      "apps/oidc-provider",
      "vitest.smoke.config.ts",
    );
    expect(smokeConfig.include).toEqual(["src/**/*.smoke.test.ts"]);
    expect(smokeConfig.maxWorkers).toBe(1);
    expect(smokeConfig.fileParallelism).toBe(false);

    const bunWorkspaces = readWorkspacePackages()
      .filter(({ packageJson }) => packageJson.scripts?.test?.startsWith("bun test"));
    expect(bunWorkspaces.length).toBeGreaterThan(0);
    for (const { packageJson } of bunWorkspaces) {
      const concurrency = packageJson.scripts.test
        .match(/--max-concurrency(?:=|\s+)(\d+)/u)?.[1];
      expect({
        name: packageJson.name,
        concurrency: concurrency === undefined ? undefined : Number(concurrency),
      }).toEqual({
        name: packageJson.name,
        concurrency: 2,
      });
    }

    const roleResolution = readJson(
      join(repoRoot, "packages", "role-assignment-resolution", "package.json"),
    );
    expect(roleResolution.scripts["test:postgres"])
      .toBe("bun test --max-concurrency=1 test-postgres");
  });

  test("collects OIDC ordinary and process smoke tests into disjoint lanes", async () => {
    const [ordinaryFiles, smokeFiles] = await Promise.all([
      listOidcTestFiles("vitest.config.ts"),
      listOidcTestFiles("vitest.smoke.config.ts"),
    ]);

    expect(ordinaryFiles.length).toBeGreaterThan(0);
    expect(ordinaryFiles.every(file => !file.endsWith(".smoke.test.ts"))).toBe(true);
    expect(smokeFiles).toContain("src/__tests__/entry.smoke.test.ts");
    expect(smokeFiles.every(file => file.endsWith(".smoke.test.ts"))).toBe(true);
    expect(ordinaryFiles.filter(file => smokeFiles.includes(file))).toEqual([]);
  }, 15_000);

  test("keeps shared process harness ordinary tests with API Core", () => {
    const apiCorePackage = readJson(join(apiCoreRoot, "package.json"));
    const apiCoreHarnessTest = join(
      apiCoreRoot,
      "src",
      "testing",
      "__tests__",
      "process-smoke-harness.test.ts",
    );
    const oidcHarnessTest = join(
      oidcRoot,
      "src",
      "__tests__",
      "process-smoke-harness.test.ts",
    );

    expect(apiCorePackage.scripts.test).toBe("bun test --max-concurrency=2 src");
    expect(existsSync(apiCoreHarnessTest)).toBe(true);
    expect(existsSync(oidcHarnessTest)).toBe(false);
  });

  test("discovers API Core ordinary and Windows Job smoke tests in disjoint Bun lanes", () => {
    const apiCorePackage = readJson(join(apiCoreRoot, "package.json"));
    const ordinaryFiles = [...new Bun.Glob("src/**/*.test.ts").scanSync({ cwd: apiCoreRoot })]
      .map(file => file.replaceAll("\\", "/"))
      .sort();
    const smokeFiles = [...new Bun.Glob("test-smoke/**/*.smoke.test.ts").scanSync({
      cwd: apiCoreRoot,
    })]
      .map(file => file.replaceAll("\\", "/"))
      .sort();
    const windowsJobSmokePath = join(
      apiCoreRoot,
      "test-smoke",
      "process-smoke-windows-job.smoke.test.ts",
    );
    const oidcWindowsJobSmokePath = join(
      oidcRoot,
      "src",
      "__tests__",
      "process-smoke-windows-job.smoke.test.ts",
    );
    const dryRun = runPackageSmokeDryRun("@iam/api-core");
    const smokeTask = dryRun.tasks.find(
      (task: { taskId: string }) => task.taskId === "@iam/api-core#test:smoke",
    );

    expect(apiCorePackage.scripts.test).toBe("bun test --max-concurrency=2 src");
    expect(apiCorePackage.scripts["test:smoke"])
      .toBe("bun test --max-concurrency=1 test-smoke");
    expect(apiCorePackage.scripts.lint)
      .toBe("eslint src test-smoke scripts eslint.config.js");
    expect(apiCorePackage.scripts["lint:fix"])
      .toBe("eslint --fix src test-smoke scripts eslint.config.js");
    expect(ordinaryFiles).toContain("src/testing/__tests__/process-smoke-harness.test.ts");
    expect(smokeFiles).toContain("test-smoke/process-smoke-windows-job.smoke.test.ts");
    expect(ordinaryFiles.filter(file => smokeFiles.includes(file))).toEqual([]);
    expect(existsSync(windowsJobSmokePath)).toBe(true);
    expect(existsSync(oidcWindowsJobSmokePath)).toBe(false);

    const windowsJobSmokeSource = readFileSync(windowsJobSmokePath, "utf8");
    expect(windowsJobSmokeSource).toContain("createProcessSmokeEnvironment({");
    expect(windowsJobSmokeSource).toContain("withOwnedTemporaryDirectory({");
    expect(windowsJobSmokeSource).not.toContain("env: process.env");
    expect(windowsJobSmokeSource).not.toContain("...process.env");
    expect(smokeTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-smoke",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
      },
    });
  }, 15_000);

  test("keeps the Windows Job outer deadline above every serial cleanup budget", () => {
    const windowsJobSmokeSource = readFileSync(
      join(
        apiCoreRoot,
        "test-smoke",
        "process-smoke-windows-job.smoke.test.ts",
      ),
      "utf8",
    );
    const serialBudget = [
      "supervisorCloseTimeoutMs",
      "descendantExitTimeoutMs",
      "processTreeCleanupTimeoutMs",
      "descendantCleanupConfirmationTimeoutMs",
      "descendantPostKillExitTimeoutMs",
      "temporaryDirectoryCleanupTimeoutMs",
    ].reduce(
      (total, constantName) =>
        total + readNumericConstant(windowsJobSmokeSource, constantName),
      0,
    );
    const outerDeadline = readNumericConstant(
      windowsJobSmokeSource,
      "windowsJobSmokeTestTimeoutMs",
    );

    expect(outerDeadline - serialBudget).toBeGreaterThanOrEqual(2_000);
    expect(windowsJobSmokeSource).toMatch(
      /test\.skipIf[\s\S]+windowsJobSmokeTestTimeoutMs,\s*\);/u,
    );
    expect(windowsJobSmokeSource).toContain(
      "await terminateProcessByPid(descendantPid, {",
    );
    expect(windowsJobSmokeSource).not.toContain(
      "process.kill(descendantPid, \"SIGKILL\")",
    );
    expect(windowsJobSmokeSource).toMatch(
      /new AggregateError\(\s*\[\s*testFailure,\s*cleanupFailure\s*\]/u,
    );
  });

  test("discovers API ordinary and process smoke tests in disjoint Bun lanes", () => {
    const apiPackage = readJson(join(apiRoot, "package.json"));
    const ordinaryFiles = [...new Bun.Glob("src/**/*.test.ts").scanSync({ cwd: apiRoot })]
      .map(file => file.replaceAll("\\", "/"))
      .sort();
    const smokeFiles = [...new Bun.Glob("test-smoke/**/*.smoke.test.ts").scanSync({ cwd: apiRoot })]
      .map(file => file.replaceAll("\\", "/"))
      .sort();
    const dryRun = runPackageSmokeDryRun("@iam/api");
    const smokeTask = dryRun.tasks.find((task: { taskId: string }) => task.taskId === "@iam/api#test:smoke");
    const entrySmokeSource = readFileSync(join(apiRoot, "test-smoke", "entry.smoke.test.ts"), "utf8");

    expect(apiPackage.scripts.test).toBe("bun test --max-concurrency=2 src");
    expect(apiPackage.scripts["test:smoke"]).toBe("bun test --max-concurrency=1 test-smoke");
    expect(apiPackage.scripts.lint).toBe("eslint src test-smoke app.config.ts eslint.config.js");
    expect(apiPackage.scripts["lint:fix"]).toBe("eslint --fix src test-smoke app.config.ts eslint.config.js");
    expect(ordinaryFiles.length).toBeGreaterThan(0);
    expect(ordinaryFiles.every(file => !file.endsWith(".smoke.test.ts"))).toBe(true);
    expect(smokeFiles).toContain("test-smoke/entry.smoke.test.ts");
    expect(smokeFiles.every(file => file.endsWith(".smoke.test.ts"))).toBe(true);
    expect(ordinaryFiles.filter(file => smokeFiles.includes(file))).toEqual([]);
    expect(entrySmokeSource).toContain("createProcessSmokeEnvironment({");
    expect(entrySmokeSource).toContain("args: [\"--no-env-file\", \"run\", \"src/index.ts\"]");
    expect(entrySmokeSource).not.toContain("...process.env");
    expect(smokeTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-smoke",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
      },
    });
  }, 15_000);

  test("discovers Admin API ordinary and process smoke tests in disjoint Bun lanes", () => {
    const adminApiPackage = readJson(join(adminApiRoot, "package.json"));
    const ordinaryFiles = [...new Bun.Glob("src/**/*.test.ts").scanSync({ cwd: adminApiRoot })]
      .map(file => file.replaceAll("\\", "/"))
      .sort();
    const smokeFiles = [...new Bun.Glob("test-smoke/**/*.smoke.test.ts").scanSync({ cwd: adminApiRoot })]
      .map(file => file.replaceAll("\\", "/"))
      .sort();
    const dryRun = runPackageSmokeDryRun("@iam/admin-api");
    const smokeTask = dryRun.tasks.find((task: { taskId: string }) => task.taskId === "@iam/admin-api#test:smoke");
    const entrySmokeSource = readFileSync(join(adminApiRoot, "test-smoke", "entry.smoke.test.ts"), "utf8");

    expect(adminApiPackage.scripts.test).toBe("bun test --max-concurrency=2 src");
    expect(adminApiPackage.scripts["test:smoke"]).toBe("bun test --max-concurrency=1 test-smoke");
    expect(adminApiPackage.scripts.lint).toBe("eslint src test-smoke app.config.ts eslint.config.js");
    expect(adminApiPackage.scripts["lint:fix"]).toBe("eslint --fix src test-smoke app.config.ts eslint.config.js");
    expect(ordinaryFiles.length).toBeGreaterThan(0);
    expect(ordinaryFiles.every(file => !file.endsWith(".smoke.test.ts"))).toBe(true);
    expect(smokeFiles).toContain("test-smoke/entry.smoke.test.ts");
    expect(smokeFiles.every(file => file.endsWith(".smoke.test.ts"))).toBe(true);
    expect(ordinaryFiles.filter(file => smokeFiles.includes(file))).toEqual([]);
    expect(entrySmokeSource).toContain("createProcessSmokeEnvironment({");
    expect(entrySmokeSource).toContain("args: [\"--no-env-file\", \"run\", \"src/index.ts\"]");
    expect(entrySmokeSource).toContain("/admin/doc");
    expect(entrySmokeSource).not.toContain("...process.env");
    expect(smokeTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-smoke",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
      },
    });
  }, 15_000);

  test("discovers Worker ordinary and process smoke tests in disjoint Bun lanes", () => {
    const workerPackage = readJson(join(workerRoot, "package.json"));
    const ordinaryFiles = [...new Bun.Glob("src/**/*.test.ts").scanSync({ cwd: workerRoot })]
      .map(file => file.replaceAll("\\", "/"))
      .sort();
    const smokeFiles = [...new Bun.Glob("test-smoke/**/*.smoke.test.ts").scanSync({ cwd: workerRoot })]
      .map(file => file.replaceAll("\\", "/"))
      .sort();
    const dryRun = runPackageSmokeDryRun("@iam/worker");
    const smokeTask = dryRun.tasks.find((task: { taskId: string }) => task.taskId === "@iam/worker#test:smoke");
    const entrySmokeSource = readFileSync(join(workerRoot, "test-smoke", "entry.smoke.test.ts"), "utf8");

    expect(workerPackage.scripts.test).toBe("bun test --max-concurrency=2 src");
    expect(workerPackage.scripts["test:smoke"]).toBe("bun test --max-concurrency=1 test-smoke");
    expect(workerPackage.scripts.lint).toBe("eslint src test-smoke eslint.config.js");
    expect(workerPackage.scripts["lint:fix"]).toBe("eslint --fix src test-smoke eslint.config.js");
    expect(ordinaryFiles.length).toBeGreaterThan(0);
    expect(ordinaryFiles.every(file => !file.endsWith(".smoke.test.ts"))).toBe(true);
    expect(smokeFiles).toContain("test-smoke/entry.smoke.test.ts");
    expect(smokeFiles.every(file => file.endsWith(".smoke.test.ts"))).toBe(true);
    expect(ordinaryFiles.filter(file => smokeFiles.includes(file))).toEqual([]);
    expect(entrySmokeSource).toContain("createProcessSmokeEnvironment({");
    expect(entrySmokeSource).toContain("args: [\"--no-env-file\", \"run\", \"src/index.ts\"]");
    expect(entrySmokeSource).toContain("IAM_WORKER_ENABLED_MODULES: \"none\"");
    expect(entrySmokeSource).not.toContain("...process.env");
    expect(smokeTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-smoke",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
      },
    });
  }, 15_000);

  test("keeps entry smoke resource ownership in the shared process suite", () => {
    const entrySmokeSources = [
      readFileSync(join(adminApiRoot, "test-smoke", "entry.smoke.test.ts"), "utf8"),
      readFileSync(join(apiRoot, "test-smoke", "entry.smoke.test.ts"), "utf8"),
      readFileSync(
        join(repoRoot, "apps", "oidc-provider", "src", "__tests__", "entry.smoke.test.ts"),
        "utf8",
      ),
      readFileSync(join(workerRoot, "test-smoke", "entry.smoke.test.ts"), "utf8"),
    ];
    const packageLocalLifecycle = [
      "createServer",
      "recoverFromPortCollision",
      "runProcessSmoke",
      "terminateProcessTree",
      "withOwnedTemporaryDirectory",
      "new Set<ProcessSmokeChild>",
    ];

    for (const source of entrySmokeSources) {
      expect(source).toContain("createProcessSmokeSuite({");
      for (const lifecyclePrimitive of packageLocalLifecycle)
        expect(source).not.toContain(lifecyclePrimitive);
    }
  });

  test("classifies in-memory OpenAPI HTTP checks as ordinary tests", () => {
    for (const workspace of ["apps/api", "apps/admin-api"]) {
      const testsRoot = join(repoRoot, workspace, "src", "__tests__");
      expect(existsSync(join(testsRoot, "openapi.smoke.test.ts"))).toBe(false);
      expect(existsSync(join(testsRoot, "openapi.test.ts"))).toBe(true);
    }
  });

  test("classifies OIDC tests that listen on a real port as smoke", () => {
    const testsRoot = join(oidcRoot, "src", "__tests__");
    const listeningTests = readdirSync(testsRoot)
      .filter(file => file.endsWith(".test.ts"))
      .filter(file => /\.\s*listen\s*\(/u.test(readFileSync(join(testsRoot, file), "utf8")));

    expect(listeningTests.length).toBeGreaterThan(0);
    expect(listeningTests.every(file => file.endsWith(".smoke.test.ts"))).toBe(true);
  });

  test("runs verify stages in the declared order", () => {
    expect(runVerifyWithRecorder()).toEqual({
      commands: [
        "lint",
        "check:docs",
        "check:env-names",
        "check:architecture",
        "typecheck",
        "test",
        "test:smoke",
        "build",
      ],
      exitCode: 0,
    });
  }, 15_000);

  test("stops verify after the first failed stage command", () => {
    expect(runVerifyWithRecorder("test")).toEqual({
      commands: [
        "lint",
        "check:docs",
        "check:env-names",
        "check:architecture",
        "typecheck",
        "test",
      ],
      exitCode: 37,
    });
  }, 15_000);

  test("stops verify before typecheck when the architecture guard fails", () => {
    expect(runVerifyWithRecorder("check:architecture")).toEqual({
      commands: [
        "lint",
        "check:docs",
        "check:env-names",
        "check:architecture",
      ],
      exitCode: 37,
    });
  }, 15_000);
});

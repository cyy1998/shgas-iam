import type { TestCollectionCommandRunner } from "../test-collection-guard";
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
import { analyzeTestCollections } from "../test-collection-guard";

const repoRoot = join(import.meta.dirname, "..", "..");
const adminRoot = join(repoRoot, "apps", "admin");
const adminCanonicalConfigs = {
  "unit": "vitest.unit.config.ts",
  "integration/component": "vitest.integration.component.config.ts",
} as const;
const adminBrowserRoot = "test-integration/browser";
const adminApiRoot = join(repoRoot, "apps", "admin-api");
const adminApiCanonicalRoots = {
  "unit": "src",
  "integration/component": "test-integration/component",
  "integration/process": "test-integration/process",
} as const;
const apiRoot = join(repoRoot, "apps", "api");
const apiOrdinaryCanonicalRoots = {
  "unit": "src",
  "integration/component": "test-integration/component",
} as const;
const apiProcessCanonicalRoot = "test-integration/process";
const apiCompositionCanonicalRoot = "test-integration/composition";
const apiPostgresCanonicalRoot = "test-integration/postgres";
const apiRedisCanonicalRoot = "test-integration/redis";
const apiCoreRoot = join(repoRoot, "packages", "api-core");
const apiCoreCanonicalRoots = {
  "unit": "src",
  "integration/component": "test-integration/component",
  "integration/process": "test-integration/process",
  "integration/redis": "test-integration/redis",
} as const;
const dbRoot = join(repoRoot, "packages", "db");
const dbCanonicalRoots = {
  "unit": "src",
  "integration/postgres": "test-integration/postgres",
} as const;
const oidcRoot = join(repoRoot, "apps", "oidc-provider");
const oidcCanonicalConfigs = {
  "unit": "vitest.unit.config.ts",
  "integration/component": "vitest.integration.component.config.ts",
  "integration/process": "vitest.integration.process.config.ts",
  "integration/composition": "vitest.integration.composition.config.ts",
  "integration/redis": "vitest.integration.redis.config.ts",
} as const;
const workerRoot = join(repoRoot, "apps", "worker");
const workerCanonicalRoots = {
  "unit": "src",
  "integration/component": "test-integration/component",
  "integration/process": "test-integration/process",
  "integration/postgres": "test-integration/postgres",
} as const;
const roleAssignmentRoot = join(repoRoot, "packages", "role-assignment-resolution");
const roleAssignmentCanonicalRoots = {
  "integration/component": "test-integration/component",
  "integration/postgres": "test-integration/postgres",
} as const;
const userProfileRoot = join(repoRoot, "packages", "user-profile-read-model");
const userProfileCanonicalRoots = {
  "unit": "src",
  "integration/component": "test-integration/component",
  "integration/postgres": "test-integration/postgres",
  "integration/redis": "test-integration/redis",
} as const;
const ssoRoot = join(repoRoot, "apps", "sso");
const ssoCanonicalConfigs = {
  "unit": "vitest.unit.config.ts",
  "integration/component": "vitest.integration.component.config.ts",
} as const;
const ssoBrowserRoot = "test-integration/browser";
const postgresIntegrationPassThroughEnv = [
  "IAM_API_TEST_DATABASE_URL",
  "IAM_DB_TEST_DATABASE_URL",
  "IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL",
  "IAM_USER_PROFILE_TEST_DATABASE_URL",
  "IAM_WORKER_TEST_DATABASE_URL",
];
const redisIntegrationPassThroughEnv = [
  "IAM_API_CORE_CLEANUP_TEST_REDIS_URL",
  "IAM_API_CORE_TEST_REDIS_URL",
  "IAM_API_TEST_REDIS_URL",
  "IAM_OIDC_PROVIDER_TEST_REDIS_URL",
  "IAM_USER_PROFILE_TEST_REDIS_URL",
];
const pnpmRecorderScript = join(
  repoRoot,
  "scripts",
  "__tests__",
  "fixtures",
  "pnpm-recorder.mjs",
);
const turboBin = join(repoRoot, "node_modules", "turbo", "bin", "turbo");
const testIntegrationScript = join(repoRoot, "scripts", "run-test-integration.mjs");
const verifyScript = join(repoRoot, "scripts", "verify.mjs");
const integrationResourceEnvNames = [
  "IAM_API_CORE_CLEANUP_TEST_REDIS_URL",
  "IAM_API_CORE_TEST_REDIS_URL",
  "IAM_API_TEST_DATABASE_URL",
  "IAM_API_TEST_REDIS_URL",
  "IAM_DB_TEST_DATABASE_URL",
  "IAM_OIDC_PROVIDER_TEST_DATABASE_URL",
  "IAM_OIDC_PROVIDER_TEST_REDIS_URL",
  "IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL",
  "IAM_USER_PROFILE_TEST_DATABASE_URL",
  "IAM_USER_PROFILE_TEST_REDIS_URL",
  "IAM_WORKER_TEST_DATABASE_URL",
] as const;

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

async function readVitestTestConfig(workspace: string, configFile: string) {
  const module = await import(pathToFileURL(join(repoRoot, workspace, configFile)).href);
  return module.default.test as {
    exclude?: string[];
    fileParallelism?: boolean;
    include?: string[];
    maxWorkers?: number | string;
    testTimeout?: number;
  };
}

async function listVitestTestFiles(workspaceRoot: string, configFile: string) {
  const vitestBin = join(workspaceRoot, "node_modules", "vitest", "vitest.mjs");
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
      cwd: workspaceRoot,
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
  const workspaceMarker = `/${workspaceRoot.replaceAll("\\", "/").split("/").slice(-2).join("/")}/`;
  return [...new Set(tests.map(({ file }) => file
    .replaceAll("\\", "/")
    .split(workspaceMarker)[1]))].sort();
}

async function listOidcTestFiles(configFile: string) {
  return listVitestTestFiles(oidcRoot, configFile);
}

interface PlaywrightSuite {
  file?: string;
  suites?: PlaywrightSuite[];
}

function collectPlaywrightFiles(suites: PlaywrightSuite[], files: Set<string>) {
  for (const suite of suites) {
    if (suite.file !== undefined)
      files.add(suite.file.replaceAll("\\", "/"));
    collectPlaywrightFiles(suite.suites ?? [], files);
  }
}

async function listPlaywrightTestFiles(workspaceRoot: string) {
  const playwrightCli = join(workspaceRoot, "node_modules", "@playwright", "test", "cli.js");
  const child = Bun.spawn(
    ["node", playwrightCli, "test", "--list", "--reporter=json"],
    {
      cwd: workspaceRoot,
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
  if (exitCode !== 0)
    throw new Error(`Playwright collection failed with ${exitCode}:\n${stdout}${stderr}`);
  const parsed = JSON.parse(stdout) as { suites: PlaywrightSuite[] };
  const files = new Set<string>();
  collectPlaywrightFiles(parsed.suites, files);
  return [...files].sort();
}

function listBunNarrowTestFiles(workspaceRoot: string, testRoot: string) {
  const prefix = testRoot === "." ? "" : `${testRoot}/`;
  return [...new Bun.Glob("**/*.test.{mjs,ts,tsx}").scanSync({ cwd: join(workspaceRoot, testRoot) })]
    .map(file => `${prefix}${file.replaceAll("\\", "/")}`)
    .sort();
}

function expectBunOwnerCollectionContract(options: {
  canonicalRoots: Record<string, string>;
  expectedCounts: Record<string, number>;
  packageName: string;
  workspaceRoot: string;
}) {
  const packageJson = readJson(join(options.workspaceRoot, "package.json"));
  const tsconfigSource = readFileSync(join(options.workspaceRoot, "tsconfig.json"), "utf8");
  const actualByProfile = new Map(Object.entries(options.canonicalRoots).map(([profile, root]) => [
    profile,
    listBunNarrowTestFiles(options.workspaceRoot, root),
  ]));

  for (const [profile, files] of actualByProfile) {
    const expectedCount = options.expectedCounts[profile];
    if (expectedCount === undefined) {
      throw new Error(
        `${options.packageName} is missing an expected count for canonical profile ${profile}`,
      );
    }
    expect(files, `${options.packageName} ${profile} count`)
      .toHaveLength(expectedCount);
  }
  expect(
    [...actualByProfile.values()].flat(),
    `${options.packageName} canonical total`,
  ).toHaveLength(Object.values(options.expectedCounts).reduce((total, count) => total + count, 0));

  return { packageJson, tsconfigSource };
}

function expectCanonicalProfileTasks(
  packageName: string,
  canonicalRoots: Record<string, string>,
) {
  for (const [profile, root] of Object.entries(canonicalRoots)) {
    const taskName = `test:${profile.replaceAll("/", ":")}`;
    const dryRun = runPackageTaskDryRun(packageName, taskName);
    const task = dryRun.tasks.find(
      (candidate: { taskId: string }) => candidate.taskId === `${packageName}#${taskName}`,
    );

    expect(task, `${packageName} ${profile}`).toMatchObject({
      command: `bun test --max-concurrency=2 ${root}`,
      resolvedTaskDefinition: {
        dependsOn: ["transit"],
      },
    });
  }
}

function expectCanonicalResourceTask(options: {
  packageName: string;
  passThroughEnv: string[];
  profile: "postgres" | "redis";
}) {
  const taskName = `test:integration:${options.profile}`;
  const dryRun = runPackageTaskDryRun(options.packageName, taskName);
  const task = dryRun.tasks.find(
    (candidate: { taskId: string }) => candidate.taskId === `${options.packageName}#${taskName}`,
  );

  expect(task, `${options.packageName} ${options.profile} Turbo task`).toMatchObject({
    command: `bun test --max-concurrency=1 test-integration/${options.profile}`,
    resolvedTaskDefinition: {
      cache: false,
      dependsOn: ["transit"],
      passThroughEnv: options.passThroughEnv,
    },
  });
}

function expectDedicatedResourceHarness(options: {
  envName: string;
  harnessPath: string;
  workspaceRoot: string;
}) {
  const source = readFileSync(join(options.workspaceRoot, options.harnessPath), "utf8");
  expect(source, `${options.envName} harness`).toContain(options.envName);
  expect(source, `${options.envName} fallback contract`).toContain("no fallback is allowed");
  expect(source, `${options.envName} resource isolation`).toContain("randomUUID()");
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
    scripts: { "test:unit": "node -e \"\"" },
  });
  writeJson(join(consumerRoot, "package.json"), {
    name: "@fixture/consumer",
    scripts: { "test:unit": "node -e \"\"" },
    dependencies: { "@fixture/dependency": "workspace:*" },
  });
  writeFileSync(join(dependencyRoot, "src", "value.ts"), "export const value = 1;\n", "utf8");
  writeFileSync(join(consumerRoot, "src", "consumer.ts"), "export const consumer = true;\n", "utf8");
  return { root, dependencySource: join(dependencyRoot, "src", "value.ts") };
}

function createCollectionGuardFixture(options: {
  brokenRootCommand?: boolean;
  omitRootE2eTask?: boolean;
  violating?: boolean;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "iam-test-collection-"));
  const ownerRoot = join(root, "packages", "owner");
  mkdirSync(join(ownerRoot, "src"), { recursive: true });
  mkdirSync(join(ownerRoot, "scripts", "__tests__"), { recursive: true });
  mkdirSync(join(ownerRoot, "test-integration", "component"), { recursive: true });
  mkdirSync(join(root, "e2e", "system"), { recursive: true });
  mkdirSync(join(root, "scripts", "__tests__"), { recursive: true });
  writeJson(join(root, "package.json"), {
    name: "fixture-root",
    packageManager: "pnpm@11.14.0",
    private: true,
    scripts: {
      ...(options.omitRootE2eTask
        ? {}
        : {
            "test:e2e": "turbo test:e2e:root --concurrency=1",
            "test:e2e:root": "bun test e2e/system/journey.spec.ts",
          }),
      "test:integration:component": options.brokenRootCommand
        ? "turbo test:unit --concurrency=2"
        : "turbo test:integration:component --concurrency=2",
      "test:unit": "turbo test:unit test:unit:root --concurrency=2",
      "test:unit:root": "bun test scripts/__tests__/architecture-guard.test.ts scripts/__tests__/eslint-config-equivalence.test.ts scripts/__tests__/test-orchestration.test.ts scripts/__tests__/tooling-performance.test.ts",
    },
  });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
  writeJson(join(root, "turbo.json"), {
    tasks: {
      "//#test:e2e:root": { cache: false },
      "//#test:unit:root": {},
      "test:integration:component": { dependsOn: ["transit"] },
      "test:unit": { dependsOn: ["transit"] },
      "transit": { dependsOn: ["^transit"] },
    },
  });
  writeJson(join(ownerRoot, "package.json"), {
    name: "@fixture/owner",
    scripts: {
      "test:integration:component": "bun test --max-concurrency=2 test-integration/component",
      "test:unit": options.violating
        ? "bun test --max-concurrency=2 src test-integration/component"
        : "bun test --max-concurrency=2 src scripts/__tests__",
    },
  });
  writeFileSync(join(ownerRoot, "src", "example.test.ts"), "export {};\n", "utf8");
  writeFileSync(join(ownerRoot, "scripts", "__tests__", "tooling.test.ts"), "export {};\n", "utf8");
  writeFileSync(
    join(ownerRoot, "test-integration", "component", "example.integration.test.ts"),
    "export {};\n",
    "utf8",
  );
  for (const file of [
    "architecture-guard.test.ts",
    "eslint-config-equivalence.test.ts",
    "test-orchestration.test.ts",
    "tooling-performance.test.ts",
  ])
    writeFileSync(join(root, "scripts", "__tests__", file), "export {};\n", "utf8");
  writeFileSync(join(root, "e2e", "system", "journey.spec.ts"), "export {};\n", "utf8");

  if (options.violating) {
    mkdirSync(join(ownerRoot, "test-integration", "redis"), { recursive: true });
    writeFileSync(join(ownerRoot, "src", "misplaced.integration.test.ts"), "export {};\n", "utf8");
    writeFileSync(
      join(ownerRoot, "test-integration", "redis", "orphan.integration.test.ts"),
      "export {};\n",
      "utf8",
    );
  }

  return root;
}

function createCollectionGuardRunner(options: { fail?: boolean; omitComponent?: boolean } = {}) {
  const runner: TestCollectionCommandRunner = {
    run: async () => options.fail
      ? { exitCode: 12, stderr: "synthetic turbo failure", stdout: "" }
      : {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify({
            tasks: [
              { taskId: "//#test:e2e:root" },
              { taskId: "//#test:unit:root" },
              { taskId: "@fixture/owner#test:unit" },
              ...(options.omitComponent
                ? []
                : [{ taskId: "@fixture/owner#test:integration:component" }]),
            ],
          }),
        },
  };
  return runner;
}

function runConsumerTestDryRun(root: string) {
  const result = Bun.spawnSync([
    process.execPath,
    turboBin,
    "run",
    "test:unit",
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

function runPackageTaskDryRun(packageName: string, taskName: string) {
  const result = Bun.spawnSync([
    process.execPath,
    turboBin,
    "run",
    taskName,
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
      `Turbo ${packageName} ${taskName} dry-run failed with ${result.exitCode}:\n${result.stdout.toString()}${result.stderr.toString()}`,
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

function runTestIntegrationWithRecorder(options: {
  failCommand?: string;
  missing?: string[];
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "iam-test-integration-recorder-"));
  const log = join(root, "commands.log");
  const env: Record<string, string | undefined> = {
    ...process.env,
    FORCE_COLOR: "0",
    IAM_TEST_INTEGRATION_COMMAND_LOG: log,
    NO_COLOR: "1",
    npm_execpath: pnpmRecorderScript,
  };
  for (const name of integrationResourceEnvNames)
    env[name] = "caller-owned-test-resource";
  for (const name of options.missing ?? [])
    delete env[name];
  if (options.failCommand !== undefined)
    env.IAM_TEST_INTEGRATION_FAIL_COMMAND = options.failCommand;

  try {
    const result = Bun.spawnSync(["node", testIntegrationScript], {
      cwd: repoRoot,
      env,
    });
    return {
      commands: existsSync(log)
        ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean)
        : [],
      exitCode: result.exitCode,
      output: `${result.stdout.toString()}${result.stderr.toString()}`,
    };
  }
  finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("test orchestration", () => {
  test("Collection Guard accepts a complete uniquely-owned fixture", async () => {
    const root = createCollectionGuardFixture();
    try {
      expect(await analyzeTestCollections(root, createCollectionGuardRunner())).toEqual([]);
    }
    finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Collection Guard rejects a public root command that cannot reach its owner task", async () => {
    const root = createCollectionGuardFixture({ brokenRootCommand: true });
    try {
      const issues = await analyzeTestCollections(root, createCollectionGuardRunner());
      expect(issues).toContainEqual(expect.objectContaining({
        code: "task-unreachable",
        message: expect.stringContaining("test:integration:component"),
      }));
    }
    finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Collection Guard reports an unowned root e2e/system candidate", async () => {
    const root = createCollectionGuardFixture({ omitRootE2eTask: true });
    try {
      const issues = await analyzeTestCollections(root, createCollectionGuardRunner());
      expect(issues).toContainEqual(expect.objectContaining({
        code: "missing-collection",
        message: expect.stringContaining("e2e/system/journey.spec.ts"),
      }));
    }
    finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Collection Guard reports path, duplicate, missing, and unreachable violations", async () => {
    const root = createCollectionGuardFixture({ violating: true });
    try {
      const issues = await analyzeTestCollections(
        root,
        createCollectionGuardRunner({ omitComponent: true }),
      );
      expect(issues.map(issue => issue.code)).toContain("duplicate-collection");
      expect(issues.map(issue => issue.code)).toContain("path-naming-mismatch");
      expect(issues.map(issue => issue.code)).toContain("missing-collection");
      expect(issues.map(issue => issue.code)).toContain("task-unreachable");
      expect(issues.some(issue => issue.message.includes("packages/owner/"))).toBe(true);
      expect(issues.some(issue => issue.message.includes("scripts/__tests__/tooling.test.ts")))
        .toBe(true);
    }
    finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Collection Guard fails closed when a runner adapter fails", async () => {
    const root = createCollectionGuardFixture();
    try {
      expect(await analyzeTestCollections(
        root,
        createCollectionGuardRunner({ fail: true }),
      )).toEqual([
        expect.objectContaining({
          code: "adapter-failure",
          message: expect.stringContaining("synthetic turbo failure"),
        }),
      ]);
    }
    finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("publishes complete canonical root collections", () => {
    const rootPackage = readJson(join(repoRoot, "package.json"));
    const turbo = readJson(join(repoRoot, "turbo.json"));

    expect(rootPackage.scripts["test:unit"])
      .toBe("turbo test:unit test:unit:root --concurrency=2");
    expect(rootPackage.scripts["test:unit:root"]).toBe(
      "bun test --max-concurrency=2 scripts/__tests__/architecture-guard.test.ts scripts/__tests__/eslint-config-equivalence.test.ts scripts/__tests__/test-orchestration.test.ts scripts/__tests__/tooling-performance.test.ts",
    );
    expect(rootPackage.scripts["test:integration:component"])
      .toBe("turbo test:integration:component --concurrency=2");
    expect(rootPackage.scripts["test:integration:process"])
      .toBe("turbo test:integration:process --concurrency=1");
    expect(rootPackage.scripts["test:integration:redis"])
      .toBe("turbo test:integration:redis --concurrency=1");
    expect(rootPackage.scripts["test:integration:postgres"])
      .toBe("turbo test:integration:postgres --concurrency=1");
    expect(rootPackage.scripts["test:integration:composition"])
      .toBe("turbo test:integration:composition --concurrency=1");
    expect(rootPackage.scripts["test:integration:browser"])
      .toBe("turbo test:integration:browser --concurrency=1");
    expect(rootPackage.scripts["test:integration"])
      .toBe("node scripts/run-test-integration.mjs");
    expect(turbo.tasks["//#test:unit:root"]).toEqual({});
  });

  test("preflights every Integration resource before starting a profile", () => {
    const result = runTestIntegrationWithRecorder({
      missing: [
        "IAM_API_CORE_CLEANUP_TEST_REDIS_URL",
        "IAM_DB_TEST_DATABASE_URL",
        "IAM_USER_PROFILE_TEST_REDIS_URL",
      ],
    });

    expect(result.exitCode).toBe(1);
    expect(result.commands).toEqual([]);
    expect(result.output).toContain("Missing caller-provided Integration test resources:");
    expect(result.output).toContain("IAM_API_CORE_CLEANUP_TEST_REDIS_URL");
    expect(result.output).toContain("IAM_DB_TEST_DATABASE_URL");
    expect(result.output).toContain("IAM_USER_PROFILE_TEST_REDIS_URL");
  });

  test("runs Integration profiles in order and propagates the first failure", () => {
    expect(runTestIntegrationWithRecorder()).toMatchObject({
      commands: [
        "test:integration:component",
        "test:integration:process",
        "test:integration:redis",
        "test:integration:postgres",
        "test:integration:composition",
        "test:integration:browser",
      ],
      exitCode: 0,
    });
    expect(runTestIntegrationWithRecorder({
      failCommand: "test:integration:postgres",
    })).toMatchObject({
      commands: [
        "test:integration:component",
        "test:integration:process",
        "test:integration:redis",
        "test:integration:postgres",
      ],
      exitCode: 37,
    });
  });

  test("cuts over the root default test command without legacy aliases", () => {
    const rootPackage = readJson(join(repoRoot, "package.json"));
    const turbo = readJson(join(repoRoot, "turbo.json"));

    expect(rootPackage.scripts.test).toBe("pnpm test:unit");
    expect(rootPackage.scripts["test:external"]).toBeUndefined();
    expect(rootPackage.scripts["test:smoke"]).toBeUndefined();
    expect(rootPackage.scripts.e2e).toBeUndefined();
    expect(turbo.tasks.test).toBeUndefined();
    expect(turbo.tasks["test:external"]).toBeUndefined();
    expect(turbo.tasks["test:smoke"]).toBeUndefined();
    expect(turbo.tasks["test:postgres"]).toBeUndefined();
    expect(turbo.tasks["test:redis"]).toBeUndefined();
    expect(turbo.tasks.e2e).toBeUndefined();
  });

  test("removes package-local legacy collection aliases", () => {
    const forbiddenAliases = [
      "e2e",
      "test:external",
      "test:postgres",
      "test:redis",
      "test:rehearsal",
      "test:smoke",
    ];

    for (const { manifestPath, packageJson } of readWorkspacePackages()) {
      for (const alias of forbiddenAliases) {
        expect(packageJson.scripts?.[alias], `${manifestPath}#${alias}`)
          .toBeUndefined();
      }
      if (packageJson.scripts?.["test:unit"] === undefined)
        expect(packageJson.scripts?.test, `${manifestPath}#test`).toBeUndefined();
      else
        expect(packageJson.scripts.test, `${manifestPath}#test`).toBe("pnpm test:unit");
    }
  });

  test("removes legacy OIDC collection configs", () => {
    for (const configFile of [
      "vitest.config.ts",
      "vitest.external.config.ts",
      "vitest.redis.config.ts",
      "vitest.smoke.config.ts",
    ]) {
      expect(existsSync(join(oidcRoot, configFile)), configFile).toBe(false);
    }
  });

  test("retires live collection migration evidence", () => {
    const evidenceRoot = join(
      repoRoot,
      ".scratch",
      "test-collection-migration",
      "evidence",
    );
    const liveEvidenceFiles = existsSync(evidenceRoot)
      ? [...new Bun.Glob("**/*").scanSync({ cwd: evidenceRoot, onlyFiles: true })]
      : [];

    expect(liveEvidenceFiles).toEqual([]);
  });

  test("exposes test lanes and keeps root guards lightweight", () => {
    const rootPackage = readJson(join(repoRoot, "package.json"));
    const turbo = readJson(join(repoRoot, "turbo.json"));

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
    expect(turbo.tasks.test).toBeUndefined();
    expect(turbo.tasks["test:unit"]).toEqual({
      dependsOn: ["transit"],
    });
    expect(turbo.tasks["test:integration:component"]).toEqual({
      dependsOn: ["transit"],
    });
    expect(turbo.tasks["test:integration:process"]).toEqual({
      dependsOn: ["transit"],
      cache: false,
    });
    expect(turbo.tasks["test:integration:postgres"]).toEqual({
      dependsOn: ["transit"],
      cache: false,
      passThroughEnv: postgresIntegrationPassThroughEnv,
    });
    expect(turbo.tasks["test:integration:composition"]).toEqual({
      dependsOn: ["transit"],
      cache: false,
      passThroughEnv: [
        "IAM_API_TEST_DATABASE_URL",
        "IAM_API_TEST_REDIS_URL",
        "IAM_OIDC_PROVIDER_TEST_DATABASE_URL",
        "IAM_OIDC_PROVIDER_TEST_REDIS_URL",
      ],
    });
    expect(turbo.tasks["test:integration:redis"]).toEqual({
      dependsOn: ["transit"],
      cache: false,
      passThroughEnv: redisIntegrationPassThroughEnv,
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

      expect(before.tasks.filter((task: { task: string }) => task.task === "test:unit")
        .map((task: { taskId: string }) => task.taskId))
        .toEqual(["@fixture/consumer#test:unit"]);
      const beforeHash = before.tasks.find((task: { taskId: string }) =>
        task.taskId === "@fixture/consumer#test:unit").hash;
      const afterHash = after.tasks.find((task: { taskId: string }) =>
        task.taskId === "@fixture/consumer#test:unit").hash;
      expect(beforeHash).not.toBe(afterHash);
    }
    finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  test("keeps package-local runner budgets explicit without a root Vitest workspace", async () => {
    const oidcPackage = readJson(join(oidcRoot, "package.json"));

    expect(existsSync(join(repoRoot, "vitest.config.ts"))).toBe(false);
    expect(existsSync(join(repoRoot, "vitest.workspace.ts"))).toBe(false);
    expect(oidcPackage.scripts["test:unit"])
      .toBe("vitest run --config vitest.unit.config.ts");
    expect(oidcPackage.scripts["test:integration:component"])
      .toBe("vitest run --config vitest.integration.component.config.ts");
    expect(oidcPackage.scripts["test:integration:process"])
      .toBe("vitest run --config vitest.integration.process.config.ts");
    expect(oidcPackage.scripts["test:integration:composition"])
      .toBe("vitest run --config vitest.integration.composition.config.ts");
    expect(oidcPackage.scripts["test:integration:redis"])
      .toBe("vitest run --config vitest.integration.redis.config.ts");

    for (const workspace of ["apps/admin", "apps/sso", "apps/oidc-provider"]) {
      const config = await readVitestTestConfig(workspace, "vitest.unit.config.ts");
      expect(config.maxWorkers).toBe("25%");
      expect(config.testTimeout).toBe(10_000);
    }

    const processConfig = await readVitestTestConfig(
      "apps/oidc-provider",
      "vitest.integration.process.config.ts",
    );
    expect(processConfig.include).toEqual(["test-integration/process/**/*.integration.test.ts"]);
    expect(processConfig.maxWorkers).toBe(1);
    expect(processConfig.fileParallelism).toBe(false);

    const bunWorkspaces = readWorkspacePackages()
      .filter(({ packageJson }) => packageJson.scripts?.["test:unit"]?.startsWith("bun test"));
    expect(bunWorkspaces.length).toBeGreaterThan(0);
    for (const { packageJson } of bunWorkspaces) {
      const concurrency = packageJson.scripts["test:unit"]
        .match(/--max-concurrency(?:=|\s+)(\d+)/u)?.[1];
      expect({
        name: packageJson.name,
        concurrency: concurrency === undefined ? undefined : Number(concurrency),
      }).toEqual({
        name: packageJson.name,
        concurrency: 2,
      });
    }
  });

  test("collects pure shared Unit surfaces through canonical commands", () => {
    const owners = [
      {
        canonicalRoot: "src",
        expectedCount: 9,
        packageName: "@iam/contracts",
        workspacePrefix: "packages/contracts/",
      },
      {
        canonicalRoot: "src",
        expectedCount: 8,
        packageName: "@iam/domain",
        workspacePrefix: "packages/domain/",
      },
      {
        canonicalRoot: "test",
        expectedCount: 1,
        packageName: "@iam/eslint-config",
        workspacePrefix: "packages/eslint-config/",
      },
      {
        canonicalRoot: "src",
        expectedCount: 1,
        packageName: "@iam/jobs",
        workspacePrefix: "packages/jobs/",
      },
    ] as const;

    for (const owner of owners) {
      const workspaceRoot = join(repoRoot, owner.workspacePrefix);
      const packageJson = readJson(join(workspaceRoot, "package.json"));
      const actual = listBunNarrowTestFiles(workspaceRoot, owner.canonicalRoot);

      expect(actual, `${owner.packageName} Unit count`).toHaveLength(owner.expectedCount);
      expect(packageJson.scripts["test:unit"])
        .toBe(`bun test --max-concurrency=2 ${owner.canonicalRoot}`);
      expectCanonicalProfileTasks(owner.packageName, {
        unit: owner.canonicalRoot,
      });
    }

    for (const workspace of ["packages/contracts", "packages/domain", "packages/jobs"]) {
      const workspaceRoot = join(repoRoot, workspace);
      expect(listBunNarrowTestFiles(workspaceRoot, "."))
        .toEqual(listBunNarrowTestFiles(workspaceRoot, "src"));
    }

    expect(listBunNarrowTestFiles(join(repoRoot, "packages/eslint-config"), "test"))
      .toEqual(["test/presets.test.mjs"]);
  }, 15_000);

  test("collects Client Subject Projection Unit and component surfaces separately", () => {
    const workspaceRoot = join(repoRoot, "packages/client-subject-projection");
    const canonicalRoots = {
      "unit": "src",
      "integration/component": "test-integration/component",
    } as const;
    const { packageJson, tsconfigSource } = expectBunOwnerCollectionContract({
      canonicalRoots,
      expectedCounts: {
        "unit": 2,
        "integration/component": 1,
      },
      packageName: "@iam/client-subject-projection",
      workspaceRoot,
    });

    expect(packageJson.scripts["test:unit"]).toBe("bun test --max-concurrency=2 src");
    expect(packageJson.scripts["test:integration:component"])
      .toBe("bun test --max-concurrency=2 test-integration/component");
    expect(packageJson.scripts.lint).toBe("eslint src test-integration eslint.config.js");
    expect(packageJson.scripts["lint:fix"])
      .toBe("eslint --fix src test-integration eslint.config.js");
    expect(tsconfigSource).toContain("\"include\": [\"src/**/*\", \"test-integration/**/*\"]");

    expectCanonicalProfileTasks("@iam/client-subject-projection", canonicalRoots);
  }, 15_000);

  test("collects Gateway Unit and component surfaces without narrowing its legacy command", () => {
    const workspaceRoot = join(repoRoot, "gateway");
    const canonicalRoots = {
      "unit": "src",
      "integration/component": "test-integration/component",
    } as const;
    const { packageJson, tsconfigSource } = expectBunOwnerCollectionContract({
      canonicalRoots,
      expectedCounts: {
        "unit": 3,
        "integration/component": 2,
      },
      packageName: "@iam/gateway-apisix",
      workspaceRoot,
    });

    expect(packageJson.scripts["test:unit"]).toBe("bun test --max-concurrency=2 src");
    expect(packageJson.scripts["test:integration:component"])
      .toBe("bun test --max-concurrency=2 test-integration/component");
    expect(listBunNarrowTestFiles(workspaceRoot, "."))
      .toEqual([
        ...listBunNarrowTestFiles(workspaceRoot, "src"),
        ...listBunNarrowTestFiles(workspaceRoot, "test-integration/component"),
      ].sort());
    expect(packageJson.scripts.lint)
      .toBe("eslint src test-integration eslint.config.js config manifests");
    expect(packageJson.scripts["lint:fix"])
      .toBe("eslint --fix src test-integration eslint.config.js config manifests");
    expect(tsconfigSource).toContain("\"src/**/*.ts\",\n    \"test-integration/**/*.ts\"");

    expectCanonicalProfileTasks("@iam/gateway-apisix", canonicalRoots);
  }, 15_000);

  test("collects the complete OIDC mapping in five disjoint canonical profiles", async () => {
    const actualByProfile = new Map(await Promise.all(
      Object.entries(oidcCanonicalConfigs).map(async ([profile, config]) => [
        profile,
        await listOidcTestFiles(config),
      ] as const),
    ));

    const expectedCounts = new Map([
      ["unit", 9],
      ["integration/component", 9],
      ["integration/process", 5],
      ["integration/composition", 1],
      ["integration/redis", 1],
    ]);

    for (const [profile, files] of actualByProfile) {
      expect(files, `${profile} count`).toHaveLength(expectedCounts.get(profile)!);
    }

    const allFiles = [...actualByProfile.values()].flat();
    expect(allFiles).toHaveLength(25);
    expect(new Set(allFiles).size).toBe(allFiles.length);

    const entrySmokeSource = readFileSync(
      join(oidcRoot, "test-integration", "process", "entry.integration.test.ts"),
      "utf8",
    );
    const externalEntrySource = readFileSync(
      join(oidcRoot, "test-integration", "composition", "entry.integration.test.ts"),
      "utf8",
    );
    expect(entrySmokeSource).not.toContain("IAM_OIDC_PROVIDER_TEST_");
    expect(externalEntrySource).toContain("IAM_OIDC_PROVIDER_TEST_DATABASE_URL");
    expect(externalEntrySource).toContain("IAM_OIDC_PROVIDER_TEST_REDIS_URL");
  }, 15_000);

  test("collects complete frontend Unit, component, and mock-browser profiles", async () => {
    const owners = [
      {
        browserRoot: adminBrowserRoot,
        canonicalConfigs: adminCanonicalConfigs,
        expectedCounts: { component: 5, unit: 6 },
        packageName: "@iam/admin",
        workspace: "admin" as const,
        workspaceRoot: adminRoot,
      },
      {
        browserRoot: ssoBrowserRoot,
        canonicalConfigs: ssoCanonicalConfigs,
        expectedCounts: { component: 4, unit: 6 },
        packageName: "@iam/sso",
        workspace: "sso" as const,
        workspaceRoot: ssoRoot,
      },
    ];

    for (const owner of owners) {
      const packageJson = readJson(join(owner.workspaceRoot, "package.json"));
      const actualByProfile = new Map(await Promise.all(
        Object.entries(owner.canonicalConfigs).map(async ([profile, config]) => [
          profile,
          await listVitestTestFiles(owner.workspaceRoot, config),
        ] as const),
      ));
      const browserFiles = (await listPlaywrightTestFiles(owner.workspaceRoot))
        .map(file => `${owner.browserRoot}/${file}`)
        .sort();
      const playwrightConfig = (await import(pathToFileURL(
        join(owner.workspaceRoot, "playwright.config.ts"),
      ).href)).default;
      const browserDryRun = runPackageTaskDryRun(
        owner.packageName,
        "test:integration:browser",
      );
      const browserTask = browserDryRun.tasks.find(
        (task: { taskId: string }) =>
          task.taskId === `${owner.packageName}#test:integration:browser`,
      );

      expect(actualByProfile.get("unit")).toHaveLength(owner.expectedCounts.unit);
      expect(actualByProfile.get("integration/component"))
        .toHaveLength(owner.expectedCounts.component);
      expect(browserFiles).toHaveLength(3);
      expect(new Set([
        ...actualByProfile.values(),
        browserFiles,
      ].flat()).size).toBe(owner.expectedCounts.unit + owner.expectedCounts.component + 3);

      expect(packageJson.scripts["test:unit"])
        .toBe("vitest run --config vitest.unit.config.ts");
      expect(packageJson.scripts["test:integration:component"])
        .toBe("vitest run --config vitest.integration.component.config.ts");
      expect(packageJson.scripts["test:integration:browser"])
        .toBe("node ../../scripts/playwright-e2e-preflight.mjs && playwright test");
      expect(packageJson.scripts["test:integration:browser"]).not.toContain("test:e2e");
      expect(packageJson.scripts["test:integration:browser"]).not.toContain("gateway");
      expect(packageJson.scripts["lint:eslint"]).toContain("test-integration");
      expect(packageJson.scripts["lint:eslint"]).toContain("vitest.unit.config.ts");
      expect(packageJson.scripts["lint:eslint"])
        .toContain("vitest.integration.component.config.ts");
      expect(playwrightConfig.testDir).toBe(`./${owner.browserRoot}`);
      expect(playwrightConfig.projects).toHaveLength(1);
      expect(playwrightConfig.projects[0].name).toBe("chromium");
      expect(playwrightConfig.webServer.command).toBe("pnpm dev:e2e");
      expect(playwrightConfig.use.baseURL).toBe(
        owner.workspace === "admin" ? "http://127.0.0.1:8001" : "http://127.0.0.1:8000",
      );
      expect(browserTask).toMatchObject({
        command: packageJson.scripts["test:integration:browser"],
        resolvedTaskDefinition: {
          cache: false,
          dependsOn: ["transit"],
        },
      });
    }
  }, 30_000);

  test("keeps shared process harness contract tests in the ordinary component profile", () => {
    const apiCorePackage = readJson(join(apiCoreRoot, "package.json"));
    const apiCoreHarnessTest = join(
      apiCoreRoot,
      "test-integration",
      "component",
      "process-smoke-harness.integration.test.ts",
    );
    const oidcHarnessTest = join(
      oidcRoot,
      "src",
      "__tests__",
      "process-smoke-harness.test.ts",
    );

    expect(apiCorePackage.scripts["test:integration:component"])
      .toBe("bun test --max-concurrency=2 test-integration/component");
    expect(existsSync(apiCoreHarnessTest)).toBe(true);
    expect(existsSync(oidcHarnessTest)).toBe(false);
  });

  test("collects the complete API Core mapping in four disjoint canonical profiles", () => {
    const apiCorePackage = readJson(join(apiCoreRoot, "package.json"));
    const actualByProfile = new Map(Object.entries(apiCoreCanonicalRoots).map(([profile, root]) => [
      profile,
      listBunNarrowTestFiles(apiCoreRoot, root),
    ]));
    const expectedCounts = new Map([
      ["unit", 14],
      ["integration/component", 21],
      ["integration/process", 3],
      ["integration/redis", 4],
    ]);
    const windowsJobSmokePath = join(
      apiCoreRoot,
      "test-integration",
      "process",
      "process-smoke-windows-job.integration.test.ts",
    );
    const oidcWindowsJobSmokePath = join(
      oidcRoot,
      "src",
      "__tests__",
      "process-smoke-windows-job.smoke.test.ts",
    );
    const processDryRun = runPackageTaskDryRun("@iam/api-core", "test:integration:process");
    const processTask = processDryRun.tasks.find(
      (task: { taskId: string }) => task.taskId === "@iam/api-core#test:integration:process",
    );
    const redisDryRun = runPackageTaskDryRun("@iam/api-core", "test:integration:redis");
    const redisTask = redisDryRun.tasks.find(
      (task: { taskId: string }) => task.taskId === "@iam/api-core#test:integration:redis",
    );
    const redisHarnessSource = readFileSync(
      join(apiCoreRoot, "test-integration", "redis", "redis-test-harness.ts"),
      "utf8",
    );

    for (const [profile, files] of actualByProfile) {
      expect(files, `${profile} count`).toHaveLength(expectedCounts.get(profile)!);
    }
    const allFiles = [...actualByProfile.values()].flat();
    expect(allFiles).toHaveLength(42);
    expect(new Set(allFiles).size).toBe(allFiles.length);

    expect(apiCorePackage.scripts["test:unit"])
      .toBe("bun test --max-concurrency=2 src");
    expect(apiCorePackage.scripts["test:integration:component"])
      .toBe("bun test --max-concurrency=2 test-integration/component");
    expect(apiCorePackage.scripts["test:integration:process"])
      .toBe("bun test --max-concurrency=1 test-integration/process");
    expect(apiCorePackage.scripts["test:integration:redis"])
      .toBe("bun test --max-concurrency=1 test-integration/redis");
    expect(apiCorePackage.scripts.lint)
      .toBe("eslint src test-integration scripts eslint.config.js");
    expect(apiCorePackage.scripts["lint:fix"])
      .toBe("eslint --fix src test-integration scripts eslint.config.js");
    expect(actualByProfile.get("integration/component")).toContain(
      "test-integration/component/process-smoke-harness.integration.test.ts",
    );
    expect(actualByProfile.get("integration/component")).toContain(
      "test-integration/component/process-smoke-redis-server.integration.test.ts",
    );
    expect(actualByProfile.get("integration/redis")).toContain(
      "test-integration/redis/login-restriction.integration.test.ts",
    );
    expect(actualByProfile.get("integration/process")).toContain(
      "test-integration/process/process-smoke-windows-job.integration.test.ts",
    );
    expect(actualByProfile.get("integration/process")).toContain(
      "test-integration/process/process-smoke-redis-server.integration.test.ts",
    );
    expect(existsSync(windowsJobSmokePath)).toBe(true);
    expect(existsSync(oidcWindowsJobSmokePath)).toBe(false);

    const windowsJobSmokeSource = readFileSync(windowsJobSmokePath, "utf8");
    expect(windowsJobSmokeSource).toContain("createProcessSmokeEnvironment({");
    expect(windowsJobSmokeSource).toContain("withOwnedTemporaryDirectory({");
    expect(windowsJobSmokeSource).not.toContain("env: process.env");
    expect(windowsJobSmokeSource).not.toContain("...process.env");
    expect(processTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-integration/process",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
      },
    });
    expect(redisTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-integration/redis",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
      },
    });
    expect(redisHarnessSource).toContain("IAM_API_CORE_TEST_REDIS_URL");
    expect(redisHarnessSource).toContain("no fallback is allowed");
    expect(redisHarnessSource).not.toContain("IAM_API_REDIS_URL");
  }, 15_000);

  test("keeps the Windows Job outer deadline above every serial cleanup budget", () => {
    const windowsJobSmokeSource = readFileSync(
      join(
        apiCoreRoot,
        "test-integration",
        "process",
        "process-smoke-windows-job.integration.test.ts",
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

  test("collects the complete API ordinary mapping in disjoint canonical Unit and component profiles", () => {
    const apiPackage = readJson(join(apiRoot, "package.json"));
    const apiTsConfigSource = readFileSync(join(apiRoot, "tsconfig.json"), "utf8");
    const actualByProfile = new Map(Object.entries(apiOrdinaryCanonicalRoots).map(([profile, root]) => [
      profile,
      listBunNarrowTestFiles(apiRoot, root),
    ]));

    expect(actualByProfile.get("unit")).toHaveLength(11);
    expect(actualByProfile.get("integration/component")).toHaveLength(40);
    const allFiles = [...actualByProfile.values()].flat();
    expect(allFiles).toHaveLength(51);
    expect(new Set(allFiles).size).toBe(allFiles.length);

    expect(apiPackage.scripts["test:unit"]).toBe("bun test --max-concurrency=2 src");
    expect(apiPackage.scripts["test:integration:component"])
      .toBe("bun test --max-concurrency=2 test-integration/component");
    expect(apiPackage.scripts.lint)
      .toBe("eslint src test-integration app.config.ts eslint.config.js");
    expect(apiPackage.scripts["lint:fix"])
      .toBe("eslint --fix src test-integration app.config.ts eslint.config.js");
    expect(apiTsConfigSource).toContain(
      "\"include\": [\"src/**/*.ts\", \"test-integration/**/*.ts\", \"app.config.ts\", \"eslint.config.js\"]",
    );
    expect(apiTsConfigSource).toContain("\"exclude\": [\n    \"scripts\"\n  ]");
  }, 15_000);

  test("collects the API child-process lifecycle only in the canonical process profile", () => {
    const apiPackage = readJson(join(apiRoot, "package.json"));
    const actual = listBunNarrowTestFiles(apiRoot, apiProcessCanonicalRoot);
    const processDryRun = runPackageTaskDryRun("@iam/api", "test:integration:process");
    const processTask = processDryRun.tasks.find(
      (task: { taskId: string }) => task.taskId === "@iam/api#test:integration:process",
    );
    const entryProcessSource = readFileSync(
      join(apiRoot, apiProcessCanonicalRoot, "entry.integration.test.ts"),
      "utf8",
    );

    expect(actual).toEqual(["test-integration/process/entry.integration.test.ts"]);
    expect(apiPackage.scripts["test:integration:process"])
      .toBe("bun test --max-concurrency=1 test-integration/process");
    expect(entryProcessSource).toContain("createProcessSmokeEnvironment({");
    expect(entryProcessSource).toContain("args: [\"--no-env-file\", \"run\", \"src/index.ts\"]");
    expect(entryProcessSource).not.toContain("...process.env");
    expect(entryProcessSource).not.toContain("IAM_API_TEST_");
    expect(processTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-integration/process",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
      },
    });
  }, 15_000);

  test("collects the API multi-resource entry only in the canonical composition profile", () => {
    const apiPackage = readJson(join(apiRoot, "package.json"));
    const actual = listBunNarrowTestFiles(apiRoot, apiCompositionCanonicalRoot);
    const compositionDryRun = runPackageTaskDryRun("@iam/api", "test:integration:composition");
    const compositionTask = compositionDryRun.tasks.find(
      (task: { taskId: string }) => task.taskId === "@iam/api#test:integration:composition",
    );
    const entryCompositionSource = readFileSync(
      join(apiRoot, apiCompositionCanonicalRoot, "entry.integration.test.ts"),
      "utf8",
    );

    expect(actual).toEqual(["test-integration/composition/entry.integration.test.ts"]);
    expect(apiPackage.scripts["test:integration:composition"])
      .toBe("bun test --max-concurrency=1 test-integration/composition");
    expect(entryCompositionSource).toContain("IAM_API_TEST_DATABASE_URL");
    expect(entryCompositionSource).toContain("IAM_API_TEST_REDIS_URL");
    expect(compositionTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-integration/composition",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
        passThroughEnv: [
          "IAM_API_TEST_DATABASE_URL",
          "IAM_API_TEST_REDIS_URL",
          "IAM_OIDC_PROVIDER_TEST_DATABASE_URL",
          "IAM_OIDC_PROVIDER_TEST_REDIS_URL",
        ],
      },
    });
  }, 15_000);

  test("collects the API PostgreSQL contract only in the canonical postgres profile", () => {
    const apiPackage = readJson(join(apiRoot, "package.json"));
    const actual = listBunNarrowTestFiles(apiRoot, apiPostgresCanonicalRoot);
    const postgresDryRun = runPackageTaskDryRun("@iam/api", "test:integration:postgres");
    const postgresTask = postgresDryRun.tasks.find(
      (task: { taskId: string }) => task.taskId === "@iam/api#test:integration:postgres",
    );
    const postgresHarnessSource = readFileSync(
      join(apiRoot, apiPostgresCanonicalRoot, "postgres-test-harness.ts"),
      "utf8",
    );

    expect(actual).toEqual([
      "test-integration/postgres/register-purveyor-contact.integration.test.ts",
    ]);
    expect(apiPackage.scripts["test:integration:postgres"])
      .toBe("bun test --max-concurrency=1 test-integration/postgres");
    expect(postgresHarnessSource).toContain("IAM_API_TEST_DATABASE_URL");
    expect(postgresHarnessSource).toContain("no fallback is allowed");
    expect(postgresHarnessSource).not.toContain("process.env.DATABASE_URL ??");
    expect(postgresHarnessSource).not.toContain("process.env.IAM_API_DATABASE_URL ??");
    expect(postgresTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-integration/postgres",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
        passThroughEnv: postgresIntegrationPassThroughEnv,
      },
    });
  }, 15_000);

  test("collects the API real Redis contracts only in the canonical redis profile", () => {
    const apiPackage = readJson(join(apiRoot, "package.json"));
    const actual = listBunNarrowTestFiles(apiRoot, apiRedisCanonicalRoot);
    const redisDryRun = runPackageTaskDryRun("@iam/api", "test:integration:redis");
    const redisTask = redisDryRun.tasks.find(
      (task: { taskId: string }) => task.taskId === "@iam/api#test:integration:redis",
    );
    const redisHarnessSource = readFileSync(
      join(apiRoot, apiRedisCanonicalRoot, "redis-test-harness.ts"),
      "utf8",
    );

    expect(actual).toEqual([
      "test-integration/redis/admin-client-cache.integration.test.ts",
      "test-integration/redis/custom-sso-client-runtime.integration.test.ts",
    ]);
    expect(apiPackage.scripts["test:integration:redis"])
      .toBe("bun test --max-concurrency=1 test-integration/redis");
    expect(redisHarnessSource).toContain("IAM_API_TEST_REDIS_URL");
    expect(redisHarnessSource).toContain("no fallback is allowed");
    expect(redisHarnessSource).not.toContain("IAM_API_REDIS_HOST");
    expect(redisHarnessSource).not.toContain("IAM_API_REDIS_URL");
    expect(redisTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-integration/redis",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
        passThroughEnv: redisIntegrationPassThroughEnv,
      },
    });
  }, 15_000);

  test("collects the complete Admin API mapping in disjoint canonical profiles", () => {
    const adminApiPackage = readJson(join(adminApiRoot, "package.json"));
    const adminApiTsConfigSource = readFileSync(join(adminApiRoot, "tsconfig.json"), "utf8");
    const actualByProfile = new Map(Object.entries(adminApiCanonicalRoots).map(([profile, root]) => [
      profile,
      listBunNarrowTestFiles(adminApiRoot, root),
    ]));
    const processDryRun = runPackageTaskDryRun("@iam/admin-api", "test:integration:process");
    const processTask = processDryRun.tasks.find(
      (task: { taskId: string }) => task.taskId === "@iam/admin-api#test:integration:process",
    );
    const processRoot = join(adminApiRoot, "test-integration", "process");
    const entrySmokeSource = readFileSync(join(processRoot, "entry.integration.test.ts"), "utf8");

    expect(actualByProfile.get("unit")).toHaveLength(7);
    expect(actualByProfile.get("integration/component")).toHaveLength(25);
    expect(actualByProfile.get("integration/process")).toHaveLength(2);
    const allFiles = [...actualByProfile.values()].flat();
    expect(allFiles).toHaveLength(34);
    expect(new Set(allFiles).size).toBe(allFiles.length);

    expect(adminApiPackage.scripts["test:unit"]).toBe("bun test --max-concurrency=2 src");
    expect(adminApiPackage.scripts["test:integration:component"])
      .toBe("bun test --max-concurrency=2 test-integration/component");
    expect(adminApiPackage.scripts["test:integration:process"])
      .toBe("bun test --max-concurrency=1 test-integration/process");
    expect(adminApiPackage.scripts.lint)
      .toBe("eslint src test-integration test-smoke app.config.ts eslint.config.js");
    expect(adminApiPackage.scripts["lint:fix"])
      .toBe("eslint --fix src test-integration test-smoke app.config.ts eslint.config.js");
    expect(adminApiTsConfigSource).toContain(
      "\"include\": [\"src/**/*.ts\", \"test-integration/**/*.ts\", \"test-smoke/**/*.ts\", \"app.config.ts\", \"eslint.config.js\"]",
    );
    expect(existsSync(join(
      adminApiRoot,
      "test-smoke",
      "client-cache-invalidation.composition-smoke.ts",
    )))
      .toBe(true);
    expect(listBunNarrowTestFiles(
      adminApiRoot,
      "test-integration/process",
    ))
      .not
      .toContain("test-integration/process/client-cache-invalidation.composition-smoke.ts");
    expect(entrySmokeSource).toContain("createProcessSmokeEnvironment({");
    expect(entrySmokeSource).toContain("args: [\"--no-env-file\", \"run\", \"src/index.ts\"]");
    expect(entrySmokeSource).toContain("/admin/doc");
    expect(entrySmokeSource).not.toContain("...process.env");
    expect(processTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-integration/process",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
      },
    });
  }, 15_000);

  test("collects the complete Worker mapping in disjoint canonical profiles", () => {
    const workerPackage = readJson(join(workerRoot, "package.json"));
    const workerTsConfigSource = readFileSync(join(workerRoot, "tsconfig.json"), "utf8");
    const actualByProfile = new Map(Object.entries(workerCanonicalRoots).map(([profile, root]) => [
      profile,
      listBunNarrowTestFiles(workerRoot, root),
    ]));
    const processDryRun = runPackageTaskDryRun("@iam/worker", "test:integration:process");
    const processTask = processDryRun.tasks.find(
      (task: { taskId: string }) => task.taskId === "@iam/worker#test:integration:process",
    );
    const postgresDryRun = runPackageTaskDryRun("@iam/worker", "test:integration:postgres");
    const postgresTask = postgresDryRun.tasks.find(
      (task: { taskId: string }) => task.taskId === "@iam/worker#test:integration:postgres",
    );
    const entrySmokeSource = readFileSync(
      join(workerRoot, "test-integration", "process", "entry.integration.test.ts"),
      "utf8",
    );
    const postgresHarnessSource = readFileSync(
      join(workerRoot, "test-integration", "postgres", "postgres-test-harness.ts"),
      "utf8",
    );

    expect(actualByProfile.get("unit")).toHaveLength(4);
    expect(actualByProfile.get("integration/component")).toHaveLength(4);
    expect(actualByProfile.get("integration/process")).toHaveLength(3);
    expect(actualByProfile.get("integration/postgres")).toHaveLength(1);
    const allFiles = [...actualByProfile.values()].flat();
    expect(allFiles).toHaveLength(12);
    expect(new Set(allFiles).size).toBe(allFiles.length);

    expect(workerPackage.scripts["test:unit"]).toBe("bun test --max-concurrency=2 src");
    expect(workerPackage.scripts["test:integration:component"])
      .toBe("bun test --max-concurrency=2 test-integration/component");
    expect(workerPackage.scripts["test:integration:process"])
      .toBe("bun test --max-concurrency=1 test-integration/process");
    expect(workerPackage.scripts["test:integration:postgres"])
      .toBe("bun test --max-concurrency=1 test-integration/postgres");
    expect(workerPackage.scripts.lint)
      .toBe("eslint src test-integration eslint.config.js");
    expect(workerPackage.scripts["lint:fix"])
      .toBe("eslint --fix src test-integration eslint.config.js");
    expect(workerTsConfigSource).toContain(
      "\"include\": [\"src/**/*.ts\", \"test-integration/**/*.ts\", \"eslint.config.js\"]",
    );
    expect(entrySmokeSource).toContain("createProcessSmokeEnvironment({");
    expect(entrySmokeSource).toContain("args: [\"--no-env-file\", \"run\", \"src/index.ts\"]");
    expect(entrySmokeSource).toContain("IAM_WORKER_ENABLED_MODULES: \"none\"");
    expect(entrySmokeSource).not.toContain("...process.env");
    expect(postgresHarnessSource).toContain("IAM_WORKER_TEST_DATABASE_URL");
    expect(postgresHarnessSource).toContain("no fallback is allowed");
    expect(postgresHarnessSource).toContain("randomUUID()");
    expect(postgresHarnessSource).not.toContain("process.env.DATABASE_URL ??");
    expect(postgresHarnessSource).not.toContain("process.env.IAM_WORKER_DATABASE_URL ??");
    expect(processTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-integration/process",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
      },
    });
    expect(postgresTask).toMatchObject({
      command: "bun test --max-concurrency=1 test-integration/postgres",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
        passThroughEnv: postgresIntegrationPassThroughEnv,
      },
    });
  }, 15_000);

  test("collects the complete Database mapping in disjoint canonical profiles", () => {
    const { packageJson, tsconfigSource } = expectBunOwnerCollectionContract({
      canonicalRoots: dbCanonicalRoots,
      expectedCounts: {
        "unit": 7,
        "integration/postgres": 5,
      },
      packageName: "@iam/db",
      workspaceRoot: dbRoot,
    });
    expectDedicatedResourceHarness({
      envName: "IAM_DB_TEST_DATABASE_URL",
      harnessPath: "test-integration/postgres/postgres-harness.ts",
      workspaceRoot: dbRoot,
    });
    expectCanonicalResourceTask({
      packageName: "@iam/db",
      passThroughEnv: postgresIntegrationPassThroughEnv,
      profile: "postgres",
    });

    expect(packageJson.scripts["test:unit"]).toBe("bun test --max-concurrency=2 src");
    expect(packageJson.scripts["test:integration:postgres"])
      .toBe("bun test --max-concurrency=1 test-integration/postgres");
    expect(packageJson.scripts.lint)
      .toBe("eslint scripts src test-integration drizzle.config.ts eslint.config.js");
    expect(tsconfigSource).toContain(
      "\"include\": [\"scripts/**/*\", \"src/**/*\", \"test-integration/**/*\", \"drizzle.config.ts\"]",
    );
  }, 15_000);

  test("collects the complete Role Assignment mapping in disjoint canonical profiles", () => {
    const { packageJson, tsconfigSource } = expectBunOwnerCollectionContract({
      canonicalRoots: roleAssignmentCanonicalRoots,
      expectedCounts: {
        "integration/component": 1,
        "integration/postgres": 2,
      },
      packageName: "@iam/role-assignment-resolution",
      workspaceRoot: roleAssignmentRoot,
    });
    expectDedicatedResourceHarness({
      envName: "IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL",
      harnessPath: "test-integration/postgres/postgres-harness.ts",
      workspaceRoot: roleAssignmentRoot,
    });
    expectCanonicalResourceTask({
      packageName: "@iam/role-assignment-resolution",
      passThroughEnv: postgresIntegrationPassThroughEnv,
      profile: "postgres",
    });

    expect(packageJson.scripts["test:integration:component"])
      .toBe("bun test --max-concurrency=2 test-integration/component");
    expect(packageJson.scripts["test:integration:postgres"])
      .toBe("bun test --max-concurrency=1 test-integration/postgres");
    expect(packageJson.scripts["test:unit"]).toBeUndefined();
    expect(packageJson.scripts.lint).toBe("eslint src test-integration eslint.config.js");
    expect(tsconfigSource).toContain(
      "\"include\": [\"src/**/*\", \"test-integration/**/*\"]",
    );
  }, 15_000);

  test("collects the complete User Profile Read Model mapping and exposes rehearsal as an operation", () => {
    const { packageJson, tsconfigSource } = expectBunOwnerCollectionContract({
      canonicalRoots: userProfileCanonicalRoots,
      expectedCounts: {
        "unit": 2,
        "integration/component": 15,
        "integration/postgres": 6,
        "integration/redis": 1,
      },
      packageName: "@iam/user-profile-read-model",
      workspaceRoot: userProfileRoot,
    });
    expectDedicatedResourceHarness({
      envName: "IAM_USER_PROFILE_TEST_DATABASE_URL",
      harnessPath: "test-integration/postgres/postgres-test-harness.ts",
      workspaceRoot: userProfileRoot,
    });
    expectDedicatedResourceHarness({
      envName: "IAM_USER_PROFILE_TEST_REDIS_URL",
      harnessPath: "test-integration/redis/redis-test-harness.ts",
      workspaceRoot: userProfileRoot,
    });
    expectCanonicalResourceTask({
      packageName: "@iam/user-profile-read-model",
      passThroughEnv: postgresIntegrationPassThroughEnv,
      profile: "postgres",
    });
    expectCanonicalResourceTask({
      packageName: "@iam/user-profile-read-model",
      passThroughEnv: redisIntegrationPassThroughEnv,
      profile: "redis",
    });
    const rehearsalPath = join(userProfileRoot, "scripts", "subject-projection-rehearsal.ts");
    const rehearsalSource = readFileSync(rehearsalPath, "utf8");

    expect(packageJson.scripts["test:unit"]).toBe("bun test --max-concurrency=2 src");
    expect(packageJson.scripts["test:integration:component"])
      .toBe("bun test --max-concurrency=2 test-integration/component");
    expect(packageJson.scripts["test:integration:postgres"])
      .toBe("bun test --max-concurrency=1 test-integration/postgres");
    expect(packageJson.scripts["test:integration:redis"])
      .toBe("bun test --max-concurrency=1 test-integration/redis");
    expect(packageJson.scripts["subject-projection:rehearsal"])
      .toBe("bun scripts/subject-projection-rehearsal.ts");
    expect(packageJson.scripts["test:rehearsal"]).toBeUndefined();
    expect(packageJson.scripts.lint).toBe("eslint src test-integration scripts eslint.config.js");
    expect(tsconfigSource).toContain(
      "\"include\": [\"src/**/*\", \"test-integration/**/*\", \"scripts/**/*\"]",
    );
    expect(existsSync(join(
      userProfileRoot,
      "test-rehearsal",
      "subject-projection.rehearsal.test.ts",
    ))).toBe(false);
    expect(rehearsalPath.endsWith(".test.ts")).toBe(false);
    expect(rehearsalSource).not.toContain("from \"bun:test\"");
    expect(rehearsalSource).toContain("if (import.meta.main)");
    expect(rehearsalSource).toContain("process.exitCode = 1");
    expect(rehearsalSource).toContain("const SYNTHETIC_USER_COUNT = 10_002;");
    expect(rehearsalSource).toContain("IAM_USER_PROFILE_TEST_DATABASE_URL");
    expect(rehearsalSource).toContain("IAM_USER_PROFILE_TEST_REDIS_URL");
    expect(rehearsalSource).toContain("missingResourceEnvNames");
    expect(rehearsalSource).toContain("cache-read");
    expect(rehearsalSource).toContain("profile-load");
    expect(rehearsalSource).toContain("single-flight-wait");
    expect(rehearsalSource).toContain("batchPublisher.publishMany");
    expect(rehearsalSource).toContain("createSubjectProjectionCutoverVerifier");
    expect(rehearsalSource).toContain("JSON.stringify");
    expect(rehearsalSource).toContain("postgresSchemaRemoved: true");
    expect(rehearsalSource).toContain("redisNamespaceRemoved: true");
  }, 15_000);

  test("keeps entry smoke resource ownership in the shared process suite", () => {
    const entrySmokeSources = [
      readFileSync(
        join(adminApiRoot, "test-integration", "process", "entry.integration.test.ts"),
        "utf8",
      ),
      readFileSync(
        join(apiRoot, "test-integration", "process", "entry.integration.test.ts"),
        "utf8",
      ),
      readFileSync(
        join(repoRoot, "apps", "oidc-provider", "test-integration", "process", "entry.integration.test.ts"),
        "utf8",
      ),
      readFileSync(
        join(workerRoot, "test-integration", "process", "entry.integration.test.ts"),
        "utf8",
      ),
    ];
    const packageLocalProcessLifecycle = [
      "recoverFromPortCollision",
      "runProcessSmoke",
      "terminateProcessTree",
      "new Set<ProcessSmokeChild>",
    ];

    for (const source of entrySmokeSources) {
      expect(source).toContain("createProcessSmokeSuite({");
      for (const lifecyclePrimitive of packageLocalProcessLifecycle)
        expect(source).not.toContain(lifecyclePrimitive);
    }

    const apiEntrySmokeSource = entrySmokeSources[1]!;
    expect(apiEntrySmokeSource).toContain(
      "@iam/api-core/testing/external-test-resources",
    );
    expect(apiEntrySmokeSource).toContain(
      "await runWithOwnedTestResources(async ({ registerCleanup }) => {",
    );
    expect(apiEntrySmokeSource).toContain("await observer.close()");
  });

  test("classifies in-memory OpenAPI HTTP checks as ordinary component tests", () => {
    expect(existsSync(join(apiRoot, "src", "__tests__", "openapi.smoke.test.ts"))).toBe(false);
    expect(existsSync(join(apiRoot, "src", "__tests__", "openapi.test.ts"))).toBe(false);
    expect(existsSync(
      join(apiRoot, "test-integration", "component", "openapi.integration.test.ts"),
    )).toBe(true);

    const adminApiComponentRoot = join(adminApiRoot, "test-integration", "component");
    expect(existsSync(join(adminApiRoot, "src", "__tests__", "openapi.smoke.test.ts"))).toBe(false);
    expect(existsSync(join(adminApiRoot, "src", "__tests__", "openapi.test.ts"))).toBe(false);
    expect(existsSync(join(adminApiComponentRoot, "openapi.integration.test.ts"))).toBe(true);
  });

  test("classifies OIDC tests that listen on a real port as process integration", () => {
    const testsRoot = join(oidcRoot, "test-integration", "process");
    const listeningTests = readdirSync(testsRoot)
      .filter(file => file.endsWith(".test.ts"))
      .filter(file => /\.\s*listen\s*\(/u.test(readFileSync(join(testsRoot, file), "utf8")));

    expect(listeningTests.length).toBeGreaterThan(0);
    expect(listeningTests.every(file => file.endsWith(".integration.test.ts"))).toBe(true);
  });

  test("runs verify stages in the declared order", () => {
    expect(runVerifyWithRecorder()).toEqual({
      commands: [
        "lint",
        "check:docs",
        "check:env-names",
        "check:architecture",
        "typecheck",
        "test:unit",
        "build",
      ],
      exitCode: 0,
    });
  }, 15_000);

  test("stops verify after the first failed stage command", () => {
    expect(runVerifyWithRecorder("test:unit")).toEqual({
      commands: [
        "lint",
        "check:docs",
        "check:env-names",
        "check:architecture",
        "typecheck",
        "test:unit",
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

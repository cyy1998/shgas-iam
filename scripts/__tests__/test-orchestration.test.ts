import type { TestCollectionCommandRunner } from "../test-collection-guard";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
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
const adminApiRoot = join(repoRoot, "apps", "admin-api");
const apiRoot = join(repoRoot, "apps", "api");
const apiCoreRoot = join(repoRoot, "packages", "api-core");
const dbRoot = join(repoRoot, "packages", "db");
const oidcRoot = join(repoRoot, "apps", "oidc-provider");
const organizationResponsibilityRoot = join(
  repoRoot,
  "packages",
  "organization-responsibility-resolution",
);
const workerRoot = join(repoRoot, "apps", "worker");
const roleAssignmentRoot = join(repoRoot, "packages", "role-assignment-resolution");
const userProfileRoot = join(repoRoot, "packages", "user-profile-read-model");
const ssoRoot = join(repoRoot, "apps", "sso");
const postgresIntegrationPassThroughEnv = [
  "IAM_ADMIN_API_TEST_DATABASE_URL",
  "IAM_API_TEST_DATABASE_URL",
  "IAM_DB_TEST_DATABASE_URL",
  "IAM_ORGANIZATION_RESPONSIBILITY_TEST_DATABASE_URL",
  "IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL",
  "IAM_USER_PROFILE_TEST_DATABASE_URL",
  "IAM_WORKER_TEST_DATABASE_URL",
];
const redisIntegrationPassThroughEnv = [
  "IAM_ADMIN_API_TEST_REDIS_URL",
  "IAM_API_CORE_TEST_REDIS_URL",
  "IAM_API_TEST_REDIS_URL",
  "IAM_OIDC_PROVIDER_TEST_REDIS_URL",
  "IAM_USER_PROFILE_TEST_REDIS_URL",
  "IAM_WORKER_TEST_REDIS_URL",
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
const verificationGateScript = join(repoRoot, "scripts", "run-verification-gate.mjs");
const pnpmRecorderControlEnvNames = [
  "IAM_TEST_INTEGRATION_COMMAND_LOG",
  "IAM_TEST_INTEGRATION_FAIL_COMMAND",
  "IAM_VERIFICATION_GATE_COMMAND_LOG",
  "IAM_VERIFICATION_GATE_DIAGNOSTIC",
  "IAM_VERIFICATION_GATE_DIAGNOSTIC_COMMAND",
  "IAM_VERIFICATION_GATE_DIAGNOSTIC_STREAM",
  "IAM_VERIFICATION_GATE_FAIL_COMMAND",
  "IAM_VERIFICATION_GATE_FAIL_EXIT_CODE",
  "IAM_VERIFICATION_GATE_SIGNAL",
  "IAM_VERIFICATION_GATE_SIGNAL_COMMAND",
  "IAM_VERIFY_COMMAND_LOG",
  "IAM_VERIFY_FAIL_COMMAND",
] as const;
const integrationResourceEnvNames = [
  "IAM_API_CORE_TEST_REDIS_URL",
  "IAM_ADMIN_API_TEST_REDIS_URL",
  "IAM_ADMIN_API_TEST_DATABASE_URL",
  "IAM_API_TEST_DATABASE_URL",
  "IAM_API_TEST_REDIS_URL",
  "IAM_DB_TEST_DATABASE_URL",
  "IAM_OIDC_PROVIDER_TEST_DATABASE_URL",
  "IAM_OIDC_PROVIDER_TEST_REDIS_URL",
  "IAM_ORGANIZATION_RESPONSIBILITY_TEST_DATABASE_URL",
  "IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL",
  "IAM_USER_PROFILE_TEST_DATABASE_URL",
  "IAM_USER_PROFILE_TEST_REDIS_URL",
  "IAM_WORKER_TEST_DATABASE_URL",
  "IAM_WORKER_TEST_REDIS_URL",
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
    environment?: string;
    exclude?: string[];
    fileParallelism?: boolean;
    include?: string[];
    maxWorkers?: number | string;
    name?: string;
    projects?: Array<{
      test?: {
        environment?: string;
        exclude?: string[];
        include?: string[];
        name?: string;
        setupFiles?: string[];
      };
    }>;
    setupFiles?: string[];
    testTimeout?: number;
  };
}

function expectDedicatedResourceHarness(options: {
  envName: string;
  harnessPath: string;
  workspaceRoot: string;
}) {
  const source = readFileSync(join(options.workspaceRoot, options.harnessPath), "utf8");
  expect(source, `${options.envName} harness`).toContain(options.envName);
  expect(source, `${options.envName} fallback contract`).toMatch(
    /no fallback is allowed|requireExternalTestUrl/u,
  );
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
  publishWorkspaceE2e?: boolean;
  violating?: boolean;
  vitestProjects?: boolean;
  workspaceLocalJourneys?: Array<{ file: string; name: string }>;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "iam-test-collection-"));
  const ownerRoot = join(root, "packages", "owner");
  const frontendRoot = join(root, "apps", "frontend");
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
        || (options.workspaceLocalJourneys?.length && !options.publishWorkspaceE2e)
        ? {}
        : options.publishWorkspaceE2e
          ? { "test:e2e": "turbo test:e2e --concurrency=1" }
          : {
              "test:e2e": "turbo test:e2e:root --concurrency=1",
              "test:e2e:root": "bun test e2e/system/journey.spec.ts",
            }),
      "test:integration:component": options.brokenRootCommand
        ? "turbo test:unit --concurrency=2"
        : "turbo test:integration:component --concurrency=2",
      "test:unit": "turbo test:unit test:unit:root --concurrency=2",
      "test:unit:root": "bun test scripts/__tests__/architecture-guard.test.ts scripts/__tests__/eslint-config-ownership.test.ts scripts/__tests__/test-orchestration.test.ts scripts/__tests__/tooling-contracts.test.ts",
    },
  });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
  writeJson(join(root, "turbo.json"), {
    tasks: {
      "//#test:e2e:root": { cache: false },
      "test:e2e": { cache: false, dependsOn: ["transit"] },
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
  if (options.vitestProjects) {
    mkdirSync(join(frontendRoot, "src"), { recursive: true });
    writeJson(join(frontendRoot, "package.json"), {
      name: "@fixture/frontend",
      scripts: {
        "test:unit": "vitest run --config vitest.unit.config.ts",
      },
    });
    writeFileSync(join(frontendRoot, "src", "logic.test.ts"), "export {};\n", "utf8");
    writeFileSync(join(frontendRoot, "src", "render.dom.test.tsx"), "export {};\n", "utf8");
  }
  writeFileSync(join(ownerRoot, "src", "example.test.ts"), "export {};\n", "utf8");
  writeFileSync(join(ownerRoot, "scripts", "__tests__", "tooling.test.ts"), "export {};\n", "utf8");
  writeFileSync(
    join(ownerRoot, "test-integration", "component", "example.integration.test.ts"),
    "export {};\n",
    "utf8",
  );
  for (const file of [
    "architecture-guard.test.ts",
    "eslint-config-ownership.test.ts",
    "test-orchestration.test.ts",
    "tooling-contracts.test.ts",
  ])
    writeFileSync(join(root, "scripts", "__tests__", file), "export {};\n", "utf8");
  if (options.workspaceLocalJourneys?.length) {
    writeJson(join(root, "e2e", "system", "package.json"), {
      name: "@fixture/e2e-system",
      scripts: {
        ...(options.publishWorkspaceE2e
          ? { "test:e2e": "bun src/cli.ts e2e" }
          : {}),
        ...Object.fromEntries(options.workspaceLocalJourneys.map(journey => [
          `${journey.name}:journey`,
          `bun src/cli.ts ${journey.name}`,
        ])),
      },
    });
    for (const journey of options.workspaceLocalJourneys) {
      writeFileSync(
        join(root, "e2e", "system", journey.file),
        "export {};\n",
        "utf8",
      );
    }
  }
  else {
    writeFileSync(join(root, "e2e", "system", "journey.spec.ts"), "export {};\n", "utf8");
  }

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

function createCollectionGuardRunner(options: {
  duplicateVitestProject?: boolean;
  fail?: boolean;
  omitComponent?: boolean;
} = {}) {
  const runner: TestCollectionCommandRunner = {
    run: async (command, cwd) => {
      if (options.fail)
        return { exitCode: 12, stderr: "synthetic turbo failure", stdout: "" };
      if (command.some(argument => argument.endsWith("vitest.mjs"))) {
        const logicTest = join(cwd, "src", "logic.test.ts");
        return {
          exitCode: 0,
          stderr: "",
          stdout: JSON.stringify([
            { file: logicTest, projectName: "project-alpha" },
            { file: join(cwd, "src", "render.dom.test.tsx"), projectName: "project-beta" },
            ...(options.duplicateVitestProject
              ? [{ file: logicTest, projectName: "project-beta" }]
              : []),
          ]),
        };
      }
      return {
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          tasks: [
            { taskId: "//#test:e2e:root" },
            { taskId: "@fixture/e2e-system#test:e2e" },
            { taskId: "//#test:unit:root" },
            { taskId: "@fixture/frontend#test:unit" },
            { taskId: "@fixture/owner#test:unit" },
            ...(options.omitComponent
              ? []
              : [{ taskId: "@fixture/owner#test:integration:component" }]),
          ],
        }),
      };
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

function runWithPnpmRecorder(options: {
  args?: string[];
  commandLogEnvName: string;
  environment?: Record<string, string | undefined>;
  temporaryDirectoryPrefix: string;
  orchestrationScript: string;
}) {
  const root = mkdtempSync(join(tmpdir(), options.temporaryDirectoryPrefix));
  const log = join(root, "commands.log");
  const env: Record<string, string | undefined> = {
    ...process.env,
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    npm_execpath: pnpmRecorderScript,
  };
  for (const name of pnpmRecorderControlEnvNames)
    delete env[name];
  for (const [name, value] of Object.entries(options.environment ?? {})) {
    if (value === undefined)
      delete env[name];
    else
      env[name] = value;
  }
  env[options.commandLogEnvName] = log;

  try {
    const result = spawnSync("node", [options.orchestrationScript, ...options.args ?? []], {
      cwd: repoRoot,
      env,
    });
    return {
      commands: existsSync(log)
        ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean)
        : [],
      exitCode: result.status,
      output: `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`,
      signal: result.signal,
    };
  }
  finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runVerifyWithRecorder(failCommand?: string) {
  const result = runWithPnpmRecorder({
    commandLogEnvName: "IAM_VERIFY_COMMAND_LOG",
    environment: { IAM_VERIFY_FAIL_COMMAND: failCommand },
    orchestrationScript: verifyScript,
    temporaryDirectoryPrefix: "iam-verify-recorder-",
  });
  return {
    commands: result.commands,
    exitCode: result.exitCode,
  };
}

function runVerificationGateWithRecorder(
  gate: "ci" | "release",
  options: {
    diagnostic?: string;
    diagnosticCommand?: string;
    diagnosticStream?: "stderr" | "stdout";
    failCommand?: string;
    failExitCode?: number;
    signal?: NodeJS.Signals;
    signalCommand?: string;
  } = {},
) {
  return runWithPnpmRecorder({
    args: [gate],
    commandLogEnvName: "IAM_VERIFICATION_GATE_COMMAND_LOG",
    environment: {
      IAM_VERIFICATION_GATE_DIAGNOSTIC: options.diagnostic,
      IAM_VERIFICATION_GATE_DIAGNOSTIC_COMMAND: options.diagnosticCommand,
      IAM_VERIFICATION_GATE_DIAGNOSTIC_STREAM: options.diagnosticStream,
      IAM_VERIFICATION_GATE_FAIL_COMMAND: options.failCommand,
      IAM_VERIFICATION_GATE_FAIL_EXIT_CODE: options.failExitCode === undefined
        ? undefined
        : String(options.failExitCode),
      IAM_VERIFICATION_GATE_SIGNAL: options.signal,
      IAM_VERIFICATION_GATE_SIGNAL_COMMAND: options.signalCommand,
    },
    orchestrationScript: verificationGateScript,
    temporaryDirectoryPrefix: "iam-verification-gate-recorder-",
  });
}

function runTestIntegrationWithRecorder(options: {
  failCommand?: string;
  missing?: string[];
} = {}) {
  const environment: Record<string, string | undefined> = {
    IAM_TEST_INTEGRATION_FAIL_COMMAND: options.failCommand,
  };
  for (const name of integrationResourceEnvNames)
    environment[name] = "caller-owned-test-resource";
  for (const name of options.missing ?? [])
    environment[name] = undefined;
  const result = runWithPnpmRecorder({
    commandLogEnvName: "IAM_TEST_INTEGRATION_COMMAND_LOG",
    environment,
    orchestrationScript: testIntegrationScript,
    temporaryDirectoryPrefix: "iam-test-integration-recorder-",
  });
  return {
    commands: result.commands,
    exitCode: result.exitCode,
    output: result.output,
  };
}

function withCallerEnvironment<T>(
  overrides: Record<string, string>,
  run: () => T,
) {
  const previous = new Map(Object.keys(overrides).map(name => [name, process.env[name]]));
  Object.assign(process.env, overrides);
  try {
    return run();
  }
  finally {
    for (const [name, value] of previous) {
      if (value === undefined)
        delete process.env[name];
      else
        process.env[name] = value;
    }
  }
}

describe("test orchestration", () => {
  test("publishes the complete Full-system E2E owner through root and Turbo", () => {
    const rootPackage = readJson(join(repoRoot, "package.json"));
    const workspacePackage = readJson(join(repoRoot, "e2e", "system", "package.json"));
    const dryRun = runPackageTaskDryRun("@iam/e2e-system", "test:e2e");
    const task = dryRun.tasks.find(
      (candidate: { taskId: string }) =>
        candidate.taskId === "@iam/e2e-system#test:e2e",
    );

    expect(rootPackage.scripts["test:e2e"])
      .toBe("turbo test:e2e --concurrency=1");
    expect(workspacePackage.scripts["test:e2e"]).toBe("bun src/cli.ts e2e");
    expect(task).toMatchObject({
      command: "bun src/cli.ts e2e",
      resolvedTaskDefinition: {
        cache: false,
        dependsOn: ["transit"],
      },
    });
  });

  test("Collection Guard accepts a complete uniquely-owned fixture", async () => {
    const root = createCollectionGuardFixture();
    try {
      expect(await analyzeTestCollections(root, createCollectionGuardRunner())).toEqual([]);
    }
    finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Collection Guard uses Vitest machine lists for multi-project Unit ownership", async () => {
    const root = createCollectionGuardFixture({ vitestProjects: true });
    try {
      expect(await analyzeTestCollections(root, createCollectionGuardRunner())).toEqual([]);
    }
    finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Collection Guard rejects a Unit file listed by multiple Vitest projects", async () => {
    const root = createCollectionGuardFixture({ vitestProjects: true });
    try {
      expect(await analyzeTestCollections(
        root,
        createCollectionGuardRunner({ duplicateVitestProject: true }),
      )).toContainEqual({
        code: "duplicate-collection",
        message: expect.stringContaining("apps/frontend/src/logic.test.ts"),
      });
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

  test("Collection Guard lists the fixed Admin, HR Admin, and OIDC owners without per-spec mappings", async () => {
    const journeys = [
      { file: "admin-custom-sso.spec.ts", name: "admin" },
      { file: "hr-admin-user-management.spec.ts", name: "hr-admin" },
      { file: "oidc-pkce.spec.ts", name: "oidc" },
    ];
    const root = createCollectionGuardFixture({ workspaceLocalJourneys: journeys });
    const baseRunner = createCollectionGuardRunner();
    const runner: TestCollectionCommandRunner = {
      async run(command, cwd, options) {
        if (command.some(token => token.endsWith("cli.js"))) {
          const journey = journeys.find(candidate =>
            candidate.name === options?.env?.IAM_E2E_JOURNEY);
          return {
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify({
              config: { rootDir: join(root, "e2e", "system") },
              suites: journey ? [{ file: journey.file }] : [],
            }),
          };
        }
        return baseRunner.run(command, cwd, options);
      },
    };
    try {
      expect(await analyzeTestCollections(root, runner)).toEqual([]);
    }
    finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Collection Guard assigns all journeys to the published workspace E2E owner", async () => {
    const journeys = [
      { file: "admin-custom-sso.spec.ts", name: "admin" },
      { file: "hr-admin-user-management.spec.ts", name: "hr-admin" },
      { file: "oidc-pkce.spec.ts", name: "oidc" },
    ];
    const root = createCollectionGuardFixture({
      publishWorkspaceE2e: true,
      workspaceLocalJourneys: journeys,
    });
    const baseRunner = createCollectionGuardRunner();
    const listedSelectors: string[] = [];
    const runner: TestCollectionCommandRunner = {
      async run(command, cwd, options) {
        if (command.some(token => token.endsWith("cli.js"))) {
          const selector = options?.env?.IAM_E2E_JOURNEY ?? "";
          listedSelectors.push(selector);
          const journey = journeys.find(candidate => candidate.name === selector);
          return {
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify({
              config: { rootDir: join(root, "e2e", "system") },
              suites: journey ? [{ file: journey.file }] : [],
            }),
          };
        }
        return baseRunner.run(command, cwd, options);
      },
    };
    try {
      expect(await analyzeTestCollections(root, runner)).toEqual([]);
      expect(listedSelectors).toEqual(["admin", "hr-admin", "oidc"]);
    }
    finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Collection Guard rejects a spec collected by two discovered journey owners", async () => {
    const root = createCollectionGuardFixture({
      workspaceLocalJourneys: [
        { file: "admin-custom-sso.spec.ts", name: "admin" },
        { file: "admin-custom-sso.spec.ts", name: "oidc" },
      ],
    });
    const baseRunner = createCollectionGuardRunner();
    const runner: TestCollectionCommandRunner = {
      async run(command, cwd, options) {
        if (command.some(token => token.endsWith("cli.js"))) {
          return {
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify({
              config: { rootDir: join(root, "e2e", "system") },
              suites: [{ file: "admin-custom-sso.spec.ts" }],
            }),
          };
        }
        return baseRunner.run(command, cwd, options);
      },
    };
    try {
      expect(await analyzeTestCollections(root, runner)).toContainEqual({
        code: "duplicate-collection",
        message: expect.stringContaining("admin-custom-sso.spec.ts"),
      });
    }
    finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Collection Guard rejects an unknown workspace-local journey owner", async () => {
    const root = createCollectionGuardFixture({
      workspaceLocalJourneys: [
        { file: "unknown.spec.ts", name: "unknown" },
      ],
    });
    const baseRunner = createCollectionGuardRunner();
    const runner: TestCollectionCommandRunner = {
      async run(command, cwd, options) {
        if (command.some(token => token.endsWith("cli.js"))) {
          return {
            exitCode: 0,
            stderr: "",
            stdout: JSON.stringify({
              config: { rootDir: join(root, "e2e", "system") },
              suites: [{ file: "unknown.spec.ts" }],
            }),
          };
        }
        return baseRunner.run(command, cwd, options);
      },
    };
    try {
      expect(await analyzeTestCollections(root, runner)).toContainEqual({
        code: "unsupported-owner",
        message: expect.stringContaining("unknown:journey"),
      });
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
      "bun test --max-concurrency=2 scripts/__tests__/architecture-guard.test.ts scripts/__tests__/eslint-config-ownership.test.ts scripts/__tests__/test-orchestration.test.ts scripts/__tests__/tooling-contracts.test.ts",
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
        "IAM_DB_TEST_DATABASE_URL",
        "IAM_USER_PROFILE_TEST_REDIS_URL",
      ],
    });

    expect(result.exitCode).toBe(1);
    expect(result.commands).toEqual([]);
    expect(result.output).toContain(
      "Provide dedicated URLs or start disposable Docker resources first",
    );
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

  test("exposes test lanes and keeps root guards lightweight", () => {
    const rootPackage = readJson(join(repoRoot, "package.json"));
    const turbo = readJson(join(repoRoot, "turbo.json"));

    expect(rootPackage.scripts.verify).toBe("node scripts/verify.mjs");
    expect(rootPackage.scripts["check:architecture"]).toBe("bun scripts/check-architecture.ts");
    expect(rootPackage.scripts["lint:root"]).toBe(
      "eslint --config eslint.root.config.mjs scripts eslint.root.config.mjs eslint.frontend.config.mjs stylelint.frontend.config.mjs",
    );
    expect(readFileSync(join(repoRoot, ".husky", "pre-commit"), "utf8"))
      .toBe("git diff --cached --check\n");
    expect(turbo.tasks.transit).toEqual({
      dependsOn: ["^transit"],
    });
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
        "IAM_ADMIN_API_TEST_DATABASE_URL",
        "IAM_ADMIN_API_TEST_REDIS_URL",
        "IAM_API_CORE_TEST_REDIS_URL",
        "IAM_API_TEST_DATABASE_URL",
        "IAM_API_TEST_REDIS_URL",
        "IAM_OIDC_PROVIDER_TEST_DATABASE_URL",
        "IAM_OIDC_PROVIDER_TEST_REDIS_URL",
        "IAM_USER_PROFILE_TEST_REDIS_URL",
        "IAM_WORKER_TEST_REDIS_URL",
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

    for (const workspace of ["apps/admin", "apps/sso"]) {
      const config = await readVitestTestConfig(workspace, "vitest.unit.config.ts");
      expect(config.maxWorkers).toBe(4);
      expect(config.testTimeout).toBe(10_000);

      const componentConfig = await readVitestTestConfig(
        workspace,
        "vitest.integration.component.config.ts",
      );
      expect(componentConfig.maxWorkers).toBe("25%");
      expect(componentConfig.testTimeout).toBe(10_000);
    }

    const oidcUnitConfig = await readVitestTestConfig(
      "apps/oidc-provider",
      "vitest.unit.config.ts",
    );
    expect(oidcUnitConfig.maxWorkers).toBe("25%");
    expect(oidcUnitConfig.testTimeout).toBe(10_000);

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

  test("keeps frontend Node and DOM Unit environments behind package commands", async () => {
    for (const workspace of ["apps/admin", "apps/sso"]) {
      const packageJson = readJson(join(repoRoot, workspace, "package.json"));
      const unitConfig = await readVitestTestConfig(workspace, "vitest.unit.config.ts");
      const componentConfig = await readVitestTestConfig(
        workspace,
        "vitest.integration.component.config.ts",
      );
      const projects = unitConfig.projects?.map(project => project.test);
      const nodeProject = projects?.find(project => project?.environment === "node");
      const domProject = projects?.find(project => project?.environment === "jsdom");

      expect(packageJson.scripts["test:unit"])
        .toBe("vitest run --config vitest.unit.config.ts");
      expect(nodeProject).toBeDefined();
      expect(domProject).toBeDefined();
      expect(unitConfig.setupFiles).toBeUndefined();
      expect(nodeProject).toMatchObject({
        include: ["src/**/*.test.{ts,tsx}"],
      });
      expect(nodeProject?.exclude).toContain("src/**/*.dom.test.{ts,tsx}");
      expect(nodeProject?.setupFiles).toBeUndefined();
      expect(domProject).toMatchObject({
        include: ["src/**/*.dom.test.{ts,tsx}"],
        setupFiles: ["./test/setup-dom.ts"],
      });
      expect(componentConfig).toMatchObject({
        environment: "jsdom",
        include: ["test-integration/component/**/*.integration.test.{ts,tsx}"],
        setupFiles: ["./test/setup.ts"],
      });
    }
  });

  test("publishes package-local canonical runner commands", () => {
    const owners = [
      {
        root: adminRoot,
        scripts: {
          "test:unit": "vitest run --config vitest.unit.config.ts",
          "test:integration:component": "vitest run --config vitest.integration.component.config.ts",
          "test:integration:browser": "node ../../scripts/playwright-e2e-preflight.mjs && playwright test",
        },
      },
      {
        root: ssoRoot,
        scripts: {
          "test:unit": "vitest run --config vitest.unit.config.ts",
          "test:integration:component": "vitest run --config vitest.integration.component.config.ts",
          "test:integration:browser": "node ../../scripts/playwright-e2e-preflight.mjs && playwright test",
        },
      },
      {
        root: oidcRoot,
        scripts: {
          "test:unit": "vitest run --config vitest.unit.config.ts",
          "test:integration:component": "vitest run --config vitest.integration.component.config.ts",
          "test:integration:process": "vitest run --config vitest.integration.process.config.ts",
          "test:integration:composition": "vitest run --config vitest.integration.composition.config.ts",
          "test:integration:redis": "vitest run --config vitest.integration.redis.config.ts",
        },
      },
      {
        root: join(repoRoot, "packages", "client-subject-projection"),
        scripts: {
          "test:unit": "bun test --max-concurrency=2 src",
          "test:integration:component": "bun test --max-concurrency=2 test-integration/component",
        },
      },
      {
        root: join(repoRoot, "gateway"),
        scripts: {
          "test:unit": "bun test --max-concurrency=2 src",
          "test:integration:component": "bun test --max-concurrency=2 test-integration/component",
        },
      },
      {
        root: apiCoreRoot,
        scripts: {
          "test:unit": "bun test --max-concurrency=2 src",
          "test:integration:component": "bun test --max-concurrency=2 test-integration/component",
          "test:integration:process": "bun test --max-concurrency=1 test-integration/process",
          "test:integration:redis": "bun test --max-concurrency=1 test-integration/redis",
        },
      },
      {
        root: apiRoot,
        scripts: {
          "test:unit": "bun test --max-concurrency=2 src",
          "test:integration:component": "bun test --max-concurrency=2 test-integration/component",
          "test:integration:process": "bun test --max-concurrency=1 test-integration/process",
          "test:integration:composition": "bun test --max-concurrency=1 test-integration/composition",
          "test:integration:postgres": "bun test --max-concurrency=1 test-integration/postgres",
          "test:integration:redis": "bun test --max-concurrency=1 test-integration/redis",
        },
      },
      {
        root: adminApiRoot,
        scripts: {
          "test:unit": "bun test --max-concurrency=2 src",
          "test:integration:component": "bun test --max-concurrency=2 test-integration/component",
          "test:integration:process": "bun test --max-concurrency=1 test-integration/process",
          "test:integration:postgres": "bun test --max-concurrency=1 test-integration/postgres",
          "test:integration:redis": "bun test --max-concurrency=1 test-integration/redis",
        },
      },
      {
        root: workerRoot,
        scripts: {
          "test:unit": "bun test --max-concurrency=2 src",
          "test:integration:component": "bun test --max-concurrency=2 test-integration/component",
          "test:integration:process": "bun test --max-concurrency=1 test-integration/process",
          "test:integration:postgres": "bun test --max-concurrency=1 test-integration/postgres",
          "test:integration:redis": "bun test --max-concurrency=1 test-integration/redis",
        },
      },
      {
        root: dbRoot,
        scripts: {
          "test:unit": "bun test --max-concurrency=2 src",
          "test:integration:postgres": "bun test --max-concurrency=1 test-integration/postgres",
        },
      },
      {
        root: roleAssignmentRoot,
        scripts: {
          "test:integration:component": "bun test --max-concurrency=2 test-integration/component",
          "test:integration:postgres": "bun test --max-concurrency=1 test-integration/postgres",
        },
      },
      {
        root: userProfileRoot,
        scripts: {
          "test:unit": "bun test --max-concurrency=2 src",
          "test:integration:component": "bun test --max-concurrency=2 test-integration/component",
          "test:integration:postgres": "bun test --max-concurrency=1 test-integration/postgres",
          "test:integration:redis": "bun test --max-concurrency=1 test-integration/redis",
        },
      },
    ];

    for (const owner of owners) {
      const manifest = readJson(join(owner.root, "package.json"));
      expect(manifest.scripts, owner.root).toMatchObject(owner.scripts);
    }
  });

  test("keeps frontend browser runner contracts package-local", async () => {
    const owners = [
      { root: adminRoot, baseURL: "http://127.0.0.1:8001" },
      { root: ssoRoot, baseURL: "http://127.0.0.1:8000" },
    ];

    for (const owner of owners) {
      const playwrightConfig = (await import(pathToFileURL(
        join(owner.root, "playwright.config.ts"),
      ).href)).default;

      expect(playwrightConfig.testDir).toBe("./test-integration/browser");
      expect(playwrightConfig.projects).toHaveLength(1);
      expect(playwrightConfig.projects[0].name).toBe("chromium");
      expect(playwrightConfig.webServer.command).toBe("pnpm dev:e2e");
      expect(playwrightConfig.use.baseURL).toBe(owner.baseURL);
    }
  });

  test("keeps caller-owned resource harnesses isolated", () => {
    const harnesses = [
      {
        envName: "IAM_ADMIN_API_TEST_DATABASE_URL",
        harnessPath: "test-integration/postgres/postgres-test-harness.ts",
        workspaceRoot: adminApiRoot,
      },
      {
        envName: "IAM_API_TEST_DATABASE_URL",
        harnessPath: "test-integration/postgres/postgres-test-harness.ts",
        workspaceRoot: apiRoot,
      },
      {
        envName: "IAM_API_TEST_REDIS_URL",
        harnessPath: "test-integration/redis/redis-test-harness.ts",
        workspaceRoot: apiRoot,
      },
      {
        envName: "IAM_API_CORE_TEST_REDIS_URL",
        harnessPath: "test-integration/redis/redis-test-harness.ts",
        workspaceRoot: apiCoreRoot,
      },
      {
        envName: "IAM_ADMIN_API_TEST_REDIS_URL",
        harnessPath: "test-integration/redis/redis-test-harness.ts",
        workspaceRoot: adminApiRoot,
      },
      {
        envName: "IAM_WORKER_TEST_DATABASE_URL",
        harnessPath: "test-integration/postgres/postgres-test-harness.ts",
        workspaceRoot: workerRoot,
      },
      {
        envName: "IAM_WORKER_TEST_REDIS_URL",
        harnessPath: "test-integration/redis/redis-test-harness.ts",
        workspaceRoot: workerRoot,
      },
      {
        envName: "IAM_DB_TEST_DATABASE_URL",
        harnessPath: "test-integration/postgres/postgres-harness.ts",
        workspaceRoot: dbRoot,
      },
      {
        envName: "IAM_ORGANIZATION_RESPONSIBILITY_TEST_DATABASE_URL",
        harnessPath: "test-integration/postgres/postgres-harness.ts",
        workspaceRoot: organizationResponsibilityRoot,
      },
      {
        envName: "IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL",
        harnessPath: "test-integration/postgres/postgres-harness.ts",
        workspaceRoot: roleAssignmentRoot,
      },
      {
        envName: "IAM_USER_PROFILE_TEST_DATABASE_URL",
        harnessPath: "test-integration/postgres/postgres-test-harness.ts",
        workspaceRoot: userProfileRoot,
      },
      {
        envName: "IAM_USER_PROFILE_TEST_REDIS_URL",
        harnessPath: "test-integration/redis/redis-test-harness.ts",
        workspaceRoot: userProfileRoot,
      },
    ];

    for (const harness of harnesses)
      expectDedicatedResourceHarness(harness);
  });

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

  test("runs the provider-neutral CI gate in owner-command order", () => {
    const rootPackage = readJson(join(repoRoot, "package.json"));

    expect(rootPackage.scripts["verify:ci"])
      .toBe("node scripts/run-verification-gate.mjs ci");
    expect(runVerificationGateWithRecorder("ci")).toEqual({
      commands: ["verify", "test:integration"],
      exitCode: 0,
      output: "",
      signal: null,
    });
  }, 15_000);

  test("stops the CI gate before Integration when verify fails", () => {
    expect(runVerificationGateWithRecorder("ci", { failCommand: "verify" })).toEqual({
      commands: ["verify"],
      exitCode: 37,
      output: "",
      signal: null,
    });
  }, 15_000);

  test("propagates an Integration failure from the CI gate", () => {
    expect(runVerificationGateWithRecorder("ci", { failCommand: "test:integration" })).toEqual({
      commands: ["verify", "test:integration"],
      exitCode: 37,
      output: "",
      signal: null,
    });
  }, 15_000);

  test("runs the provider-neutral release gate in owner-command order", () => {
    const rootPackage = readJson(join(repoRoot, "package.json"));

    expect(rootPackage.scripts["verify:release"])
      .toBe("node scripts/run-verification-gate.mjs release");
    expect(runVerificationGateWithRecorder("release")).toEqual({
      commands: ["verify:ci", "test:e2e"],
      exitCode: 0,
      output: "",
      signal: null,
    });
  }, 15_000);

  test("stops the release gate before E2E when the CI gate fails", () => {
    expect(runVerificationGateWithRecorder("release", { failCommand: "verify:ci" })).toEqual({
      commands: ["verify:ci"],
      exitCode: 37,
      output: "",
      signal: null,
    });
  }, 15_000);

  test("preserves an E2E assertion failure and its owner diagnostic", () => {
    const result = runVerificationGateWithRecorder("release", {
      diagnostic: "synthetic E2E assertion failure",
      diagnosticCommand: "test:e2e",
      failCommand: "test:e2e",
      failExitCode: 43,
    });

    expect(result.commands).toEqual(["verify:ci", "test:e2e"]);
    expect(result.exitCode).toBe(43);
    expect(result.output).toContain("synthetic E2E assertion failure");
    expect(result.signal).toBeNull();
  }, 15_000);

  test("preserves an E2E cleanup failure and its owner diagnostic", () => {
    const result = runVerificationGateWithRecorder("release", {
      diagnostic: "synthetic exact-project cleanup failure",
      diagnosticCommand: "test:e2e",
      diagnosticStream: "stdout",
      failCommand: "test:e2e",
      failExitCode: 47,
    });

    expect(result.commands).toEqual(["verify:ci", "test:e2e"]);
    expect(result.exitCode).toBe(47);
    expect(result.output).toContain("synthetic exact-project cleanup failure");
    expect(result.signal).toBeNull();
  }, 15_000);

  test("propagates a child signal and stops the downstream owner command", () => {
    const result = runVerificationGateWithRecorder("ci", {
      signal: "SIGTERM",
      signalCommand: "verify",
    });

    expect(result.commands).toEqual(["verify"]);
    if (process.platform === "win32") {
      expect(result).toMatchObject({ exitCode: 1, signal: null });
    }
    else {
      expect(result).toMatchObject({ exitCode: null, signal: "SIGTERM" });
    }
  }, 15_000);

  test("isolates every recorder-backed orchestration seam from caller controls", () => {
    const verifyResult = withCallerEnvironment(
      { IAM_VERIFICATION_GATE_FAIL_COMMAND: "lint" },
      () => runVerifyWithRecorder(),
    );
    const integrationResult = withCallerEnvironment(
      { IAM_VERIFICATION_GATE_SIGNAL_COMMAND: "test:integration:component" },
      () => runTestIntegrationWithRecorder(),
    );
    const gateResult = withCallerEnvironment(
      { IAM_TEST_INTEGRATION_FAIL_COMMAND: "verify" },
      () => runVerificationGateWithRecorder("ci"),
    );

    expect(verifyResult.exitCode).toBe(0);
    expect(integrationResult.exitCode).toBe(0);
    expect(gateResult.exitCode).toBe(0);
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

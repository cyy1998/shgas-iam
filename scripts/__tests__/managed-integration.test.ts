import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = join(import.meta.dirname, "../..");
const entry = join(repoRoot, "scripts/run-test-integration.mjs");
const packageEntry = join(repoRoot, "scripts/run-package-integration.mjs");
const nodeExecutable = spawnSync("node", ["-p", "process.execPath"], { encoding: "utf8" }).stdout.trim();

function runSelection(args: string[]) {
  const root = mkdtempSync(join(tmpdir(), "iam-integration-selection-"));
  const owner = join(root, "apps/worker");
  const directory = join(owner, "test-integration/component");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "iam-monorepo", private: true }));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  writeFileSync(
    join(owner, "package.json"),
    JSON.stringify({
      name: "@iam/worker",
      scripts: { "test:integration:component": "bun test test-integration/component" },
    }),
  );
  for (const name of ["first", "second"]) writeFileSync(join(directory, `${name}.integration.test.ts`), "");
  const recorder = join(root, "recorder.mjs");
  const log = join(root, "commands.json");
  writeFileSync(
    recorder,
    'import { writeFileSync } from "node:fs"; writeFileSync(process.env.RECORDER_LOG, JSON.stringify({args: process.argv.slice(2), selection: JSON.parse(process.env.IAM_TEST_INTEGRATION_SELECTION)}));',
  );
  const environment = { ...process.env, npm_execpath: recorder, RECORDER_LOG: log, PATH: dirname(nodeExecutable) };
  for (const name of Object.keys(environment))
    if (/^IAM_.*_TEST_(DATABASE|REDIS)_URL$/.test(name)) delete environment[name];
  try {
    const result = spawnSync(nodeExecutable, [entry, ...args], { cwd: root, env: environment, encoding: "utf8" });
    return {
      exitCode: result.status,
      output: `${result.stdout}${result.stderr}`,
      command: existsSync(log) ? JSON.parse(readFileSync(log, "utf8")) : null,
      createdResources: existsSync(join(root, "test-results/integration")),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("selects the requested workspace, profile and file without creating PG or Redis", () => {
  const result = runSelection([
    "--workspace",
    "@iam/worker",
    "--profile",
    "component",
    "--file",
    "apps/worker/test-integration/component/second.integration.test.ts",
  ]);
  expect(result).toMatchObject({
    exitCode: 0,
    createdResources: false,
    command: {
      args: [
        "exec",
        "turbo",
        "run",
        "test:integration:component",
        "--filter=@iam/worker",
        "--concurrency=2",
        "--no-daemon",
      ],
      selection: { "@iam/worker:component": ["test-integration/component/second.integration.test.ts"] },
    },
  });
});

test.each([
  [
    "--workspace",
    "@iam/worker",
    "--profile",
    "component",
    "--file",
    "test-integration/component/missing.integration.test.ts",
  ],
  ["--workspace", "@iam/worker", "--profile", "redis"],
  ["--workspace", "@iam/unknown", "--profile", "component"],
])("rejects an unmatched selection before running a task or creating resources: %j", (...args) => {
  const result = runSelection(args);
  expect(result).toMatchObject({ exitCode: 1, command: null, createdResources: false });
});

test("package resource runner rejects external URLs without this command's managed record", () => {
  const result = spawnSync("node", [packageEntry, "redis", "--", "bun", "test", "test-integration/redis"], {
    cwd: join(repoRoot, "apps/worker"),
    env: {
      ...process.env,
      IAM_WORKER_TEST_REDIS_URL: "redis://caller.invalid:1/0",
      IAM_TEST_RESOURCE_RECORD: "",
      IAM_TEST_RESOURCE_RUN_ID: "",
    },
    encoding: "utf8",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Use the root Integration entry to create managed resources");
});

test.skipIf(process.platform !== "win32")(
  "managed records remain atomic across a short Windows file lock",
  () => {
    const root = mkdtempSync(join(tmpdir(), "iam-record-lock-"));
    const locker = join(root, "locker.ps1");
    const ready = join(root, "lock-ready.txt");
    const driver = join(root, "driver.mjs");
    writeFileSync(
      locker,
      `param([string]$Target, [string]$Ready)
    $stream = [IO.File]::Open($Target, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::ReadWrite)
    try {[IO.File]::WriteAllText($Ready, "ready"); Start-Sleep -Milliseconds 350} finally {$stream.Dispose()}`,
    );
    writeFileSync(
      driver,
      `import {spawn} from "node:child_process"; import {existsSync} from "node:fs"; import {readFile} from "node:fs/promises"; import {join} from "node:path";
    import {createManagedResourceRun, saveManagedResourceRun} from ${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/test-resources/managed-resources.mjs")).href)};
    const run = await createManagedResourceRun({root: process.cwd(), composeFile: "compose.yaml"});
    const child = spawn(join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe"), ["-NoProfile", "-File", ${JSON.stringify(locker)}, join(run.root, run.recordPath), ${JSON.stringify(ready)}], {stdio: "ignore", windowsHide: true});
    const closed = new Promise((resolve, reject) => {child.once("error", reject); child.once("close", resolve);}); closed.catch(() => {});
    try {
      for (let attempt = 0; attempt < 200 && !existsSync(${JSON.stringify(ready)}); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
      if (!existsSync(${JSON.stringify(ready)})) throw new Error("File lock did not become ready");
      run.record.status = "ready"; await saveManagedResourceRun(run);
      const record = JSON.parse(await readFile(join(run.root, run.recordPath), "utf8"));
      if (record.status !== "ready") throw new Error("Record update was lost"); console.log("ATOMIC_RECORD_READY");
    } finally {child.kill(); await closed;}`,
    );
    try {
      const result = spawnSync(nodeExecutable, [driver], { cwd: root, encoding: "utf8", timeout: 8000 });
      expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
      expect(result.stdout).toContain("ATOMIC_RECORD_READY");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  10_000,
);

function runFailingFixture(failure: "setup" | "assertion" | "teardown" | "reset", profile = "postgres") {
  const root = mkdtempSync(join(tmpdir(), "iam-package-bail-"));
  const owner = join(root, "apps/worker");
  const testDirectory = join(owner, `test-integration/${profile}`);
  const artifacts = "test-results/integration/controlled-run";
  const record = `${artifacts}/run.json`;
  const log = join(root, "cases.log");
  mkdirSync(testDirectory, { recursive: true });
  mkdirSync(join(root, artifacts), { recursive: true });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  writeFileSync(join(owner, "package.json"), JSON.stringify({ name: "@iam/worker" }));
  writeFileSync(
    join(root, record),
    JSON.stringify({
      schemaVersion: 1,
      runId: "controlled-run",
      project: "iam-controlled-run",
      composeFile: "compose.yaml",
      artifactDirectory: artifacts,
      composeEnvironmentFile: `${artifacts}/compose.json`,
      envFile: `${artifacts}/empty.env`,
      testEnvironmentFile: `${artifacts}/environment.json`,
      services: ["postgres"],
      keep: false,
      status: "running",
      removeLocalImages: false,
      createdAt: "2026-10-14T00:00:00.000Z",
      durations: {},
    }),
  );
  const url = "postgres://test@127.0.0.1:1/controlled";
  writeFileSync(join(root, artifacts, "environment.json"), JSON.stringify({ IAM_WORKER_TEST_DATABASE_URL: url }));
  writeFileSync(
    join(testDirectory, "failure.integration.test.ts"),
    `
    import { beforeEach, afterEach, expect, test } from "bun:test";
    import { appendFileSync } from "node:fs";
    const record = (value) => appendFileSync(process.env.CASE_LOG, value + "\\n");
    let first = true;
    beforeEach(() => { if (first && process.env.FIXTURE_FAILURE === "setup") { record("setup failed"); throw new Error("setup failed"); } });
    afterEach(async () => { if (first) {
      first = false;
      if (process.env.FIXTURE_FAILURE === "teardown") { record("teardown failed"); throw new Error("teardown failed"); }
      if (process.env.FIXTURE_FAILURE === "reset") { await Promise.resolve(); record("reset failed"); throw new Error("reset failed"); }
    }});
    test("first case", () => { record("first case"); if (process.env.FIXTURE_FAILURE === "assertion") expect(1).toBe(2); });
    test("next case", () => { record("next case"); });
  `,
  );
  const pnpm = join(root, "pnpm.mjs");
  writeFileSync(
    pnpm,
    'import { spawnSync } from "node:child_process"; const result = spawnSync(process.env.RUNNER_BUN, process.argv.slice(4), { stdio: "inherit" }); process.exit(result.status ?? 1);',
  );
  try {
    const result = spawnSync(
      "node",
      [packageEntry, profile, "--", "bun", "test", "--max-concurrency=1", `test-integration/${profile}`],
      {
        cwd: owner,
        env: {
          ...process.env,
          npm_execpath: pnpm,
          RUNNER_BUN: process.execPath,
          IAM_TEST_RESOURCE_RUN_ID: profile === "postgres" ? "controlled-run" : "",
          IAM_TEST_RESOURCE_RECORD: profile === "postgres" ? record : "",
          IAM_WORKER_TEST_DATABASE_URL: profile === "postgres" ? url : "",
          IAM_TEST_INTEGRATION_SELECTION: "",
          FIXTURE_FAILURE: failure,
          CASE_LOG: log,
        },
        encoding: "utf8",
      },
    );
    return {
      exitCode: result.status,
      output: `${result.stdout}${result.stderr}`,
      entered: readFileSync(log, "utf8").trim().split("\n"),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test.each(["setup", "assertion", "teardown", "reset"] as const)(
  "resource runner stops before the next case after %s failure",
  (failure) => {
    const result = runFailingFixture(failure);
    expect(result.exitCode, result.output).toBe(1);
    expect(result.entered).not.toContain("next case");
    expect(result.output).toContain(failure === "assertion" ? "Expected: 2" : `${failure} failed`);
  },
);

test("a process profile stops after its first failure without requiring managed PG or Redis", () => {
  const result = runFailingFixture("assertion", "process");
  expect(result.exitCode, result.output).toBe(1);
  expect(result.entered).toEqual(["first case"]);
  expect(result.output).toContain("Expected: 2");
});

test("the mock browser runner preserves its project and file selection, and stops after its first failure", () => {
  const root = mkdtempSync(join(tmpdir(), "iam-playwright-bail-"));
  const owner = join(root, "apps/sso");
  const directory = join(owner, "test-integration/browser");
  const log = join(root, "cases.log");
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(owner, "node_modules/@playwright"), { recursive: true });
  symlinkSync(
    join(repoRoot, "apps/sso/node_modules/@playwright/test"),
    join(owner, "node_modules/@playwright/test"),
    process.platform === "win32" ? "junction" : "dir",
  );
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  writeFileSync(join(owner, "package.json"), JSON.stringify({ name: "@iam/sso" }));
  writeFileSync(
    join(owner, "playwright.config.cjs"),
    `module.exports = {testDir: "./test-integration/browser", reporter: "list", workers: 2, projects: [{name: "controlled-project"}]};`,
  );
  writeFileSync(
    join(directory, "selected.spec.ts"),
    `import { test, expect } from "@playwright/test"; import { appendFileSync } from "node:fs";
    test("first case", async ({}, testInfo) => {appendFileSync(${JSON.stringify(log)}, testInfo.project.name + "\\n"); expect(1).toBe(2);});
    test("next case", async () => {appendFileSync(${JSON.stringify(log)}, "next case\\n");});`,
  );
  writeFileSync(
    join(directory, "unselected.spec.ts"),
    `import { test } from "@playwright/test"; import { appendFileSync } from "node:fs";
    test("unselected", async () => {appendFileSync(${JSON.stringify(log)}, "unselected\\n");});`,
  );
  const pnpm = join(root, "pnpm.mjs");
  writeFileSync(
    pnpm,
    `import { spawnSync } from "node:child_process"; const result = spawnSync(process.execPath, [${JSON.stringify(join(repoRoot, "apps/sso/node_modules/@playwright/test/cli.js"))}, ...process.argv.slice(4)], {stdio: "inherit"}); process.exit(result.status ?? 1);`,
  );
  try {
    const result = spawnSync(
      nodeExecutable,
      [packageEntry, "browser", "--", "playwright", "test", "--config=playwright.config.cjs"],
      {
        cwd: owner,
        env: {
          ...process.env,
          npm_execpath: pnpm,
          IAM_TEST_RESOURCE_RUN_ID: "",
          IAM_TEST_RESOURCE_RECORD: "",
          IAM_TEST_INTEGRATION_SELECTION: JSON.stringify({
            "@iam/sso:browser": ["test-integration/browser/selected.spec.ts"],
          }),
        },
        encoding: "utf8",
      },
    );
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(1);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["controlled-project"]);
    expect(`${result.stdout}${result.stderr}`).toContain("Testing stopped early after 1 maximum allowed failures");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 15_000);

test("the root command and real package runner execute only the selected component file", () => {
  const root = mkdtempSync(join(tmpdir(), "iam-real-selection-"));
  const owner = join(root, "apps/worker");
  const directory = join(owner, "test-integration/component");
  const log = join(root, "cases.log");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "iam-monorepo", private: true, packageManager: "pnpm@12.5.1" }),
  );
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
  writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n\nimporters:\n  .: {}\n  apps/worker: {}\n");
  writeFileSync(join(root, "turbo.json"), readFileSync(join(repoRoot, "turbo.json"), "utf8"));
  const original = JSON.parse(readFileSync(join(repoRoot, "apps/worker/package.json"), "utf8"));
  const command = original.scripts["test:integration:component"].replaceAll(
    "../../scripts/",
    `${repoRoot.replaceAll("\\", "/")}/scripts/`,
  );
  writeFileSync(
    join(owner, "package.json"),
    JSON.stringify({ name: "@iam/worker", scripts: { "test:integration:component": command } }),
  );
  for (const name of ["first", "second"])
    writeFileSync(
      join(directory, `${name}.integration.test.ts`),
      `import { test } from "bun:test"; import { appendFileSync } from "node:fs"; test("${name}", () => appendFileSync(${JSON.stringify(log)}, "${name}\\n"));`,
    );
  const pnpm = join(root, "pnpm.mjs");
  writeFileSync(
    pnpm,
    `import { spawnSync } from "node:child_process"; const result = spawnSync(process.execPath, [${JSON.stringify(join(repoRoot, "node_modules/turbo/bin/turbo"))}, ...process.argv.slice(4)], { stdio: "inherit" }); process.exit(result.status ?? 1);`,
  );
  try {
    const result = spawnSync(
      "node",
      [
        entry,
        "--workspace",
        "@iam/worker",
        "--profile",
        "component",
        "--file",
        "test-integration/component/second.integration.test.ts",
      ],
      {
        cwd: root,
        env: { ...process.env, npm_execpath: pnpm, NO_COLOR: "1" },
        encoding: "utf8",
      },
    );
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["second"]);
    const anotherSelection = spawnSync(
      "node",
      [
        entry,
        "--workspace",
        "@iam/worker",
        "--profile",
        "component",
        "--file",
        "test-integration/component/first.integration.test.ts",
      ],
      {
        cwd: root,
        env: { ...process.env, npm_execpath: pnpm, NO_COLOR: "1" },
        encoding: "utf8",
      },
    );
    expect(anotherSelection.status, `${anotherSelection.stdout}${anotherSelection.stderr}`).toBe(0);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["second", "first"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 15_000);

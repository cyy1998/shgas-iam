import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPnpmCommand } from "../../run-pnpm-command.mjs";

const repoRoot = join(import.meta.dirname, "../../..");
const pnpmRecorderScript = join(import.meta.dirname, "fixtures/pnpm-recorder.mjs");
const turboBin = join(repoRoot, "node_modules/turbo/bin/turbo");
const verifyScript = join(repoRoot, "scripts/verify.mjs");
const verificationGateScript = join(repoRoot, "scripts/run-verification-gate.mjs");
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
function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
    packageManager: "pnpm@12.5.1",
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
    scripts: { "test:unit": 'node -e ""' },
  });
  writeJson(join(consumerRoot, "package.json"), {
    name: "@fixture/consumer",
    scripts: { "test:unit": 'node -e ""' },
    dependencies: { "@fixture/dependency": "workspace:*" },
  });
  writeFileSync(join(dependencyRoot, "src", "value.ts"), "export const value = 1;\n", "utf8");
  writeFileSync(join(consumerRoot, "src", "consumer.ts"), "export const consumer = true;\n", "utf8");
  return { root, dependencySource: join(dependencyRoot, "src", "value.ts") };
}

function runConsumerTestDryRun(root: string) {
  const result = Bun.spawnSync(
    [process.execPath, turboBin, "run", "test:unit", "--filter=@fixture/consumer", "--dry=json", "--no-daemon"],
    {
      cwd: root,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
    },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Turbo dry-run failed with ${result.exitCode}:\n${result.stdout.toString()}${result.stderr.toString()}`,
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
  for (const name of pnpmRecorderControlEnvNames) delete env[name];
  for (const [name, value] of Object.entries(options.environment ?? {})) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
  env[options.commandLogEnvName] = log;

  try {
    const result = spawnSync("node", [options.orchestrationScript, ...(options.args ?? [])], {
      cwd: repoRoot,
      env,
    });
    return {
      commands: existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [],
      exitCode: result.status,
      output: `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`,
      signal: result.signal,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runVerifyWithRecorder(failCommand?: string, args: string[] = []) {
  const result = runWithPnpmRecorder({
    args,
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
      IAM_VERIFICATION_GATE_FAIL_EXIT_CODE:
        options.failExitCode === undefined ? undefined : String(options.failExitCode),
      IAM_VERIFICATION_GATE_SIGNAL: options.signal,
      IAM_VERIFICATION_GATE_SIGNAL_COMMAND: options.signalCommand,
    },
    orchestrationScript: verificationGateScript,
    temporaryDirectoryPrefix: "iam-verification-gate-recorder-",
  });
}

describe("test orchestration", () => {
  test("propagates dependency source hashes without executing dependency tests", () => {
    const fixture = createTransitFixture();
    try {
      const before = runConsumerTestDryRun(fixture.root);
      writeFileSync(fixture.dependencySource, "export const value = 2;\n", "utf8");
      const after = runConsumerTestDryRun(fixture.root);

      expect(
        before.tasks
          .filter((task: { task: string }) => task.task === "test:unit")
          .map((task: { taskId: string }) => task.taskId),
      ).toEqual(["@fixture/consumer#test:unit"]);
      const beforeHash = before.tasks.find(
        (task: { taskId: string }) => task.taskId === "@fixture/consumer#test:unit",
      ).hash;
      const afterHash = after.tasks.find(
        (task: { taskId: string }) => task.taskId === "@fixture/consumer#test:unit",
      ).hash;
      expect(beforeHash).not.toBe(afterHash);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  test("Unit reuses its cache and reruns on dependency source changes without running dependency tests", () => {
    const fixture = createTransitFixture();
    try {
      writeFileSync(join(fixture.root, ".gitignore"), ".turbo/\nexecutions.log\n");
      const initialized = spawnSync("git", ["init", "--quiet"], { cwd: fixture.root, encoding: "utf8" });
      expect(initialized.status, initialized.stderr).toBe(0);
      const owner = join(fixture.root, "packages/consumer");
      const manifest = readJson(join(owner, "package.json"));
      manifest.scripts["test:unit"] = "node execute.cjs";
      writeJson(join(owner, "package.json"), manifest);
      writeFileSync(
        join(owner, "execute.cjs"),
        'require("node:fs").appendFileSync("../../executions.log", "consumer\\n");',
      );
      const run = () => {
        const result = Bun.spawnSync(
          [
            process.execPath,
            turboBin,
            "run",
            "test:unit",
            "--filter=@fixture/consumer",
            "--concurrency=2",
            "--no-daemon",
          ],
          { cwd: fixture.root, env: { ...process.env, NO_COLOR: "1", TURBO_TOKEN: undefined, TURBO_TEAM: undefined } },
        );
        expect(result.exitCode, result.stderr.toString()).toBe(0);
      };
      run();
      run();
      expect(readFileSync(join(fixture.root, "executions.log"), "utf8")).toBe("consumer\n");
      writeFileSync(fixture.dependencySource, "export const value = 2;\n");
      run();
      expect(readFileSync(join(fixture.root, "executions.log"), "utf8")).toBe("consumer\nconsumer\n");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test("launches a native package-manager entry directly and preserves its exit code", () => {
    const result = runPnpmCommand(process.execPath, ["-e", "process.exit(37)"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(37);
  });

  test("runs verify stages in the declared order", () => {
    expect(runVerifyWithRecorder()).toEqual({
      commands: [
        "format:check",
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

  test("runs only the five static checks through the public static entry", () => {
    const rootPackage = readJson(join(repoRoot, "package.json"));
    expect(rootPackage.scripts["verify:static"]).toBe("node scripts/verify.mjs --static");
    expect(runVerifyWithRecorder(undefined, ["--static"])).toEqual({
      commands: ["format:check", "lint", "check:docs", "check:env-names", "check:architecture"],
      exitCode: 0,
    });
  }, 15_000);

  test.each([[[]], [["--static"]]])(
    "blocks downstream commands on static guard failures with args %j",
    (args) => {
      expect(runVerifyWithRecorder("format:check", args)).toEqual({
        commands: ["format:check"],
        exitCode: 37,
      });
      expect(runVerifyWithRecorder("check:env-names", args)).toEqual({
        commands: ["format:check", "lint", "check:docs", "check:env-names"],
        exitCode: 37,
      });
      expect(runVerifyWithRecorder("check:architecture", args)).toEqual({
        commands: ["format:check", "lint", "check:docs", "check:env-names", "check:architecture"],
        exitCode: 37,
      });
    },
    15_000,
  );

  test.each([["--unknown"], ["static"], ["--static", "--static"], ["--static", "extra"]].map((args) => ({ args })))(
    "rejects invalid verify arguments before launching checks: %j",
    ({ args }) => {
      expect(runVerifyWithRecorder(undefined, args)).toEqual({ commands: [], exitCode: 1 });
    },
  );

  test("fails before checks when pnpm lifecycle context is missing", () => {
    const result = runWithPnpmRecorder({
      commandLogEnvName: "IAM_VERIFY_COMMAND_LOG",
      environment: { npm_execpath: undefined },
      orchestrationScript: verifyScript,
      temporaryDirectoryPrefix: "iam-verify-context-",
    });
    expect(result.commands).toEqual([]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("pnpm lifecycle script");
  });

  test("stops verify when the child entry cannot start", () => {
    const result = runWithPnpmRecorder({
      commandLogEnvName: "IAM_VERIFY_COMMAND_LOG",
      environment: { npm_execpath: join(repoRoot, "missing-pnpm-entry.mjs") },
      orchestrationScript: verifyScript,
      temporaryDirectoryPrefix: "iam-verify-launch-",
    });
    expect(result.commands).toEqual([]);
    expect(result.exitCode).toBe(1);
    expect(result.output).not.toContain("[verify] typecheck");
  });

  test("stops verify with a nonzero exit when a child terminates abnormally", () => {
    const result = runWithPnpmRecorder({
      commandLogEnvName: "IAM_VERIFY_COMMAND_LOG",
      environment: {
        IAM_VERIFICATION_GATE_SIGNAL_COMMAND: "lint",
        IAM_VERIFICATION_GATE_SIGNAL: "SIGTERM",
      },
      orchestrationScript: verifyScript,
      temporaryDirectoryPrefix: "iam-verify-signal-",
    });
    expect(result.commands).toEqual(["format:check", "lint"]);
    expect(result.exitCode).toBe(1);
    expect(result.signal).toBeNull();
  });

  test.each([[], ["unknown"], ["--ci"], ["ci", "extra"], ["release", "extra"]].map((args) => ({ args })))(
    "rejects invalid gate arguments before launching owner commands: %j",
    ({ args }) => {
      const result = runWithPnpmRecorder({
        args,
        commandLogEnvName: "IAM_VERIFICATION_GATE_COMMAND_LOG",
        orchestrationScript: verificationGateScript,
        temporaryDirectoryPrefix: "iam-verification-gate-args-",
      });
      expect(result.commands).toEqual([]);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("Usage:");
    },
  );

  test("runs the provider-neutral CI gate in owner-command order", () => {
    const rootPackage = readJson(join(repoRoot, "package.json"));

    expect(rootPackage.scripts["verify:ci"]).toBe("node scripts/run-verification-gate.mjs ci");
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

    expect(rootPackage.scripts["verify:release"]).toBe("node scripts/run-verification-gate.mjs release");
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
    } else {
      expect(result).toMatchObject({ exitCode: null, signal: "SIGTERM" });
    }
  }, 15_000);

  test("stops verify after the first failed stage command", () => {
    expect(runVerifyWithRecorder("test:unit")).toEqual({
      commands: [
        "format:check",
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
      commands: ["format:check", "lint", "check:docs", "check:env-names", "check:architecture"],
      exitCode: 37,
    });
  }, 15_000);
});

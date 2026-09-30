import { describe, expect, test } from "bun:test";
import { access, chmod, copyFile, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  copyFixtureToolLaunchers,
  runOwnedCommand,
  withCommandFixture,
} from "./command-fixture";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const pnpmCli = Reflect.get(Bun.env, "npm_execpath") as string | undefined;

function pnpmCommand(args: string[]) {
  if (!pnpmCli) throw new Error("quality CLI integration tests must be launched through pnpm");
  return [...(/\.(?:c?js|mjs)$/u.test(pnpmCli) ? [process.execPath, pnpmCli] : [pnpmCli]), ...args];
}

async function runPublicCommand(
  cwd: string,
  signal: AbortSignal,
  script: "format" | "format:check" | "lint" | "lint:fix" | "verify" | "verify:static",
) {
  return runOwnedCommand(pnpmCommand(["run", script]), cwd, signal);
}

async function writeFixtureFile(root: string, path: string, source: string) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source, "utf8");
}

async function initializeQualityFixture(root: string, signal: AbortSignal) {
  const rootManifest = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const workspaceManifest = JSON.parse(await readFile(join(repoRoot, "packages", "domain", "package.json"), "utf8"));
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "packages", "domain"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      {
        name: "quality-cli-fixture",
        packageManager: rootManifest.packageManager,
        private: true,
        scripts: {
          ...Object.fromEntries(
            ["format", "format:check", "lint", "lint:fix"].map((name) => [name, rootManifest.scripts[name]]),
          ),
          "check:architecture": 'node -e "process.exit(0)"',
          "check:docs": 'node -e "process.exit(0)"',
          "check:env-names": 'node -e "process.exit(0)"',
          "check:test-collection": 'node -e "process.exit(0)"',
          build: 'node -e "process.exit(0)"',
          "test:unit": 'node -e "process.exit(0)"',
          typecheck: 'node -e "process.exit(0)"',
          verify: rootManifest.scripts.verify,
          "verify:static": "node scripts/verify.mjs --static",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "packages", "domain", "package.json"),
    `${JSON.stringify(
      {
        name: "@fixture/domain",
        private: true,
        scripts: Object.fromEntries(
          ["format", "format:check", "lint", "lint:fix"].map((name) => [name, workspaceManifest.scripts[name]]),
        ),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\nverifyDepsBeforeRun: false\n", "utf8");
  for (const path of [
    "biome.jsonc",
    ".gitignore",
    ".prettierignore",
    ".prettierrc.json",
    "stylelint.config.mjs",
    "scripts/run-pnpm-command.mjs",
    "scripts/verify.mjs",
  ]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(join(repoRoot, path), join(root, path));
  }
  // Keep package-manager metadata fixture-owned; only tools resolve to the installed packages.
  for (const dependency of ["@biomejs/biome", "prettier", "stylelint", "stylelint-config-standard", "postcss-less"]) {
    const target = join(root, "node_modules", dependency);
    await mkdir(dirname(target), { recursive: true });
    await symlink(
      await realpath(join(repoRoot, "node_modules", dependency)),
      target,
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  await copyFixtureToolLaunchers(repoRoot, root, ["biome", "prettier", "stylelint"]);
  const initialized = await runOwnedCommand(["git", "init", "--quiet", "--initial-branch=main"], root, signal);
  expect(initialized.exitCode, initialized.output).toBe(0);
  const isolatedLineEndings = await runOwnedCommand(["git", "config", "core.autocrlf", "false"], root, signal);
  expect(isolatedLineEndings.exitCode, isolatedLineEndings.output).toBe(0);
  const localExcludesPath = join(root, ".git", "info", "exclude");
  const localExcludes = await readFile(localExcludesPath, "utf8");
  await writeFile(localExcludesPath, `${localExcludes}\nnode-compile-cache/\n`, "utf8");
}

async function runGit(root: string, signal: AbortSignal, ...args: string[]) {
  return runOwnedCommand(["git", ...args], root, signal);
}

async function commitAll(root: string, signal: AbortSignal, message: string) {
  const staged = await runGit(root, signal, "add", "--all");
  expect(staged.exitCode, staged.output).toBe(0);
  const committed = await runGit(
    root,
    signal,
    "-c",
    "user.name=Quality Fixture",
    "-c",
    "user.email=quality@example.test",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=.git/hooks",
    "commit",
    "--no-verify",
    "-m",
    message,
  );
  expect(committed.exitCode, committed.output).toBe(0);
}

async function expectReadonlyGitFailure(
  root: string,
  signal: AbortSignal,
  script: "verify" | "verify:static",
  path: string,
  diagnostic: string,
) {
  const candidate = await readFile(join(root, path), "utf8");
  const beforeHead = await runGit(root, signal, "rev-parse", "HEAD");
  expect(beforeHead.exitCode, beforeHead.output).toBe(0);
  const beforeStatus = await runGit(root, signal, "status", "--porcelain");
  expect(beforeStatus.exitCode, beforeStatus.output).toBe(0);
  expect(beforeStatus.output).toBe("(no output captured)");

  const result = await runPublicCommand(root, signal, script);
  expect(result.exitCode).not.toBe(0);
  expect(result.output).toContain(diagnostic);
  expect(await readFile(join(root, path), "utf8")).toBe(candidate);
  const afterHead = await runGit(root, signal, "rev-parse", "HEAD");
  expect(afterHead.exitCode, afterHead.output).toBe(0);
  expect(afterHead.output).toBe(beforeHead.output);
  const afterStatus = await runGit(root, signal, "status", "--porcelain");
  expect(afterStatus.exitCode, afterStatus.output).toBe(0);
  expect(afterStatus.output).toBe("(no output captured)");
}

async function withQualityFixture(runScenario: (root: string, signal: AbortSignal) => Promise<void>) {
  await withCommandFixture("iam-quality-cli-", async (root, signal) => {
    await initializeQualityFixture(root, signal);
    await runScenario(root, signal);
  });
}

describe("quality CLI", () => {
  test.each(["format:check", "lint", "verify", "verify:static"] as const)(
    "%s refuses unavailable dependencies without starting tools or rewriting the candidate",
    async (script) => {
      await withQualityFixture(async (root, signal) => {
        const configuration = await runOwnedCommand(
          pnpmCommand(["config", "get", "verifyDepsBeforeRun", "--json"]),
          repoRoot,
          signal,
        );
        expect(configuration.exitCode, configuration.output).toBe(0);
        const dependencyPolicy: unknown = JSON.parse(configuration.output.replaceAll("[stdout] ", "").trim());
        expect(dependencyPolicy).toBe("error");
        await writeFile(
          join(root, "pnpm-workspace.yaml"),
          `packages:\n  - packages/*\nverifyDepsBeforeRun: ${dependencyPolicy}\n`,
          "utf8",
        );

        const manifestPath = join(root, "package.json");
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        manifest.devDependencies = { "not-installed-fixture-dependency": "0.0.0" };
        const candidateManifest = `${JSON.stringify(manifest, null, 2)}\n`;
        await writeFile(manifestPath, candidateManifest, "utf8");
        const lockPath = join(root, "pnpm-lock.yaml");
        const candidateLock = await readFile(join(repoRoot, "pnpm-lock.yaml"), "utf8");
        await writeFile(lockPath, candidateLock, "utf8");
        for (const entry of ["format", "format:check", "lint", "lint:fix", "verify", "verify:static"]) {
          manifest.scripts[entry] =
            "node -e \"require('node:fs').writeFileSync('tool-started', 'started'); process.exit(91)\"";
        }
        const guardedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
        await writeFile(manifestPath, guardedManifest, "utf8");

        const result = await runPublicCommand(root, signal, script);
        expect(result.exitCode).not.toBe(0);
        expect(result.output).toContain("ERR_PNPM_VERIFY_DEPS_BEFORE_RUN");
        const remainingManifest = await readFile(manifestPath, "utf8");
        const remainingLock = await readFile(lockPath, "utf8");
        expect(remainingManifest).toBe(guardedManifest);
        expect(remainingLock).toBe(candidateLock);
        const started = await access(join(root, "tool-started")).then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(started).toMatchObject({ code: "ENOENT" });
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "keeps fixture package-manager metadata separate from the host installation",
    async () => {
      const hostMetadataPath = join(repoRoot, "node_modules", ".modules.yaml");
      const hostMetadata = await readFile(hostMetadataPath, "utf8");
      await withQualityFixture(async (root, signal) => {
        const fixtureMetadataPath = join(root, "node_modules", ".modules.yaml");
        const fixtureMetadata = "fixture_metadata: keep\n";
        await writeFile(fixtureMetadataPath, fixtureMetadata, "utf8");
        await writeFixtureFile(root, "value.ts", "export const value=1\n");
        const result = await runPublicCommand(root, signal, "format");
        expect(result.exitCode, result.output).toBe(0);
        const remainingFixtureMetadata = await readFile(fixtureMetadataPath, "utf8");
        expect(remainingFixtureMetadata).toBe(fixtureMetadata);
      });
      const remainingHostMetadata = await readFile(hostMetadataPath, "utf8");
      expect(remainingHostMetadata).toBe(hostMetadata);
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each([
    {
      path: "value.ts",
      source:
        "import { zebra } from './zebra.js'\nimport { alpha } from './alpha.js'\nexport const value={zebra,alpha}\n",
      expected: 'from "./zebra.js"',
    },
    { path: "value.json", source: '{"enabled":true,"count":1}\n', expected: '"enabled": true' },
    { path: "style.css", source: ".item{color:red;padding:0  1px}\n", expected: "color: red;" },
    { path: "style.less", source: "@tone:red;.item{color:@tone;}\n", expected: "@tone: red;" },
    { path: "config.yaml", source: "enabled:   true\nitems:\n - one\n", expected: "enabled: true" },
    { path: "notes.md", source: "# Notes\n\n-   one\n- two\n", expected: "- one" },
  ])(
    "formats $path once and remains idempotent",
    async ({ expected, path, source }) => {
      await withQualityFixture(async (root, signal) => {
        await writeFixtureFile(root, path, source);
        const rootFormat = await runPublicCommand(root, signal, "format");
        expect(rootFormat.exitCode, rootFormat.output).toBe(0);
        const onceFormatted = await readFile(join(root, path), "utf8");
        expect(onceFormatted).toContain(expected);
        if (path.endsWith(".ts")) expect(onceFormatted.indexOf("zebra")).toBeLessThan(onceFormatted.indexOf("alpha"));
        const secondFormat = await runPublicCommand(root, signal, "format");
        expect(secondFormat.exitCode, secondFormat.output).toBe(0);
        expect(await readFile(join(root, path), "utf8")).toBe(onceFormatted);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "workspace and root commands discover their own default scope",
    async () => {
      await withQualityFixture(async (root, signal) => {
        const source = "export const value={ enabled:true }\n";
        await writeFixtureFile(root, "root.ts", source);
        await writeFixtureFile(root, "packages/domain/src/workspace.ts", source);
        const prettierSources = {
          "style.less": ".item{color:red}\n",
          "notes.md": "# Notes\n\n-   one\n",
          "config.yaml": "enabled:   true\n",
        };
        for (const [path, prettierSource] of Object.entries(prettierSources)) {
          await writeFixtureFile(root, `root-${path}`, prettierSource);
          await writeFixtureFile(root, `packages/domain/src/${path}`, prettierSource);
          await writeFixtureFile(root, `packages/domain/generated/${path}`, prettierSource);
        }
        const workspaceFormat = await runPublicCommand(join(root, "packages", "domain"), signal, "format");
        expect(workspaceFormat.exitCode, workspaceFormat.output).toBe(0);
        expect(await readFile(join(root, "root.ts"), "utf8")).toBe(source);
        const workspaceFormatted = await readFile(join(root, "packages", "domain", "src", "workspace.ts"), "utf8");
        expect(workspaceFormatted).not.toBe(source);
        for (const [path, prettierSource] of Object.entries(prettierSources)) {
          expect(await readFile(join(root, `root-${path}`), "utf8")).toBe(prettierSource);
          expect(await readFile(join(root, "packages", "domain", "src", path), "utf8")).not.toBe(prettierSource);
          expect(await readFile(join(root, "packages", "domain", "generated", path), "utf8")).toBe(prettierSource);
        }

        const rootFormat = await runPublicCommand(root, signal, "format");
        expect(rootFormat.exitCode, rootFormat.output).toBe(0);
        expect(await readFile(join(root, "root.ts"), "utf8")).toBe(workspaceFormatted);
        for (const [path, prettierSource] of Object.entries(prettierSources)) {
          expect(await readFile(join(root, `root-${path}`), "utf8")).toBe(
            await readFile(join(root, "packages", "domain", "src", path), "utf8"),
          );
          expect(await readFile(join(root, "packages", "domain", "generated", path), "utf8")).toBe(prettierSource);
        }
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "root and workspace commands skip ignored Sandcastle worktrees",
    async () => {
      await withQualityFixture(async (root, signal) => {
        await writeFixtureFile(root, ".sandcastle/.gitignore", "worktrees/\n");
        const candidates = {
          ".sandcastle/worktrees/temporary/style.less": ".item { colour: red; }\n",
          ".sandcastle/worktrees/temporary/notes.md": "# Notes\n\n-   one\n",
          ".sandcastle/worktrees/temporary/config.yaml": "enabled:   true\n",
          ".sandcastle/worktrees/temporary/generated.ts": "export const generated={ value:1 }\n",
        };
        for (const [path, source] of Object.entries(candidates)) await writeFixtureFile(root, path, source);

        const ignored = await runGit(root, signal, "check-ignore", "--", ...Object.keys(candidates));
        expect(ignored.exitCode, ignored.output).toBe(0);
        for (const path of Object.keys(candidates)) expect(ignored.output).toContain(path);

        const rootLint = await runPublicCommand(root, signal, "lint");
        expect(rootLint.exitCode, rootLint.output).toBe(0);
        const rootFormat = await runPublicCommand(root, signal, "format");
        expect(rootFormat.exitCode, rootFormat.output).toBe(0);
        const workspaceRoot = join(root, "packages", "domain");
        const workspaceLint = await runPublicCommand(workspaceRoot, signal, "lint");
        expect(workspaceLint.exitCode, workspaceLint.output).toBe(0);
        const workspaceFormat = await runPublicCommand(workspaceRoot, signal, "format");
        expect(workspaceFormat.exitCode, workspaceFormat.output).toBe(0);

        for (const [path, source] of Object.entries(candidates)) {
          expect(await readFile(join(root, path), "utf8")).toBe(source);
        }
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "readonly checks preserve files while safe fixes organize imports idempotently",
    async () => {
      await withQualityFixture(async (root, signal) => {
        const path = "imports.ts";
        await writeFixtureFile(
          root,
          path,
          "import './setup-z.js'\nimport './setup-a.js'\nimport { zebra } from './zebra.js'\nimport { alpha } from './alpha.js'\nexport const value={zebra,alpha}\n",
        );
        const unformatted = await readFile(join(root, path), "utf8");
        const formatCheck = await runPublicCommand(root, signal, "format:check");
        expect(formatCheck.exitCode).not.toBe(0);
        expect(await readFile(join(root, path), "utf8")).toBe(unformatted);

        const formatted = await runPublicCommand(root, signal, "format");
        expect(formatted.exitCode, formatted.output).toBe(0);
        const beforeLint = await readFile(join(root, path), "utf8");
        const lint = await runPublicCommand(root, signal, "lint");
        expect(lint.exitCode).not.toBe(0);
        expect(await readFile(join(root, path), "utf8")).toBe(beforeLint);

        const fixed = await runPublicCommand(root, signal, "lint:fix");
        expect(fixed.exitCode, fixed.output).toBe(0);
        const onceFixed = await readFile(join(root, path), "utf8");
        expect(onceFixed.indexOf("setup-z")).toBeLessThan(onceFixed.indexOf("setup-a"));
        expect(onceFixed.indexOf("alpha")).toBeLessThan(
          onceFixed.indexOf("zebra", onceFixed.indexOf("import { alpha")),
        );
        const fixedAgain = await runPublicCommand(root, signal, "lint:fix");
        expect(fixedAgain.exitCode, fixedAgain.output).toBe(0);
        expect(await readFile(join(root, path), "utf8")).toBe(onceFixed);
        const cleanLint = await runPublicCommand(root, signal, "lint");
        expect(cleanLint.exitCode, cleanLint.output).toBe(0);

        await writeFixtureFile(root, "broken.ts", "export const broken = ;\n");
        const brokenBefore = await readFile(join(root, "broken.ts"), "utf8");
        const broken = await runPublicCommand(root, signal, "lint:fix");
        expect(broken.exitCode).not.toBe(0);
        expect(await readFile(join(root, "broken.ts"), "utf8")).toBe(brokenBefore);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "a normal non-fixable lint error remains unchanged and fails lint-fix",
    async () => {
      await withQualityFixture(async (root, signal) => {
        const path = "equality.ts";
        await writeFixtureFile(root, path, "export function matches(value: number) { return value == 1 }\n");
        const formatted = await runPublicCommand(root, signal, "format");
        expect(formatted.exitCode, formatted.output).toBe(0);
        const beforeFix = await readFile(join(root, path), "utf8");
        const fix = await runPublicCommand(root, signal, "lint:fix");
        expect(fix.exitCode).not.toBe(0);
        expect(await readFile(join(root, path), "utf8")).toBe(beforeFix);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "frontend TypeScript rules accept type aliases and reject interfaces",
    async () => {
      await withQualityFixture(async (root, signal) => {
        const accepted = "apps/admin/src/accepted.tsx";
        const rejected = "apps/admin/src/rejected.tsx";
        await writeFixtureFile(
          root,
          accepted,
          "type Props = { label: string }; export function Widget(props: Props) { return <div>{props.label}</div>; }\n",
        );
        const formatted = await runPublicCommand(root, signal, "format");
        expect(formatted.exitCode, formatted.output).toBe(0);
        const acceptedLint = await runPublicCommand(root, signal, "lint");
        expect(acceptedLint.exitCode, acceptedLint.output).toBe(0);
        await writeFixtureFile(
          root,
          rejected,
          "interface Props { label: string } export function Widget(props: Props) { return <div>{props.label}</div>; }\n",
        );
        const rejectedFormat = await runPublicCommand(root, signal, "format");
        expect(rejectedFormat.exitCode, rejectedFormat.output).toBe(0);
        const rejectedBefore = await readFile(join(root, rejected), "utf8");
        const rejectedLint = await runPublicCommand(root, signal, "lint");
        expect(rejectedLint.exitCode).not.toBe(0);
        expect(await readFile(join(root, rejected), "utf8")).toBe(rejectedBefore);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each(["verify", "verify:static"] as const)(
    "%s propagates format and lint failures without rewriting candidates",
    async (script) => {
      await withQualityFixture(async (root, signal) => {
        const path = "candidate.ts";
        await writeFixtureFile(root, path, "export const candidate = { enabled: true };\n");
        const cleanBaseline = await runPublicCommand(root, signal, script);
        expect(cleanBaseline.exitCode, cleanBaseline.output).toBe(0);
        expect(cleanBaseline.output).toContain("[verify] static");
        if (script === "verify") expect(cleanBaseline.output).toContain("[verify] build");

        await writeFixtureFile(root, path, "export const candidate={ enabled:true }\n");
        const unformatted = await readFile(join(root, path), "utf8");
        const formatFailure = await runPublicCommand(root, signal, script);
        expect(formatFailure.exitCode).not.toBe(0);
        expect(formatFailure.output).toContain("candidate.ts");
        expect(await readFile(join(root, path), "utf8")).toBe(unformatted);

        await writeFixtureFile(root, path, "export function matches(value: number) {\n  return value == 1;\n}\n");
        const formatCheck = await runPublicCommand(root, signal, "format:check");
        expect(formatCheck.exitCode, formatCheck.output).toBe(0);
        const directLint = await runPublicCommand(root, signal, "lint");
        expect(directLint.exitCode).not.toBe(0);
        expect(directLint.output).toContain("noDoubleEquals");
        const lintFailureBefore = await readFile(join(root, path), "utf8");
        const lintFailure = await runPublicCommand(root, signal, script);
        expect(lintFailure.exitCode).not.toBe(0);
        expect(lintFailure.output).toContain("noDoubleEquals");
        expect(await readFile(join(root, path), "utf8")).toBe(lintFailureBefore);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each([
    {
      config: "biome.jsonc",
      diagnostic: "noConsole",
      mutate: (source: string) => source.replace('"noConsole": "warn"', '"noConsole": "error"'),
      path: "apps/api/src/console.ts",
      source: 'console.log("message");\n',
      targetCheck: "lint" as const,
    },
    {
      config: ".prettierrc.json",
      diagnostic: "config.yaml",
      mutate: (source: string) => source.replace('"singleQuote": false', '"singleQuote": true'),
      path: "config.yaml",
      source: 'message: "true"\n',
      targetCheck: "format:check" as const,
    },
    {
      config: "stylelint.config.mjs",
      diagnostic: "color-named",
      mutate: (source: string) => source.replace("rules: {", 'rules: {\n    "color-named": "never",'),
      path: "style.less",
      source: ".item { color: red; }\n",
      targetCheck: "lint" as const,
    },
  ])(
    "$config changes invalidate a previous aggregate pass",
    async ({ config, diagnostic, mutate, path, source, targetCheck }) => {
      await withQualityFixture(async (root, signal) => {
        await writeFixtureFile(root, path, source);
        const formatted = await runPublicCommand(root, signal, "format");
        expect(formatted.exitCode, formatted.output).toBe(0);
        const cleanBaseline = await runPublicCommand(root, signal, "verify:static");
        expect(cleanBaseline.exitCode, cleanBaseline.output).toBe(0);

        const configPath = join(root, config);
        const originalConfig = await readFile(configPath, "utf8");
        const changedConfig = mutate(originalConfig);
        expect(changedConfig).not.toBe(originalConfig);
        await writeFile(configPath, changedConfig, "utf8");
        const candidateBeforeCheck = await readFile(join(root, path), "utf8");
        const targetFailure = await runPublicCommand(root, signal, targetCheck);
        expect(targetFailure.exitCode).not.toBe(0);
        expect(targetFailure.output).toContain(diagnostic);
        const changedResult = await runPublicCommand(root, signal, "verify:static");
        expect(changedResult.exitCode).not.toBe(0);
        expect(changedResult.output).toContain(diagnostic);
        expect(await readFile(join(root, path), "utf8")).toBe(candidateBeforeCheck);
        expect(await readFile(configPath, "utf8")).toBe(changedConfig);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "verify catches an unformatted commit created by explicitly bypassing hooks",
    async () => {
      await withQualityFixture(async (root, signal) => {
        await writeFixtureFile(root, "baseline.ts", "export const baseline = true;\n");
        const baseline = await runPublicCommand(root, signal, "verify");
        expect(baseline.exitCode, baseline.output).toBe(0);
        await commitAll(root, signal, "baseline");

        const hookMarker = join(root, "pre-commit-invoked");
        const hookPath = join(root, ".git", "hooks", "pre-commit");
        await writeFile(hookPath, "#!/bin/sh\nprintf invoked > pre-commit-invoked\nexit 97\n", "utf8");
        await chmod(hookPath, 0o700);
        await writeFixtureFile(root, "bypassed.ts", "export const bypassed={ enabled:true }\n");
        await commitAll(root, signal, "bypass hook");
        const markerError = await access(hookMarker).then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(markerError).toMatchObject({ code: "ENOENT" });

        await expectReadonlyGitFailure(root, signal, "verify", "bypassed.ts", "bypassed.ts");
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "an automatic merge skips pre-commit and aggregate verification catches the combined lint error",
    async () => {
      await withQualityFixture(async (root, signal) => {
        const path = "merged.ts";
        const base = [
          "export const base = 0;",
          "",
          'export const left = "left";',
          "",
          'export const right = "right";',
          "",
        ].join("\n");
        await writeFixtureFile(root, path, base);
        await commitAll(root, signal, "merge base");

        const featureBranch = await runGit(root, signal, "switch", "-c", "feature");
        expect(featureBranch.exitCode, featureBranch.output).toBe(0);
        await writeFixtureFile(root, path, `${base}export const collision = "feature";\n`);
        const featureFormat = await runPublicCommand(root, signal, "format:check");
        expect(featureFormat.exitCode, featureFormat.output).toBe(0);
        const featureLint = await runPublicCommand(root, signal, "lint");
        expect(featureLint.exitCode, featureLint.output).toBe(0);
        await commitAll(root, signal, "feature side");

        const mainBranch = await runGit(root, signal, "switch", "main");
        expect(mainBranch.exitCode, mainBranch.output).toBe(0);
        await writeFixtureFile(
          root,
          path,
          base.replace(
            'export const left = "left";',
            'export const collision = "main";\n\nexport const left = "left";',
          ),
        );
        const mainFormat = await runPublicCommand(root, signal, "format:check");
        expect(mainFormat.exitCode, mainFormat.output).toBe(0);
        const mainLint = await runPublicCommand(root, signal, "lint");
        expect(mainLint.exitCode, mainLint.output).toBe(0);
        await commitAll(root, signal, "main side");

        const hookPath = join(root, ".git", "hooks", "pre-commit");
        await writeFile(hookPath, "#!/bin/sh\nprintf invoked > pre-commit-invoked\nexit 97\n", "utf8");
        await chmod(hookPath, 0o700);
        const absentMergeHook = await access(join(root, ".git", "hooks", "pre-merge-commit")).then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(absentMergeHook).toMatchObject({ code: "ENOENT" });

        const merged = await runGit(
          root,
          signal,
          "-c",
          "user.name=Quality Fixture",
          "-c",
          "user.email=quality@example.test",
          "-c",
          "commit.gpgsign=false",
          "-c",
          "core.hooksPath=.git/hooks",
          "merge",
          "--no-ff",
          "--no-edit",
          "feature",
        );
        expect(merged.exitCode, merged.output).toBe(0);
        const markerError = await access(join(root, "pre-commit-invoked")).then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(markerError).toMatchObject({ code: "ENOENT" });

        await expectReadonlyGitFailure(root, signal, "verify:static", path, "noRedeclare");
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "lint skips YAML and Markdown semantics but reports Less rule failures",
    async () => {
      await withQualityFixture(async (root, signal) => {
        await writeFixtureFile(root, "config.yaml", "unknown_application_key: true\n");
        await writeFixtureFile(root, "notes.md", "Words without a prose policy.\n");
        await writeFixtureFile(root, "pnpm-lock.yaml", "lockfileVersion:   '9.0'\n");
        await writeFixtureFile(root, "asset.txt", "leave   this alone\n");
        await writeFixtureFile(root, "generated/output.ts", "export const generated={ value:1 }\n");

        const skippedLint = await runPublicCommand(root, signal, "lint");
        expect(skippedLint.exitCode, skippedLint.output).toBe(0);
        await writeFixtureFile(root, "invalid.less", ".item { colour: red; }\n");
        const lessLint = await runPublicCommand(root, signal, "lint");
        expect(lessLint.exitCode).not.toBe(0);
        const lessFix = await runPublicCommand(root, signal, "lint:fix");
        expect(lessFix.exitCode).not.toBe(0);

        const lockfileBefore = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
        const assetBefore = await readFile(join(root, "asset.txt"), "utf8");
        const generatedBefore = await readFile(join(root, "generated", "output.ts"), "utf8");
        const excludedFormat = await runPublicCommand(root, signal, "format");
        expect(excludedFormat.exitCode, excludedFormat.output).toBe(0);
        expect(await readFile(join(root, "pnpm-lock.yaml"), "utf8")).toBe(lockfileBefore);
        expect(await readFile(join(root, "asset.txt"), "utf8")).toBe(assetBefore);
        expect(await readFile(join(root, "generated", "output.ts"), "utf8")).toBe(generatedBefore);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );
});

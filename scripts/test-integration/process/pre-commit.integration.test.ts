import { describe, expect, test } from "bun:test";
import { copyFile, mkdir, readFile, realpath, rename, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  copyFixtureToolLaunchers,
  runOwnedCommand,
  withCommandFixture,
} from "./command-fixture";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

function cleanCommandOutput(output: string) {
  const cleaned = output.replace(/^\[(?:stdout|stderr)\] ?/gmu, "");
  return cleaned === "(no output captured)" ? "" : cleaned.replace(/\r?\n$/u, "");
}

async function writeFixtureFile(root: string, path: string, source: string) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source, "utf8");
}

async function runGit(root: string, signal: AbortSignal, args: string[]) {
  return runOwnedCommand(["git", "--no-optional-locks", ...args], root, signal);
}

async function expectGitSuccess(root: string, signal: AbortSignal, args: string[]) {
  const result = await runGit(root, signal, args);
  expect(result.exitCode, result.output).toBe(0);
  return result;
}

async function gitText(root: string, signal: AbortSignal, args: string[]) {
  return cleanCommandOutput((await expectGitSuccess(root, signal, args)).output);
}

async function commit(root: string, signal: AbortSignal, message: string) {
  return runGit(root, signal, ["commit", "--quiet", "-m", message]);
}

async function head(root: string, signal: AbortSignal) {
  return gitText(root, signal, ["rev-parse", "HEAD"]);
}

async function readGitFile(root: string, signal: AbortSignal, revision: string, path: string) {
  const object = revision === ":" ? `:${path}` : `${revision}:${path}`;
  return `${cleanCommandOutput((await expectGitSuccess(root, signal, ["show", object])).output)}\n`;
}

async function assertForbiddenCommandsWereNotRun(root: string) {
  const exists = await Bun.file(join(root, "forbidden-hook-command")).exists();
  expect(exists).toBe(false);
}

async function initializePreCommitFixture(root: string, signal: AbortSignal, initialFiles: Record<string, string>) {
  for (const path of [
    ".gitignore",
    ".prettierignore",
    ".prettierrc.json",
    "biome.jsonc",
    "lint-staged.config.mjs",
    "stylelint.config.mjs",
    ".husky/install.mjs",
    ".husky/pre-commit",
  ]) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(repoRoot, path), target);
  }

  await writeFixtureFile(
    root,
    "package.json",
    `${JSON.stringify(
      {
        name: "pre-commit-fixture",
        private: true,
        scripts: Object.fromEntries(
          ["build", "test", "typecheck"].map((name) => [
            name,
            "node -e \"require('node:fs').writeFileSync('forbidden-hook-command', process.argv[1]); process.exit(91)\"",
          ]),
        ),
      },
      null,
      2,
    )}\n`,
  );

  // The fixture owns its package-manager metadata. Each tool resolves through one package link only.
  for (const dependency of [
    "@biomejs/biome",
    "husky",
    "lint-staged",
    "postcss-less",
    "prettier",
    "stylelint",
    "stylelint-config-standard",
  ]) {
    const target = join(root, "node_modules", dependency);
    await mkdir(dirname(target), { recursive: true });
    await symlink(
      await realpath(join(repoRoot, "node_modules", dependency)),
      target,
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  await copyFixtureToolLaunchers(repoRoot, root, ["biome", "prettier", "stylelint"]);

  for (const [path, source] of Object.entries(initialFiles)) await writeFixtureFile(root, path, source);
  await expectGitSuccess(root, signal, ["init", "--quiet"]);
  await expectGitSuccess(root, signal, ["config", "user.name", "IAM Hook Test"]);
  await expectGitSuccess(root, signal, ["config", "user.email", "hook-test@example.invalid"]);
  await expectGitSuccess(root, signal, ["config", "core.autocrlf", "false"]);
  await expectGitSuccess(root, signal, ["add", "."]);
  const baseline = await commit(root, signal, "fixture baseline");
  expect(baseline.exitCode, baseline.output).toBe(0);

  const installed = await runOwnedCommand([process.execPath, ".husky/install.mjs"], root, signal);
  expect(installed.exitCode, installed.output).toBe(0);
  expect(await gitText(root, signal, ["config", "--get", "core.hooksPath"])).toBe(".husky/_");
  expect(await gitText(root, signal, ["status", "--short"])).toBe("");
}

async function withPreCommitFixture(
  runScenario: (root: string, signal: AbortSignal) => Promise<void>,
  initialFiles: Record<string, string> = {},
) {
  await withCommandFixture("iam-pre-commit-", async (root, signal) => {
    await initializePreCommitFixture(root, signal, initialFiles);
    await runScenario(root, signal);
    await assertForbiddenCommandsWereNotRun(root);
  });
}

describe("pre-commit hook", () => {
  test(
    "formats staged files, applies safe import fixes, and preserves bare import order",
    async () => {
      await withPreCommitFixture(async (root, signal) => {
        const path = "imports.ts";
        await writeFixtureFile(
          root,
          path,
          "import './setup-z.js'\nimport './setup-a.js'\nimport { zebra } from './zebra.js'\nimport { alpha } from './alpha.js'\nexport const value={zebra,alpha}\n",
        );
        await expectGitSuccess(root, signal, ["add", "--", path]);
        const before = await head(root, signal);

        const result = await commit(root, signal, "format imports");

        expect(result.exitCode, result.output).toBe(0);
        expect(await head(root, signal)).not.toBe(before);
        const committed = await readGitFile(root, signal, "HEAD", path);
        expect(committed.indexOf('import "./setup-z.js"')).toBeLessThan(committed.indexOf('import "./setup-a.js"'));
        expect(committed.indexOf("import { alpha }")).toBeLessThan(committed.indexOf("import { zebra }"));
        expect(committed).toContain("export const value = { zebra, alpha };");
        expect(await readFile(join(root, path), "utf8")).toBe(committed);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each([
    {
      name: "non-fixable lint error",
      path: "equality.ts",
      source: "export function matches(value: number) { return value == 1 }\n",
    },
    { name: "parse error", path: "broken.ts", source: "export const broken = ;\n" },
  ])(
    "keeps HEAD and the staged candidate intact after a $name",
    async ({ path, source }) => {
      await withPreCommitFixture(async (root, signal) => {
        await writeFixtureFile(root, path, source);
        await expectGitSuccess(root, signal, ["add", "--", path]);
        const before = await head(root, signal);

        const result = await commit(root, signal, "rejected candidate");

        expect(result.exitCode).not.toBe(0);
        expect(await head(root, signal)).toBe(before);
        expect(await readGitFile(root, signal, ":", path)).toBe(source);
        expect(await readFile(join(root, path), "utf8")).toBe(source);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "restores the staged candidate after a tool failure and commits after the tool returns",
    async () => {
      await withPreCommitFixture(async (root, signal) => {
        const path = "notes.md";
        const source = "# Notes\n\n-   one\n";
        await writeFixtureFile(root, path, source);
        await expectGitSuccess(root, signal, ["add", "--", path]);
        const before = await head(root, signal);
        const prettierLink = join(root, "node_modules", "prettier");
        const unavailableLink = join(root, "node_modules", "prettier-unavailable");
        await rename(prettierLink, unavailableLink);

        const failed = await commit(root, signal, "tool unavailable");

        expect(failed.exitCode).not.toBe(0);
        expect(await head(root, signal)).toBe(before);
        expect(await readGitFile(root, signal, ":", path)).toBe(source);
        expect(await readFile(join(root, path), "utf8")).toBe(source);

        await rename(unavailableLink, prettierLink);
        const recovered = await commit(root, signal, "tool restored");
        expect(recovered.exitCode, recovered.output).toBe(0);
        expect(await readGitFile(root, signal, "HEAD", path)).toBe("# Notes\n\n- one\n");
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "commits the staged hunk while preserving a distant unstaged hunk",
    async () => {
      await withPreCommitFixture(async (root, signal) => {
        const path = "partial.ts";
        const lines = Array.from({ length: 24 }, (_, index) => `  "line-${String(index + 1).padStart(2, "0")}",`);
        const baseline = `export const values = [\n${lines.join("\n")}\n];\n`;
        await writeFixtureFile(root, path, baseline);
        await expectGitSuccess(root, signal, ["add", "--", path]);
        expect((await commit(root, signal, "add partial fixture")).exitCode).toBe(0);

        const staged = baseline.replace('"line-02"', '"line-02-staged"');
        const working = staged.replace('"line-22"', '"line-22-unstaged"');
        await writeFixtureFile(root, path, staged);
        await expectGitSuccess(root, signal, ["add", "--", path]);
        await writeFixtureFile(root, path, working);

        const result = await commit(root, signal, "commit staged hunk");

        expect(result.exitCode, result.output).toBe(0);
        const committed = await readGitFile(root, signal, "HEAD", path);
        expect(committed).toContain('"line-02-staged"');
        expect(committed).toContain('"line-22"');
        expect(committed).not.toContain('"line-22-unstaged"');
        expect(await readFile(join(root, path), "utf8")).toBe(working);
        expect(await gitText(root, signal, ["status", "--short", "--", path])).toBe(
          `M ${path}`.padStart(path.length + 3),
        );
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "reports a real partial-restore conflict while preserving recoverable candidate content",
    async () => {
      await withPreCommitFixture(async (root, signal) => {
        const path = "conflict.ts";
        const baseline = "export const value = { alpha: 1 };\n";
        await writeFixtureFile(root, path, baseline);
        await expectGitSuccess(root, signal, ["add", "--", path]);
        expect((await commit(root, signal, "add conflict fixture")).exitCode).toBe(0);
        const before = await head(root, signal);

        const staged = "export const value={alpha:2}\n";
        const unstaged = "export const value={alpha:3}\n";
        await writeFixtureFile(root, path, staged);
        await expectGitSuccess(root, signal, ["add", "--", path]);
        await writeFixtureFile(root, path, unstaged);

        const result = await commit(root, signal, "trigger restore conflict");

        expect(result.exitCode).not.toBe(0);
        expect(result.output).toContain("Failed to restore unstaged changes!");
        expect(result.output).toContain("Unstaged changes have been kept back in a patch file:");
        expect(await head(root, signal)).toBe(before);
        const stagedAfter = await readGitFile(root, signal, ":", path);
        const workingAfter = await readFile(join(root, path), "utf8");
        expect(stagedAfter).toBe(staged);
        expect(workingAfter).toBe(unstaged);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "allows excluded and unsupported staged files without changing their content",
    async () => {
      await withPreCommitFixture(async (root, signal) => {
        const files = {
          "pnpm-lock.yaml": "lockfileVersion:   '9.0'\n",
          "asset.txt": "leave   this alone\n",
          "generated/ignored.less": ".item{colour:red}\n",
          ".sandcastle/worktrees/temporary/ignored.less": ".item{colour:red}\n",
          ".sandcastle/worktrees/temporary/ignored.md": "# Notes\n\n-   one\n",
          ".sandcastle/worktrees/temporary/ignored.yaml": "enabled:   true\n",
        };
        const paths = Object.keys(files);
        for (const [path, source] of Object.entries(files)) await writeFixtureFile(root, path, source);
        await expectGitSuccess(root, signal, ["add", "--", ...paths]);

        const result = await commit(root, signal, "excluded files");

        expect(result.exitCode, result.output).toBe(0);
        const committedPaths = (await gitText(root, signal, ["ls-tree", "-r", "--name-only", "HEAD", "--", ...paths]))
          .split(/\r?\n/u)
          .filter(Boolean)
          .sort();
        expect(committedPaths).toEqual([...paths].sort());
        const unchanged = await expectGitSuccess(root, signal, ["diff", "--exit-code", "HEAD", "--", ...paths]);
        expect(unchanged.output).toBe("(no output captured)");
        for (const [path, source] of Object.entries(files)) {
          expect(await readFile(join(root, path), "utf8")).toBe(source);
        }
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "handles staged paths containing spaces and Chinese characters",
    async () => {
      await withPreCommitFixture(async (root, signal) => {
        const path = "目录 空格/文件 name.ts";
        await writeFixtureFile(root, path, "export const value={ enabled:true }\n");
        await expectGitSuccess(root, signal, ["add", "--", path]);

        const result = await commit(root, signal, "unicode path");

        expect(result.exitCode, result.output).toBe(0);
        expect(await readGitFile(root, signal, "HEAD", path)).toBe("export const value = { enabled: true };\n");
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "formats added and renamed files while accepting a staged deletion",
    async () => {
      const renameBaseline = `export const values = [\n${Array.from(
        { length: 12 },
        (_, index) => `  "keep-${String(index + 1).padStart(2, "0")}",`,
      ).join("\n")}\n];\nexport const renamed = true;\n`;
      await withPreCommitFixture(
        async (root, signal) => {
          await writeFixtureFile(root, "added.ts", "export const added={ enabled:true }\n");
          await unlink(join(root, "delete.ts"));
          await rename(join(root, "rename-before.ts"), join(root, "rename after.ts"));
          await writeFixtureFile(
            root,
            "rename after.ts",
            renameBaseline.replace("export const renamed = true;", "export const renamed={ enabled:true }"),
          );
          await expectGitSuccess(root, signal, ["add", "--all"]);
          const stagedNames = await gitText(root, signal, ["diff", "--cached", "--name-status", "-M"]);
          expect(stagedNames).toMatch(/^R\d+\trename-before\.ts\trename after\.ts$/mu);

          const result = await commit(root, signal, "add delete rename");

          expect(result.exitCode, result.output).toBe(0);
          expect(await readGitFile(root, signal, "HEAD", "added.ts")).toBe("export const added = { enabled: true };\n");
          const renamed = await readGitFile(root, signal, "HEAD", "rename after.ts");
          expect(renamed).toContain('"keep-12"');
          expect(renamed).toContain("export const renamed = { enabled: true };");
          const deleted = await runGit(root, signal, ["cat-file", "-e", "HEAD:delete.ts"]);
          expect(deleted.exitCode).not.toBe(0);
          expect(await gitText(root, signal, ["status", "--short"])).toBe("");
        },
        { "delete.ts": "export const removed = true;\n", "rename-before.ts": renameBaseline },
      );
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "a staged configuration change does not expand checks to unstaged repository files",
    async () => {
      await withPreCommitFixture(async (root, signal) => {
        const outsidePath = "outside.ts";
        const baseline = "export const outside = true;\n";
        await writeFixtureFile(root, outsidePath, baseline);
        await expectGitSuccess(root, signal, ["add", "--", outsidePath]);
        expect((await commit(root, signal, "add outside fixture")).exitCode).toBe(0);

        const invalidUnstaged = "export const outside = ;\n";
        await writeFixtureFile(root, outsidePath, invalidUnstaged);
        const prettierConfigPath = join(root, ".prettierrc.json");
        const prettierConfig = JSON.parse(await readFile(prettierConfigPath, "utf8"));
        prettierConfig.printWidth = 100;
        await writeFile(prettierConfigPath, `${JSON.stringify(prettierConfig, null, 2)}\n`, "utf8");
        await expectGitSuccess(root, signal, ["add", "--", ".prettierrc.json"]);

        const result = await commit(root, signal, "change formatting config");

        expect(result.exitCode, result.output).toBe(0);
        expect(await readGitFile(root, signal, "HEAD", outsidePath)).toBe(baseline);
        expect(await readFile(join(root, outsidePath), "utf8")).toBe(invalidUnstaged);
        expect(await gitText(root, signal, ["status", "--short", "--", outsidePath])).toBe(
          `M ${outsidePath}`.padStart(outsidePath.length + 3),
        );
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "blocks staged trailing whitespace after quality tools finish",
    async () => {
      await withPreCommitFixture(async (root, signal) => {
        const path = "whitespace.txt";
        const source = "trailing spaces  \n";
        await writeFixtureFile(root, path, source);
        await expectGitSuccess(root, signal, ["add", "--", path]);
        const before = await head(root, signal);

        const result = await commit(root, signal, "trailing whitespace");

        expect(result.exitCode).not.toBe(0);
        expect(result.output).toContain("trailing whitespace");
        expect(await head(root, signal)).toBe(before);
        expect(await readGitFile(root, signal, ":", path)).toBe(source);
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );
});

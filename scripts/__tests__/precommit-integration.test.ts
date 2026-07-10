import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const sourceRoot = join(import.meta.dirname, "..", "..");
const fixtureRoots: string[] = [];
const checkCommand = "pnpm run check:openspec --staged";

afterAll(() => {
  for (const root of fixtureRoots) rmSync(root, { force: true, recursive: true });
});

describe("OpenSpec pre-commit integration", () => {
  test("routes staged files, blocks invalid archives, and preserves partial staging", async () => {
    const root = await createRepositoryFixture();

    write(root, "apps/api/ordinary.ts", "export const ordinary = true;\n");
    await mustRun(root, ["git", "add", "apps/api/ordinary.ts"]);
    const ordinaryCommit = await run(root, ["git", "commit", "-m", "ordinary code"]);
    expect(ordinaryCommit.exitCode).toBe(0);
    expect(combinedOutput(ordinaryCommit)).not.toContain("OpenSpec strict validation");
    expect(countOccurrences(combinedOutput(ordinaryCommit), checkCommand)).toBe(0);
    const lockfileDiff = (await mustRun(root, ["git", "diff", "--", "pnpm-lock.yaml"])).stdout;
    if (lockfileDiff) throw new Error(`ordinary pre-commit changed pnpm-lock.yaml:\n${lockfileDiff}`);

    append(root, "openspec/specs/example/spec.md", "\n<!-- valid staged edit -->\n");
    append(root, "openspec/changes/archive/2026-07-10-valid-change/proposal.md", "\nValid edit.\n");
    await mustRun(root, [
      "git",
      "add",
      "openspec/specs/example/spec.md",
      "openspec/changes/archive/2026-07-10-valid-change/proposal.md",
    ]);
    const sensitiveCommit = await run(root, ["git", "commit", "-m", "valid OpenSpec edit"]);
    expectSuccess(sensitiveCommit, "sensitive commit");
    expect(countOccurrences(combinedOutput(sensitiveCommit), checkCommand)).toBe(1);

    const invalidArchive = "openspec/changes/archive/2026-07-11-invalid-archive";
    write(root, `${invalidArchive}/proposal.md`, "# Incomplete archive\n");
    await mustRun(root, ["git", "add", invalidArchive]);
    const beforeInvalidHead = (await mustRun(root, ["git", "rev-parse", "HEAD"])).stdout;
    const beforeInvalidIndex = (await mustRun(root, ["git", "diff", "--cached", "--binary"])).stdout;
    const beforeInvalidStatus = (await mustRun(root, ["git", "status", "--porcelain=v1", "-z"])).stdout;

    const invalidCommit = await run(root, ["git", "commit", "-m", "invalid archive"]);

    expect(invalidCommit.exitCode).not.toBe(0);
    expect(combinedOutput(invalidCommit)).toContain("required-design");
    expect((await mustRun(root, ["git", "rev-parse", "HEAD"])).stdout).toBe(beforeInvalidHead);
    expect((await mustRun(root, ["git", "diff", "--cached", "--binary"])).stdout).toBe(beforeInvalidIndex);
    expect((await mustRun(root, ["git", "status", "--porcelain=v1", "-z"])).stdout).toBe(beforeInvalidStatus);
    expect(read(root, `${invalidArchive}/proposal.md`)).toBe("# Incomplete archive\n");

    await mustRun(root, ["git", "rm", "--cached", "-r", "--", invalidArchive]);
    rmSync(join(root, invalidArchive), { force: true, recursive: true });

    const specPath = "openspec/specs/example/spec.md";
    const originalSpec = read(root, specPath);
    const stagedSpec = `<!-- staged marker -->\n${originalSpec}`;
    const workingSpec = `${stagedSpec}\n<!-- unstaged marker -->\n`;
    write(root, specPath, stagedSpec);
    await mustRun(root, ["git", "add", specPath]);
    write(root, specPath, workingSpec);

    const partialCommit = await run(root, ["git", "commit", "-m", "partial OpenSpec edit"]);

    expectSuccess(partialCommit, "partial commit");
    expect(countOccurrences(combinedOutput(partialCommit), checkCommand)).toBe(1);
    expect((await mustRun(root, ["git", "show", `HEAD:${specPath}`])).stdout).toBe(stagedSpec);
    expect(read(root, specPath)).toBe(workingSpec);
    expect((await run(root, ["git", "diff", "--cached", "--quiet"])).exitCode).toBe(0);

    write(root, specPath, stagedSpec);
    const proposalPath = "openspec/changes/archive/2026-07-10-valid-change/proposal.md";
    append(root, proposalPath, "\nStaged while another sensitive file is untracked.\n");
    await mustRun(root, ["git", "add", proposalPath]);
    write(root, "openspec/untracked-sensitive-note.md", "untracked\n");
    const beforeConflictIndex = (await mustRun(root, ["git", "diff", "--cached", "--binary"])).stdout;
    const beforeConflictStatus = (await mustRun(root, ["git", "status", "--porcelain=v1", "-z"])).stdout;

    const conflictCommit = await run(root, ["git", "commit", "-m", "conflicting OpenSpec edit"]);

    expect(conflictCommit.exitCode).not.toBe(0);
    expect(combinedOutput(conflictCommit)).toContain("OpenSpec staged check blocked");
    expect((await mustRun(root, ["git", "diff", "--cached", "--binary"])).stdout).toBe(beforeConflictIndex);
    expect((await mustRun(root, ["git", "status", "--porcelain=v1", "-z"])).stdout).toBe(beforeConflictStatus);
  }, 180_000);
});

async function createRepositoryFixture(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "openspec-precommit-"));
  fixtureRoots.push(root);

  write(root, ".gitignore", "node_modules\n");
  write(root, "package.json", `${JSON.stringify({
    name: "openspec-precommit-fixture",
    private: true,
    packageManager: "pnpm@11.5.0",
    scripts: {
      "check:openspec": "bun scripts/check-openspec.ts",
      precommit: "nano-staged --config nano-staged.mjs",
    },
    "simple-git-hooks": {
      "pre-commit": "pnpm precommit",
      preserveUnused: true,
    },
  }, null, 2)}\n`);
  write(root, "pnpm-lock.yaml", `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .: {}
`);

  for (const file of [
    "nano-staged.mjs",
    "scripts/check-openspec.ts",
    "scripts/check-openspec-archive-integrity.ts",
    "scripts/install-git-hooks.mjs",
    "openspec/config.yaml",
  ]) {
    copy(root, file);
  }
  const nanoStagedRoot = realpathSync(join(sourceRoot, "node_modules", "nano-staged"));
  const openSpecRoot = realpathSync(join(sourceRoot, "node_modules", "@fission-ai", "openspec"));
  const simpleGitHooksRoot = realpathSync(join(sourceRoot, "node_modules", "simple-git-hooks"));
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  symlinkSync(simpleGitHooksRoot, join(root, "node_modules", "simple-git-hooks"), "dir");
  writeExecutable(
    root,
    "node_modules/.bin/nano-staged",
    `#!/bin/sh\nexec node ${JSON.stringify(join(nanoStagedRoot, "lib", "bin.js"))} \"$@\"\n`,
  );
  writeExecutable(
    root,
    "node_modules/.bin/openspec",
    `#!/bin/sh\nexec node ${JSON.stringify(join(openSpecRoot, "bin", "openspec.js"))} \"$@\"\n`,
  );

  const spec = readFileSync(
    join(sourceRoot, "openspec", "specs", "api-error-handling", "spec.md"),
    "utf8",
  );
  write(root, "openspec/specs/example/spec.md", spec);
  write(root, "openspec/archive-integrity-waivers.json", "{\n  \"waivers\": []\n}\n");
  write(root, "openspec/changes/archive/2026-07-10-valid-change/.openspec.yaml", "schema: spec-driven\ncreated: 2026-07-10\n");
  write(root, "openspec/changes/archive/2026-07-10-valid-change/proposal.md", "# Proposal\n");
  write(root, "openspec/changes/archive/2026-07-10-valid-change/design.md", "# Design\n");
  write(root, "openspec/changes/archive/2026-07-10-valid-change/tasks.md", "- [x] complete\n");
  write(root, "openspec/changes/archive/2026-07-10-valid-change/specs/example/spec.md", spec);

  await mustRun(root, ["git", "init", "--quiet"]);
  await mustRun(root, ["git", "config", "user.email", "codex@example.invalid"]);
  await mustRun(root, ["git", "config", "user.name", "Codex Fixture"]);
  await mustRun(root, ["git", "add", "."]);
  await mustRun(root, ["git", "commit", "--quiet", "--no-verify", "-m", "fixture baseline"]);
  await mustRun(root, ["node", "scripts/install-git-hooks.mjs"]);
  return root;
}

function copy(root: string, file: string): void {
  const destination = join(root, file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(sourceRoot, file), destination);
}

function write(root: string, file: string, content: string): void {
  const destination = join(root, file);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function writeExecutable(root: string, file: string, content: string): void {
  write(root, file, content);
  chmodSync(join(root, file), 0o755);
}

function append(root: string, file: string, content: string): void {
  write(root, file, read(root, file) + content);
}

function read(root: string, file: string): string {
  return readFileSync(join(root, file), "utf8");
}

async function mustRun(root: string, command: string[]): Promise<CommandResult> {
  const result = await run(root, command);
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed:\n${combinedOutput(result)}`);
  }
  return result;
}

async function run(root: string, command: string[]): Promise<CommandResult> {
  const subprocess = Bun.spawn({
    cmd: command,
    cwd: root,
    env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);
  return { exitCode, stderr, stdout };
}

function combinedOutput(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`;
}

function countOccurrences(text: string, value: string): number {
  return text.split(value).length - 1;
}

function expectSuccess(result: CommandResult, label: string): void {
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${result.exitCode}:\n${combinedOutput(result)}`);
  }
}

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

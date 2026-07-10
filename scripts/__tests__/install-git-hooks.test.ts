import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = join(import.meta.dirname, "..", "..");
const installer = join(repoRoot, "scripts", "install-git-hooks.mjs");
const fixtureRoots: string[] = [];

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("install-git-hooks", () => {
  test("skips safely when Git metadata is absent", async () => {
    const root = createFixtureRoot();

    const result = await run(root, ["node", installer]);

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "Git hook installation skipped: no .git metadata found.\n",
    });
  });

  test("installs pre-commit without deleting another hook type", async () => {
    const root = createFixtureRoot();
    expect(Bun.spawnSync({ cmd: ["git", "init", "--quiet"], cwd: root }).exitCode).toBe(0);
    writeFileSync(join(root, "package.json"), JSON.stringify({
      "simple-git-hooks": {
        "pre-commit": "pnpm precommit",
        preserveUnused: true,
      },
    }));
    const prePushPath = join(root, ".git", "hooks", "pre-push");
    writeFileSync(prePushPath, "#!/bin/sh\necho existing\n");
    chmodSync(prePushPath, 0o755);

    const result = await run(root, ["node", installer]);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(root, ".git", "hooks", "pre-commit"), "utf8")).toContain("pnpm precommit");
    expect(readFileSync(prePushPath, "utf8")).toBe("#!/bin/sh\necho existing\n");
  });
});

function createFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "git-hook-installer-"));
  fixtureRoots.push(root);
  return root;
}

async function run(root: string, command: string[]): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const subprocess = Bun.spawn({
    cmd: command,
    cwd: root,
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

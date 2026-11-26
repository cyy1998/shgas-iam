import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BindMountCreateOptions,
  type BindMountSandboxHandle,
  createBindMountSandboxProvider,
} from "@ai-hero/sandcastle";
import { command } from "../command.ts";
import {
  preflightCredentials,
  readonlySandbox,
  readReviewCache,
  resolvePromptFile,
  writeReviewCache,
} from "../sandbox.ts";
import { phases } from "../types.ts";

const sha1 = "1".repeat(40);
const sha2 = "2".repeat(40);

async function expectReject(operation: () => Promise<unknown>): Promise<Error> {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  return caught as Error;
}

async function withGitDir(run: (cwd: string) => Promise<void>) {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-sandbox-"));
  try {
    await command("git", ["init", "-b", "main", cwd], cwd);
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("readonlySandbox wraps a BindMountSandboxProvider via public API and marks every mount readonly", async () => {
  let received: BindMountCreateOptions | undefined;
  const fakeHandle: BindMountSandboxHandle = {
    worktreePath: "/home/agent/workspace",
    exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
    copyFileIn: async () => {},
    copyFileOut: async () => {},
    close: async () => {},
  };
  const base = createBindMountSandboxProvider({
    name: "fake-docker",
    env: { FOO: "bar" },
    sandboxHomedir: "/home/agent",
    create: async (options) => {
      received = options;
      return fakeHandle;
    },
  });

  const wrapped = readonlySandbox(base);
  expect(wrapped.name).toBe("fake-docker");
  expect(wrapped.env).toEqual({ FOO: "bar" });
  expect(wrapped.sandboxHomedir).toBe("/home/agent");
  expect("tag" in wrapped && wrapped.tag).toBe("bind-mount");

  const inputMounts = [
    { hostPath: "/tmp/wt", sandboxPath: "/home/agent/workspace" },
    { hostPath: "/tmp/repo/.git", sandboxPath: "/home/agent/repo/.git", readonly: false },
    { hostPath: "/tmp/auth", sandboxPath: "/home/agent/.codex", readonly: true },
  ];
  const createFn = (wrapped as unknown as { create: (opts: BindMountCreateOptions) => Promise<BindMountSandboxHandle> })
    .create;
  const handle = await createFn({
    worktreePath: "/tmp/wt",
    hostRepoPath: "/tmp/repo",
    mounts: inputMounts,
    env: { FOO: "bar" },
  });

  expect(handle).toBe(fakeHandle);
  expect(received?.mounts).toEqual([
    { hostPath: "/tmp/wt", sandboxPath: "/home/agent/workspace", readonly: true },
    { hostPath: "/tmp/repo/.git", sandboxPath: "/home/agent/repo/.git", readonly: true },
    { hostPath: "/tmp/auth", sandboxPath: "/home/agent/.codex", readonly: true },
  ]);
  // Original mount objects must not be mutated.
  expect(inputMounts[0]?.readonly).toBeUndefined();
  expect(inputMounts[1]?.readonly).toBe(false);
});

test("preflightCredentials allows safe .sandcastle/.env and clean remotes, and rejects GH_TOKEN/GITHUB_TOKEN (including empty values)", async () => {
  await withGitDir(async (cwd) => {
    await command("git", ["remote", "add", "origin", "https://github.com/cyy1998/shgas-iam.git"], cwd);
    await command("git", ["remote", "add", "ssh-origin", "ssh://git@github.com/cyy1998/shgas-iam.git"], cwd);

    // No .sandcastle/.env -> passes.
    await preflightCredentials(cwd, "origin");

    // Safe .sandcastle/.env (including commented GH_TOKEN) -> passes.
    await mkdir(join(cwd, ".sandcastle"), { recursive: true });
    await writeFile(
      join(cwd, ".sandcastle", ".env"),
      ["# GH_TOKEN=commented-out", "CODEX_AUTH=chatgpt", "SANDCASTLE_IMAGE=iam-sandcastle:local", ""].join("\n"),
    );
    await preflightCredentials(cwd, "origin");

    // Forbidden entries — including empty values that cause SDK resolveEnv() to fall back to process.env.
    for (const line of [
      "GH_TOKEN=ghp_12345",
      "GITHUB_TOKEN=ghp_67890",
      "GH_TOKEN=",
      "GITHUB_TOKEN=",
      'GH_TOKEN=""',
      "export GITHUB_TOKEN=",
    ]) {
      await writeFile(join(cwd, ".sandcastle", ".env"), `CODEX_AUTH=chatgpt\n${line}\n`);
      const err = await expectReject(() => preflightCredentials(cwd, "origin"));
      expect(err.message).toMatch(/GH_TOKEN|GITHUB_TOKEN/);
    }
  });
});

test("preflightCredentials rejects embedded credentials in .git/config remote URLs", async () => {
  for (const badUrl of [
    "https://user:pass@github.com/cyy1998/shgas-iam.git",
    "https://ghp_secret@github.com/cyy1998/shgas-iam.git",
    "ssh://git:secret@github.com/cyy1998/shgas-iam.git",
  ]) {
    await withGitDir(async (cwd) => {
      await command("git", ["remote", "add", "origin", badUrl], cwd);
      const err = await expectReject(() => preflightCredentials(cwd, "origin"));
      expect(err.message.toLowerCase()).toContain("credential");
    });
  }

  await withGitDir(async (cwd) => {
    await command("git", ["remote", "add", "origin", "https://github.com/cyy1998/shgas-iam.git"], cwd);
    await command(
      "git",
      ["remote", "set-url", "--push", "origin", "https://token@github.com/cyy1998/shgas-iam.git"],
      cwd,
    );
    const err = await expectReject(() => preflightCredentials(cwd, "origin"));
    expect(err.message.toLowerCase()).toContain("credential");
  });
});

test("readReviewCache and writeReviewCache persist reports keyed solely by candidate SHA in a single JSON file", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-cache-"));
  try {
    expect(await readReviewCache(cwd, sha1)).toBeUndefined();

    await writeReviewCache(cwd, {
      candidateSha: sha1,
      standards: "Standards: no issues",
      spec: "Spec: all acceptance criteria met",
    });

    const hit1 = await readReviewCache(cwd, sha1);
    expect(hit1).toMatchObject({
      candidateSha: sha1,
      standards: "Standards: no issues",
      spec: "Spec: all acceptance criteria met",
    });
    expect(await readReviewCache(cwd, sha2)).toBeUndefined();

    await writeReviewCache(cwd, {
      candidateSha: sha2,
      standards: "Standards 2",
      spec: "Spec 2",
    });
    expect((await readReviewCache(cwd, sha1))?.standards).toBe("Standards: no issues");
    expect((await readReviewCache(cwd, sha2))?.standards).toBe("Standards 2");

    // Verify single JSON file under .sandcastle/state/.
    const raw = JSON.parse(await readFile(join(cwd, ".sandcastle", "state", "review-cache.json"), "utf8"));
    expect(Object.keys(raw.entries).sort()).toEqual([sha1, sha2]);

    // Invalid SHA is rejected.
    const badShaErr = await expectReject(() => readReviewCache(cwd, "not-a-sha"));
    expect(badShaErr.message).toContain("SHA");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("resolvePromptFile prefers promptsDir/<phase>.md and falls back to built-in templates with expected placeholders", async () => {
  const customDir = await mkdtemp(join(tmpdir(), "sandcastle-prompts-"));
  try {
    const customImplement = join(customDir, "implement.md");
    await writeFile(customImplement, "# Custom implement prompt\n{{TICKET}}\n");

    expect(await resolvePromptFile("implement", customDir)).toBe(customImplement);

    const seenPlaceholders = new Set<string>();
    for (const phase of phases) {
      const resolved = await resolvePromptFile(phase, phase === "implement" ? undefined : customDir);
      expect(resolved.endsWith(`/prompts/${phase}.md`)).toBe(true);
      const content = await readFile(resolved, "utf8");
      expect(content.trim().length).toBeGreaterThan(0);
      for (const [, key] of content.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)) {
        if (key) seenPlaceholders.add(key);
      }
    }

    for (const required of [
      "SPEC",
      "TICKET",
      "TICKETS",
      "BASE_SHA",
      "CANDIDATE_SHA",
      "REVIEW_REPORT",
      "CONFLICT_BASE",
      "ROLE_INSTRUCTIONS",
    ]) {
      expect(seenPlaceholders.has(required)).toBe(true);
    }
  } finally {
    await rm(customDir, { recursive: true, force: true });
  }
});

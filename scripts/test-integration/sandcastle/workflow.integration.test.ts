import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareCodexAuth } from "../../sandcastle/auth";
import { command, deleteMergedTicketBranch } from "../../sandcastle/commands";

describe("Sandcastle merged ticket cleanup", () => {
  test.each(["merged", "unmerged", "advanced", "checked-out", "other-branch"])(
    "handles %s branches without losing recovery work",
    async (scenario) => {
      const directory = await mkdtemp(join(tmpdir(), "iam-afk-branch-test-"));
      const git = (...args: string[]) => command("git", args, directory);
      const branch = scenario === "other-branch" ? "codex/feature" : "codex/sandcastle/issue-42";
      try {
        await git("init", "--initial-branch=main");
        await git("config", "user.name", "Sandcastle test");
        await git("config", "user.email", "sandcastle@example.invalid");
        await git("config", "commit.gpgsign", "false");
        await git("config", "core.hooksPath", join(directory, "no-hooks"));
        await git("commit", "--allow-empty", "-m", "base");
        await git("switch", "-c", branch);
        await git("commit", "--allow-empty", "-m", "ticket");
        const candidate = await git("rev-parse", "HEAD");
        await git("switch", "main");
        if (scenario !== "unmerged") await git("merge", "--ff-only", branch);
        if (scenario === "advanced") {
          await git("switch", branch);
          await git("commit", "--allow-empty", "-m", "new recovery work");
          await git("switch", "main");
        }
        if (scenario === "checked-out") await git("worktree", "add", join(directory, "ticket-worktree"), branch);
        const before = await git("rev-parse", `refs/heads/${branch}`);
        const target = await git("rev-parse", "HEAD");
        let caught: unknown;
        try {
          await deleteMergedTicketBranch(directory, branch, candidate);
        } catch (error) {
          caught = error;
        }
        const remaining = await git("for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`);
        const afterTarget = await git("rev-parse", "HEAD");
        expect(afterTarget).toBe(target);
        if (scenario === "merged") {
          expect(caught).toBeUndefined();
          expect(remaining).toBe("");
        } else {
          expect(caught).toBeInstanceOf(Error);
          expect(remaining).toBe(before);
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});

describe("Sandcastle account configuration", () => {
  test("uses CODEX_HOME credentials when the template leaves CODEX_AUTH_FILE blank", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iam-afk-auth-test-"));
    try {
      await writeFile(join(directory, "auth.json"), "{}");
      const auth = await prepareCodexAuth({ CODEX_HOME: directory, CODEX_AUTH: "chatgpt", CODEX_AUTH_FILE: "" });
      await auth.close();
      expect(auth.mode).toBe("chatgpt");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  test("persists refreshed account credentials on close", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iam-afk-auth-test-"));
    try {
      const source = join(directory, "auth.json");
      await writeFile(source, '{"token":"original-test-token"}');
      const auth = await prepareCodexAuth({ CODEX_HOME: directory });
      const updated = '{"token":"refreshed-test-token"}';
      await writeFile(join(auth.mounts[0]!.hostPath, "auth.json"), updated);
      await auth.close();
      const persisted = await readFile(source, "utf8");
      expect(persisted).toBe(updated);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  test("preserves both credentials when the host login changed during AFK", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iam-afk-auth-test-"));
    let staged: string | undefined;
    try {
      const source = join(directory, "auth.json");
      await writeFile(source, '{"token":"original-test-token"}');
      const auth = await prepareCodexAuth({ CODEX_HOME: directory });
      staged = auth.mounts[0]!.hostPath;
      await writeFile(join(staged, "auth.json"), '{"token":"refreshed-test-token"}');
      await writeFile(source, '{"token":"new-host-login"}');
      let caught: unknown;
      try {
        await auth.close();
      } catch (error) {
        caught = error;
      }
      const host = await readFile(source, "utf8");
      const recovery = await readFile(join(staged, "auth.json"), "utf8");
      expect(caught).toBeInstanceOf(Error);
      expect(host).toBe('{"token":"new-host-login"}');
      expect(recovery).toBe('{"token":"refreshed-test-token"}');
    } finally {
      if (staged) await rm(staged, { recursive: true, force: true });
      await rm(directory, { recursive: true, force: true });
    }
  });
});

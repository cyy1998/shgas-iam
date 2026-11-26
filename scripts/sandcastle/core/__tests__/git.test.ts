import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "../command.ts";
import {
  assertBoundary,
  branchTip,
  deleteBranchCas,
  ensureSpecWorktree,
  fetchBase,
  mergeBase,
  mergeTicket,
  pushBranchNonForce,
  readIntegratedTickets,
  removeWorktreeSafe,
  specBranchName,
  ticketBranchName,
} from "../git.ts";
import { commit } from "./git-fixture.ts";

async function withRepoAndRemote(
  run: (ctx: { dir: string; cwd: string; remotePath: string; baseSha: string }) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), "sandcastle-git-"));
  const cwd = join(dir, "repo");
  const remotePath = join(dir, "remote.git");
  const git = (...args: string[]) => command("git", args, cwd);
  try {
    await command("git", ["init", "--bare", "-b", "main", remotePath], dir);
    await command("git", ["init", "-b", "main", cwd], dir);
    await git("config", "user.name", "Sandcastle Test");
    await git("config", "user.email", "test@example.test");
    await git("remote", "add", "origin", remotePath);
    const baseSha = await commit(cwd, "shared.txt", "base\n");
    await writeFile(join(cwd, ".git", "info", "exclude"), "\n.sandcastle/\n");
    await git("push", "-u", "origin", "main");
    await run({ dir, cwd, remotePath, baseSha });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

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

test("resolves Integration branch / 集成分支 declarations and sandcastle/ticket-<N> naming", () => {
  expect(specBranchName(433, "Integration branch: `feat/core-v2`")).toBe("feat/core-v2");
  expect(specBranchName(433, "集成分支：feat/sandcastle-native-convergence")).toBe(
    "feat/sandcastle-native-convergence",
  );
  expect(specBranchName(433, "集成分支: `feat/cn-ascii-colon`")).toBe("feat/cn-ascii-colon");
  expect(specBranchName(433, "No branch heading here")).toBe("sandcastle/spec-433");
  expect(() => specBranchName(433, "Integration branch: feat/a\n集成分支：feat/b")).toThrow(
    "conflicting integration branches",
  );
  expect(ticketBranchName(434)).toBe("sandcastle/ticket-434");
});

test("fetchBase fetches origin/main without touching a dirty non-main checkout, and mergeBase survives remote main advancing", async () => {
  await withRepoAndRemote(async ({ dir, cwd, remotePath, baseSha }) => {
    const git = (...args: string[]) => command("git", args, cwd);

    // Put local checkout on a different branch with dirty tracked + untracked files.
    await git("checkout", "-b", "interactive/wip");
    const localHead = await commit(cwd, "wip.txt", "local work\n");
    await writeFile(join(cwd, "shared.txt"), "dirty local edit\n");
    await writeFile(join(cwd, "untracked.txt"), "keep me\n");

    // Fetch origin/main; local checkout must remain completely untouched.
    const initial = await fetchBase(cwd);
    expect(initial).toEqual({ remoteRef: "refs/remotes/origin/main", sha: baseSha });
    expect(await git("symbolic-ref", "--short", "HEAD")).toBe("interactive/wip");
    expect(await git("rev-parse", "HEAD")).toBe(localHead);
    expect(await readFile(join(cwd, "shared.txt"), "utf8")).toBe("dirty local edit\n");
    expect(await readFile(join(cwd, "untracked.txt"), "utf8")).toBe("keep me\n");

    // Start Spec worktree from origin/main and integrate a ticket.
    const specBranch = "feat/demo-spec";
    const specWt = await ensureSpecWorktree(cwd, specBranch, initial.sha);
    const ticketBranch = ticketBranchName(101);
    const ticketWt = join(dir, "ticket-101");
    await git("worktree", "add", "-b", ticketBranch, ticketWt, initial.sha);
    const ticketSha = await commit(ticketWt, "feature.txt", "ticket 101 work\n");
    const merged = await mergeTicket(cwd, specWt.worktreePath, 101, ticketBranch, "bun test: 4 passed");
    expect(merged.merged).toBe(true);
    if (!merged.merged) throw new Error("expected merge");

    // Advance remote main via a separate clone while AFK is running.
    const otherClone = join(dir, "other-clone");
    await command("git", ["clone", "-b", "main", remotePath, otherClone], dir);
    await command("git", ["config", "user.name", "Other Dev"], otherClone);
    await command("git", ["config", "user.email", "other@example.test"], otherClone);
    const advancedMainSha = await commit(otherClone, "unrelated.txt", "main moved forward\n");
    await command("git", ["push", "origin", "main"], otherClone);

    // Fetch again; merge-base must still equal the original divergence point (baseSha), not advancedMainSha.
    const updated = await fetchBase(cwd);
    expect(updated.sha).toBe(advancedMainSha);
    const derivedBase = await mergeBase(cwd, specBranch, updated.remoteRef);
    expect(derivedBase).toBe(baseSha);

    // Non-force push of specBranch still succeeds even though remote main moved.
    await pushBranchNonForce(cwd, "origin", specBranch, merged.mergeSha);
    const remoteSpecLine = await git("ls-remote", "--heads", "origin", `refs/heads/${specBranch}`);
    expect(remoteSpecLine.startsWith(`${merged.mergeSha}\t`)).toBe(true);

    // Clean up temporary external ticket worktree created by this test.
    await git("worktree", "remove", ticketWt);
    expect(ticketSha).toBe(merged.candidateSha);
  });
});

test("mergeTicket embeds trailer and handoff, readIntegratedTickets recovers only two-parent merges, and conflicts abort cleanly", async () => {
  await withRepoAndRemote(async ({ dir, cwd, baseSha }) => {
    const git = (...args: string[]) => command("git", args, cwd);
    const specBranch = "feat/handoff-test";
    const specWt = await ensureSpecWorktree(cwd, specBranch, baseSha);

    // Reuse existing Spec worktree cleanly.
    const reused = await ensureSpecWorktree(cwd, specBranch, baseSha);
    expect(reused.worktreePath).toBe(specWt.worktreePath);

    // Ticket 11 merges cleanly with multiline handoff.
    const t11 = ticketBranchName(11);
    const t11Path = join(dir, "t11");
    await git("worktree", "add", "-b", t11, t11Path, baseSha);
    const t11Sha = await commit(t11Path, "a.txt", "ticket 11\n");
    const handoff11 = "Verification:\n- `bun test`: 12 passed\n- `pnpm check:architecture`: ok";
    const m11 = await mergeTicket(cwd, specWt.worktreePath, 11, t11, handoff11);
    expect(m11).toEqual({ merged: true, mergeSha: expect.any(String), candidateSha: t11Sha });

    // Already-integrated candidate reports no-change.
    const noChange = await mergeTicket(cwd, specWt.worktreePath, 11, t11, handoff11);
    expect(noChange).toEqual({ merged: false, conflict: false, specTip: m11.merged ? m11.mergeSha : "" });

    // Forged non-merge commit with Sandcastle-Ticket trailer must NOT be counted as integrated.
    await commit(specWt.worktreePath, "forged.txt", "Plain commit\n\nSandcastle-Ticket: #12");

    // Ticket 13 conflicts with a file edited on spec branch.
    const specTipBeforeConflict = await commit(specWt.worktreePath, "shared.txt", "spec side\n");
    const t13 = ticketBranchName(13);
    const t13Path = join(dir, "t13");
    await git("worktree", "add", "-b", t13, t13Path, baseSha);
    await commit(t13Path, "shared.txt", "ticket 13 side\n");

    const conflict = await mergeTicket(cwd, specWt.worktreePath, 13, t13, "handoff 13");
    expect(conflict).toEqual({ merged: false, conflict: true, specTip: specTipBeforeConflict });
    const statusAfterAbort = await command("git", ["status", "--porcelain"], specWt.worktreePath);
    const headAfterAbort = await command("git", ["rev-parse", "HEAD"], specWt.worktreePath);
    expect(statusAfterAbort).toBe("");
    expect(headAfterAbort).toBe(specTipBeforeConflict);

    // Recover integrated tickets from merge-base..specBranch.
    const recovered = await readIntegratedTickets(cwd, specBranch, baseSha);
    expect([...recovered.keys()]).toEqual([11]);
    const info11 = recovered.get(11);
    expect(info11).toBeDefined();
    expect(info11?.candidateSha).toBe(t11Sha);
    expect(info11?.handoff).toContain("`bun test`: 12 passed");
    expect(info11?.handoff).toContain("`pnpm check:architecture`: ok");

    // Also verify git log --first-parent carries the handoff body.
    const logBody = await command(
      "git",
      ["log", "--first-parent", "--merges", "-n", "1", "--format=%B", `${baseSha}..${specBranch}`],
      cwd,
    );
    expect(logBody).toContain("Sandcastle-Ticket: #11");
    expect(logBody).toContain("`bun test`: 12 passed");

    await git("worktree", "remove", t11Path);
    await git("worktree", "remove", t13Path);
  });
});

test("assertBoundary enforces candidate-contains-baseline and untouched spec/remote refs", async () => {
  await withRepoAndRemote(async ({ dir, cwd, baseSha }) => {
    const git = (...args: string[]) => command("git", args, cwd);
    const specBranch = "feat/boundary-spec";
    const specWt = await ensureSpecWorktree(cwd, specBranch, baseSha);
    const remoteRef = "refs/remotes/origin/main";

    const t21 = ticketBranchName(21);
    const t21Path = join(dir, "t21");
    await git("worktree", "add", "-b", t21, t21Path, baseSha);
    await commit(t21Path, "ok.txt", "valid work\n");

    // Valid boundary passes.
    await assertBoundary(cwd, {
      ticketBranch: t21,
      baselineSha: baseSha,
      specBranch,
      expectedSpecTip: baseSha,
      remoteRef,
      expectedRemoteSha: baseSha,
    });

    // Spec-only boundary check (without ticketBranch/baselineSha) also passes.
    await assertBoundary(cwd, {
      specBranch,
      expectedSpecTip: baseSha,
      remoteRef,
      expectedRemoteSha: baseSha,
    });

    // Fail 1: specBranch tip moved.
    const movedSpecTip = await commit(specWt.worktreePath, "spec-drift.txt", "agent touched spec\n");
    const specErr = await expectReject(() =>
      assertBoundary(cwd, {
        ticketBranch: t21,
        baselineSha: baseSha,
        specBranch,
        expectedSpecTip: baseSha,
        remoteRef,
        expectedRemoteSha: baseSha,
      }),
    );
    expect(specErr.message).toContain(specBranch);

    // Fail 2: candidate does not contain baseline (ticket based on baseSha, baseline is movedSpecTip).
    const baseErr = await expectReject(() =>
      assertBoundary(cwd, {
        ticketBranch: t21,
        baselineSha: movedSpecTip,
        specBranch,
        expectedSpecTip: movedSpecTip,
        remoteRef,
        expectedRemoteSha: baseSha,
      }),
    );
    expect(baseErr.message).toContain(t21);

    // Fail 3: remote tracking ref moved.
    await git("update-ref", remoteRef, movedSpecTip);
    const remoteErr = await expectReject(() =>
      assertBoundary(cwd, {
        ticketBranch: t21,
        baselineSha: baseSha,
        specBranch,
        expectedSpecTip: movedSpecTip,
        remoteRef,
        expectedRemoteSha: baseSha,
      }),
    );
    expect(remoteErr.message).toContain(remoteRef);

    await git("worktree", "remove", t21Path);
  });
});

test("removeWorktreeSafe refuses dirty worktrees, preserves local spec ref, deleteBranchCas enforces CAS, and pushBranchNonForce rejects non-ff", async () => {
  await withRepoAndRemote(async ({ dir, cwd, remotePath, baseSha }) => {
    const git = (...args: string[]) => command("git", args, cwd);
    const specBranch = "feat/cleanup-spec";
    const specWt = await ensureSpecWorktree(cwd, specBranch, baseSha);
    const specHead = await commit(specWt.worktreePath, "spec.txt", "spec work\n");

    // Dirty worktree must NOT be deleted.
    const dirtyFile = join(specWt.worktreePath, "dirty.txt");
    await writeFile(dirtyFile, "uncommitted data\n");
    const dirtyErr = await expectReject(() => removeWorktreeSafe(cwd, specWt.worktreePath));
    expect(dirtyErr.message.toLowerCase()).toContain("dirty");
    expect(await readFile(dirtyFile, "utf8")).toBe("uncommitted data\n");

    // Clean worktree removes cleanly while preserving the local spec branch ref.
    await rm(dirtyFile);
    await removeWorktreeSafe(cwd, specWt.worktreePath);
    expect(await branchTip(cwd, specBranch)).toBe(specHead);

    // deleteBranchCas fails on stale expectedTip and succeeds on exact tip.
    const ticketBranch = ticketBranchName(31);
    await git("branch", ticketBranch, specHead);
    const casErr = await expectReject(() => deleteBranchCas(cwd, ticketBranch, baseSha));
    expect(casErr).toBeInstanceOf(Error);
    expect(await branchTip(cwd, ticketBranch)).toBe(specHead);
    await deleteBranchCas(cwd, ticketBranch, specHead);
    expect(await branchTip(cwd, ticketBranch)).toBeUndefined();

    // pushBranchNonForce succeeds initially, then rejects non-fast-forward remote divergence.
    await pushBranchNonForce(cwd, "origin", specBranch, specHead);
    const otherClone = join(dir, "other");
    await command("git", ["clone", "-b", specBranch, remotePath, otherClone], dir);
    await command("git", ["config", "user.name", "Other"], otherClone);
    await command("git", ["config", "user.email", "other@example.test"], otherClone);
    await commit(otherClone, "remote-only.txt", "diverged remote\n");
    await command("git", ["push", "origin", specBranch], otherClone);

    // Recreate local spec commit diverging from remote.
    const divergedWt = await ensureSpecWorktree(cwd, specBranch, baseSha);
    const divergedHead = await commit(divergedWt.worktreePath, "local-only.txt", "diverged local\n");
    const pushErr = await expectReject(() => pushBranchNonForce(cwd, "origin", specBranch, divergedHead));
    expect(pushErr).toBeInstanceOf(Error);
    await removeWorktreeSafe(cwd, divergedWt.worktreePath);
  });
});

test("ensureSpecWorktree rejects a branch already checked out outside managed worktrees", async () => {
  await withRepoAndRemote(async ({ dir, cwd, baseSha }) => {
    const git = (...args: string[]) => command("git", args, cwd);
    const external = join(dir, "external-checkout");
    await mkdir(external, { recursive: true });
    await rm(external, { recursive: true, force: true });
    await git("worktree", "add", "-b", "feat/external", external, baseSha);

    const err = await expectReject(() => ensureSpecWorktree(cwd, "feat/external", baseSha));
    expect(err.message).toContain("feat/external");

    await git("worktree", "remove", external);
  });
});

import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "../command.ts";
import { createGitWorkspace, specBranchName } from "../git.ts";
import { createSpecState, pendingDeliveries } from "../state.ts";
import { commit } from "./git-fixture.ts";

async function withRepository(run: (cwd: string, base: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "sandcastle-git-"));
  const cwd = join(directory, "repo");
  const git = (...args: string[]) => command("git", args, cwd);
  try {
    await command("git", ["init", "-b", "main", cwd], directory);
    await git("config", "user.name", "Sandcastle Test");
    await git("config", "user.email", "test@example.test");
    await commit(cwd, "shared.txt", "base");
    await writeFile(join(cwd, ".git", "info", "exclude"), "\n.sandcastle/\n");
    await run(cwd, await git("rev-parse", "HEAD"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("resolves Chinese and English branch declarations and rejects conflicting declarations", () => {
  expect(specBranchName(40, "Integration-Branch: `feat/design`")).toBe("feat/design");
  expect(specBranchName(40, "集成分支：feat/design")).toBe("feat/design");
  expect(() => specBranchName(40, "集成分支：feat/design\nIntegration-Branch: feat/other")).toThrow(
    "conflicting integration branches",
  );
});

test("the synchronized invocation is verified against a freshly fetched bare remote", async () => {
  await withRepository(async (cwd, base) => {
    const git = (...args: string[]) => command("git", args, cwd);
    await git("init", "--bare", "../remote.git");
    await git("remote", "add", "origin", "../remote.git");
    await git("push", "origin", "main");
    const workspace = createGitWorkspace(cwd);
    expect(await workspace.synchronizeInvocation("main", "origin")).toBe(base);
    const ahead = await commit(cwd, "local.txt", "unpushed");
    const error = await workspace.synchronizeInvocation("main", "origin").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    const unchanged = await git("rev-parse", "HEAD");
    expect(unchanged).toBe(ahead);
  });
});

test("restart recovers serial merges by trailer and preserves an unfinished zero-commit ticket", async () => {
  await withRepository(async (cwd, base) => {
    const git = createGitWorkspace(cwd);
    const spec = await git.open(specBranchName(40, "Integration branch: `feat/migration`"), base);
    const branches = new Map([
      [41, "sandcastle/issue-41"],
      [42, "sandcastle/issue-42"],
      [43, "sandcastle/issue-43"],
    ]);
    const [first, second, unfinished] = await Promise.all(
      [...branches.values()].map((branch) => git.open(branch, base)),
    );
    if (!first || !second || !unfinished) throw new Error("Expected three worktrees");
    const firstTip = await commit(first.worktreePath, "41.txt", "ticket 41");
    const secondTip = await commit(second.worktreePath, "42.txt", "ticket 42");
    const merges = await Promise.all([
      git.integrate(spec, first, 41, firstTip),
      git.integrate(spec, second, 42, secondTip),
    ]);
    expect(merges.map((result) => result.status)).toEqual(["merged", "merged"]);
    await commit(spec.worktreePath, "unverified.txt", "Plain commit\n\nSandcastle-Ticket: #43");
    await writeFile(join(unfinished.worktreePath, "unfinished.txt"), "carry over");
    const restart = createGitWorkspace(cwd);
    const recovered = await restart.inspectTickets(spec, base, branches);
    expect([...recovered.integrated.keys()].sort()).toEqual([41, 42]);
    expect([...recovered.resumable]).toEqual([43]);
    const resumed = await restart.open(unfinished.branch, base, { allowDirty: true });
    expect(resumed.worktreePath).toBe(unfinished.worktreePath);
    const preserved = await readFile(join(resumed.worktreePath, "unfinished.txt"), "utf8");
    expect(preserved).toBe("carry over");
    const noChange = await restart.integrate(spec, await restart.open("sandcastle/issue-44", base), 44, base);
    expect(noChange.status).toBe("no-change");
    const messages = await command(
      "git",
      ["log", "--first-parent", "--merges", "--format=%B", `${base}..HEAD`],
      spec.worktreePath,
    );
    expect(messages.match(/^Sandcastle-Ticket: #\d+$/gm)).toEqual(["Sandcastle-Ticket: #42", "Sandcastle-Ticket: #41"]);
    await commit(first.worktreePath, "advanced.txt", "unmerged continuation");
    const advanced = await restart.inspectTickets(spec, base, branches);
    expect(advanced.integrated.has(41)).toBe(false);
    expect(advanced.resumable.has(41)).toBe(true);
  });
});

test("opening worktrees rejects external registrations and preserves unregistered contents", async () => {
  await withRepository(async (cwd, base) => {
    const workspace = createGitWorkspace(cwd);
    const spec = await workspace.open("sandcastle/spec-40", base);
    const external = join(cwd, ".sandcastle", "worktrees-sibling", "ticket");
    await mkdir(join(external, ".."), { recursive: true });
    await command("git", ["worktree", "add", "-b", "sandcastle/issue-41", external, base], cwd);
    const existing = await workspace.open("sandcastle/issue-41", base).catch((reason: unknown) => reason);
    expect(existing).toBeInstanceOf(Error);
    const blockedCleanup = await workspace.closeTicket("sandcastle/issue-41", base).catch((reason: unknown) => reason);
    expect(blockedCleanup).toBeInstanceOf(Error);
    expect(await workspace.branchTip("sandcastle/issue-41")).toBe(base);

    const orphan = join(cwd, ".sandcastle", "worktrees", "unknown");
    await mkdir(orphan);
    await writeFile(join(orphan, "keep.txt"), "preserve me");
    const failure = await workspace.open("sandcastle/issue-42", base).catch((reason: unknown) => reason);
    const kept = await readFile(join(orphan, "keep.txt"), "utf8");
    expect(failure).toBeInstanceOf(Error);
    expect(kept).toBe("preserve me");

    await workspace.close(spec, base);
    const tip = await command("git", ["rev-parse", `refs/heads/${spec.branch}`], cwd);
    expect(tip).toBe(base);
  });
});

test("worktree open adds one host listing and cleanup removes a ticket directly", async () => {
  await withRepository(async (cwd, base) => {
    const branch = "sandcastle/issue-41";
    const workspace = createGitWorkspace(cwd);
    await workspace.open("sandcastle/spec-40", base);
    const trace = join(cwd, ".git", "worktree.trace");
    const traceVariable = "GIT_TRACE2_EVENT";
    const originalTrace = process.env[traceVariable];
    process.env[traceVariable] = trace;
    let opening: string;
    let cleanup: string;
    try {
      const ticket = await workspace.open(branch, base);
      const candidate = await commit(ticket.worktreePath, ".gitignore", "node_modules/\n");
      const dependencies = join(ticket.worktreePath, "node_modules");
      await mkdir(dependencies);
      await writeFile(join(dependencies, "fixture"), "generated dependency");
      opening = await readFile(trace, "utf8");
      await writeFile(trace, "");
      await workspace.closeTicket(branch, candidate);
      cleanup = await readFile(trace, "utf8");
    } finally {
      if (originalTrace === undefined) delete process.env[traceVariable];
      else process.env[traceVariable] = originalTrace;
    }

    function worktreeCommands(events: string, action: string) {
      return events
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter(({ event, argv }) => event === "start" && argv.includes("worktree") && argv.includes(action));
    }
    // The native SDK lists once while pruning and once while creating an explicit branch.
    expect(worktreeCommands(opening, "list")).toHaveLength(3);
    expect(worktreeCommands(cleanup, "list")).toHaveLength(1);
    expect(worktreeCommands(cleanup, "remove")).toHaveLength(1);
    const tip = await workspace.branchTip(branch);
    expect(tip).toBeUndefined();
  });
});

test("a real conflict is aborted and leaves the candidate available for resolution", async () => {
  await withRepository(async (cwd, base) => {
    const git = createGitWorkspace(cwd);
    const spec = await git.open("sandcastle/spec-40", base);
    const ticket = await git.open("sandcastle/issue-41", base);
    const kept = await commit(spec.worktreePath, "shared.txt", "spec choice");
    const candidate = await commit(ticket.worktreePath, "shared.txt", "ticket choice");
    const result = await git.integrate(spec, ticket, 41, candidate);
    expect(result).toEqual({ status: "conflict", integrationSha: kept });
    const status = await command("git", ["status", "--porcelain"], spec.worktreePath);
    const head = await command("git", ["rev-parse", "HEAD"], ticket.worktreePath);
    expect(status).toBe("");
    expect(head).toBe(candidate);
    const recovery = await git.inspectTickets(spec, base, new Map([[41, ticket.branch]]));
    expect(recovery.integrated.size).toBe(0);
  });
});

test("exploration and finalization only resume from their exact Git identities", async () => {
  await withRepository(async (cwd, base) => {
    const evidence = {
      reviewBase: base,
      reviewCandidate: base,
      reviewReport: "passed review",
      repairSummary: "passed checks",
      prBody: "Ready",
    };
    const state = createSpecState(cwd, 40);
    const path = await state.saveExploration(base, "module notes");
    await state.saveDelivery(base, evidence);
    const restart = createSpecState(cwd, 40);
    const notes = await restart.readExploration(base);
    const recovered = await restart.readDelivery(base);
    const changed = await commit(cwd, "changed.txt", "create a new HEAD");
    const drift = await restart.readDelivery(changed);
    const otherBaseline = await restart.readExploration(changed);
    const otherSpec = await createSpecState(cwd, 41).readDelivery(base);
    expect(notes).toBe(path);
    expect(recovered).toEqual(evidence);
    expect(drift).toBeUndefined();
    expect(otherBaseline).toBeUndefined();
    expect(otherSpec).toBeUndefined();
  });
});

test("review checkpoints bind the report to both Git identities and leave delivery pending only after verification", async () => {
  await withRepository(async (cwd, base) => {
    const candidate = await commit(cwd, "reviewed.txt", "reviewed content");
    const review = { reviewBase: base, reviewCandidate: candidate, reviewReport: "Standards and Spec passed" };
    await createSpecState(cwd, 40).saveReview(review);

    const restart = createSpecState(cwd, 40);
    const next = await commit(cwd, "changed.txt", "advanced HEAD");
    expect(await restart.readReview(base, candidate)).toBe(review.reviewReport);
    expect(await restart.readReview(base, next)).toBeUndefined();
    expect(await restart.readReview(candidate, candidate)).toBeUndefined();
    expect(await restart.readDelivery(candidate)).toBeUndefined();
    expect(await pendingDeliveries(cwd)).toEqual([]);

    await restart.saveDelivery(next, { ...review, repairSummary: "Verification passed", prBody: "Ready" });
    expect(await pendingDeliveries(cwd)).toEqual([40]);
  });
});

import { expect, test } from "bun:test";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "../../sandcastle/commands";
import { createSpecDelivery } from "../../sandcastle/delivery";
import { createFinalizationLifecycle } from "../../sandcastle/finalization";
import type { SpecGraph, TrackedIssue } from "../../sandcastle/specs";
import { createTicketLifecycle, GitStateError } from "../../sandcastle/tickets";

function issue(number: number, type: "spec" | "ticket"): TrackedIssue {
  return {
    number,
    title: `${type} ${number}`,
    body: "Acceptance criteria",
    state: "OPEN",
    labels: [`type:${type}`, "ready-for-agent"],
    assignees: [],
    parent: type === "ticket" ? 10 : null,
    blockers: [],
  };
}

async function repository(run: (cwd: string) => Promise<void>) {
  const cwd = await mkdtemp(join(tmpdir(), "iam-afk-delivery-test-"));
  const git = (...args: string[]) => command("git", args, cwd);
  try {
    await git("init", "--initial-branch=main");
    await git("config", "user.name", "Sandcastle test");
    await git("config", "user.email", "sandcastle@example.invalid");
    await git("config", "commit.gpgsign", "false");
    await git("config", "core.hooksPath", join(cwd, "no-hooks"));
    await writeFile(join(cwd, ".gitignore"), ".sandcastle/\n");
    await git("add", ".gitignore");
    await git("commit", "-m", "base");
    await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function finalized(cwd: string) {
  const spec = issue(10, "spec");
  const children = [issue(11, "ticket"), issue(12, "ticket")];
  const graph: SpecGraph = { spec, tickets: children, dependencies: [spec, ...children] };
  const tickets = createTicketLifecycle({
    cwd,
    invocationBranch: "main",
    recordHandoff: async () => {},
    runTicket: async ({ phase, context, integrationSha }) => {
      const git = (...args: string[]) => command("git", args, context.worktreePath);
      if (phase === "implement") {
        await writeFile(join(context.worktreePath, `${context.ticket.number}.txt`), "implemented\n");
        await git("add", ".");
        await git("commit", "-m", `Implement #${context.ticket.number}`);
      } else await git("merge", "--no-edit", integrationSha);
      return { completed: true, handoff: "Focused behavior and types passed." };
    },
  });
  const workspace = await tickets.prepareSpec(graph);
  for (const child of children) {
    const ticket = {
      number: child.number,
      title: child.title,
      branch: `codex/sandcastle/issue-${child.number}`,
      implementer: "implementer_standard" as const,
      reason: "Routine change",
    };
    await tickets.execute(workspace, ticket);
    await tickets.integrate(workspace, ticket);
  }
  const gate = createFinalizationLifecycle({
    cwd,
    recordHandoff: async () => {},
    runFinal: async ({ phase }) => ({
      completed: true,
      handoff:
        phase === "review"
          ? "Standards and Spec reports: no findings."
          : "pnpm verify passed; required Integration passed.",
    }),
  });
  return { result: await gate.finalize(workspace, tickets.contexts, tickets.integrated), contexts: tickets.contexts };
}

test("delivers a complete Spec as one squash commit before closing tickets and its parent", async () => {
  await repository(async (cwd) => {
    const { result, contexts } = await finalized(cwd);
    const git = (...args: string[]) => command("git", args, cwd);
    const expectedTree = await git("rev-parse", `${result.finalCandidate}^{tree}`);
    const events: string[] = [];
    const comments: string[] = [];
    const delivery = createSpecDelivery({
      cwd,
      creatorsStopped: () => true,
      recordHandoff: async (number, body) => {
        events.push(`record:${number}`);
        comments.push(body);
      },
      closeIssue: async (number) => {
        const commits = await git("rev-list", "--count", `${result.reviewBase}..main`);
        expect(commits).toBe("1");
        events.push(`close:${number}`);
      },
    });
    const delivered = await delivery.deliver(result, contexts);
    const head = await git("rev-parse", "HEAD");
    const deliveredTree = await git("rev-parse", "HEAD^{tree}");
    const parents = await git("rev-list", "--parents", "-n", "1", "HEAD");
    const status = await git("status", "--porcelain");
    expect(delivered.squashSha).toBe(head);
    expect(deliveredTree).toBe(expectedTree);
    expect(parents).toBe(`${delivered.squashSha} ${result.reviewBase}`);
    expect(status).toBe("");
    expect(events.filter((event) => event.startsWith("close:"))).toEqual(["close:11", "close:12", "close:10"]);
    expect(comments.join("\n")).toContain(delivered.squashSha);
    const message = await git("show", "-s", "--format=%B", "HEAD");
    expect(message).toContain("Spec: #10");
    expect(message).toContain(result.finalCandidate);
    const branches = await git("for-each-ref", "--format=%(refname)", "refs/heads/codex/sandcastle/");
    const worktrees = await git("worktree", "list", "--porcelain");
    expect(branches).toBe("");
    expect(worktrees.match(/^worktree /gm)).toHaveLength(1);
  });
}, 30_000);

test.each([
  "missing-review",
  "missing-validation",
  "missing-ticket",
  "candidate-drift",
  "target-drift",
  "dirty-target",
  "unstopped-creator",
])(
  "preserves the Spec without squash or closeout when %s invalidates delivery",
  async (scenario) => {
    await repository(async (cwd) => {
      const { result, contexts } = await finalized(cwd);
      const git = (...args: string[]) => command("git", args, cwd);
      const input = { ...result };
      const ticketContexts = new Map(contexts);
      if (scenario === "missing-review") input.reviewReport = " ";
      if (scenario === "missing-validation") input.repairAndValidation = " ";
      if (scenario === "missing-ticket") ticketContexts.delete(12);
      if (scenario === "candidate-drift")
        await command("git", ["commit", "--allow-empty", "-m", "candidate changed"], result.workspace.worktreePath);
      if (scenario === "target-drift") await git("commit", "--allow-empty", "-m", "target changed");
      if (scenario === "dirty-target") await writeFile(join(cwd, "uncommitted.txt"), "unknown work");
      const targetBefore = await git("rev-parse", "main");
      const closed: number[] = [];
      const comments: string[] = [];
      const delivery = createSpecDelivery({
        cwd,
        creatorsStopped: () => scenario !== "unstopped-creator",
        recordHandoff: async (_number, body) => {
          comments.push(body);
        },
        closeIssue: async (number) => {
          closed.push(number);
        },
      });
      let caught: unknown;
      try {
        await delivery.deliver(input, ticketContexts);
      } catch (error) {
        caught = error;
      }
      const targetAfter = await git("rev-parse", "main");
      expect(caught).toBeInstanceOf(Error);
      expect(targetAfter).toBe(targetBefore);
      expect(closed).toEqual([]);
      expect(comments.at(-1)).toContain("下一动作");
      await access(result.workspace.worktreePath);
      for (const context of contexts.values()) await access(context.worktreePath);
    });
  },
  30_000,
);

test.each(["commit-fails", "hook-changes-tree"])(
  "preserves actual Git effects after %s without closing issues",
  async (scenario) => {
    await repository(async (cwd) => {
      const { result, contexts } = await finalized(cwd);
      const git = (...args: string[]) => command("git", args, cwd);
      const hooks = join(cwd, ".git", "test-hooks");
      await mkdir(hooks);
      await writeFile(
        join(hooks, "pre-commit"),
        scenario === "commit-fails"
          ? "#!/bin/sh\nexit 1\n"
          : "#!/bin/sh\nprintf 'hook change' >> 11.txt\ngit add 11.txt\n",
      );
      await git("config", "core.hooksPath", hooks);
      const closed: number[] = [];
      const comments: string[] = [];
      const delivery = createSpecDelivery({
        cwd,
        creatorsStopped: () => true,
        recordHandoff: async (_number, body) => {
          comments.push(body);
        },
        closeIssue: async (number) => {
          closed.push(number);
        },
      });
      let caught: unknown;
      try {
        await delivery.deliver(result, contexts);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(GitStateError);
      expect(closed).toEqual([]);
      const count = await git("rev-list", "--count", `${result.reviewBase}..main`);
      expect(count).toBe(scenario === "commit-fails" ? "0" : "1");
      expect(comments.at(-1)).toContain("启动分支实际 HEAD");
      await access(result.workspace.worktreePath);
    });
  },
  30_000,
);

test.each(["delivery-record", "second-ticket", "parent"])(
  "preserves a successful squash and unfinished closeout after %s fails",
  async (scenario) => {
    await repository(async (cwd) => {
      const { result, contexts } = await finalized(cwd);
      const git = (...args: string[]) => command("git", args, cwd);
      const closed: number[] = [];
      const comments: string[] = [];
      const delivery = createSpecDelivery({
        cwd,
        creatorsStopped: () => true,
        recordHandoff: async (_number, body) => {
          if (scenario === "delivery-record" && !body.includes("收尾未完成")) throw new Error("GitHub record failed");
          comments.push(body);
        },
        closeIssue: async (number) => {
          if ((scenario === "second-ticket" && number === 12) || (scenario === "parent" && number === 10))
            throw new Error("GitHub close failed");
          closed.push(number);
        },
      });
      let caught: unknown;
      try {
        await delivery.deliver(result, contexts);
      } catch (error) {
        caught = error;
      }
      const count = await git("rev-list", "--count", `${result.reviewBase}..main`);
      const squashSha = await git("rev-parse", "HEAD");
      expect(caught).toBeInstanceOf(Error);
      expect(count).toBe("1");
      expect(closed).toEqual(scenario === "delivery-record" ? [] : scenario === "second-ticket" ? [11] : [11, 12]);
      expect(comments.at(-1)).toContain(squashSha);
      expect(comments.at(-1)).toContain(result.finalCandidate);
      await access(result.workspace.worktreePath);
      for (const context of contexts.values()) await access(context.worktreePath);
      try {
        await delivery.deliver(result, contexts);
      } catch {}
      const unchangedCount = await git("rev-list", "--count", `${result.reviewBase}..main`);
      expect(unchangedCount).toBe("1");
    });
  },
  30_000,
);

test.each(["dirty-ticket", "drifted-ticket", "locked-worktree", "unstopped-creator"])(
  "keeps all branches and worktrees when cleanup encounters %s",
  async (scenario) => {
    await repository(async (cwd) => {
      const { result, contexts } = await finalized(cwd);
      const context = contexts.get(12)!;
      let creatorsStopped = true;
      const closed: number[] = [];
      const delivery = createSpecDelivery({
        cwd,
        creatorsStopped: () => creatorsStopped,
        recordHandoff: async () => {},
        closeIssue: async (number) => {
          closed.push(number);
          if (number !== 10) return;
          if (scenario === "dirty-ticket") await writeFile(join(context.worktreePath, "unknown.txt"), "unknown work");
          if (scenario === "drifted-ticket")
            await command("git", ["commit", "--allow-empty", "-m", "unknown commit"], context.worktreePath);
          if (scenario === "locked-worktree") await command("git", ["worktree", "lock", context.worktreePath], cwd);
          if (scenario === "unstopped-creator") creatorsStopped = false;
        },
      });
      let caught: unknown;
      try {
        await delivery.deliver(result, contexts);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(GitStateError);
      expect(closed).toEqual([11, 12, 10]);
      await access(result.workspace.worktreePath);
      for (const entry of contexts.values()) {
        await access(entry.worktreePath);
        const branch = await command("git", ["rev-parse", `refs/heads/${entry.ticket.branch}`], cwd);
        expect(branch).toBeTruthy();
      }
    });
  },
  30_000,
);

test("rechecks the delivered Git state after recording and before closing an issue", async () => {
  await repository(async (cwd) => {
    const { result, contexts } = await finalized(cwd);
    const closed: number[] = [];
    const delivery = createSpecDelivery({
      cwd,
      creatorsStopped: () => true,
      recordHandoff: async (number) => {
        if (number === 11) await command("git", ["commit", "--allow-empty", "-m", "unexpected target change"], cwd);
      },
      closeIssue: async (number) => {
        closed.push(number);
      },
    });
    let caught: unknown;
    try {
      await delivery.deliver(result, contexts);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GitStateError);
    expect(closed).toEqual([]);
    await access(result.workspace.worktreePath);
  });
}, 30_000);

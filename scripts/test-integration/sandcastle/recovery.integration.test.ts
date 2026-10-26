import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { command } from "../../sandcastle/commands";
import { createSpecDelivery } from "../../sandcastle/delivery";
import { createFinalizationLifecycle } from "../../sandcastle/finalization";
import { createSpecRecovery, type RecoveredSpec } from "../../sandcastle/recovery";
import { type SpecGraph, specFrontier, type TrackedIssue } from "../../sandcastle/specs";
import { createTicketLifecycle, GitStateError, type TicketRun } from "../../sandcastle/tickets";
import type { Ticket } from "../../sandcastle/workflow";

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
    comments: [],
  };
}

async function repository(
  run: (cwd: string, graph: SpecGraph, record: (number: number, body: string) => Promise<void>) => Promise<void>,
) {
  const cwd = await mkdtemp(join(tmpdir(), "iam-afk-recovery-test-"));
  const git = (...args: string[]) => command("git", args, cwd);
  const spec = issue(10, "spec");
  const children = [issue(11, "ticket"), issue(12, "ticket")];
  children[1]!.blockers = [11];
  const graph = { spec, tickets: children, dependencies: [spec, ...children] };
  try {
    await git("init", "--initial-branch=main");
    await git("config", "user.name", "Sandcastle test");
    await git("config", "user.email", "sandcastle@example.invalid");
    await git("config", "commit.gpgsign", "false");
    await git("config", "core.autocrlf", "false");
    await git("config", "core.hooksPath", join(cwd, "no-hooks"));
    await writeFile(join(cwd, ".gitignore"), ".sandcastle/\n");
    await git("add", ".gitignore");
    await git("commit", "-m", "base");
    await run(cwd, graph, async (number, body) => {
      graph.dependencies.find((entry) => entry.number === number)!.comments!.push({ body, author: "runner" });
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

const ticket = (number: number): Ticket => ({
  number,
  title: `ticket ${number}`,
  branch: `codex/sandcastle/issue-${number}`,
  implementer: "implementer_standard",
  reason: "Routine change",
});
const implement: TicketRun = async ({ phase, context, integrationSha }) => {
  const git = (...args: string[]) => command("git", args, context.worktreePath);
  if (phase === "implement") {
    await writeFile(join(context.worktreePath, `${context.ticket.number}.txt`), "implemented\n");
    await git("add", ".");
    await git("commit", "-m", `Implement #${context.ticket.number}`);
  } else await git("merge", "--no-edit", integrationSha);
  return { completed: true, handoff: "Focused behavior and type checks passed." };
};

async function deliverFixture(
  cwd: string,
  graph: SpecGraph,
  recordHandoff: (number: number, body: string) => Promise<void>,
) {
  const lifecycle = createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement });
  const workspace = await lifecycle.prepareSpec(graph);
  for (const child of graph.tickets) {
    await lifecycle.execute(workspace, ticket(child.number));
    await lifecycle.integrate(workspace, ticket(child.number));
  }
  const finalized = await createFinalizationLifecycle({
    cwd,
    recordHandoff,
    runFinal: async () => ({ completed: true, handoff: "Both real reports; required validation passed." }),
  }).finalize(workspace, lifecycle.contexts, lifecycle.integrated);
  return createSpecDelivery({
    cwd,
    creatorsStopped: () => true,
    recordHandoff,
    closeIssue: async (number) => {
      graph.dependencies.find((entry) => entry.number === number)!.state = "CLOSED";
    },
  }).deliver(finalized, lifecycle.contexts);
}

test.each(["collaborator", "forged"])(
  "checks %s delivery as a cross-Spec dependency independently of the current actor",
  async (scenario) => {
    await repository(async (cwd, graph, recordHandoff) => {
      const delivered = await deliverFixture(cwd, graph, recordHandoff);
      const prerequisite = graph.tickets[0]!;
      prerequisite.assignees = ["runner"];
      if (scenario === "forged")
        prerequisite.comments = prerequisite.comments!.map((entry) => ({
          ...entry,
          body: entry.body.replace(
            `实际 squash 提交：${delivered.squashSha}`,
            `实际 squash 提交：${delivered.reviewBase}`,
          ),
        }));
      const spec = issue(20, "spec");
      const child = { ...issue(21, "ticket"), parent: 20, blockers: [11] };
      const downstream = { spec, tickets: [child], dependencies: [spec, child, prerequisite] };
      const recovery = createSpecRecovery({
        cwd,
        invocationBranch: "main",
        actor: "collaborator",
        tickets: createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement }),
      });
      expect(specFrontier(downstream, recovery.progress).ready).toEqual([]);
      let failure: unknown;
      try {
        await recovery.confirmDelivered(prerequisite);
      } catch (error) {
        failure = error;
      }
      expect(prerequisite.state).toBe("CLOSED");
      if (scenario === "forged") {
        expect(failure).toBeInstanceOf(GitStateError);
        expect(recovery.progress.delivered?.size).toBe(0);
        expect(specFrontier(downstream, recovery.progress).ready).toEqual([]);
      } else {
        expect(failure).toBeUndefined();
        expect(specFrontier(downstream, recovery.progress).ready.map((entry) => entry.number)).toEqual([21]);
      }
    });
  },
  30_000,
);

test("does not resume another actor's unfinished work even when its issues are unassigned", async () => {
  await repository(async (cwd, graph, recordHandoff) => {
    const first = createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement });
    const workspace = await first.prepareSpec(graph);
    await first.execute(workspace, ticket(11));
    const before = await command("git", ["worktree", "list", "--porcelain"], cwd);
    const next = createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement });
    const recovery = createSpecRecovery({ cwd, invocationBranch: "main", actor: "collaborator", tickets: next });
    const restored = await recovery.restore(graph);
    expect(restored).toBeUndefined();
    expect(next.contexts.size).toBe(0);
    expect(recovery.progress.recoverable?.size).toBe(0);
    const after = await command("git", ["worktree", "list", "--porcelain"], cwd);
    expect(after).toBe(before);
  });
}, 30_000);

test("recognizes delivery in a fresh checkout containing only the persistent invocation branch objects", async () => {
  await repository(async (cwd, graph, recordHandoff) => {
    const delivered = await deliverFixture(cwd, graph, recordHandoff);
    const clone = await mkdtemp(join(tmpdir(), "iam-afk-delivered-only-"));
    try {
      await command("git", ["clone", "--no-local", "--single-branch", "--branch", "main", cwd, clone], cwd);
      let missingCandidate: unknown;
      try {
        await command("git", ["cat-file", "-e", `${delivered.finalCandidate}^{commit}`], clone);
      } catch (error) {
        missingCandidate = error;
      }
      expect(missingCandidate).toBeInstanceOf(Error);
      const head = await command("git", ["rev-parse", "HEAD"], clone);
      expect(head).toBe(delivered.squashSha);
      const recovery = createSpecRecovery({
        cwd: clone,
        invocationBranch: "main",
        actor: "runner",
        tickets: createTicketLifecycle({ cwd: clone, invocationBranch: "main", recordHandoff, runTicket: implement }),
      });
      await recovery.confirmDelivered(graph.spec);
      await recovery.confirmDelivered(graph.tickets[0]!);
      expect(recovery.progress.delivered).toEqual(new Set([10, 11]));
      expect(await recovery.localSpecs()).toEqual([]);
    } finally {
      await rm(clone, { recursive: true, force: true });
    }
  });
}, 30_000);

test("prioritizes existing accepted integrations over fresh work and continues only the unfinished frontier", async () => {
  await repository(async (cwd, graph, recordHandoff) => {
    const options = { cwd, invocationBranch: "main", recordHandoff, runTicket: implement };
    const first = createTicketLifecycle(options);
    const original = await first.prepareSpec(graph);
    await first.execute(original, ticket(11));
    const integrated = await first.integrate(original, ticket(11));
    graph.spec.assignees = ["runner"];
    graph.tickets[0]!.assignees = ["runner"];
    const next = createTicketLifecycle(options);
    const recovery = createSpecRecovery({ cwd, invocationBranch: "main", actor: "runner", tickets: next });
    const fresh = issue(20, "spec");
    const restored = await recovery.select([{ spec: fresh, tickets: [], dependencies: [fresh] }, graph]);
    expect(restored).toBeDefined();
    const frontier = specFrontier(graph, recovery.progress);
    expect(frontier.ready.map((entry) => entry.number)).toEqual([12]);
    expect(next.integrated).toEqual(new Set([11]));
    expect(next.contexts.get(11)?.mergedSha).toBe(integrated.mergedSha);
    await next.execute(restored!.workspace, ticket(12));
    await next.integrate(restored!.workspace, ticket(12));
    const content = await readFile(join(restored!.workspace.worktreePath, "12.txt"), "utf8");
    expect(content).toBe("implemented\n");
    const target = await command("git", ["rev-parse", "main"], cwd);
    expect(target).toBe(original.invocationBase);
  });
}, 30_000);

test("recovers an already merged candidate with lost acceptance recording by checking it again without another merge", async () => {
  await repository(async (cwd, graph, recordHandoff) => {
    let missing = true;
    const first = createTicketLifecycle({
      cwd,
      invocationBranch: "main",
      runTicket: implement,
      recordHandoff: async (number, body) => {
        if (missing && body.startsWith("Spec #10 的票级集成已完成")) throw new Error("Comment failed after merge");
        await recordHandoff(number, body);
      },
    });
    const original = await first.prepareSpec(graph);
    await first.execute(original, ticket(11));
    try {
      await first.integrate(original, ticket(11));
    } catch {}
    missing = false;
    const before = await command("git", ["rev-parse", original.branch], cwd);
    let accepts = 0;
    const next = createTicketLifecycle({
      cwd,
      invocationBranch: "main",
      recordHandoff,
      runTicket: async (input) => {
        expect(input.phase).toBe("accept");
        accepts++;
        return implement(input);
      },
    });
    const recovery = createSpecRecovery({ cwd, invocationBranch: "main", actor: "runner", tickets: next });
    const restored = await recovery.restore(graph);
    expect(next.integrated.size).toBe(0);
    await recovery.execute(restored!.workspace, ticket(11));
    await next.integrate(restored!.workspace, ticket(11));
    const after = await command("git", ["rev-parse", original.branch], cwd);
    expect(after).toBe(before);
    expect(accepts).toBe(1);
    expect(next.integrated.has(11)).toBe(true);
  });
}, 30_000);

test.each(["incomplete", "executor-error"])(
  "recovers acceptance after merging and committing before %s without replaying implementation",
  async (failureMode) => {
    await repository(async (cwd, graph, recordHandoff) => {
      graph.tickets[1]!.blockers = [];
      let accepts = 0;
      const first = createTicketLifecycle({
        cwd,
        invocationBranch: "main",
        recordHandoff,
        runTicket: async (input) => {
          const result = await implement(input);
          if (input.phase !== "accept" || input.context.ticket.number !== 11) return result;
          accepts++;
          await writeFile(join(input.context.worktreePath, "acceptance-fix.txt"), "retained acceptance fix\n");
          await command("git", ["add", "."], input.context.worktreePath);
          await command(
            "git",
            ["commit", "-m", "Acceptance fix before failed verification"],
            input.context.worktreePath,
          );
          if (failureMode === "executor-error") throw new Error("Acceptance executor disconnected after commit");
          return { completed: false, handoff: "Merged and fixed; required verification remains incomplete." };
        },
      });
      const workspace = await first.prepareSpec(graph);
      await first.execute(workspace, ticket(11));
      await first.execute(workspace, ticket(12));
      await first.integrate(workspace, ticket(12));
      let failure: unknown;
      try {
        await first.integrate(workspace, ticket(11));
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect(accepts).toBe(1);
      expect(first.integrated.has(11)).toBe(false);
      const retainedHead = await command("git", ["rev-parse", ticket(11).branch], cwd);
      let rechecked = false;
      const next = createTicketLifecycle({
        cwd,
        invocationBranch: "main",
        recordHandoff,
        runTicket: async (input) => {
          expect(input.phase).toBe("accept");
          expect(input.context.candidate).toBe(retainedHead);
          const fix = await readFile(join(input.context.worktreePath, "acceptance-fix.txt"), "utf8");
          const peer = await readFile(join(input.context.worktreePath, "12.txt"), "utf8");
          expect(fix).toBe("retained acceptance fix\n");
          expect(peer).toBe("implemented\n");
          rechecked = true;
          return implement(input);
        },
      });
      const recovery = createSpecRecovery({ cwd, invocationBranch: "main", actor: "runner", tickets: next });
      const restored = await recovery.restore(graph);
      await recovery.execute(restored!.workspace, ticket(11));
      await next.integrate(restored!.workspace, ticket(11));
      expect(rechecked).toBe(true);
      expect(next.integrated).toEqual(new Set([11, 12]));
    });
  },
  30_000,
);

test.each(["other-claim", "unknown-dirty-path", "candidate-drift"])(
  "preserves an uncertain recovery after %s",
  async (scenario) => {
    await repository(async (cwd, graph, recordHandoff) => {
      const first = createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement });
      const workspace = await first.prepareSpec(graph);
      await first.execute(workspace, ticket(11));
      const context = first.contexts.get(11)!;
      if (scenario === "other-claim") {
        graph.spec.assignees = ["someone-else"];
        graph.tickets[0]!.assignees = ["someone-else"];
      }
      if (scenario === "unknown-dirty-path") {
        graph.tickets[0]!.comments = graph.tickets[0]!.comments!.map((entry) => ({
          ...entry,
          body: entry.body.replace(/ticket 工作树：[^；。]+；/g, ""),
        }));
        await writeFile(join(context.worktreePath, "unknown.txt"), "unknown uncommitted work\n");
        await command("git", ["worktree", "move", context.worktreePath, join(cwd, "unowned-location")], cwd);
      }
      if (scenario === "candidate-drift")
        await command("git", ["commit", "--allow-empty", "-m", "unexpected branch drift"], context.worktreePath);
      const before = await command("git", ["rev-parse", context.ticket.branch], cwd);
      const next = createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement });
      const recovery = createSpecRecovery({ cwd, invocationBranch: "main", actor: "runner", tickets: next });
      let failure: unknown;
      let result: RecoveredSpec | undefined;
      try {
        result = await recovery.restore(graph);
      } catch (error) {
        failure = error;
      }
      if (scenario === "other-claim") {
        expect(result).toBeUndefined();
        expect(recovery.progress.recoverable?.size).toBe(0);
      } else expect(failure).toBeInstanceOf(GitStateError);
      const after = await command("git", ["rev-parse", context.ticket.branch], cwd);
      expect(after).toBe(before);
      expect(next.integrated.size).toBe(0);
    });
  },
  30_000,
);

test("finishes remaining cleanup for a closed parent with already removed ticket worktrees", async () => {
  await repository(async (cwd, graph, recordHandoff) => {
    const first = createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement });
    const workspace = await first.prepareSpec(graph);
    for (const child of graph.tickets) {
      await first.execute(workspace, ticket(child.number));
      await first.integrate(workspace, ticket(child.number));
    }
    const finalized = await createFinalizationLifecycle({
      cwd,
      recordHandoff,
      runFinal: async () => ({ completed: true, handoff: "Both real reports; all required validation passed." }),
    }).finalize(workspace, first.contexts, first.integrated);
    const locked = first.contexts.get(12)!;
    const delivery = createSpecDelivery({
      cwd,
      creatorsStopped: () => true,
      recordHandoff,
      closeIssue: async (number) => {
        graph.dependencies.find((entry) => entry.number === number)!.state = "CLOSED";
        if (number === 10) await command("git", ["worktree", "lock", locked.worktreePath], cwd);
      },
    });
    try {
      await delivery.deliver(finalized, first.contexts);
    } catch {}
    expect(graph.spec.state).toBe("CLOSED");
    const cleaned = first.contexts.get(11)!;
    await command("git", ["worktree", "remove", cleaned.worktreePath], cwd);
    await command("git", ["update-ref", "-d", `refs/heads/${cleaned.ticket.branch}`, cleaned.candidate!], cwd);
    await command("git", ["worktree", "unlock", locked.worktreePath], cwd);
    const next = createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement });
    const recovery = createSpecRecovery({ cwd, invocationBranch: "main", actor: "runner", tickets: next });
    expect(await recovery.localSpecs()).toEqual([10]);
    const restored = await recovery.restore(graph);
    expect(restored?.squashSha).toBeDefined();
    const closes: number[] = [];
    await createSpecDelivery({
      cwd,
      creatorsStopped: () => true,
      recordHandoff,
      closeIssue: async (number) => {
        closes.push(number);
      },
    }).deliver(restored!.finalized!, next.contexts, { squashSha: restored!.squashSha! });
    expect(closes).toEqual([]);
    expect(await recovery.localSpecs()).toEqual([]);
    const registrations = await command("git", ["worktree", "list", "--porcelain"], cwd);
    expect(registrations.match(/^worktree /gm)).toHaveLength(1);
  });
}, 30_000);

test.each(["partial-close", "lost-delivery-comment"])(
  "resumes %s without repeating squash, implementation, or final review",
  async (scenario) => {
    await repository(async (cwd, graph, recordHandoff) => {
      const lifecycle = createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement });
      const workspace = await lifecycle.prepareSpec(graph);
      for (const child of graph.tickets) {
        await lifecycle.execute(workspace, ticket(child.number));
        await lifecycle.integrate(workspace, ticket(child.number));
      }
      const gate = createFinalizationLifecycle({
        cwd,
        recordHandoff,
        runFinal: async () => ({
          completed: true,
          handoff: "Real Standards and Spec reports; full required verification passed.",
        }),
      });
      const finalized = await gate.finalize(workspace, lifecycle.contexts, lifecycle.integrated);
      const first = createSpecDelivery({
        cwd,
        creatorsStopped: () => true,
        recordHandoff: async (number, body) => {
          if (scenario === "lost-delivery-comment" && body.includes("已确认本地 squash 交付"))
            throw new Error("Delivery comment lost after commit");
          await recordHandoff(number, body);
        },
        closeIssue: async (number) => {
          if (number === 12) throw new Error("GitHub disconnected after first close");
          graph.dependencies.find((entry) => entry.number === number)!.state = "CLOSED";
        },
      });
      try {
        await first.deliver(finalized, lifecycle.contexts);
      } catch {}
      const squash = await command("git", ["rev-parse", "HEAD"], cwd);
      const next = createTicketLifecycle({
        cwd,
        invocationBranch: "main",
        recordHandoff,
        runTicket: async () => {
          throw new Error("Cannot replay delivered work");
        },
      });
      const recovery = createSpecRecovery({ cwd, invocationBranch: "main", actor: "runner", tickets: next });
      const restored = await recovery.restore(graph);
      expect(restored?.squashSha).toBe(squash);
      const closed: number[] = [];
      const delivery = createSpecDelivery({
        cwd,
        creatorsStopped: () => true,
        recordHandoff,
        closeIssue: async (number) => {
          closed.push(number);
          graph.dependencies.find((entry) => entry.number === number)!.state = "CLOSED";
        },
      });
      await delivery.deliver(restored!.finalized!, next.contexts, { squashSha: restored!.squashSha! });
      expect(closed).toEqual(scenario === "partial-close" ? [12, 10] : [11, 12, 10]);
      const head = await command("git", ["rev-parse", "HEAD"], cwd);
      expect(head).toBe(squash);
      const count = await command("git", ["rev-list", "--count", `${finalized.reviewBase}..main`], cwd);
      expect(count).toBe("1");
    });
  },
  30_000,
);

test("reuses a current final gate but merges an advanced invocation baseline before requiring a new gate", async () => {
  await repository(async (cwd, graph, recordHandoff) => {
    const lifecycle = createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement });
    const workspace = await lifecycle.prepareSpec(graph);
    for (const child of graph.tickets) {
      await lifecycle.execute(workspace, ticket(child.number));
      await lifecycle.integrate(workspace, ticket(child.number));
    }
    const gate = createFinalizationLifecycle({
      cwd,
      recordHandoff,
      runFinal: async () => ({ completed: true, handoff: "Real reports and required validation completed." }),
    });
    const finalized = await gate.finalize(workspace, lifecycle.contexts, lifecycle.integrated);
    const first = createSpecRecovery({
      cwd,
      invocationBranch: "main",
      actor: "runner",
      tickets: createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement }),
    });
    const unchanged = await first.restore(graph);
    expect(unchanged?.finalized?.finalCandidate).toBe(finalized.finalCandidate);
    await recordHandoff(
      10,
      `Spec #10 最终验收尚未完成，保留分支与工作树。\nreview base：${workspace.invocationBase}；评审候选：${finalized.reviewCandidate}。\n\n阻碍：最终交接后检查失败。`,
    );
    const invalidated = await createSpecRecovery({
      cwd,
      invocationBranch: "main",
      actor: "runner",
      tickets: createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement }),
    }).restore(graph);
    expect(invalidated?.finalized).toBeUndefined();
    graph.spec.comments!.pop();
    await writeFile(join(cwd, "new-base.txt"), "new caller content\n");
    await command("git", ["add", "."], cwd);
    await command("git", ["commit", "-m", "caller advances"], cwd);
    const advanced = await command("git", ["rev-parse", "HEAD"], cwd);
    const next = createSpecRecovery({
      cwd,
      invocationBranch: "main",
      actor: "runner",
      tickets: createTicketLifecycle({ cwd, invocationBranch: "main", recordHandoff, runTicket: implement }),
    });
    const restored = await next.restore(graph);
    expect(restored?.finalized).toBeUndefined();
    expect(restored?.workspace.invocationBase).toBe(advanced);
    const content = await readFile(join(restored!.workspace.worktreePath, "new-base.txt"), "utf8");
    expect(content).toBe("new caller content\n");
    expect(next.progress.integrated).toEqual(new Set([11, 12]));
  });
}, 30_000);

test.each(["recorded-path", "legacy-canonical-path"])(
  "resumes the owned unfinished checkout using %s with uncommitted work intact",
  async (scenario) => {
    await repository(async (cwd, graph, recordHandoff) => {
      const first = createTicketLifecycle({
        cwd,
        invocationBranch: "main",
        recordHandoff,
        runTicket: async ({ context }) => {
          await writeFile(join(context.worktreePath, "draft.txt"), "owned unfinished work\n");
          return { completed: false, handoff: "Implementation interrupted; draft retained." };
        },
      });
      const original = await first.prepareSpec(graph);
      try {
        await first.execute(original, ticket(11));
      } catch {}
      const path = first.contexts.get(11)!.worktreePath;
      if (scenario === "legacy-canonical-path")
        graph.tickets[0]!.comments = graph.tickets[0]!.comments!.map((entry) => ({
          ...entry,
          body: entry.body.replace(/ticket 工作树：[^；。]+；/g, ""),
        }));
      let continued = false;
      const next = createTicketLifecycle({
        cwd,
        invocationBranch: "main",
        recordHandoff,
        runTicket: async (input) => {
          if (input.phase === "implement") {
            const content = await readFile(join(input.context.worktreePath, "draft.txt"), "utf8");
            expect(content).toBe("owned unfinished work\n");
            expect(resolve(input.context.worktreePath)).toBe(resolve(path));
            continued = true;
          }
          return implement(input);
        },
      });
      const recovery = createSpecRecovery({ cwd, invocationBranch: "main", actor: "runner", tickets: next });
      const restored = await recovery.restore(graph);
      await recovery.execute(restored!.workspace, ticket(11));
      await next.integrate(restored!.workspace, ticket(11));
      expect(continued).toBe(true);
      expect(next.integrated.has(11)).toBe(true);
    });
  },
  30_000,
);

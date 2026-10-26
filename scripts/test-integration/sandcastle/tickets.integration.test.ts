import { describe, expect, test } from "bun:test";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "../../sandcastle/commands";
import type { SpecGraph, TrackedIssue } from "../../sandcastle/specs";
import { specFrontier } from "../../sandcastle/specs";
import { createTicketLifecycle, GitStateError, type TicketRun } from "../../sandcastle/tickets";
import type { Ticket } from "../../sandcastle/workflow";
import { runWorkflow } from "../../sandcastle/workflow";

function issue(number: number, type: "spec" | "ticket"): TrackedIssue {
  return {
    number,
    title: `${type} ${number}`,
    body: "",
    state: "OPEN",
    labels: [`type:${type}`, "ready-for-agent"],
    assignees: [],
    parent: type === "ticket" ? 10 : null,
    blockers: [],
  };
}
const spec = issue(10, "spec");
const child = issue(11, "ticket");
const graph: SpecGraph = { spec, tickets: [child], dependencies: [spec, child] };
const ticket: Ticket = {
  number: 11,
  title: child.title,
  branch: "codex/sandcastle/issue-11",
  implementer: "implementer_standard",
  reason: "Routine feature",
};

async function repository(run: (cwd: string, git: (...args: string[]) => Promise<string>) => Promise<void>) {
  const cwd = await mkdtemp(join(tmpdir(), "iam-afk-ticket-test-"));
  const git = (...args: string[]) => command("git", args, cwd);
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
    await run(cwd, git);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

const implement: TicketRun = async ({ phase, context, integrationSha }) => {
  const git = (...args: string[]) => command("git", args, context.worktreePath);
  if (phase === "implement") {
    const file = context.ticket.number === 11 ? "ticket.txt" : `ticket-${context.ticket.number}.txt`;
    await writeFile(join(context.worktreePath, file), "implemented\n");
    await git("add", file);
    await git("commit", "-m", `Implement #${context.ticket.number}`);
  } else {
    await git("merge", "--no-edit", integrationSha);
    await git("diff", "--check");
  }
  return { completed: true, handoff: "Focused behavior and type checks passed; no required checks remain." };
};

describe("Sandcastle ticket integration", () => {
  test("the workflow starts a dependent ticket from real integrated content while its independent peer is still running", async () => {
    await repository(async (cwd, git) => {
      const invocation = await git("rev-parse", "HEAD");
      const children = [child, issue(12, "ticket"), { ...issue(13, "ticket"), blockers: [11] }];
      const expanded: SpecGraph = { spec, tickets: children, dependencies: [spec, ...children] };
      const entries = children.map((entry) => ({
        ...ticket,
        number: entry.number,
        title: entry.title,
        branch: `codex/sandcastle/issue-${entry.number}`,
      }));
      let releaseB!: () => void;
      let startedC!: () => void;
      const heldB = new Promise<void>((resolve) => {
        releaseB = resolve;
      });
      const enteredC = new Promise<void>((resolve) => {
        startedC = resolve;
      });
      let finishedB = false;
      let inheritedA: string | undefined;
      const lifecycle = createTicketLifecycle({
        cwd,
        invocationBranch: "main",
        recordHandoff: async () => {},
        runTicket: async (input) => {
          if (input.phase === "implement" && input.context.ticket.number === 12) {
            await heldB;
            finishedB = true;
          }
          if (input.phase === "implement" && input.context.ticket.number === 13) {
            try {
              inheritedA = await readFile(join(input.context.worktreePath, "ticket.txt"), "utf8");
            } finally {
              startedC();
            }
          }
          return implement(input);
        },
      });
      const workspace = await lifecycle.prepareSpec(expanded);
      const completion = runWorkflow(
        { maxParallel: 2 },
        {
          plan: async () => ({ workspace, tickets: entries.slice(0, 2) }),
          frontier: async (_workspace, attempted) => {
            const frontier = specFrontier(expanded, { integrated: lifecycle.integrated });
            return {
              ...frontier,
              tickets: entries.filter(
                (entry) =>
                  frontier.ready.some((ready) => ready.number === entry.number) && !attempted.has(entry.number),
              ),
            };
          },
          execute: (entry) => lifecycle.execute(workspace, entry),
          integrate: (entry) => lifecycle.integrate(workspace, entry),
          report: () => {},
        },
      );
      try {
        await enteredC;
        expect(finishedB).toBe(false);
        expect(inheritedA).toBe("implemented\n");
        expect(lifecycle.integrated.has(11)).toBe(true);
        expect(lifecycle.integrated.has(12)).toBe(false);
      } finally {
        releaseB();
      }
      const result = await completion;
      expect(result.readyForFinalization).toEqual([10]);
      expect(lifecycle.integrated).toEqual(new Set([11, 12, 13]));
      expect(await git("rev-parse", "HEAD")).toBe(invocation);
      expect(children.every((entry) => entry.state === "OPEN")).toBe(true);
    });
  }, 30_000);

  test("accepts one ticket into its Spec without delivering or closing issues", async () => {
    await repository(async (cwd, git) => {
      const invocation = await git("rev-parse", "HEAD");
      const comments: { number: number; body: string }[] = [];
      const lifecycle = createTicketLifecycle({
        cwd,
        invocationBranch: "main",
        runTicket: implement,
        recordHandoff: async (number, body) => {
          comments.push({ number, body });
        },
      });
      const workspace = await lifecycle.prepareSpec(graph);
      const executed = await lifecycle.execute(workspace, ticket);
      expect(executed).toBe(true);
      expect(lifecycle.integrated.has(11)).toBe(false);
      const result = await lifecycle.integrate(workspace, ticket);
      const target = await git("rev-parse", "main");
      const parents = await git("rev-list", "--parents", "-n", "1", result.mergedSha);
      const contents = await readFile(join(workspace.worktreePath, "ticket.txt"), "utf8");
      expect(target).toBe(invocation);
      expect(parents.split(" ")).toHaveLength(3);
      expect(contents).toBe("implemented\n");
      expect(lifecycle.integrated.has(11)).toBe(true);
      expect(result.baseSha).toBe(invocation);
      expect(result.candidate).not.toBe(invocation);
      const handoff = comments.find((entry) => entry.body.startsWith("Spec #10 的票级集成已完成"));
      expect(handoff?.number).toBe(11);
      expect(handoff?.body).toContain(result.candidate);
      expect(handoff?.body).toContain(workspace.branch);
      expect(graph.spec.state).toBe("OPEN");
      expect(child.state).toBe("OPEN");
    });
  });

  test("preserves the candidate when the invocation branch advances during implementation", async () => {
    await repository(async (cwd, git) => {
      const lifecycle = createTicketLifecycle({
        cwd,
        invocationBranch: "main",
        runTicket: implement,
        recordHandoff: async () => {},
      });
      const workspace = await lifecycle.prepareSpec(graph);
      await lifecycle.execute(workspace, ticket);
      await git("commit", "--allow-empty", "-m", "unexpected caller change");
      const before = await command("git", ["rev-parse", "HEAD"], workspace.worktreePath);
      let caught: unknown;
      try {
        await lifecycle.integrate(workspace, ticket);
      } catch (error) {
        caught = error;
      }
      const after = await command("git", ["rev-parse", "HEAD"], workspace.worktreePath);
      expect(caught).toBeInstanceOf(GitStateError);
      expect(after).toBe(before);
      expect(lifecycle.integrated.size).toBe(0);
      expect(lifecycle.contexts.get(11)?.candidate).toBeDefined();
    });
  });

  test("serializes acceptance, refreshes the handoff baseline, and starts new tickets from integrated content", async () => {
    await repository(async (cwd, git) => {
      const second = { ...ticket, number: 12, title: "ticket 12", branch: "codex/sandcastle/issue-12" };
      const third = { ...ticket, number: 13, title: "ticket 13", branch: "codex/sandcastle/issue-13" };
      const expanded: SpecGraph = { ...graph, tickets: [child, issue(12, "ticket"), issue(13, "ticket")] };
      let release!: () => void;
      let started!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const accepting: number[] = [];
      const lifecycle = createTicketLifecycle({
        cwd,
        invocationBranch: "main",
        recordHandoff: async () => {},
        runTicket: async (input) => {
          if (input.phase === "accept") {
            accepting.push(input.context.ticket.number);
            if (input.context.ticket.number === 11) {
              started();
              await held;
            }
          }
          return implement(input);
        },
      });
      const workspace = await lifecycle.prepareSpec(expanded);
      await lifecycle.execute(workspace, ticket);
      await lifecycle.execute(workspace, second);
      const original = lifecycle.contexts.get(12)!;
      const first = lifecycle.integrate(workspace, ticket);
      await entered;
      const next = lifecycle.integrate(workspace, second);
      expect(accepting).toEqual([11]);
      expect(lifecycle.integrated.size).toBe(0);
      release();
      const merged = await first;
      const refreshed = await next;
      await command("git", ["merge-base", "--is-ancestor", merged.mergedSha!, refreshed.candidate!], cwd);
      expect(accepting).toEqual([11, 12]);
      expect(refreshed.baseSha).toBe(original.baseSha);
      expect(original.candidate).not.toBe(refreshed.candidate);
      expect(lifecycle.integrated).toEqual(new Set([11, 12]));
      await lifecycle.execute(workspace, third);
      expect(lifecycle.contexts.get(13)?.baseSha).toBe(refreshed.mergedSha);
      expect(await git("rev-parse", "main")).toBe(workspace.invocationBase);
    });
  }, 20_000);

  test("reuses an explicitly associated Spec branch and resumes a ticket only with its checked baseline", async () => {
    await repository(async (cwd, git) => {
      await git("branch", "codex/existing-feature");
      await git("worktree", "add", join(cwd, ".sandcastle", "existing-spec"), "codex/existing-feature");
      const associated: SpecGraph = { ...graph, spec: { ...spec, body: "复用功能/集成分支：codex/existing-feature" } };
      const base = await git("rev-parse", "HEAD");
      await git("branch", ticket.branch);
      const lifecycle = createTicketLifecycle({
        cwd,
        invocationBranch: "main",
        runTicket: implement,
        recordHandoff: async () => {},
      });
      const workspace = await lifecycle.prepareSpec(associated);
      expect(workspace.worktreePath.replaceAll("\\", "/")).toBe(
        join(cwd, ".sandcastle", "existing-spec").replaceAll("\\", "/"),
      );
      let unknown: unknown;
      try {
        await lifecycle.execute(workspace, ticket);
      } catch (error) {
        unknown = error;
      }
      expect(unknown).toBeInstanceOf(GitStateError);
      expect(await git("rev-parse", ticket.branch)).toBe(base);
      await lifecycle.execute(workspace, ticket, { baseSha: base });
      const result = await lifecycle.integrate(workspace, ticket);
      expect(result.spec.branch).toBe("codex/existing-feature");
      expect(result.baseSha).toBe(base);
      expect(await lifecycle.prepareSpec(associated)).toBe(workspace);
    });
  }, 20_000);

  test.each(["implementation", "validation", "candidate-drift", "handoff"])(
    "preserves recoverable work after %s failure",
    async (scenario) => {
      await repository(async (cwd, git) => {
        let accepted = 0;
        let comments = 0;
        const lifecycle = createTicketLifecycle({
          cwd,
          invocationBranch: "main",
          runTicket: async (input) => {
            if (input.phase === "accept") accepted++;
            const result = await implement(input);
            if (
              (scenario === "implementation" && input.phase === "implement") ||
              (scenario === "validation" && input.phase === "accept")
            )
              return { ...result, completed: false };
            return result;
          },
          recordHandoff: async (_number, body) => {
            if (!body.includes("票级集成已完成")) return;
            comments++;
            if (scenario === "handoff" && comments === 1) throw new Error("GitHub comment unavailable");
          },
        });
        const workspace = await lifecycle.prepareSpec(graph);
        const initial = await command("git", ["rev-parse", "HEAD"], workspace.worktreePath);
        let caught: unknown;
        try {
          await lifecycle.execute(workspace, ticket);
          if (scenario === "candidate-drift")
            await command(
              "git",
              ["commit", "--allow-empty", "-m", "unexpected update"],
              lifecycle.contexts.get(11)!.worktreePath,
            );
          await lifecycle.integrate(workspace, ticket);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(scenario === "candidate-drift" ? GitStateError : Error);
        expect(lifecycle.integrated.size).toBe(0);
        const context = lifecycle.contexts.get(11)!;
        await access(context.worktreePath);
        expect(await git("rev-parse", ticket.branch)).not.toBe(initial);
        const integratedHead = await command("git", ["rev-parse", "HEAD"], workspace.worktreePath);
        if (scenario === "handoff") {
          expect(context.mergedSha).toBe(integratedHead);
          const recovered = await lifecycle.integrate(workspace, ticket);
          expect(recovered.mergedSha).toBe(integratedHead);
          expect(accepted).toBe(1);
          expect(lifecycle.integrated.has(11)).toBe(true);
        } else {
          expect(integratedHead).toBe(initial);
          expect(context.mergedSha).toBeUndefined();
        }
        expect(await git("rev-parse", "main")).toBe(workspace.invocationBase);
      });
    },
    20_000,
  );

  test("preserves unknown orphan directories without creating or pruning worktrees", async () => {
    await repository(async (cwd, git) => {
      const orphan = join(cwd, ".sandcastle", "worktrees", "spec-10");
      await mkdir(orphan, { recursive: true });
      await writeFile(join(orphan, "sentinel"), "unowned recovery work");
      const before = await git("worktree", "list", "--porcelain");
      const lifecycle = createTicketLifecycle({
        cwd,
        invocationBranch: "main",
        runTicket: implement,
        recordHandoff: async () => {},
      });
      let caught: unknown;
      try {
        await lifecycle.prepareSpec(graph);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(GitStateError);
      expect(await readFile(join(orphan, "sentinel"), "utf8")).toBe("unowned recovery work");
      expect(await git("worktree", "list", "--porcelain")).toBe(before);
    });
  });
});

import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "../../sandcastle/commands";
import { createFinalizationLifecycle, type FinalizationRun } from "../../sandcastle/finalization";
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
  const cwd = await mkdtemp(join(tmpdir(), "iam-afk-final-test-"));
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

async function integrated(cwd: string) {
  const spec = issue(10, "spec");
  const child = issue(11, "ticket");
  const graph: SpecGraph = { spec, tickets: [child], dependencies: [spec, child] };
  const ticket = {
    number: 11,
    title: child.title,
    branch: "codex/sandcastle/issue-11",
    implementer: "implementer_standard" as const,
    reason: "Routine change",
  };
  const tickets = createTicketLifecycle({
    cwd,
    invocationBranch: "main",
    recordHandoff: async () => {},
    runTicket: async ({ phase, context, integrationSha }) => {
      const git = (...args: string[]) => command("git", args, context.worktreePath);
      if (phase === "implement") {
        await writeFile(join(context.worktreePath, "ticket.txt"), "implemented\n");
        await git("add", "ticket.txt");
        await git("commit", "-m", "Implement #11");
      } else await git("merge", "--no-edit", integrationSha);
      return { completed: true, handoff: "Focused behavior and types passed." };
    },
  });
  const workspace = await tickets.prepareSpec(graph);
  await tickets.execute(workspace, ticket);
  await tickets.integrate(workspace, ticket);
  return { workspace, tickets };
}

test("finalizes the complete Spec once and preserves the reviewed and repaired candidates without delivery", async () => {
  await repository(async (cwd) => {
    const { workspace, tickets } = await integrated(cwd);
    const git = (...args: string[]) => command("git", args, workspace.worktreePath);
    const candidate = await git("rev-parse", "HEAD");
    const phases: string[] = [];
    const comments: string[] = [];
    const runFinal: FinalizationRun = async (input) => {
      phases.push(input.phase);
      expect(input.reviewBase).toBe(workspace.invocationBase);
      expect(input.reviewCandidate).toBe(candidate);
      expect(input.tickets.map((entry) => entry.ticket.number)).toEqual([11]);
      if (input.phase === "review")
        return { completed: true, handoff: "Standards: one naming finding. Spec: no findings." };
      expect(input.reviewReport).toContain("one naming finding");
      await writeFile(join(workspace.worktreePath, "repair.txt"), "finding resolved\n");
      await git("add", "repair.txt");
      await git("commit", "-m", "Resolve final finding #10");
      return {
        completed: true,
        handoff: "Naming finding fixed; focused check and pnpm verify passed; no additional required checks.",
      };
    };
    const lifecycle = createFinalizationLifecycle({
      cwd,
      runFinal,
      recordHandoff: async (_number, body) => {
        comments.push(body);
      },
    });
    const result = await lifecycle.finalize(workspace, tickets.contexts, tickets.integrated);
    expect(phases).toEqual(["review", "repair-and-verify"]);
    expect(result.reviewCandidate).toBe(candidate);
    expect(result.finalCandidate).not.toBe(candidate);
    expect(result.finalCandidate).toBe(await git("rev-parse", "HEAD"));
    expect(result.reviewReport).toContain("Standards:");
    expect(result.repairAndValidation).toContain("pnpm verify passed");
    expect(comments.at(-1)).toContain(result.finalCandidate);
    expect(await command("git", ["rev-parse", "main"], cwd)).toBe(workspace.invocationBase);
    expect(workspace.graph.spec.state).toBe("OPEN");
  });
}, 20_000);

test("does not review a partial Spec even when all existing contexts are integrated", async () => {
  await repository(async (cwd) => {
    const { workspace, tickets } = await integrated(cwd);
    workspace.graph.tickets.push(issue(12, "ticket"));
    const phases: string[] = [];
    const lifecycle = createFinalizationLifecycle({
      cwd,
      recordHandoff: async () => {},
      runFinal: async (input) => {
        phases.push(input.phase);
        return { completed: true, handoff: "unused" };
      },
    });
    let caught: unknown;
    try {
      await lifecycle.finalize(workspace, tickets.contexts, tickets.integrated);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(phases).toEqual([]);
    expect(await command("git", ["rev-parse", "main"], cwd)).toBe(workspace.invocationBase);
  });
}, 20_000);

test.each([
  "missing-axis",
  "failed-session",
  "unresolved-findings",
  "required-check-failed",
  "review-drift",
  "target-drift",
  "dirty-review",
  "empty-report",
  "missing-validation-record",
])(
  "preserves an unfinished Spec after %s without opening another review or repair session",
  async (scenario) => {
    await repository(async (cwd) => {
      const { workspace, tickets } = await integrated(cwd);
      const phases: string[] = [];
      const comments: string[] = [];
      const candidate = await command("git", ["rev-parse", "HEAD"], workspace.worktreePath);
      const failure = new Error("Model session failed");
      const lifecycle = createFinalizationLifecycle({
        cwd,
        recordHandoff: async (_number, body) => {
          comments.push(body);
        },
        runFinal: async ({ phase }) => {
          phases.push(phase);
          if (phase === "review") {
            if (scenario === "missing-axis") return { completed: false, handoff: "Spec reviewer did not finish." };
            if (scenario === "empty-report") return { completed: true, handoff: " " };
            if (scenario === "failed-session") throw failure;
            if (scenario === "dirty-review")
              await writeFile(join(workspace.worktreePath, "uncommitted.txt"), "unexpected mutation");
            if (scenario === "review-drift")
              await command("git", ["commit", "--allow-empty", "-m", "unexpected mutation"], workspace.worktreePath);
            if (scenario === "target-drift")
              await command("git", ["commit", "--allow-empty", "-m", "caller advanced"], cwd);
            return { completed: true, handoff: "Standards: one finding. Spec: passed." };
          }
          if (scenario === "missing-validation-record") return { completed: true, handoff: " " };
          return {
            completed: false,
            handoff:
              scenario === "unresolved-findings"
                ? "Finding remains unresolved."
                : "pnpm verify failed; required integration not executed.",
          };
        },
      });
      let caught: unknown;
      try {
        await lifecycle.finalize(workspace, tickets.contexts, tickets.integrated);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(scenario.endsWith("drift") || scenario === "dirty-review" ? GitStateError : Error);
      if (scenario === "failed-session") expect(caught).toBe(failure);
      expect(phases).toEqual(
        scenario === "unresolved-findings" ||
          scenario === "required-check-failed" ||
          scenario === "missing-validation-record"
          ? ["review", "repair-and-verify"]
          : ["review"],
      );
      expect(comments.at(-1)).toContain(candidate);
      let repeated: unknown;
      try {
        await lifecycle.finalize(workspace, tickets.contexts, tickets.integrated);
      } catch (error) {
        repeated = error;
      }
      expect(repeated).toBeInstanceOf(Error);
      expect(phases.filter((phase) => phase === "review")).toHaveLength(1);
      expect(workspace.graph.spec.state).toBe("OPEN");
      if (scenario !== "target-drift")
        expect(await command("git", ["rev-parse", "main"], cwd)).toBe(workspace.invocationBase);
    });
  },
  20_000,
);

test("preserves both the failed session and unavailable issue handoff", async () => {
  await repository(async (cwd) => {
    const { workspace, tickets } = await integrated(cwd);
    const sessionFailure = new Error("review unavailable");
    const handoffFailure = new Error("GitHub unavailable");
    const lifecycle = createFinalizationLifecycle({
      cwd,
      runFinal: async () => {
        throw sessionFailure;
      },
      recordHandoff: async () => {
        throw handoffFailure;
      },
    });
    let caught: unknown;
    try {
      await lifecycle.finalize(workspace, tickets.contexts, tickets.integrated);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    if (!(caught instanceof AggregateError)) return;
    expect(caught.errors).toEqual([sessionFailure, handoffFailure]);
  });
}, 20_000);

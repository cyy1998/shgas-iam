import type { Ticket, WorkflowRuntime } from "../sandcastle/workflow";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { parseAgentRole } from "../sandcastle/agents";
import { prepareCodexAuth } from "../sandcastle/auth";
import { command, deleteMergedTicketBranch } from "../sandcastle/commands";
import { parsePlan, runWorkflow } from "../sandcastle/workflow";

function ticket(number: number): Ticket {
  return { number, title: `Implement issue ${number}`, branch: `codex/sandcastle/issue-${number}`, implementer: "implementer_standard", reason: "Routine feature" };
}

function runtime(overrides: Partial<WorkflowRuntime> = {}): WorkflowRuntime {
  return {
    plan: async () => [],
    execute: async () => true,
    merge: async () => {},
    report: () => {},
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("Sandcastle merged ticket cleanup", () => {
  test.each(["merged", "unmerged", "advanced", "checked-out", "other-branch"])("handles %s branches without losing recovery work", async (scenario) => {
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
      if (scenario !== "unmerged")
        await git("merge", "--ff-only", branch);
      if (scenario === "advanced") {
        await git("switch", branch);
        await git("commit", "--allow-empty", "-m", "new recovery work");
        await git("switch", "main");
      }
      if (scenario === "checked-out")
        await git("worktree", "add", join(directory, "ticket-worktree"), branch);
      const before = await git("rev-parse", `refs/heads/${branch}`);
      const target = await git("rev-parse", "HEAD");
      let caught: unknown;
      try {
        await deleteMergedTicketBranch(directory, branch, candidate);
      }
      catch (error) {
        caught = error;
      }
      const remaining = await git("for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`);
      const afterTarget = await git("rev-parse", "HEAD");
      expect(afterTarget).toBe(target);
      if (scenario === "merged") {
        expect(caught).toBeUndefined();
        expect(remaining).toBe("");
      }
      else {
        expect(caught).toBeInstanceOf(Error);
        expect(remaining).toBe(before);
      }
    }
    finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("Sandcastle account configuration", () => {
  test("uses CODEX_HOME credentials when the template leaves CODEX_AUTH_FILE blank", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iam-afk-auth-test-"));
    try {
      await writeFile(join(directory, "auth.json"), "{}");
      const auth = await prepareCodexAuth({ CODEX_HOME: directory, CODEX_AUTH: "chatgpt", CODEX_AUTH_FILE: "" });
      await auth.close();
      expect(auth.mode).toBe("chatgpt");
    }
    finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("passes explicit API credentials using the Codex exec environment key", async () => {
    const auth = await prepareCodexAuth({ CODEX_AUTH: "api-key", CODEX_API_KEY: "test-only-key" });
    await auth.close();
    expect(auth.env).toEqual({ CODEX_API_KEY: "test-only-key" });
  });

  test("persists refreshed account credentials on close", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iam-afk-auth-test-"));
    try {
      const source = join(directory, "auth.json");
      await writeFile(source, "{\"token\":\"original-test-token\"}");
      const auth = await prepareCodexAuth({ CODEX_HOME: directory });
      const updated = "{\"token\":\"refreshed-test-token\"}";
      await writeFile(join(auth.mounts[0]!.hostPath, "auth.json"), updated);
      await auth.close();
      const persisted = await readFile(source, "utf8");
      expect(persisted).toBe(updated);
    }
    finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("preserves both credentials when the host login changed during AFK", async () => {
    const directory = await mkdtemp(join(tmpdir(), "iam-afk-auth-test-"));
    let staged: string | undefined;
    try {
      const source = join(directory, "auth.json");
      await writeFile(source, "{\"token\":\"original-test-token\"}");
      const auth = await prepareCodexAuth({ CODEX_HOME: directory });
      staged = auth.mounts[0]!.hostPath;
      await writeFile(join(staged, "auth.json"), "{\"token\":\"refreshed-test-token\"}");
      await writeFile(source, "{\"token\":\"new-host-login\"}");
      let caught: unknown;
      try {
        await auth.close();
      }
      catch (error) {
        caught = error;
      }
      const host = await readFile(source, "utf8");
      const recovery = await readFile(join(staged, "auth.json"), "utf8");
      expect(caught).toBeInstanceOf(Error);
      expect(host).toBe("{\"token\":\"new-host-login\"}");
      expect(recovery).toBe("{\"token\":\"refreshed-test-token\"}");
    }
    finally {
      if (staged)
        await rm(staged, { recursive: true, force: true });
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("Sandcastle parent closeout", () => {
  test("waits for pending parent closeout even when all implementation tickets are closed", async () => {
    const closeout = deferred<void>();
    let finishing = false;
    let completed = false;
    const pending = runWorkflow({ maxIterations: 1, maxParallel: 1 }, runtime({
      finish: async () => {
        finishing = true;
        await closeout.promise;
      },
    })).then((result) => {
      completed = true;
      return result;
    });
    await Promise.resolve();
    expect(finishing).toBe(true);
    expect(completed).toBe(false);
    closeout.resolve();
    const result = await pending;
    expect(result.exhausted).toBe(true);
  });

  test("does not report an exhausted run when parent closure fails", async () => {
    const failure = new Error("GitHub parent update failed");
    let caught: unknown;
    try {
      await runWorkflow({ maxIterations: 1, maxParallel: 1 }, runtime({
        finish: async () => { throw failure; },
      }));
    }
    catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
  });
});

describe("Sandcastle plan", () => {
  test.each(["implementer_light", "implementer_standard", "implementer_deep"])("keeps Planner selection %s for dispatch", (implementer) => {
    const issue = { ...ticket(42), implementer, reason: "Risk-based selection" };
    expect(parsePlan(`<plan>${JSON.stringify({ issues: [issue] })}</plan>`)).toEqual([issue]);
  });
  test("reads one tagged plan from agent output", () => {
    const issues = [ticket(41), ticket(52)];
    const result = parsePlan(`Selected independent issues.\n<plan>${JSON.stringify({ issues })}</plan>\nDone.`);
    expect(result).toEqual(issues);
  });

  test("accepts an empty backlog", () => {
    expect(parsePlan("<plan>{\"issues\":[]}</plan>")).toEqual([]);
  });

  test.each([
    ["missing block", "No more work."],
    ["invalid JSON", "<plan>{</plan>"],
    ["missing issues", "<plan>{}</plan>"],
    ["non-array issues", "<plan>{\"issues\":{}}</plan>"],
    ["null payload", "<plan>null</plan>"],
    ["multiple blocks", "<plan>{\"issues\":[]}</plan><plan>{\"issues\":[]}</plan>"],
  ])("rejects %s", (_name, output) => {
    expect(() => parsePlan(output)).toThrow();
  });

  test.each([
    ["duplicate issue", [ticket(41), ticket(41)]],
    ["zero issue number", [ticket(0)]],
    ["negative issue number", [ticket(-1)]],
    ["fractional issue number", [ticket(1.5)]],
    ["unsafe issue number", [ticket(Number.MAX_SAFE_INTEGER + 1)]],
    ["string issue number", [{ ...ticket(41), number: "41" }]],
    ["blank title", [{ ...ticket(41), title: "  " }]],
    ["non-string title", [{ ...ticket(41), title: 41 }]],
    ["foreign branch", [{ ...ticket(41), branch: "main" }]],
    ["mismatched branch", [{ ...ticket(41), branch: ticket(52).branch }]],
    ["missing branch", [{ number: 41, title: "Implement issue" }]],
    ["unknown implementer", [{ ...ticket(41), implementer: "arbitrary-model" }]],
    ["missing implementer", [{ ...ticket(41), implementer: undefined }]],
    ["blank selection reason", [{ ...ticket(41), reason: " " }]],
    ["null issue", [null]],
  ])("rejects %s before it can be dispatched", (_name, issues) => {
    expect(() => parsePlan(`<plan>${JSON.stringify({ issues })}</plan>`)).toThrow();
  });
});

describe("Sandcastle role configuration", () => {
  const source = `name = "implementer_standard"
description = "Routine changes"
model = "custom-model"
model_reasoning_effort = "high"
developer_instructions = "Complete the ticket and request review."
`;
  test("loads model, effort and instructions from the repository role", () => {
    expect(parseAgentRole(source, "implementer_standard")).toMatchObject({
      model: "custom-model",
      effort: "high",
      instructions: "Complete the ticket and request review.",
    });
  });
  test.each([
    ["wrong name", source.replace("implementer_standard", "unregistered")],
    ["unsupported effort", source.replace("\"high\"", "\"ultra\"")],
    ["missing model", source.replace("model = \"custom-model\"", "")],
    ["missing instructions", source.replace("developer_instructions = \"Complete the ticket and request review.\"", "")],
  ])("rejects %s before starting an agent", (_name, input) => {
    expect(() => parseAgentRole(input, "implementer_standard")).toThrow();
  });
  test("requires reviewer read-only intent", () => {
    const reviewer = source.replace("implementer_standard", "spec_reviewer");
    expect(() => parseAgentRole(reviewer, "spec_reviewer")).toThrow();
    expect(parseAgentRole(`${reviewer}\nsandbox_mode = "read-only"`, "spec_reviewer").name).toBe("spec_reviewer");
  });
});

describe("Sandcastle workflow", () => {
  test("plans the next dependency frontier from the previous merged batch", async () => {
    const merged: number[] = [];
    const planningBases: number[][] = [];
    const executionBases: number[][] = [];
    const firstMergeStarted = deferred<void>();
    const releaseFirstMerge = deferred<void>();
    const completion = runWorkflow({ maxIterations: 3, maxParallel: 2 }, runtime({
      plan: async (iteration) => {
        planningBases.push([...merged]);
        if (iteration === 1) {
          return [ticket(1), ticket(2)];
        }
        return merged.includes(3) ? [] : [ticket(3)];
      },
      execute: async () => {
        executionBases.push([...merged]);
        return true;
      },
      merge: async (tickets) => {
        if (merged.length === 0) {
          firstMergeStarted.resolve();
          await releaseFirstMerge.promise;
        }
        merged.push(...tickets.map(issue => issue.number));
      },
    }));

    await firstMergeStarted.promise;
    expect(planningBases).toEqual([[]]);
    releaseFirstMerge.resolve();
    const result = await completion;

    expect(planningBases).toEqual([[], [1, 2], [1, 2, 3]]);
    expect(executionBases).toEqual([[], [], [1, 2]]);
    expect(result).toEqual({ iterations: 2, merged: [1, 2, 3], failed: [], exhausted: true });
  });

  test("bounds execution and waits for every started peer before merging successes", async () => {
    const executions = [1, 2, 3, 4].map(() => deferred<boolean>());
    const starts = [1, 2, 3, 4].map(() => deferred<void>());
    const started: number[] = [];
    const merged: number[][] = [];
    const reports: string[] = [];
    let active = 0;
    let peak = 0;
    const completion = runWorkflow({ maxIterations: 1, maxParallel: 2 }, runtime({
      plan: async () => [1, 2, 3, 4].map(ticket),
      execute: async (issue) => {
        active++;
        peak = Math.max(peak, active);
        started.push(issue.number);
        starts[issue.number - 1]!.resolve();
        try {
          return await executions[issue.number - 1]!.promise;
        }
        finally {
          active--;
        }
      },
      merge: async (tickets) => {
        expect(active).toBe(0);
        merged.push(tickets.map(issue => issue.number));
      },
      report: message => reports.push(message),
    }));

    await starts[1]!.promise;
    expect(started).toEqual([1, 2]);
    executions[0]!.reject(new Error("Implementation failed"));
    await starts[2]!.promise;
    executions[2]!.resolve(true);
    await starts[3]!.promise;
    executions[3]!.resolve(true);
    expect(merged).toEqual([]);
    executions[1]!.resolve(true);
    const result = await completion;

    expect(peak).toBe(2);
    expect(merged).toEqual([[2, 3, 4]]);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toContain("#1");
    expect(result).toEqual({ iterations: 1, merged: [2, 3, 4], failed: [1], exhausted: false });
  });

  test("excludes false and rejected executions without invoking an empty merge", async () => {
    const reports: string[] = [];
    let merges = 0;
    const result = await runWorkflow({ maxIterations: 1, maxParallel: 2 }, runtime({
      plan: async () => [ticket(1), ticket(2)],
      execute: async (issue) => {
        if (issue.number === 1) {
          return false;
        }
        throw new Error("Reviewer failed");
      },
      merge: async () => { merges++; },
      report: message => reports.push(message),
    }));

    expect(result).toEqual({ iterations: 1, merged: [], failed: [1, 2], exhausted: false });
    expect(merges).toBe(0);
    expect(reports).toHaveLength(2);
  });

  test("stops immediately when the planner returns no tickets", async () => {
    let executed = false;
    const result = await runWorkflow({ maxIterations: 5, maxParallel: 2 }, runtime({
      execute: async () => {
        executed = true;
        return true;
      },
    }));

    expect(executed).toBe(false);
    expect(result).toEqual({ iterations: 0, merged: [], failed: [], exhausted: true });
  });

  test("propagates merge failure without planning another batch", async () => {
    const failure = new Error("Merge conflict");
    let plans = 0;
    let caught: unknown;
    try {
      await runWorkflow({ maxIterations: 5, maxParallel: 2 }, runtime({
        plan: async () => {
          plans++;
          return [ticket(1)];
        },
        merge: async () => { throw failure; },
      }));
    }
    catch (error) {
      caught = error;
    }

    expect(caught).toBe(failure);
    expect(plans).toBe(1);
  });

  test("cancellation stops queued work and awaits started cleanup without merging", async () => {
    const controller = new AbortController();
    const reason = new Error("Operator stopped the run");
    const releases = [deferred<boolean>(), deferred<boolean>()];
    const secondStarted = deferred<void>();
    const firstReleased = deferred<void>();
    const started: number[] = [];
    const cleaned: number[] = [];
    let merges = 0;
    let settled = false;
    const completion = runWorkflow({ maxIterations: 5, maxParallel: 2 }, runtime({
      signal: controller.signal,
      plan: async () => [ticket(1), ticket(2), ticket(3)],
      execute: async (issue) => {
        started.push(issue.number);
        if (issue.number === 2) {
          secondStarted.resolve();
        }
        try {
          return await releases[issue.number - 1]!.promise;
        }
        finally {
          cleaned.push(issue.number);
          if (issue.number === 1) {
            firstReleased.resolve();
          }
        }
      },
      merge: async () => { merges++; },
    })).then(
      () => {
        settled = true;
        return undefined;
      },
      (error) => {
        settled = true;
        return error;
      },
    );

    await secondStarted.promise;
    controller.abort(reason);
    releases[0]!.resolve(true);
    await firstReleased.promise;
    expect(settled).toBe(false);
    releases[1]!.resolve(true);
    const caught = await completion;

    expect(caught).toBe(reason);
    expect(started).toEqual([1, 2]);
    expect(cleaned).toEqual([1, 2]);
    expect(merges).toBe(0);
  });

  test("does not dispatch a plan returned after cancellation", async () => {
    const controller = new AbortController();
    let executed = false;
    let caught: unknown;
    try {
      await runWorkflow({ maxIterations: 1, maxParallel: 1 }, runtime({
        signal: controller.signal,
        plan: async () => {
          controller.abort();
          return [ticket(1)];
        },
        execute: async () => {
          executed = true;
          return true;
        },
      }));
    }
    catch (error) {
      caught = error;
    }

    expect(caught).toBe(controller.signal.reason);
    expect(executed).toBe(false);
  });

  test.each([
    { maxIterations: 0, maxParallel: 1 },
    { maxIterations: 1, maxParallel: 0 },
    { maxIterations: 1.5, maxParallel: 1 },
    { maxIterations: 1, maxParallel: Number.POSITIVE_INFINITY },
  ])("rejects invalid execution limits %j", async (options) => {
    let planned = false;
    let caught: unknown;
    try {
      await runWorkflow(options, runtime({
        plan: async () => {
          planned = true;
          return [];
        },
      }));
    }
    catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect(planned).toBe(false);
  });
});

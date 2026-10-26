import { describe, expect, test } from "bun:test";
import { parseAgentRole } from "../agents";
import { prepareCodexAuth } from "../auth";
import type { FinalizedSpec } from "../finalization";
import { ExecutorTerminationError } from "../resources";
import { specFrontier } from "../specs";
import { ExecutorInfrastructureError } from "../ticket-runtime.mts";
import { GitStateError, type SpecWorkspace } from "../tickets";
import type { Ticket, WorkflowRuntime } from "../workflow";
import { parsePlan, runWorkflow } from "../workflow";

function ticket(number: number): Ticket {
  return {
    number,
    title: `Implement issue ${number}`,
    branch: `codex/sandcastle/issue-${number}`,
    implementer: "implementer_standard",
    reason: "Routine feature",
  };
}

function runtime(overrides: Partial<WorkflowRuntime> = {}): WorkflowRuntime {
  return {
    plan: async () => undefined,
    frontier: async () => ({ tickets: [], complete: false, blocked: [] }),
    execute: async () => true,
    integrate: async () => {},
    report: () => {},
    ...overrides,
  };
}

function finalResult(workspace: SpecWorkspace): FinalizedSpec {
  return {
    workspace,
    reviewBase: workspace.invocationBase,
    reviewCandidate: "review-candidate",
    finalCandidate: "final-candidate",
    reviewReport: "Both axes finished",
    repairAndValidation: "Required checks passed",
    handoff: "Ready for delivery",
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

describe("Sandcastle account configuration", () => {
  test("passes explicit API credentials using the Codex exec environment key", async () => {
    const auth = await prepareCodexAuth({ CODEX_AUTH: "api-key", CODEX_API_KEY: "test-only-key" });
    await auth.close();
    expect(auth.env).toEqual({ CODEX_API_KEY: "test-only-key" });
  });
});

describe("Sandcastle plan", () => {
  test.each(["implementer_light", "implementer_standard", "implementer_deep"])(
    "keeps Planner selection %s for dispatch",
    (implementer) => {
      const issue = { ...ticket(42), implementer, reason: "Risk-based selection" };
      expect(parsePlan(`<plan>${JSON.stringify({ issues: [issue] })}</plan>`)).toEqual([issue]);
    },
  );
  test("reads one tagged plan from agent output", () => {
    const issues = [ticket(41), ticket(52)];
    const result = parsePlan(`Selected independent issues.\n<plan>${JSON.stringify({ issues })}</plan>\nDone.`);
    expect(result).toEqual(issues);
  });
  test("accepts an empty backlog", () => {
    expect(parsePlan('<plan>{"issues":[]}</plan>')).toEqual([]);
  });
  test.each([
    ["missing block", "No more work."],
    ["invalid JSON", "<plan>{</plan>"],
    ["missing issues", "<plan>{}</plan>"],
    ["non-array issues", '<plan>{"issues":{}}</plan>'],
    ["null payload", "<plan>null</plan>"],
    ["multiple blocks", '<plan>{"issues":[]}</plan><plan>{"issues":[]}</plan>'],
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
    ["unsupported effort", source.replace('"high"', '"ultra"')],
    ["missing model", source.replace('model = "custom-model"', "")],
    ["missing instructions", source.replace('developer_instructions = "Complete the ticket and request review."', "")],
  ])("rejects %s before starting an agent", (_name, input) => {
    expect(() => parseAgentRole(input, "implementer_standard")).toThrow();
  });
  test("requires reviewer read-only intent", () => {
    const reviewer = source.replace("implementer_standard", "spec_reviewer");
    expect(() => parseAgentRole(reviewer, "spec_reviewer")).toThrow();
    expect(parseAgentRole(`${reviewer}\nsandbox_mode = "read-only"`, "spec_reviewer").name).toBe("spec_reviewer");
  });
});

function specWorkspace(
  number = 100,
  dependencies: [number, number[]][] = [
    [1, []],
    [2, []],
    [3, [1]],
  ],
): SpecWorkspace {
  const issue = (id: number, blockers: number[] = []) => ({
    number: id,
    title: `Implement issue ${id}`,
    body: "",
    state: "OPEN" as const,
    labels: ["type:ticket", "ready-for-agent"],
    assignees: [],
    parent: number,
    blockers,
  });
  const spec = { ...issue(number), labels: ["type:spec", "ready-for-agent"], parent: null };
  const children = dependencies.map(([id, blockers]) => issue(id, blockers));
  return {
    graph: { spec, tickets: children, dependencies: [spec, ...children] },
    branch: `codex/sandcastle/spec-${number}`,
    worktreePath: `/spec-${number}`,
    invocationBranch: "main",
    invocationBase: "base",
  };
}

function specRuntime(workspace: SpecWorkspace, overrides: Partial<WorkflowRuntime> = {}): WorkflowRuntime {
  const integrated = new Set<number>();
  const frontier = async (_workspace: SpecWorkspace, attempted: ReadonlySet<number>) => {
    const frontier = specFrontier(workspace.graph, { integrated });
    return {
      ...frontier,
      tickets: frontier.ready.filter((entry) => !attempted.has(entry.number)).map((entry) => ticket(entry.number)),
    };
  };
  return runtime({
    plan: async () => ({ workspace, tickets: (await frontier(workspace, new Set())).tickets }),
    frontier,
    integrate: async (entry) => {
      integrated.add(entry.number);
    },
    ...overrides,
  });
}

describe("Sandcastle Spec workflow", () => {
  test("integrates A and starts dependent C while independent B is still running", async () => {
    const workspace = specWorkspace();
    const b = deferred<boolean>();
    const cStarted = deferred<void>();
    const integratingA = deferred<void>();
    const releaseA = deferred<void>();
    const started: number[] = [];
    const driver = specRuntime(workspace);
    const integrate = driver.integrate;
    driver.integrate = async (entry) => {
      if (entry.number === 1) {
        integratingA.resolve();
        await releaseA.promise;
      }
      await integrate(entry);
    };
    driver.execute = async (entry) => {
      started.push(entry.number);
      if (entry.number === 2) return b.promise;
      if (entry.number === 3) cStarted.resolve();
      return true;
    };
    const completion = runWorkflow({ maxSpecs: 1, maxParallel: 2 }, driver);
    await integratingA.promise;
    expect(started).toEqual([1, 2]);
    releaseA.resolve();
    await cStarted.promise;
    expect(started).toEqual([1, 2, 3]);
    b.resolve(true);
    const result = await completion;
    expect(result.readyForFinalization).toEqual([100]);
    expect(result.integrated.toSorted()).toEqual([1, 2, 3]);
    expect(result.finalized).toEqual([]);
  });

  test("serializes integrations even when another implementation finishes during acceptance", async () => {
    const firstAcceptance = deferred<void>();
    const releaseAcceptance = deferred<void>();
    const secondFinished = deferred<void>();
    const integrations: number[] = [];
    const driver = specRuntime(
      specWorkspace(100, [
        [1, []],
        [2, []],
      ]),
    );
    const integrate = driver.integrate;
    driver.integrate = async (entry) => {
      integrations.push(entry.number);
      if (entry.number === 1) {
        firstAcceptance.resolve();
        await releaseAcceptance.promise;
      }
      await integrate(entry);
    };
    driver.execute = async (entry) => {
      if (entry.number === 2) {
        await firstAcceptance.promise;
        secondFinished.resolve();
      }
      return true;
    };
    const completion = runWorkflow({ maxParallel: 2 }, driver);
    await secondFinished.promise;
    expect(integrations).toEqual([1]);
    releaseAcceptance.resolve();
    const result = await completion;
    expect(integrations).toEqual([1, 2]);
    expect(result.readyForFinalization).toEqual([100]);
  });

  test("defaults to four concurrent tickets and consumes one Spec allowance even for resumed work", async () => {
    const workspace = specWorkspace(
      100,
      [1, 2, 3, 4, 5, 6].map((number) => [number, []]),
    );
    const releases = [1, 2, 3, 4, 5, 6].map(() => deferred<boolean>());
    const starts = [1, 2, 3, 4, 5, 6].map(() => deferred<void>());
    const started: number[] = [];
    let active = 0;
    let peak = 0;
    let plans = 0;
    const driver = specRuntime(workspace);
    const select = driver.plan;
    driver.plan = async (...args) => {
      plans++;
      return select(...args);
    };
    driver.execute = async (entry) => {
      active++;
      peak = Math.max(peak, active);
      started.push(entry.number);
      starts[entry.number - 1]!.resolve();
      try {
        return await releases[entry.number - 1]!.promise;
      } finally {
        active--;
      }
    };
    const completion = runWorkflow({}, driver);
    await starts[3]!.promise;
    expect(started).toEqual([1, 2, 3, 4]);
    releases[0]!.resolve(true);
    await starts[4]!.promise;
    releases[1]!.resolve(true);
    await starts[5]!.promise;
    for (const release of releases) release.resolve(true);
    const result = await completion;
    expect(peak).toBe(4);
    expect(plans).toBe(1);
    expect(result.attemptedSpecs).toEqual([100]);
    expect(result.exhausted).toBe(false);
    expect(result.readyForFinalization).toEqual([100]);
  });

  test.each(["implementation", "acceptance"])(
    "keeps independent slices after %s failure and moves to the next Spec without retry",
    async (phase) => {
      const first = specWorkspace(100, [
        [1, []],
        [2, []],
        [3, [1]],
        [4, [2]],
      ]);
      const second = specWorkspace(200, [[5, []]]);
      const drivers = new Map([
        [100, specRuntime(first)],
        [200, specRuntime(second)],
      ]);
      let current = drivers.get(100)!;
      const started: number[] = [];
      const paused: number[] = [];
      const result = await runWorkflow(
        { maxSpecs: 2, maxParallel: 2 },
        runtime({
          plan: async (_attempt, excluded) => {
            const next = [first, second].find((entry) => !excluded.has(entry.graph.spec.number));
            if (!next) return undefined;
            current = drivers.get(next.graph.spec.number)!;
            return current.plan(1, excluded);
          },
          frontier: (...args) => current.frontier(...args),
          finalize: async (workspace) => finalResult(workspace),
          deliver: async () => {},
          execute: async (entry) => {
            started.push(entry.number);
            return phase !== "implementation" || entry.number !== 1;
          },
          integrate: async (entry) => {
            if (phase === "acceptance" && entry.number === 1) throw new Error("Focused validation failed");
            return current.integrate(entry);
          },
          pause: async (workspace, outcome) => {
            paused.push(workspace.graph.spec.number);
            expect(outcome.failed).toEqual([1]);
            expect(outcome.blocked.some((entry) => entry.number === 3)).toBe(true);
          },
        }),
      );
      expect(started.toSorted()).toEqual([1, 2, 4, 5]);
      expect(result.integrated.toSorted()).toEqual([2, 4, 5]);
      expect(result.failed).toEqual([1]);
      expect(result.incompleteSpecs).toEqual([100]);
      expect(result.readyForFinalization).toEqual([200]);
      expect(paused).toEqual([100]);
    },
  );

  test.each([
    new GitStateError("Git checkout drifted"),
    new ExecutorInfrastructureError("Docker unavailable"),
    new ExecutorTerminationError("Creator still running"),
  ])("stops on public infrastructure failure and waits for started peers: %s", async (failure) => {
    const secondStarted = deferred<void>();
    const secondCleanup = deferred<boolean>();
    const firstFailed = deferred<void>();
    const started: number[] = [];
    let settled = false;
    let plans = 0;
    const wrapped = new Error("Ticket and cleanup failed", {
      cause: new AggregateError([new Error("local"), failure]),
    });
    const driver = specRuntime(
      specWorkspace(100, [
        [1, []],
        [2, []],
        [3, []],
      ]),
    );
    const select = driver.plan;
    driver.plan = async (...args) => {
      plans++;
      return select(...args);
    };
    driver.execute = async (entry) => {
      started.push(entry.number);
      if (entry.number === 2) {
        secondStarted.resolve();
        return secondCleanup.promise;
      }
      await secondStarted.promise;
      firstFailed.resolve();
      throw wrapped;
    };
    const completion = runWorkflow({ maxSpecs: 2, maxParallel: 2 }, driver).then(
      () => {
        settled = true;
        return undefined;
      },
      (error) => {
        settled = true;
        return error;
      },
    );
    await firstFailed.promise;
    expect(settled).toBe(false);
    secondCleanup.resolve(true);
    const caught = await completion;
    expect(caught).toBe(wrapped);
    expect(started).toEqual([1, 2]);
    expect(plans).toBe(1);
  });

  test("cancellation stops queued dispatch and waits for every started executor cleanup", async () => {
    const controller = new AbortController();
    const reason = new Error("Operator stopped the run");
    const releases = [deferred<boolean>(), deferred<boolean>()];
    const secondStarted = deferred<void>();
    const firstCleaned = deferred<void>();
    const started: number[] = [];
    const cleaned: number[] = [];
    let settled = false;
    let integrated = false;
    const driver = specRuntime(
      specWorkspace(100, [
        [1, []],
        [2, []],
        [3, []],
      ]),
      {
        signal: controller.signal,
        execute: async (entry) => {
          started.push(entry.number);
          if (entry.number === 2) secondStarted.resolve();
          try {
            return await releases[entry.number - 1]!.promise;
          } finally {
            cleaned.push(entry.number);
            if (entry.number === 1) firstCleaned.resolve();
          }
        },
        integrate: async () => {
          integrated = true;
        },
      },
    );
    const completion = runWorkflow({ maxSpecs: 2, maxParallel: 2 }, driver).then(
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
    await firstCleaned.promise;
    expect(settled).toBe(false);
    releases[1]!.resolve(true);
    const caught = await completion;
    expect(caught).toBe(reason);
    expect(started).toEqual([1, 2]);
    expect(cleaned).toEqual([1, 2]);
    expect(integrated).toBe(false);
  });

  test("does not dispatch a selection returned after cancellation", async () => {
    const controller = new AbortController();
    let executed = false;
    let caught: unknown;
    try {
      await runWorkflow(
        {},
        specRuntime(specWorkspace(), {
          signal: controller.signal,
          plan: async () => {
            controller.abort();
            return { workspace: specWorkspace(), tickets: [ticket(1)] };
          },
          execute: async () => {
            executed = true;
            return true;
          },
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(controller.signal.reason);
    expect(executed).toBe(false);
  });

  test("enters finalization only after every required slice is integrated", async () => {
    const workspace = specWorkspace(100, [
      [1, []],
      [2, []],
    ]);
    const finalized: number[] = [];
    const driver = specRuntime(workspace, {
      finalize: async (entry) => {
        finalized.push(entry.graph.spec.number);
        return finalResult(entry);
      },
    });
    const result = await runWorkflow({}, driver);
    expect(finalized).toEqual([100]);
    expect(result.finalized).toEqual([100]);
    const blocked = specWorkspace(200, [[3, []]]);
    blocked.graph.tickets[0]!.state = "CLOSED";
    const incomplete = await runWorkflow(
      {},
      specRuntime(blocked, {
        finalize: async () => {
          throw new Error("must not finalize");
        },
      }),
    );
    expect(incomplete.readyForFinalization).toEqual([]);
    expect(incomplete.incompleteSpecs).toEqual([200]);
  });

  test("reports final gate failure as incomplete without retrying its session", async () => {
    let finalizations = 0;
    let pauses = 0;
    const result = await runWorkflow(
      {},
      specRuntime(specWorkspace(100, [[1, []]]), {
        finalize: async () => {
          finalizations++;
          throw new Error("Required verification failed");
        },
        pause: async () => {
          pauses++;
        },
      }),
    );
    expect(finalizations).toBe(1);
    expect(pauses).toBe(1);
    expect(result.readyForFinalization).toEqual([100]);
    expect(result.finalized).toEqual([]);
    expect(result.incompleteSpecs).toEqual([100]);
  });

  test("stops normally when no new Spec is available", async () => {
    const result = await runWorkflow({ maxSpecs: 3 }, runtime());
    expect(result).toEqual({
      attemptedSpecs: [],
      integrated: [],
      failed: [],
      readyForFinalization: [],
      finalized: [],
      delivered: [],
      incompleteSpecs: [],
      exhausted: true,
    });
  });

  test("waits for actual delivery before reporting a complete Spec", async () => {
    const workspace = specWorkspace(100, [[1, []]]);
    const deliveryStarted = deferred<void>();
    const deliveryCompleted = deferred<void>();
    const pending = runWorkflow(
      {},
      specRuntime(workspace, {
        finalize: async () => finalResult(workspace),
        deliver: async (accepted) => {
          expect(accepted.finalCandidate).toBe("final-candidate");
          deliveryStarted.resolve();
          await deliveryCompleted.promise;
        },
      }),
    );
    await deliveryStarted.promise;
    deliveryCompleted.resolve();
    const result = await pending;
    expect(result.finalized).toEqual([100]);
    expect(result.delivered).toEqual([100]);
    expect(result.incompleteSpecs).toEqual([]);
  });

  test("keeps a passed gate incomplete when delivery fails or has no implementation", async () => {
    const workspace = specWorkspace(100, [[1, []]]);
    for (const deliver of [
      undefined,
      async () => {
        throw new Error("Issue closeout interrupted");
      },
    ]) {
      const result = await runWorkflow(
        {},
        specRuntime(workspace, {
          finalize: async () => finalResult(workspace),
          deliver,
        }),
      );
      expect(result.finalized).toEqual([100]);
      expect(result.delivered).toEqual([]);
      expect(result.incompleteSpecs).toEqual([100]);
    }
  });

  test.each([new GitStateError("Unknown squash result"), new ExecutorInfrastructureError("GitHub closeout failed")])(
    "stops before another Spec after a public delivery failure: %s",
    async (failure) => {
      const workspace = specWorkspace(100, [[1, []]]);
      let plans = 0;
      let caught: unknown;
      const driver = specRuntime(workspace, {
        finalize: async () => finalResult(workspace),
        deliver: async () => {
          throw failure;
        },
      });
      const plan = driver.plan;
      driver.plan = (...args) => {
        plans++;
        return plan(...args);
      };
      try {
        await runWorkflow({ maxSpecs: 2 }, driver);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(failure);
      expect(plans).toBe(1);
    },
  );

  test.each([{ maxSpecs: 0 }, { maxParallel: 0 }, { maxSpecs: 1.5 }, { maxParallel: Number.POSITIVE_INFINITY }])(
    "rejects invalid limits before selecting a Spec: %j",
    async (options) => {
      let planned = false;
      let caught: unknown;
      try {
        await runWorkflow(
          options,
          runtime({
            plan: async () => {
              planned = true;
              return undefined;
            },
          }),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(planned).toBe(false);
    },
  );
});

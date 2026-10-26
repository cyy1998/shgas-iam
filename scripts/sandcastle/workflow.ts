import type { ImplementerName } from "./agents.ts";
import { isImplementer } from "./agents.ts";
import type { FinalizedSpec } from "./finalization.ts";
import { ExecutorInfrastructureError, hasUnstoppedExecutor } from "./resources.ts";
import type { SpecBlocker } from "./specs.ts";
import { GitStateError, type SpecWorkspace } from "./tickets.ts";

export interface Ticket {
  number: number;
  title: string;
  branch: string;
  implementer: ImplementerName;
  reason: string;
}

export type SpecSelection = { workspace: SpecWorkspace; tickets: Ticket[] };
export type SpecFrontier = { tickets: Ticket[]; complete: boolean; blocked: SpecBlocker[] };

export interface WorkflowRuntime {
  plan: (attempt: number, excludedSpecs: ReadonlySet<number>) => Promise<SpecSelection | undefined>;
  frontier: (workspace: SpecWorkspace, attemptedTickets: ReadonlySet<number>) => Promise<SpecFrontier>;
  execute: (ticket: Ticket) => Promise<boolean>;
  integrate: (ticket: Ticket) => Promise<unknown>;
  finalize?: (workspace: SpecWorkspace) => Promise<FinalizedSpec>;
  deliver?: (finalized: FinalizedSpec) => Promise<unknown>;
  pause?: (
    workspace: SpecWorkspace,
    outcome: { integrated: number[]; failed: number[]; blocked: SpecBlocker[] },
  ) => Promise<void>;
  close?: () => Promise<void>;
  report: (message: string) => void;
  signal?: AbortSignal;
}

export interface WorkflowResult {
  attemptedSpecs: number[];
  integrated: number[];
  failed: number[];
  readyForFinalization: number[];
  finalized: number[];
  delivered: number[];
  incompleteSpecs: number[];
  exhausted: boolean;
}

export type WorkflowLimits = { maxSpecs: number; maxParallel: number };

export function workflowLimits(options: Partial<WorkflowLimits> = {}): WorkflowLimits {
  const limits = { maxSpecs: 1, maxParallel: 4, ...options };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer.`);
  }
  return limits;
}

export function isFatalWorkflowError(error: unknown, seen = new Set<unknown>()): boolean {
  if (seen.has(error)) return false;
  seen.add(error);
  return (
    error instanceof GitStateError ||
    error instanceof ExecutorInfrastructureError ||
    hasUnstoppedExecutor(error) ||
    (error instanceof AggregateError && error.errors.some((entry) => isFatalWorkflowError(entry, seen))) ||
    (error instanceof Error && isFatalWorkflowError(error.cause, seen))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePlan(stdout: string): Ticket[] {
  const blocks = [...stdout.matchAll(/<plan>([\s\S]*?)<\/plan>/g)];
  if (blocks.length !== 1) {
    throw new Error("Planner must return exactly one <plan> JSON block.");
  }

  let plan: unknown;
  try {
    plan = JSON.parse(blocks[0]![1]!);
  } catch {
    throw new Error("Planner returned invalid JSON in <plan>.");
  }
  if (!isRecord(plan) || !Array.isArray(plan.issues)) {
    throw new Error("Planner must return an issues array.");
  }

  const seen = new Set<number>();
  return plan.issues.map((issue: unknown) => {
    if (
      !isRecord(issue) ||
      typeof issue.number !== "number" ||
      !Number.isSafeInteger(issue.number) ||
      issue.number <= 0 ||
      typeof issue.title !== "string" ||
      issue.title.trim().length === 0 ||
      issue.branch !== `codex/sandcastle/issue-${issue.number}` ||
      !isImplementer(issue.implementer) ||
      typeof issue.reason !== "string" ||
      !issue.reason.trim()
    ) {
      throw new Error("Planner returned an invalid ticket, implementer, or selection reason.");
    }
    if (seen.has(issue.number)) {
      throw new Error(`Planner selected issue #${issue.number} more than once.`);
    }
    seen.add(issue.number);
    return {
      number: issue.number,
      title: issue.title,
      branch: issue.branch,
      implementer: issue.implementer,
      reason: issue.reason,
    };
  });
}

export async function runWorkflow(options: Partial<WorkflowLimits>, runtime: WorkflowRuntime): Promise<WorkflowResult> {
  const limits = workflowLimits(options);
  const result: WorkflowResult = {
    attemptedSpecs: [],
    integrated: [],
    failed: [],
    readyForFinalization: [],
    finalized: [],
    delivered: [],
    incompleteSpecs: [],
    exhausted: false,
  };
  const attemptedSpecs = new Set<number>();
  for (let attempt = 1; attempt <= limits.maxSpecs; attempt++) {
    runtime.signal?.throwIfAborted();
    const selection = await runtime.plan(attempt, new Set(attemptedSpecs));
    runtime.signal?.throwIfAborted();
    if (!selection) {
      result.exhausted = true;
      break;
    }
    const { workspace } = selection;
    const number = workspace.graph.spec.number;
    if (attemptedSpecs.has(number)) throw new Error(`Planner selected already attempted Spec #${number}.`);
    attemptedSpecs.add(number);
    result.attemptedSpecs.push(number);
    const attemptedTickets = new Set<number>();
    type Completion = { ticket: Ticket; outcome: PromiseSettledResult<boolean> };
    const running = new Map<number, Promise<Completion>>();
    const fatal: unknown[] = [];
    const localIntegrated: number[] = [];
    const localFailed: number[] = [];
    let frontier: SpecFrontier = { tickets: selection.tickets, complete: false, blocked: [] };
    const failed = (ticket: Ticket, error?: unknown) => {
      result.failed.push(ticket.number);
      localFailed.push(ticket.number);
      runtime.report(`Issue #${ticket.number} failed${error === undefined ? "" : `: ${String(error)}`}`);
    };
    const dispatch = () => {
      for (const ticket of frontier.tickets) {
        if (running.size >= limits.maxParallel || fatal.length || runtime.signal?.aborted) break;
        if (attemptedTickets.has(ticket.number)) continue;
        attemptedTickets.add(ticket.number);
        const pending = Promise.resolve()
          .then(() => runtime.execute(ticket))
          .then(
            (value): Completion => ({ ticket, outcome: { status: "fulfilled", value } }),
            (reason): Completion => {
              if (isFatalWorkflowError(reason)) fatal.push(reason);
              return { ticket, outcome: { status: "rejected", reason } };
            },
          );
        running.set(ticket.number, pending);
      }
    };
    try {
      dispatch();
      while (running.size) {
        const { ticket, outcome } = await Promise.race(running.values());
        running.delete(ticket.number);
        if (fatal.length || runtime.signal?.aborted) break;
        if (outcome.status === "fulfilled" && outcome.value === true) {
          try {
            await runtime.integrate(ticket);
            result.integrated.push(ticket.number);
            localIntegrated.push(ticket.number);
          } catch (error) {
            if (isFatalWorkflowError(error)) throw error;
            failed(ticket, error);
          }
        } else {
          failed(ticket, outcome.status === "rejected" ? outcome.reason : undefined);
        }
        if (fatal.length || runtime.signal?.aborted) break;
        frontier = await runtime.frontier(workspace, new Set(attemptedTickets));
        dispatch();
      }
    } catch (error) {
      fatal.push(error);
    } finally {
      // Each ticket promise includes its executor/resource finalizers. Never leave started peers behind.
      await Promise.allSettled(running.values());
    }
    if (fatal.length === 1) throw fatal[0];
    if (fatal.length) throw new AggregateError(fatal, "Sandcastle 公共故障；已等待全部在途任务收尾。");
    runtime.signal?.throwIfAborted();
    frontier = await runtime.frontier(workspace, new Set(attemptedTickets));
    if (frontier.complete && !localFailed.length) {
      result.readyForFinalization.push(number);
      if (runtime.finalize) {
        try {
          const finalized = await runtime.finalize(workspace);
          result.finalized.push(number);
          if (!runtime.deliver) throw new Error("缺少 Spec 交付接线，最终门禁通过仍保持未完成。");
          runtime.signal?.throwIfAborted();
          await runtime.deliver(finalized);
          result.delivered.push(number);
        } catch (error) {
          if (isFatalWorkflowError(error) || runtime.signal?.aborted) throw error;
          result.incompleteSpecs.push(number);
          runtime.report(`Spec #${number} 最终验收或交付未完成：${String(error)}`);
          await runtime.pause?.(workspace, {
            integrated: localIntegrated,
            failed: localFailed,
            blocked: frontier.blocked,
          });
        }
      } else {
        result.incompleteSpecs.push(number);
      }
    } else {
      result.incompleteSpecs.push(number);
      await runtime.pause?.(workspace, { integrated: localIntegrated, failed: localFailed, blocked: frontier.blocked });
    }
  }
  runtime.signal?.throwIfAborted();
  return result;
}

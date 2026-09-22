import type { ImplementerName } from "./agents.ts";
import { isImplementer } from "./agents.ts";

export interface Ticket {
  number: number;
  title: string;
  branch: string;
  implementer: ImplementerName;
  reason: string;
}

export interface WorkflowRuntime {
  plan: (iteration: number) => Promise<Ticket[]>;
  execute: (ticket: Ticket) => Promise<boolean>;
  merge: (tickets: Ticket[]) => Promise<void>;
  finish?: () => Promise<void>;
  close?: () => Promise<void>;
  report: (message: string) => void;
  signal?: AbortSignal;
}

export interface WorkflowResult {
  iterations: number;
  merged: number[];
  failed: number[];
  exhausted: boolean;
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
  }
  catch {
    throw new Error("Planner returned invalid JSON in <plan>.");
  }
  if (!isRecord(plan) || !Array.isArray(plan.issues)) {
    throw new Error("Planner must return an issues array.");
  }

  const seen = new Set<number>();
  return plan.issues.map((issue: unknown) => {
    if (!isRecord(issue)
      || typeof issue.number !== "number"
      || !Number.isSafeInteger(issue.number)
      || issue.number <= 0
      || typeof issue.title !== "string"
      || issue.title.trim().length === 0
      || issue.branch !== `codex/sandcastle/issue-${issue.number}`
      || !isImplementer(issue.implementer)
      || typeof issue.reason !== "string" || !issue.reason.trim()) {
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

export async function runWorkflow(
  options: { maxIterations: number; maxParallel: number },
  runtime: WorkflowRuntime,
): Promise<WorkflowResult> {
  for (const [name, value] of Object.entries(options)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive safe integer.`);
    }
  }

  const result: WorkflowResult = { iterations: 0, merged: [], failed: [], exhausted: false };
  for (let iteration = 1; iteration <= options.maxIterations; iteration++) {
    runtime.signal?.throwIfAborted();
    const tickets = await runtime.plan(iteration);
    runtime.signal?.throwIfAborted();
    if (tickets.length === 0) {
      await runtime.finish?.();
      runtime.signal?.throwIfAborted();
      result.exhausted = true;
      return result;
    }
    result.iterations++;

    let next = 0;
    const outcomes = new Map<Ticket, PromiseSettledResult<boolean>>();
    async function executeNext() {
      while (!runtime.signal?.aborted) {
        const ticket = tickets[next++];
        if (!ticket) {
          return;
        }
        try {
          outcomes.set(ticket, { status: "fulfilled", value: await runtime.execute(ticket) });
        }
        catch (reason) {
          outcomes.set(ticket, { status: "rejected", reason });
        }
      }
    }

    // Each worker settles its executions before cancellation or a peer failure can leave the batch.
    await Promise.all(Array.from({ length: Math.min(options.maxParallel, tickets.length) }, executeNext));
    runtime.signal?.throwIfAborted();

    const successful: Ticket[] = [];
    for (const ticket of tickets) {
      const outcome = outcomes.get(ticket);
      if (outcome?.status === "fulfilled" && outcome.value === true) {
        successful.push(ticket);
      }
      else {
        result.failed.push(ticket.number);
        const detail = outcome?.status === "rejected" ? `: ${String(outcome.reason)}` : "";
        runtime.report(`Issue #${ticket.number} failed${detail}`);
      }
    }

    runtime.signal?.throwIfAborted();
    if (successful.length > 0) {
      await runtime.merge(successful);
      result.merged.push(...successful.map(ticket => ticket.number));
    }
  }

  runtime.signal?.throwIfAborted();
  return result;
}

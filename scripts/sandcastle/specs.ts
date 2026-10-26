import type { Ticket } from "./workflow.ts";
import { parsePlan } from "./workflow.ts";

export type TrackedIssue = {
  number: number;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED";
  labels: string[];
  assignees: string[];
  parent: number | null;
  blockers: number[];
  comments?: { body: string; author: string }[];
};

export type IssueTracker = {
  listSpecs: () => Promise<TrackedIssue[]>;
  readIssue: (number: number) => Promise<TrackedIssue>;
  readChildren: (number: number) => Promise<number[]>;
};

export type SpecGraph = {
  spec: TrackedIssue;
  tickets: TrackedIssue[];
  dependencies: TrackedIssue[];
};

export type SpecProgress = {
  integrated?: ReadonlySet<number>;
  delivered?: ReadonlySet<number>;
  recoverable?: ReadonlySet<number>;
};

export type SpecBlocker = { number: number; reasons: string[] };

function issueType(issue: TrackedIssue, type: "spec" | "ticket"): boolean {
  return issue.labels.includes(`type:${type}`) && !issue.labels.includes(`type:${type === "spec" ? "ticket" : "spec"}`);
}

export async function loadSpecBacklog(tracker: IssueTracker): Promise<{
  specs: SpecGraph[];
  rejected: SpecBlocker[];
}> {
  const specs: SpecGraph[] = [];
  const rejected: SpecBlocker[] = [];
  for (const spec of await tracker.listSpecs()) {
    if (!issueType(spec, "spec") || spec.state !== "OPEN" || !spec.labels.includes("ready-for-agent")) {
      rejected.push({ number: spec.number, reasons: ["Spec 类型或准入条件不满足。"] });
      continue;
    }
    specs.push(await loadSpecGraph(tracker, spec));
  }
  return { specs, rejected };
}

export async function loadSpecGraph(tracker: IssueTracker, spec: TrackedIssue): Promise<SpecGraph> {
  const tickets = await Promise.all(
    (await tracker.readChildren(spec.number)).map((number) => tracker.readIssue(number)),
  );
  const dependencies = new Map<number, TrackedIssue>([spec, ...tickets].map((entry) => [entry.number, entry]));
  async function visit(issue: TrackedIssue): Promise<void> {
    for (const number of issue.blockers) {
      if (dependencies.has(number)) continue;
      const blocker = await tracker.readIssue(number);
      dependencies.set(number, blocker);
      await visit(blocker);
    }
  }
  for (const ticket of [spec, ...tickets]) await visit(ticket);
  return { spec, tickets, dependencies: [...dependencies.values()] };
}

export function specFrontier(graph: SpecGraph, progress: SpecProgress = {}) {
  const integrated = progress.integrated ?? new Set<number>();
  const issues = new Map(graph.dependencies.map((entry) => [entry.number, entry]));
  const cycleMemo = new Map<number, boolean>();
  function cyclic(number: number, path = new Set<number>()): boolean {
    const known = cycleMemo.get(number);
    if (known !== undefined) return known;
    if (path.has(number)) return true;
    const next = new Set(path).add(number);
    const result = issues.get(number)?.blockers.some((blocker) => cyclic(blocker, next)) ?? false;
    cycleMemo.set(number, result);
    return result;
  }
  const ready: TrackedIssue[] = [];
  const blocked: SpecBlocker[] = [];
  function prerequisites(issue: TrackedIssue): string[] {
    return issue.blockers.flatMap((number) => {
      const local = graph.tickets.find((entry) => entry.number === number);
      if (local && (!issueType(local, "ticket") || local.parent !== graph.spec.number))
        return [`前置 #${number} 的类型或原生父子关系不合法。`];
      return (local ? integrated.has(number) : progress.delivered?.has(number))
        ? []
        : [`前置 #${number} 尚未${local ? "集成" : "交付"}。`];
    });
  }
  const specReasons = prerequisites(graph.spec);
  if (cyclic(graph.spec.number)) specReasons.push("Spec 前置关系存在循环依赖。");
  if (!issueType(graph.spec, "spec") || graph.spec.state !== "OPEN" || !graph.spec.labels.includes("ready-for-agent"))
    specReasons.push("Spec 类型或准入条件不满足。");
  if (graph.spec.assignees.length && !progress.recoverable?.has(graph.spec.number)) specReasons.push("Spec 已被认领。");
  for (const ticket of graph.tickets) {
    const reasons = [...specReasons];
    if (!issueType(ticket, "ticket")) reasons.push("ticket 类型缺失或冲突。");
    if (ticket.parent !== graph.spec.number) reasons.push("ticket 原生父子关系与 Spec 不匹配。");
    if (cyclic(ticket.number)) reasons.push("前置关系存在循环依赖。");
    if (integrated.has(ticket.number)) {
      if (reasons.length) blocked.push({ number: ticket.number, reasons });
      continue;
    }
    if (ticket.state !== "OPEN" || !ticket.labels.includes("ready-for-agent"))
      reasons.push("ticket 尚未满足实施准入。");
    if (ticket.assignees.length && !progress.recoverable?.has(ticket.number)) reasons.push("ticket 已被认领。");
    reasons.push(...prerequisites(ticket));
    if (reasons.length) blocked.push({ number: ticket.number, reasons });
    else ready.push(ticket);
  }
  return {
    ready,
    blocked,
    complete:
      graph.tickets.length > 0 && !blocked.length && graph.tickets.every((entry) => integrated.has(entry.number)),
  };
}

export function parseSpecPlan(
  stdout: string,
  backlog: { specs: SpecGraph[] },
  progress: SpecProgress = {},
): { graph: SpecGraph | undefined; tickets: Ticket[] } {
  const tickets = parsePlan(stdout);
  const payload: unknown = JSON.parse([...stdout.matchAll(/<plan>([\s\S]*?)<\/plan>/g)][0]![1]!);
  if (!payload || typeof payload !== "object" || !("spec" in payload))
    throw new Error("Planner 必须明确选择一个 Spec 或 null。");
  if (payload.spec === null && !tickets.length) return { graph: undefined, tickets };
  const graph = backlog.specs.find((entry) => entry.spec.number === payload.spec);
  if (!graph) throw new Error("Planner 选择了不在准入范围内的 Spec。");
  const ready = specFrontier(graph, progress).ready;
  for (const ticket of tickets) {
    const issue = ready.find((entry) => entry.number === ticket.number);
    if (!issue || issue.title !== ticket.title)
      throw new Error(`Planner 不能派发非当前 Spec 可执行切片 #${ticket.number}。`);
  }
  return { graph, tickets };
}

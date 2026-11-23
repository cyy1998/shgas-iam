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
export type ExplorationPlan = { needed: boolean; focus: string };

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
  const eligible: TrackedIssue[] = [];
  const localTicketNumbers = new Set(graph.tickets.map((entry) => entry.number));
  function classifyPrerequisites(issue: TrackedIssue): { staticReasons: string[]; localPending: string[] } {
    const staticReasons: string[] = [];
    const localPending: string[] = [];
    for (const number of issue.blockers) {
      const local = graph.tickets.find((entry) => entry.number === number);
      if (local && (!issueType(local, "ticket") || local.parent !== graph.spec.number)) {
        staticReasons.push(`前置 #${number} 的类型或原生父子关系不合法。`);
        continue;
      }
      if (local) {
        if (!integrated.has(number)) localPending.push(`前置 #${number} 尚未集成。`);
      } else if (!progress.delivered?.has(number)) {
        staticReasons.push(`前置 #${number} 尚未交付。`);
      }
    }
    return { staticReasons, localPending };
  }
  const specPrereqs = classifyPrerequisites(graph.spec);
  const specReasons = [...specPrereqs.staticReasons, ...specPrereqs.localPending];
  if (cyclic(graph.spec.number)) specReasons.push("Spec 前置关系存在循环依赖。");
  if (!issueType(graph.spec, "spec") || graph.spec.state !== "OPEN" || !graph.spec.labels.includes("ready-for-agent"))
    specReasons.push("Spec 类型或准入条件不满足。");
  if (graph.spec.assignees.length && !progress.recoverable?.has(graph.spec.number)) specReasons.push("Spec 已被认领。");
  for (const ticket of graph.tickets) {
    const staticReasons = [...specReasons];
    if (!issueType(ticket, "ticket")) staticReasons.push("ticket 类型缺失或冲突。");
    if (ticket.parent !== graph.spec.number) staticReasons.push("ticket 原生父子关系与 Spec 不匹配。");
    if (cyclic(ticket.number)) staticReasons.push("前置关系存在循环依赖。");
    if (integrated.has(ticket.number)) {
      if (staticReasons.length) blocked.push({ number: ticket.number, reasons: staticReasons });
      continue;
    }
    if (ticket.state !== "OPEN" || !ticket.labels.includes("ready-for-agent"))
      staticReasons.push("ticket 尚未满足实施准入。");
    if (ticket.assignees.length && !progress.recoverable?.has(ticket.number)) staticReasons.push("ticket 已被认领。");
    const prereqs = classifyPrerequisites(ticket);
    staticReasons.push(...prereqs.staticReasons);
    const reasons = [...staticReasons, ...prereqs.localPending];
    if (reasons.length) blocked.push({ number: ticket.number, reasons });
    else ready.push(ticket);
    if (!staticReasons.length) eligible.push(ticket);
  }
  const simulated = new Set<number>(integrated);
  const plannable: TrackedIssue[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const ticket of eligible) {
      if (simulated.has(ticket.number)) continue;
      if (ticket.blockers.every((number) => !localTicketNumbers.has(number) || simulated.has(number))) {
        simulated.add(ticket.number);
        plannable.push(ticket);
        changed = true;
      }
    }
  }
  return {
    ready,
    plannable,
    blocked,
    complete:
      graph.tickets.length > 0 && !blocked.length && graph.tickets.every((entry) => integrated.has(entry.number)),
  };
}

function parseExplorationPlan(value: unknown): ExplorationPlan {
  if (value === undefined || value === null) return { needed: false, focus: "" };
  if (typeof value !== "object" || Array.isArray(value) || typeof (value as { needed?: unknown }).needed !== "boolean")
    throw new Error("Planner 返回了无效的 explore 配置。");
  const { needed, focus } = value as { needed: boolean; focus?: unknown };
  if (!needed) return { needed: false, focus: "" };
  if (typeof focus !== "string" || !focus.trim()) throw new Error("Planner 启用 explore 时必须提供非空的 focus 说明。");
  return { needed: true, focus: focus.trim() };
}

export function parseSpecPlan(
  stdout: string,
  backlog: { specs: SpecGraph[] },
  progress: SpecProgress = {},
): { graph: SpecGraph | undefined; planned: Ticket[]; ready: Ticket[]; explore: ExplorationPlan } {
  const planned = parsePlan(stdout);
  const payload: unknown = JSON.parse([...stdout.matchAll(/<plan>([\s\S]*?)<\/plan>/g)][0]![1]!);
  if (!payload || typeof payload !== "object" || !("spec" in payload))
    throw new Error("Planner 必须明确选择一个 Spec 或 null。");
  const explore = parseExplorationPlan("explore" in payload ? payload.explore : undefined);
  if (payload.spec === null && !planned.length)
    return { graph: undefined, planned, ready: [], explore: { needed: false, focus: "" } };
  const graph = backlog.specs.find((entry) => entry.spec.number === payload.spec);
  if (!graph) throw new Error("Planner 选择了不在准入范围内的 Spec。");
  const frontier = specFrontier(graph, progress);
  for (const ticket of planned) {
    const issue = frontier.plannable.find((entry) => entry.number === ticket.number);
    if (!issue || issue.title !== ticket.title)
      throw new Error(`Planner 不能规划非当前 Spec 可执行或可解锁切片 #${ticket.number}。`);
  }
  const readyNumbers = new Set(frontier.ready.map((entry) => entry.number));
  const ready = planned.filter((ticket) => readyNumbers.has(ticket.number));
  if (!ready.length) throw new Error("Planner 未选择任何当前就绪的切片，无法启动本 Spec。");
  return { graph, planned, ready, explore };
}

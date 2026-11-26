import { command } from "./command.ts";
import { validateRepository } from "./config.ts";

export type RunGh = (args: string[]) => Promise<string>;
type IssueState = "OPEN" | "CLOSED";

export type IssueReference = { repo: string; number: number; state: IssueState };
export type TrackedIssue = IssueReference & {
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
  blockers: IssueReference[];
};
export type TicketIssue = TrackedIssue & { parent: IssueReference };
export type SpecGraph = { spec: TrackedIssue; tickets: TicketIssue[] };

type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  repository_url: string;
  labels: { name: string }[];
  assignees: { login: string }[];
  pull_request?: unknown;
};

function reference(issue: GitHubIssue): IssueReference {
  const repo = /^https:\/\/api\.github\.com\/repos\/(.+)$/.exec(issue.repository_url)?.[1];
  if (
    !repo ||
    !Number.isSafeInteger(issue.number) ||
    issue.number < 1 ||
    (issue.state !== "open" && issue.state !== "closed") ||
    issue.pull_request
  ) {
    throw new Error("GitHub returned an invalid native issue relationship.");
  }
  return {
    repo: validateRepository(repo).toLowerCase(),
    number: issue.number,
    state: issue.state === "open" ? "OPEN" : "CLOSED",
  };
}

function hasType(issue: TrackedIssue, type: "spec" | "ticket") {
  return issue.labels.includes(`type:${type}`) && !issue.labels.includes(type === "spec" ? "type:ticket" : "type:spec");
}

function admitted(issue: TrackedIssue) {
  return issue.state === "OPEN" && issue.labels.includes("ready-for-agent");
}

export function createGitHubIssueTracker(
  options: { cwd: string; repo: string },
  runGh: RunGh = (args) => command("gh", args, options.cwd),
) {
  const repo = validateRepository(options.repo).toLowerCase();
  const issuesPath = `repos/${repo}/issues`;
  const get = async (path: string): Promise<GitHubIssue> => JSON.parse(await runGh(["api", path]));
  async function pages(path: string): Promise<GitHubIssue[]> {
    // gh applies the jq filter to each page. Each issue is a single JSON line, including multiline bodies.
    const output = await runGh(["api", path, "--paginate", "--jq", ".[] | @json"]);
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  async function hydrate(issue: GitHubIssue): Promise<TrackedIssue> {
    const ref = reference(issue);
    if (
      ref.repo !== repo ||
      typeof issue.title !== "string" ||
      (issue.body !== null && typeof issue.body !== "string") ||
      !Array.isArray(issue.labels) ||
      !issue.labels.every(({ name }) => typeof name === "string") ||
      !Array.isArray(issue.assignees) ||
      !issue.assignees.every(({ login }) => typeof login === "string")
    ) {
      throw new Error("GitHub returned invalid issue details.");
    }
    const blockers = await pages(`${issuesPath}/${ref.number}/dependencies/blocked_by?per_page=100`);
    return {
      ...ref,
      title: issue.title,
      body: issue.body ?? "",
      labels: issue.labels.map(({ name }) => name),
      assignees: issue.assignees.map(({ login }) => login),
      blockers: blockers.map(reference),
    };
  }
  async function readIssue(number: number) {
    const issue = await get(`${issuesPath}/${number}`);
    if (issue.number !== number) throw new Error(`GitHub returned a different issue for #${number}.`);
    return hydrate(issue);
  }
  async function loadSpecGraph(spec: TrackedIssue): Promise<SpecGraph> {
    if (spec.repo !== repo) throw new Error("The Spec belongs to a different repository.");
    const children = (await pages(`${issuesPath}/${spec.number}/sub_issues?per_page=100`)).map(reference);
    const numbers = new Set<number>();
    for (const child of children) {
      if (child.repo !== repo || child.number === spec.number || numbers.has(child.number)) {
        throw new Error(`Spec #${spec.number} has an invalid or duplicate child relationship.`);
      }
      numbers.add(child.number);
    }
    const tickets = await Promise.all(
      children.map(async (child) => {
        const [ticket, parent] = await Promise.all([
          readIssue(child.number),
          get(`${issuesPath}/${child.number}/parent`),
        ]);
        return { ...ticket, parent: reference(parent) };
      }),
    );
    return { spec, tickets };
  }
  return {
    readIssue,
    loadSpecGraph,
    async loadBacklog(): Promise<SpecGraph[]> {
      const candidates = await pages(`${issuesPath}?state=open&labels=type%3Aspec&per_page=100`);
      const specs = await Promise.all(candidates.filter((issue) => !issue.pull_request).map(hydrate));
      return Promise.all(specs.filter((spec) => hasType(spec, "spec") && admitted(spec)).map(loadSpecGraph));
    },
  };
}

export function specFrontier(
  graph: SpecGraph,
  progress: {
    integrated?: ReadonlySet<number>;
    resumable?: ReadonlySet<number>;
    actor?: string;
    deliveryRecovery?: boolean;
  } = {},
) {
  const { spec, tickets } = graph;
  const children = new Map(tickets.map((ticket) => [ticket.number, ticket]));
  const integrated = progress.integrated ?? new Set<number>();
  const ready: TicketIssue[] = [];
  const plannable: TicketIssue[] = [];
  const blocked: { number: number; reasons: string[] }[] = [];
  const visiting = new Set<number>();
  const cyclic = new Map<number, boolean>();

  function localBlockers(issue: TrackedIssue) {
    return issue.blockers.flatMap((blocker) => {
      const local =
        blocker.repo === spec.repo && (blocker.number === spec.number ? spec : children.get(blocker.number));
      return local ? [local] : [];
    });
  }
  function hasCycle(issue: TrackedIssue): boolean {
    if (visiting.has(issue.number)) return true;
    const known = cyclic.get(issue.number);
    if (known !== undefined) return known;
    visiting.add(issue.number);
    const result = localBlockers(issue).some(hasCycle);
    visiting.delete(issue.number);
    cyclic.set(issue.number, result);
    return result;
  }
  function owned(issue: TrackedIssue) {
    return (
      issue.assignees.length === 0 ||
      Boolean(progress.resumable?.has(issue.number) && issue.assignees.every((login) => login === progress.actor))
    );
  }
  function pendingExternal(issue: TrackedIssue) {
    return issue.blockers
      .filter(
        (blocker) =>
          (blocker.repo !== spec.repo || (blocker.number !== spec.number && !children.has(blocker.number))) &&
          blocker.state !== "CLOSED",
      )
      .map((blocker) => `External blocker ${blocker.repo}#${blocker.number} is open.`);
  }
  const belongsToSpec = (ticket: TicketIssue) =>
    ticket.parent.repo === spec.repo && ticket.parent.number === spec.number;
  const specReasons = pendingExternal(spec);
  if (!hasType(spec, "spec") || (progress.deliveryRecovery ? spec.state !== "OPEN" : !admitted(spec))) {
    specReasons.push("Spec type or admission is invalid.");
  }
  if (!owned(spec)) specReasons.push("Spec is assigned.");
  if (hasCycle(spec)) specReasons.push("Spec dependency cycle.");
  if (localBlockers(spec).length) specReasons.push("Spec depends on an issue within its own graph.");

  const eligible = new Set<number>();
  for (const ticket of tickets) {
    const reasons = [...specReasons];
    if (!hasType(ticket, "ticket")) reasons.push("Ticket type is missing or conflicts with Spec.");
    if (!belongsToSpec(ticket)) {
      reasons.push("Ticket native parent does not match the Spec.");
    }
    if (hasCycle(ticket)) reasons.push("Ticket dependency cycle.");
    if (!integrated.has(ticket.number)) {
      if (!admitted(ticket)) reasons.push("Ticket is not ready for agent.");
      if (!owned(ticket)) reasons.push("Ticket is assigned.");
      reasons.push(...pendingExternal(ticket));
      const local = localBlockers(ticket);
      for (const blocker of local) {
        const child = children.get(blocker.number);
        if (!child || !hasType(child, "ticket") || !belongsToSpec(child)) {
          reasons.push(`Blocker #${blocker.number} has an invalid type or parent.`);
        }
      }
      if (!reasons.length) eligible.add(ticket.number);
      for (const blocker of local) {
        if (!integrated.has(blocker.number)) reasons.push(`Blocker #${blocker.number} is not integrated.`);
      }
      if (!reasons.length) ready.push(ticket);
    }
    if (reasons.length) blocked.push({ number: ticket.number, reasons });
  }
  const planned = new Map<number, boolean>();
  function plan(ticket: TrackedIssue): boolean {
    if (integrated.has(ticket.number)) return true;
    if (!eligible.has(ticket.number)) return false;
    const known = planned.get(ticket.number);
    if (known !== undefined) return known;
    const possible = localBlockers(ticket).every(plan);
    planned.set(ticket.number, possible);
    if (possible) {
      const child = children.get(ticket.number);
      if (child) plannable.push(child);
    }
    return possible;
  }
  for (const ticket of tickets) plan(ticket);
  return {
    ready,
    plannable,
    blocked,
    complete: tickets.length > 0 && blocked.length === 0 && tickets.every(({ number }) => integrated.has(number)),
  };
}

import { command, retryGhRead } from "./command.ts";
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
export type TicketIssue = TrackedIssue & { parent: IssueReference | null };
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

type Page<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
type GraphReference = { number: number; state: IssueState; repository: { nameWithOwner: string } };
type GraphIssue = GraphReference & {
  title: string;
  body: string;
  labels: Page<{ name: string }>;
  assignees: Page<{ login: string }>;
  blockedBy: Page<GraphReference>;
};
type GraphTicket = GraphIssue & { parent: GraphReference | null };
type GraphSpec = GraphIssue & { subIssues: Page<GraphTicket> };

const referenceFragment = `
  fragment IssueReference on Issue { number state repository { nameWithOwner } }
`;
const pageInfo = "pageInfo { hasNextPage endCursor }";
const issueConnections = {
  labels: "name",
  assignees: "login",
  blockedBy: "...IssueReference",
};
type IssueConnection = keyof typeof issueConnections;
const connectionFields = Object.keys(issueConnections) as IssueConnection[];

function connectionSelection(field: IssueConnection, after = "") {
  return `${field}(first: 100${after}) { nodes { ${issueConnections[field]} } ${pageInfo} }`;
}

const specGraphQuery = `
  query SpecGraph($owner: String!, $name: String!, $number: Int!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) {
        ...IssueDetails
        subIssues(first: 25, after: $cursor) {
          nodes { ...IssueDetails parent { ...IssueReference } }
          ${pageInfo}
        }
      }
    }
  }
  fragment IssueDetails on Issue {
    ...IssueReference
    title
    body
    ${connectionFields.map((field) => connectionSelection(field)).join("\n")}
  }
  ${referenceFragment}
`;

function reference(repo: string | undefined, number: number, state: IssueState): IssueReference {
  if (!repo || !Number.isSafeInteger(number) || number < 1 || (state !== "OPEN" && state !== "CLOSED")) {
    throw new Error("GitHub returned an invalid native issue relationship.");
  }
  return { repo: validateRepository(repo).toLowerCase(), number, state };
}

function graphReference(issue: GraphReference | null): IssueReference {
  if (!issue?.repository) throw new Error("GitHub returned an invalid native issue relationship.");
  return reference(issue.repository.nameWithOwner, issue.number, issue.state);
}

function nextCursor(page: Page<unknown>, seen: Set<string>): string | undefined {
  if (!Array.isArray(page?.nodes) || typeof page.pageInfo?.hasNextPage !== "boolean") {
    throw new Error("GitHub returned an invalid graph connection.");
  }
  if (!page.pageInfo.hasNextPage) return;
  const cursor = page.pageInfo.endCursor;
  if (typeof cursor !== "string" || !cursor || seen.has(cursor)) {
    throw new Error("GitHub returned an invalid or repeated graph cursor.");
  }
  seen.add(cursor);
  return cursor;
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
  const [owner, name] = repo.split("/");
  const read = (args: string[]) => retryGhRead(() => runGh(args));

  async function graphql<T>(query: string, args: string[]): Promise<T> {
    const result: { data?: { repository?: T }; errors?: unknown[] } = JSON.parse(
      await read(["api", "graphql", "-f", `query=${query}`, "-f", `owner=${owner}`, "-f", `name=${name}`, ...args]),
    );
    if (result.errors?.length || !result.data?.repository) {
      throw new Error("GitHub returned an incomplete GraphQL issue graph.");
    }
    return result.data.repository;
  }
  async function pages(path: string): Promise<GitHubIssue[]> {
    // gh applies the jq filter to each page. Each issue is a single JSON line, including multiline bodies.
    const output = await read(["api", path, "--paginate", "--jq", ".[] | @json"]);
    return output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  function details(issue: GitHubIssue): Omit<TrackedIssue, "blockers"> {
    const repository = /^https:\/\/api\.github\.com\/repos\/(.+)$/.exec(issue.repository_url)?.[1];
    if (issue.pull_request || (issue.state !== "open" && issue.state !== "closed")) {
      throw new Error("GitHub returned an invalid native issue relationship.");
    }
    const ref = reference(repository, issue.number, issue.state === "open" ? "OPEN" : "CLOSED");
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
    return {
      ...ref,
      title: issue.title,
      body: issue.body ?? "",
      labels: issue.labels.map(({ name }) => name),
      assignees: issue.assignees.map(({ login }) => login),
    };
  }
  async function readIssue(number: number) {
    const issue: GitHubIssue = JSON.parse(await read(["api", `${issuesPath}/${number}`]));
    if (issue.number !== number) throw new Error(`GitHub returned a different issue for #${number}.`);
    return details(issue);
  }

  async function loadSpecGraph(number: number): Promise<SpecGraph> {
    type Continuation = {
      expected: IssueReference;
      field: IssueConnection;
      cursor: string;
      append: (issue: GraphIssue) => void;
    };
    const pending: Continuation[] = [];
    function track(issue: GraphIssue): TrackedIssue {
      const ref = graphReference(issue);
      if (typeof issue.title !== "string" || typeof issue.body !== "string") {
        throw new Error("GitHub returned invalid issue details.");
      }
      function collect<K extends IssueConnection, T>(field: K, parse: (page: GraphIssue[K]) => T[]): T[] {
        const values: T[] = [];
        const seen = new Set<string>();
        function append(current: GraphIssue) {
          const page = current[field];
          const cursor = nextCursor(page, seen);
          values.push(...parse(page));
          if (cursor) pending.push({ expected: ref, field, cursor, append });
        }
        append(issue);
        return values;
      }
      function text(value: string) {
        if (typeof value !== "string") throw new Error("GitHub returned invalid issue details.");
        return value;
      }
      return {
        ...ref,
        title: issue.title,
        body: issue.body,
        labels: collect("labels", (page) => page.nodes.map(({ name }) => text(name))),
        assignees: collect("assignees", (page) => page.nodes.map(({ login }) => text(login))),
        blockers: collect("blockedBy", (page) => page.nodes.map(graphReference)),
      };
    }

    const tickets: TicketIssue[] = [];
    const numbers = new Set<number>();
    const seen = new Set<string>();
    let spec: TrackedIssue | undefined;
    let cursor: string | undefined;
    do {
      const { issue } = await graphql<{ issue: GraphSpec | null }>(specGraphQuery, [
        "-F",
        `number=${number}`,
        ...(cursor ? ["-f", `cursor=${cursor}`] : []),
      ]);
      const ref = graphReference(issue);
      if (!issue || ref.repo !== repo || ref.number !== number) {
        throw new Error(`GitHub returned a different issue for #${number}.`);
      }
      spec ??= track(issue);
      cursor = nextCursor(issue.subIssues, seen);
      for (const child of issue.subIssues.nodes) {
        const ticket = track(child);
        if (ticket.repo !== repo || ticket.number === number || numbers.has(ticket.number)) {
          throw new Error(`Spec #${number} has an invalid or duplicate child relationship.`);
        }
        numbers.add(ticket.number);
        tickets.push({ ...ticket, parent: child.parent ? graphReference(child.parent) : null });
      }
    } while (cursor);

    // Nested connections have independent cursors. Batch their continuation pages in the same request.
    while (pending.length) {
      const batch = pending.splice(0, 25);
      const variables = batch.map((_, index) => `$cursor${index}: String!`).join(", ");
      const selections = batch.map(
        ({ expected, field }, index) =>
          `page${index}: issue(number: ${expected.number}) { ...IssueReference ${connectionSelection(field, `, after: $cursor${index}`)} }`,
      );
      const pages = await graphql<Record<string, GraphIssue>>(
        `query SpecGraphConnections($owner: String!, $name: String!, ${variables}) {
          repository(owner: $owner, name: $name) { ${selections.join("\n")} }
        } ${referenceFragment}`,
        batch.flatMap(({ cursor }, index) => ["-f", `cursor${index}=${cursor}`]),
      );
      for (const [index, { expected, append }] of batch.entries()) {
        const issue = pages[`page${index}`];
        const actual = graphReference(issue ?? null);
        if (!issue || actual.number !== expected.number || actual.repo !== expected.repo) {
          throw new Error(`GitHub returned a different issue for #${expected.number}.`);
        }
        append(issue);
      }
    }
    return { spec, tickets };
  }
  return {
    readIssue,
    loadSpecGraph,
    async listOpenSpecs() {
      const candidates = await pages(`${issuesPath}?state=open&labels=type%3Aspec&per_page=100`);
      return candidates.filter((issue) => !issue.pull_request).map(details);
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
    Boolean(ticket.parent && ticket.parent.repo === spec.repo && ticket.parent.number === spec.number);
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
    if (ticket.state !== "OPEN" && integrated.has(ticket.number)) reasons.push("Integrated ticket is closed.");
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

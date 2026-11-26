import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command, retryGhRead } from "./command.ts";
import { specBranchName } from "./git.ts";
import type {
  BlockedTicket,
  BranchConflict,
  FrontierResult,
  ImplementerTier,
  IntegratedTicket,
  IssueComment,
  IssueDetails,
  IssueRef,
  IssueState,
  PullRequestInfo,
  RunGh,
  SpecGraph,
  SpecIssue,
  TicketIssue,
} from "./types.ts";

export { retryGhRead } from "./command.ts";

export type GhOptions = {
  cwd?: string;
  runGh?: RunGh;
};

type Page<T> = {
  nodes: T[];
  pageInfo: { hasNextPage: boolean };
};

type RawIssueRef = {
  number: number;
  state: IssueState;
  repository: { nameWithOwner: string };
};

type RawComment = {
  author: { login: string } | null;
  body: string;
  createdAt: string;
};

type RawIssueNode = RawIssueRef & {
  title: string;
  body: string;
  labels: Page<{ name: string }>;
  comments: Page<RawComment>;
  blockedBy: Page<RawIssueRef>;
};

type RawTicketNode = RawIssueNode & {
  parent: RawIssueRef | null;
};

type RawSpecNode = RawIssueNode & {
  subIssues: Page<RawTicketNode>;
};

const prFields = "number,url,state,headRefName,baseRefName,headRefOid,isCrossRepository";

const specGraphQuery = `
  query ReadSpecGraph($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      issues(first: 100, states: OPEN, labels: ["type:spec"]) {
        nodes {
          ...IssueFields
          subIssues(first: 100) {
            nodes {
              ...IssueFields
              parent { ...IssueRefFields }
            }
            pageInfo { hasNextPage }
          }
        }
        pageInfo { hasNextPage }
      }
    }
  }
  fragment IssueRefFields on Issue {
    number
    state
    repository { nameWithOwner }
  }
  fragment IssueFields on Issue {
    ...IssueRefFields
    title
    body
    labels(first: 100) {
      nodes { name }
      pageInfo { hasNextPage }
    }
    comments(first: 100) {
      nodes { author { login } body createdAt }
      pageInfo { hasNextPage }
    }
    blockedBy(first: 100) {
      nodes { ...IssueRefFields }
      pageInfo { hasNextPage }
    }
  }
`;

export function validateRepository(repo: string): string {
  if (!/^[\w-]+\/[\w.-]+$/.test(repo) || /\/\.{1,2}$/.test(repo)) {
    throw new Error(`Invalid GitHub repository "${repo}". Expected "owner/repo".`);
  }
  return repo;
}

function assertPositiveInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Expected a positive integer for ${label}, got: ${value}`);
  }
  return value;
}

function defaultGh(options?: GhOptions): RunGh {
  if (options?.runGh) return options.runGh;
  const cwd = options?.cwd ?? process.cwd();
  return (args) => command("gh", args, cwd, { ...process.env, GH_PROMPT_DISABLED: "1" });
}

async function withBodyFile<T>(body: string, use: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "sandcastle-gh-body-"));
  try {
    const filePath = join(dir, "body.md");
    await writeFile(filePath, body, { mode: 0o600, flag: "wx" });
    return await use(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function assertNotOverflowed<T>(page: Page<T> | undefined, context: string): T[] {
  if (!page || !Array.isArray(page.nodes) || typeof page.pageInfo?.hasNextPage !== "boolean") {
    throw new Error(`GitHub GraphQL returned an invalid connection for ${context}.`);
  }
  if (page.pageInfo.hasNextPage) {
    throw new Error(`GitHub GraphQL first:100 page overflowed for ${context}.`);
  }
  return page.nodes;
}

function parseIssueRef(raw: RawIssueRef | null | undefined): IssueRef {
  if (
    !raw?.repository?.nameWithOwner ||
    !Number.isSafeInteger(raw.number) ||
    raw.number < 1 ||
    (raw.state !== "OPEN" && raw.state !== "CLOSED")
  ) {
    throw new Error("GitHub returned an invalid issue reference.");
  }
  return {
    repo: validateRepository(raw.repository.nameWithOwner).toLowerCase(),
    number: raw.number,
    state: raw.state,
  };
}

function parseIssueNode(raw: RawIssueNode): IssueDetails {
  const ref = parseIssueRef(raw);
  if (typeof raw.title !== "string" || typeof raw.body !== "string") {
    throw new Error(`GitHub returned invalid title/body for #${ref.number}.`);
  }
  const labelNodes = assertNotOverflowed(raw.labels, `issue #${ref.number} labels`);
  const commentNodes = assertNotOverflowed(raw.comments, `issue #${ref.number} comments`);
  const blockerNodes = assertNotOverflowed(raw.blockedBy, `issue #${ref.number} blockedBy`);
  const labels = labelNodes.map((node) => {
    if (typeof node?.name !== "string") throw new Error(`Invalid label on #${ref.number}.`);
    return node.name;
  });
  const comments: IssueComment[] = commentNodes.map((node) => {
    if (typeof node?.body !== "string" || typeof node?.createdAt !== "string") {
      throw new Error(`Invalid comment on #${ref.number}.`);
    }
    return {
      author: typeof node.author?.login === "string" && node.author.login ? node.author.login : "ghost",
      body: node.body,
      createdAt: node.createdAt,
    };
  });
  const blockers = blockerNodes.map((node) => parseIssueRef(node));
  return {
    ...ref,
    title: raw.title,
    body: raw.body,
    labels,
    comments,
    blockers,
  };
}

export async function readSpecGraph(repo: string, options?: GhOptions): Promise<SpecGraph[]> {
  const normalizedRepo = validateRepository(repo);
  const [owner, name] = normalizedRepo.split("/");
  if (!owner || !name) throw new Error(`Invalid GitHub repository "${repo}".`);
  const gh = defaultGh(options);

  const rawText = await retryGhRead(() =>
    gh(["api", "graphql", "-f", `query=${specGraphQuery}`, "-f", `owner=${owner}`, "-f", `name=${name}`]),
  );
  const parsed: {
    data?: { repository?: { issues?: Page<RawSpecNode> } };
    errors?: Array<{ message?: string }>;
  } = JSON.parse(rawText);

  if (parsed.errors?.length || !parsed.data?.repository?.issues) {
    const details = parsed.errors
      ?.map((err) => err.message)
      .filter(Boolean)
      .join("; ");
    throw new Error(`GitHub GraphQL query failed for ${normalizedRepo}${details ? `: ${details}` : "."}`);
  }

  const specNodes = assertNotOverflowed(parsed.data.repository.issues, `${normalizedRepo} open specs`);
  const expectedRepo = normalizedRepo.toLowerCase();

  return specNodes.map((specNode) => {
    const spec: SpecIssue = parseIssueNode(specNode);
    const subNodes = assertNotOverflowed(specNode.subIssues, `spec #${spec.number} subIssues`);
    const seenTickets = new Set<number>();
    const tickets: TicketIssue[] = subNodes.map((ticketNode) => {
      const details = parseIssueNode(ticketNode);
      if (details.repo !== expectedRepo || details.number === spec.number || seenTickets.has(details.number)) {
        throw new Error(`Spec #${spec.number} has an invalid or duplicate sub-issue #${details.number}.`);
      }
      seenTickets.add(details.number);
      return {
        ...details,
        parent: ticketNode.parent ? parseIssueRef(ticketNode.parent) : null,
      };
    });
    return { spec, tickets };
  });
}

function hasExclusiveType(labels: readonly string[], expected: "spec" | "ticket"): boolean {
  const other = expected === "spec" ? "type:ticket" : "type:spec";
  return labels.includes(`type:${expected}`) && !labels.includes(other);
}

export function specFrontier(graph: SpecGraph, integrated: ReadonlySet<number> = new Set()): FrontierResult {
  const { spec, tickets } = graph;
  const children = new Map(tickets.map((ticket) => [ticket.number, ticket]));
  const ready: TicketIssue[] = [];
  const blocked: BlockedTicket[] = [];

  const localBlockers = (issue: IssueDetails): IssueDetails[] =>
    issue.blockers.flatMap((blocker) => {
      if (blocker.repo !== spec.repo) return [];
      const local = blocker.number === spec.number ? spec : children.get(blocker.number);
      return local ? [local] : [];
    });

  const externalBlockers = (issue: IssueDetails): IssueRef[] =>
    issue.blockers.filter(
      (blocker) => blocker.repo !== spec.repo || (blocker.number !== spec.number && !children.has(blocker.number)),
    );

  const visiting = new Set<number>();
  const cyclicCache = new Map<number, boolean>();
  const hasCycle = (issue: IssueDetails): boolean => {
    if (visiting.has(issue.number)) return true;
    const cached = cyclicCache.get(issue.number);
    if (cached !== undefined) return cached;
    visiting.add(issue.number);
    const result = localBlockers(issue).some(hasCycle);
    visiting.delete(issue.number);
    cyclicCache.set(issue.number, result);
    return result;
  };

  const specReasons: string[] = [];
  if (spec.state !== "OPEN") specReasons.push("Spec is not OPEN.");
  if (!hasExclusiveType(spec.labels, "spec")) specReasons.push("Spec type label is missing or conflicting.");
  if (!spec.labels.includes("ready-for-agent")) specReasons.push("Spec is missing ready-for-agent label.");
  if (spec.labels.includes("needs-attention")) specReasons.push("Spec has needs-attention label.");
  if (localBlockers(spec).length > 0) specReasons.push("Spec depends on an issue within its own graph.");
  for (const blocker of externalBlockers(spec)) {
    if (blocker.state !== "CLOSED") {
      specReasons.push(`External blocker ${blocker.repo}#${blocker.number} is ${blocker.state}.`);
    }
  }

  for (const ticket of tickets) {
    if (integrated.has(ticket.number)) {
      if (specReasons.length > 0) {
        blocked.push({ number: ticket.number, reasons: [...specReasons] });
      }
      continue;
    }

    const reasons: string[] = [...specReasons];
    if (ticket.state !== "OPEN") reasons.push("Ticket is not OPEN.");
    if (!hasExclusiveType(ticket.labels, "ticket")) reasons.push("Ticket type label is missing or conflicting.");
    if (!ticket.labels.includes("ready-for-agent")) reasons.push("Ticket is missing ready-for-agent label.");
    if (ticket.labels.includes("needs-attention")) reasons.push("Ticket has needs-attention label.");
    if (!ticket.parent || ticket.parent.repo !== spec.repo || ticket.parent.number !== spec.number) {
      reasons.push("Ticket native parent does not match the Spec.");
    }
    if (hasCycle(ticket)) {
      reasons.push("Ticket is part of a local dependency cycle.");
    }
    for (const blocker of externalBlockers(ticket)) {
      if (blocker.state !== "CLOSED") {
        reasons.push(`External blocker ${blocker.repo}#${blocker.number} is ${blocker.state}.`);
      }
    }
    for (const blocker of localBlockers(ticket)) {
      if (blocker.number === spec.number) {
        reasons.push(`Ticket depends on its own parent Spec #${spec.number}.`);
      } else if (!integrated.has(blocker.number)) {
        reasons.push(`Internal blocker #${blocker.number} is not integrated.`);
      }
    }

    if (reasons.length === 0) {
      ready.push(ticket);
    } else {
      blocked.push({ number: ticket.number, reasons });
    }
  }

  const complete =
    specReasons.length === 0 &&
    tickets.length > 0 &&
    blocked.length === 0 &&
    tickets.every((ticket) => integrated.has(ticket.number));

  return { ready, blocked, complete };
}

export function resolveTicketTier(
  labelsOrTicket: readonly string[] | { number?: number; labels: readonly string[] },
): ImplementerTier {
  const isTicket = "labels" in labelsOrTicket;
  const labels = isTicket ? labelsOrTicket.labels : labelsOrTicket;
  const ticketRef = isTicket && labelsOrTicket.number !== undefined ? `Ticket #${labelsOrTicket.number}` : "Ticket";
  const hasDeep = labels.includes("agent:deep");
  const hasLight = labels.includes("agent:light");
  if (hasDeep && hasLight) {
    throw new Error(`${ticketRef} has conflicting tier labels: both agent:light and agent:deep are set.`);
  }
  if (hasDeep) return "deep";
  if (hasLight) return "light";
  return "standard";
}

export function findBranchConflicts(specs: readonly SpecIssue[]): BranchConflict[] {
  const byBranch = new Map<string, number[]>();
  for (const spec of specs) {
    if (spec.state !== "OPEN" || !spec.labels.includes("ready-for-agent")) continue;
    const branch = specBranchName(spec.number, spec.body);
    const list = byBranch.get(branch) ?? [];
    list.push(spec.number);
    byBranch.set(branch, list);
  }
  const conflicts: BranchConflict[] = [];
  for (const [branch, specNumbers] of byBranch) {
    if (specNumbers.length > 1) {
      conflicts.push({ branch, specNumbers: [...specNumbers].sort((a, b) => a - b) });
    }
  }
  return conflicts.sort((a, b) => a.branch.localeCompare(b.branch));
}

export async function readSpecLabels(repo: string, specNumber: number, options?: GhOptions): Promise<string[]> {
  const normalizedRepo = validateRepository(repo);
  const number = assertPositiveInt(specNumber, "specNumber");
  const gh = defaultGh(options);
  const output = await retryGhRead(() => gh(["api", `repos/${normalizedRepo}/issues/${number}`]));
  const parsed: { labels?: Array<{ name?: unknown }> } = JSON.parse(output);
  if (!Array.isArray(parsed.labels)) {
    throw new Error(`GitHub returned invalid labels payload for ${normalizedRepo}#${number}.`);
  }
  return parsed.labels.map((label) => {
    if (typeof label?.name !== "string") {
      throw new Error(`GitHub returned an invalid label entry for ${normalizedRepo}#${number}.`);
    }
    return label.name;
  });
}

export async function pauseSpec(repo: string, specNumber: number, reason: string, options?: GhOptions): Promise<void> {
  const normalizedRepo = validateRepository(repo);
  const number = assertPositiveInt(specNumber, "specNumber");
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("Pause reason must not be empty.");
  const gh = defaultGh(options);
  await gh(["issue", "edit", String(number), "--repo", normalizedRepo, "--add-label", "needs-attention"]);
  await withBodyFile(trimmedReason, (bodyPath) =>
    gh(["issue", "comment", String(number), "--repo", normalizedRepo, "--body-file", bodyPath]),
  );
}

export async function removeLabel(
  repo: string,
  issueNumber: number,
  label: string,
  options?: GhOptions,
): Promise<void> {
  const normalizedRepo = validateRepository(repo);
  const number = assertPositiveInt(issueNumber, "issueNumber");
  if (!label.trim()) throw new Error("Label must not be empty.");
  const gh = defaultGh(options);
  await gh(["issue", "edit", String(number), "--repo", normalizedRepo, "--remove-label", label]);
}

function verifyPullRequest(
  pr: PullRequestInfo,
  headBranch: string,
  baseBranch: string,
  headSha?: string,
): PullRequestInfo {
  if (
    !Number.isSafeInteger(pr.number) ||
    pr.number < 1 ||
    !pr.url ||
    pr.isCrossRepository === true ||
    pr.state !== "OPEN" ||
    pr.headRefName !== headBranch ||
    pr.baseRefName !== baseBranch
  ) {
    throw new Error(`Open PR #${pr.number} does not match ${headBranch} -> ${baseBranch}.`);
  }
  if (headSha !== undefined && pr.headRefOid !== headSha) {
    throw new Error(`Open PR #${pr.number} for ${headBranch} points to ${pr.headRefOid}, expected ${headSha}.`);
  }
  return pr;
}

export async function findOpenPr(
  repo: string,
  params: { headBranch: string; baseBranch: string; headSha?: string },
  options?: GhOptions,
): Promise<PullRequestInfo | undefined> {
  const normalizedRepo = validateRepository(repo);
  const gh = defaultGh(options);
  const output = await retryGhRead(() =>
    gh([
      "pr",
      "list",
      "--repo",
      normalizedRepo,
      "--state",
      "open",
      "--head",
      params.headBranch,
      "--base",
      params.baseBranch,
      "--limit",
      "100",
      "--json",
      prFields,
    ]),
  );
  const list: PullRequestInfo[] = JSON.parse(output);
  const matches = list.filter(
    (pr) =>
      pr.isCrossRepository !== true &&
      pr.state === "OPEN" &&
      pr.headRefName === params.headBranch &&
      pr.baseRefName === params.baseBranch,
  );
  if (matches.length > 1) {
    throw new Error(`Multiple open PRs exist for ${params.headBranch} -> ${params.baseBranch}.`);
  }
  const found = matches[0];
  if (!found) return undefined;
  return verifyPullRequest(found, params.headBranch, params.baseBranch, params.headSha);
}

function formatClosesAndTable(
  spec: Pick<SpecIssue, "number" | "title">,
  tickets: ReadonlyArray<Pick<TicketIssue, "number" | "title">>,
  integrated: ReadonlyMap<number, IntegratedTicket>,
): string {
  const closes = [spec.number, ...tickets.map((ticket) => ticket.number)].map((number) => `Closes #${number}`);
  const rows = tickets.map((ticket) => {
    const safeTitle = ticket.title.replaceAll("|", "\\|").replaceAll("\n", " ");
    const sha = integrated.get(ticket.number)?.mergeSha ?? "—";
    return `| #${ticket.number} | ${safeTitle} | \`${sha}\` |`;
  });
  return [
    ...closes,
    "",
    "## Integrated Tickets",
    "",
    "| Ticket | Title | Merge commit |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

export function buildFallbackPrBody(input: {
  spec: Pick<SpecIssue, "number" | "title">;
  tickets: ReadonlyArray<Pick<TicketIssue, "number" | "title">>;
  integrated: ReadonlyMap<number, IntegratedTicket>;
  baseBranch: string;
  headBranch: string;
  headSha: string;
}): string {
  const { spec, tickets, integrated, baseBranch, headBranch, headSha } = input;
  return [
    "## Summary",
    "",
    `Automated AFK delivery for Spec #${spec.number}: ${spec.title}.`,
    "",
    formatClosesAndTable(spec, tickets, integrated),
    "",
    "---",
    `Spec: #${spec.number}`,
    `Base-Branch: ${baseBranch}`,
    `Head-Branch: ${headBranch}`,
    `Head-SHA: ${headSha}`,
  ].join("\n");
}

function parseCreatedPrNumber(output: string, repo: string): number {
  const url = URL.parse(output.trim());
  const number = Number(url?.pathname.split("/").at(-1));
  if (
    url?.origin !== "https://github.com" ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    url.pathname.toLowerCase() !== `/${repo.toLowerCase()}/pull/${number}`
  ) {
    throw new Error(`GitHub did not return a valid PR URL for ${repo}: ${output.trim()}`);
  }
  return number;
}

export async function ensurePr(
  repo: string,
  params: {
    spec: Pick<SpecIssue, "number" | "title">;
    tickets: ReadonlyArray<Pick<TicketIssue, "number" | "title">>;
    integrated: ReadonlyMap<number, IntegratedTicket>;
    headBranch: string;
    baseBranch: string;
    headSha: string;
    title?: string;
    draftBody?: string;
    draft?: boolean;
  },
  options?: GhOptions,
): Promise<PullRequestInfo> {
  const normalizedRepo = validateRepository(repo);
  const existing = await findOpenPr(
    normalizedRepo,
    { headBranch: params.headBranch, baseBranch: params.baseBranch, headSha: params.headSha },
    options,
  );
  if (existing) return existing;

  const trimmedDraft = params.draftBody?.trim();
  const body = trimmedDraft
    ? `${trimmedDraft}\n\n${formatClosesAndTable(params.spec, params.tickets, params.integrated)}`
    : buildFallbackPrBody({
        spec: params.spec,
        tickets: params.tickets,
        integrated: params.integrated,
        baseBranch: params.baseBranch,
        headBranch: params.headBranch,
        headSha: params.headSha,
      });

  const gh = defaultGh(options);
  const title = params.title ?? `Spec #${params.spec.number}: ${params.spec.title}`;
  const createdOutput = await withBodyFile(body, (bodyPath) =>
    gh([
      "pr",
      "create",
      "--repo",
      normalizedRepo,
      "--base",
      params.baseBranch,
      "--head",
      params.headBranch,
      "--title",
      title,
      "--body-file",
      bodyPath,
      ...(params.draft ? ["--draft"] : []),
    ]),
  );

  const prNumber = parseCreatedPrNumber(createdOutput, normalizedRepo);
  const viewed: PullRequestInfo = JSON.parse(
    await retryGhRead(() => gh(["pr", "view", String(prNumber), "--repo", normalizedRepo, "--json", prFields])),
  );
  if (viewed.number !== prNumber) {
    throw new Error(`GitHub returned PR #${viewed.number} when verifying created PR #${prNumber}.`);
  }
  return verifyPullRequest(viewed, params.headBranch, params.baseBranch, params.headSha);
}

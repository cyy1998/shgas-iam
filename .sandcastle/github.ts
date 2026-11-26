import { type ExecFn, runCommand } from "./git.ts";

export type CommentNote = { author: string; createdAt: string; body: string };

export type TicketIssue = {
  number: number;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED";
  labels: string[];
  comments: CommentNote[];
  blockedBy: { number: number; state: "OPEN" | "CLOSED" }[];
};

export type SpecIssue = {
  number: number;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED";
  labels: string[];
  comments: CommentNote[];
  linkedBranches: string[];
  subIssues: TicketIssue[];
};

type Page<T> = { pageInfo: { hasNextPage: boolean }; nodes: T[] };

const LIST_SPECS_QUERY = `query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    issues(first:50,states:OPEN,labels:["type:spec","ready-for-agent"]){
      pageInfo{hasNextPage}
      nodes{number labels(first:20){pageInfo{hasNextPage} nodes{name}}}
    }
  }
}`;

const READ_SPEC_QUERY = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    issue(number:$number){
      number title body state
      labels(first:20){pageInfo{hasNextPage} nodes{name}}
      comments(first:50){pageInfo{hasNextPage} nodes{body createdAt author{login}}}
      linkedBranches(first:10){pageInfo{hasNextPage} nodes{ref{name}}}
      subIssues(first:100){
        pageInfo{hasNextPage}
        nodes{
          number title body state
          labels(first:20){pageInfo{hasNextPage} nodes{name}}
          comments(first:50){pageInfo{hasNextPage} nodes{body createdAt author{login}}}
          blockedBy(first:50){pageInfo{hasNextPage} nodes{number state}}
        }
      }
    }
  }
}`;

const SPEC_LABELS_QUERY = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    issue(number:$number){state labels(first:20){pageInfo{hasNextPage} nodes{name}}}
  }
}`;

function splitRepo(repo: string): { owner: string; name: string } {
  const [owner, name, extra] = repo.split("/");
  if (!owner || !name || extra) throw new Error(`无效的仓库标识：${repo}`);
  return { owner, name };
}

function assertNoOverflow(page: { pageInfo: { hasNextPage: boolean } }, scope: string): void {
  if (page.pageInfo.hasNextPage) throw new Error(`GitHub 分页溢出（${scope}），请缩小范围后再运行。`);
}

async function ghGraphql<T>(
  query: string,
  vars: Record<string, string | number>,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<T> {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, val] of Object.entries(vars)) {
    args.push(typeof val === "number" ? "-F" : "-f", `${key}=${val}`);
  }
  const raw = await execFn("gh", args, cwd);
  const parsed = JSON.parse(raw) as { data?: T; errors?: { message: string }[] };
  if (parsed.errors?.length) {
    throw new Error(`GitHub GraphQL 错误：${parsed.errors.map((e) => e.message).join("; ")}`);
  }
  if (!parsed.data) throw new Error("GitHub GraphQL 返回空数据。");
  return parsed.data;
}

export function isOpenTicket(ticket: TicketIssue): boolean {
  return ticket.state === "OPEN" && ticket.labels.includes("type:ticket") && !ticket.labels.includes("type:spec");
}

export function isSpecReady(state: string, labels: string[]): boolean {
  return (
    state === "OPEN" &&
    labels.includes("type:spec") &&
    !labels.includes("type:ticket") &&
    labels.includes("ready-for-agent") &&
    !labels.includes("needs-attention")
  );
}

export function findBlockingOpenTickets(spec: SpecIssue, done: ReadonlyMap<number, string>): TicketIssue[] {
  return spec.subIssues.filter((t) => isOpenTicket(t) && !done.has(t.number));
}

export function resolveSpecBranch(spec: SpecIssue, baseBranch: string): string {
  if (spec.linkedBranches.length > 1) {
    throw new Error(`Spec #${spec.number} 关联了多个分支（${spec.linkedBranches.join(", ")}），无法唯一确定集成分支。`);
  }
  const branch = spec.linkedBranches[0] ?? `sandcastle/spec-${spec.number}`;
  if (branch === "main" || branch === baseBranch) {
    throw new Error(`Spec #${spec.number} 的集成分支不得为 main 或基线分支 ${baseBranch}。`);
  }
  return branch;
}

export function formatIssue(issue: {
  number: number;
  title: string;
  body: string;
  labels: string[];
  comments: CommentNote[];
}): string {
  const comments = issue.comments.length
    ? `\n\n### Comments\n${issue.comments.map((c) => `- @${c.author} (${c.createdAt}):\n${c.body}`).join("\n\n")}`
    : "";
  return `#${issue.number}: ${issue.title}\nLabels: ${issue.labels.join(", ") || "(none)"}\n\n${issue.body}${comments}`;
}

export function ensureClosesLines(body: string, numbers: number[]): string {
  const existing = new Set([...body.matchAll(/^\s*Closes\s+#(\d+)\s*$/gim)].map((m) => Number(m[1])));
  const missing = [...new Set(numbers)].filter((n) => !existing.has(n));
  if (missing.length === 0) return body;
  return `${body.trimEnd()}\n\n${missing.map((n) => `Closes #${n}`).join("\n")}\n`;
}

export async function listReadySpecNumbers(repo: string, cwd: string, execFn: ExecFn = runCommand): Promise<number[]> {
  const { owner, name } = splitRepo(repo);
  const data = await ghGraphql<{
    repository: { issues: Page<{ number: number; labels: Page<{ name: string }> }> };
  }>(LIST_SPECS_QUERY, { owner, name }, cwd, execFn);
  const issues = data.repository.issues;
  assertNoOverflow(issues, "ready specs");
  return issues.nodes
    .filter((issue) => {
      assertNoOverflow(issue.labels, `spec #${issue.number} labels`);
      return isSpecReady(
        "OPEN",
        issue.labels.nodes.map((l) => l.name),
      );
    })
    .map((issue) => issue.number)
    .sort((a, b) => a - b);
}

export async function readSpec(
  repo: string,
  number: number,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<SpecIssue> {
  const { owner, name } = splitRepo(repo);
  type RawComment = { body: string; createdAt: string; author: { login: string } | null };
  type RawTicket = {
    number: number;
    title: string;
    body: string;
    state: "OPEN" | "CLOSED";
    labels: Page<{ name: string }>;
    comments: Page<RawComment>;
    blockedBy: Page<{ number: number; state: "OPEN" | "CLOSED" }>;
  };
  const data = await ghGraphql<{
    repository: {
      issue: {
        number: number;
        title: string;
        body: string;
        state: "OPEN" | "CLOSED";
        labels: Page<{ name: string }>;
        comments: Page<RawComment>;
        linkedBranches: Page<{ ref: { name: string } | null }>;
        subIssues: Page<RawTicket>;
      } | null;
    };
  }>(READ_SPEC_QUERY, { owner, name, number }, cwd, execFn);

  const issue = data.repository.issue;
  if (!issue) throw new Error(`未找到 Spec #${number}。`);
  assertNoOverflow(issue.labels, `spec #${number} labels`);
  assertNoOverflow(issue.comments, `spec #${number} comments`);
  assertNoOverflow(issue.linkedBranches, `spec #${number} linkedBranches`);
  assertNoOverflow(issue.subIssues, `spec #${number} subIssues`);

  const toComments = (c: Page<RawComment>): CommentNote[] =>
    c.nodes.map((n) => ({ author: n.author?.login ?? "unknown", createdAt: n.createdAt, body: n.body }));

  return {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels.nodes.map((l) => l.name),
    comments: toComments(issue.comments),
    linkedBranches: issue.linkedBranches.nodes.map((b) => b.ref?.name).filter((n): n is string => Boolean(n)),
    subIssues: issue.subIssues.nodes.map((t) => {
      assertNoOverflow(t.labels, `ticket #${t.number} labels`);
      assertNoOverflow(t.comments, `ticket #${t.number} comments`);
      assertNoOverflow(t.blockedBy, `ticket #${t.number} blockedBy`);
      return {
        number: t.number,
        title: t.title,
        body: t.body,
        state: t.state,
        labels: t.labels.nodes.map((l) => l.name),
        comments: toComments(t.comments),
        blockedBy: t.blockedBy.nodes,
      };
    }),
  };
}

export async function isSpecAuthorized(
  repo: string,
  number: number,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<boolean> {
  const { owner, name } = splitRepo(repo);
  const data = await ghGraphql<{
    repository: { issue: { state: string; labels: Page<{ name: string }> } | null };
  }>(SPEC_LABELS_QUERY, { owner, name, number }, cwd, execFn);
  const issue = data.repository.issue;
  if (!issue) return false;
  assertNoOverflow(issue.labels, `spec #${number} labels`);
  return isSpecReady(
    issue.state,
    issue.labels.nodes.map((l) => l.name),
  );
}

export async function pauseSpec(
  repo: string,
  specNumber: number,
  reason: string,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<void> {
  for (const [label, args] of [
    ["添加 needs-attention", ["issue", "edit", String(specNumber), "--repo", repo, "--add-label", "needs-attention"]],
    [
      "写入暂停评论",
      ["issue", "comment", String(specNumber), "--repo", repo, "--body", `Sandcastle AFK 已暂停：${reason}`],
    ],
  ] as const) {
    await execFn("gh", [...args], cwd).catch((err: unknown) => {
      console.error(`Spec #${specNumber} ${label}失败：${err instanceof Error ? err.message : String(err)}`);
    });
  }
}

export async function upsertPullRequest(opts: {
  repo: string;
  cwd: string;
  specBranch: string;
  baseBranch: string;
  title: string;
  body: string;
  closeNums: number[];
  draft?: boolean;
  execFn?: ExecFn;
}): Promise<string> {
  const execFn = opts.execFn ?? runCommand;
  type OpenPr = {
    number: number;
    url: string;
    body: string;
    isCrossRepository: boolean;
    headRefName: string;
    baseRefName: string;
  };
  const openPrs = (
    JSON.parse(
      await execFn(
        "gh",
        [
          "pr",
          "list",
          "--repo",
          opts.repo,
          "--state",
          "open",
          "--head",
          opts.specBranch,
          "--base",
          opts.baseBranch,
          "--json",
          "number,url,body,isCrossRepository,headRefName,baseRefName",
        ],
        opts.cwd,
      ),
    ) as OpenPr[]
  ).filter((pr) => !pr.isCrossRepository && pr.headRefName === opts.specBranch && pr.baseRefName === opts.baseBranch);

  const existing = openPrs[0];
  if (existing) {
    const updated = ensureClosesLines(existing.body, opts.closeNums);
    if (updated !== existing.body) {
      await execFn("gh", ["pr", "edit", String(existing.number), "--repo", opts.repo, "--body", updated], opts.cwd);
    }
    return existing.url;
  }

  const createArgs = [
    "pr",
    "create",
    "--repo",
    opts.repo,
    "--base",
    opts.baseBranch,
    "--head",
    opts.specBranch,
    "--title",
    opts.title,
    "--body",
    opts.body,
    ...(opts.draft ? ["--draft"] : []),
  ];
  return (await execFn("gh", createArgs, opts.cwd)).split(/\r?\n/).at(-1) ?? "";
}

export async function removeReadyLabel(
  repo: string,
  issueNumber: number,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<void> {
  await execFn("gh", ["issue", "edit", String(issueNumber), "--repo", repo, "--remove-label", "ready-for-agent"], cwd);
}

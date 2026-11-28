import { type ExecFn, runCommand } from "./git.ts";

type CommentNote = { author: string; createdAt: string; body: string };
type IssueBase = {
  number: number;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED";
  labels: string[];
  comments: CommentNote[];
};
export type TicketIssue = IssueBase & { blockedBy: { number: number; state: "OPEN" | "CLOSED" }[] };
export type SpecIssue = IssueBase & { linkedBranches: string[]; subIssues: TicketIssue[] };
type OpenPullRequest = {
  number: number;
  url: string;
  body: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  headRefOid: string;
};
type Page<T> = { pageInfo: { hasNextPage: boolean }; nodes: T[] };
type RawComment = { body: string; createdAt: string; author: { login: string } | null };

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

function splitRepo(repo: string): { owner: string; name: string } {
  const [owner, name, extra] = repo.split("/");
  if (!owner || !name || extra) throw new Error(`无效的仓库标识：${repo}`);
  return { owner, name };
}

function assertNoOverflow(page: { pageInfo: { hasNextPage: boolean } }, scope: string): void {
  if (page.pageInfo.hasNextPage) throw new Error(`GitHub 分页溢出（${scope}），请缩小范围后再运行。`);
}

export const isOpenTicket = (t: TicketIssue): boolean =>
  t.state === "OPEN" && t.labels.includes("type:ticket") && !t.labels.includes("type:spec");

export const isSpecReady = (state: string, labels: string[]): boolean =>
  state === "OPEN" &&
  labels.includes("type:spec") &&
  !labels.includes("type:ticket") &&
  labels.includes("ready-for-agent") &&
  !labels.includes("needs-attention");

export const findBlockingOpenTickets = (spec: SpecIssue, done: ReadonlyMap<number, string>): TicketIssue[] =>
  spec.subIssues.filter((t) => isOpenTicket(t) && !done.has(t.number));

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

export function formatIssue(issue: Pick<IssueBase, "number" | "title" | "body" | "labels" | "comments">): string {
  const comments = issue.comments.length
    ? `\n\n### Comments\n${issue.comments.map((c) => `- @${c.author} (${c.createdAt}):\n${c.body}`).join("\n\n")}`
    : "";
  return `#${issue.number}: ${issue.title}\nLabels: ${issue.labels.join(", ") || "(none)"}\n\n${issue.body}${comments}`;
}

export function ensureClosesLines(body: string, numbers: number[]): string {
  const existing = new Set([...body.matchAll(/^\s*Closes\s+#(\d+)\s*$/gim)].map((m) => Number(m[1])));
  const missing = [...new Set(numbers)].filter((n) => !existing.has(n));
  return missing.length === 0 ? body : `${body.trimEnd()}\n\n${missing.map((n) => `Closes #${n}`).join("\n")}\n`;
}

export function createGitHubClient({ repo, cwd, execFn = runCommand }: { repo: string; cwd: string; execFn?: ExecFn }) {
  const gh = (...args: string[]) => execFn("gh", args, cwd);
  const ghJson = async <T>(args: string[]): Promise<T> => JSON.parse(await gh(...args)) as T;

  async function listReadySpecNumbers(): Promise<number[]> {
    const limit = 100;
    const issues = await ghJson<{ number: number; labels: { name: string }[] }[]>([
      "issue",
      "list",
      "--repo",
      repo,
      "--state",
      "open",
      "--label",
      "type:spec",
      "--label",
      "ready-for-agent",
      "--limit",
      String(limit),
      "--json",
      "number,labels",
    ]);
    if (issues.length >= limit) throw new Error("GitHub 分页溢出（ready specs），请缩小范围后再运行。");
    return issues
      .filter((i) =>
        isSpecReady(
          "OPEN",
          i.labels.map((l) => l.name),
        ),
      )
      .map((i) => i.number)
      .sort((a, b) => a - b);
  }

  async function readSpec(number: number): Promise<SpecIssue> {
    const { owner, name } = splitRepo(repo);
    type RawIssue = {
      number: number;
      title: string;
      body: string;
      state: "OPEN" | "CLOSED";
      labels: Page<{ name: string }>;
      comments: Page<RawComment>;
    };
    const { data, errors } = await ghJson<{
      data?: {
        repository: {
          issue:
            | (RawIssue & {
                linkedBranches: Page<{ ref: { name: string } | null }>;
                subIssues: Page<RawIssue & { blockedBy: Page<{ number: number; state: "OPEN" | "CLOSED" }> }>;
              })
            | null;
        };
      };
      errors?: { message: string }[];
    }>([
      "api",
      "graphql",
      "-f",
      `query=${READ_SPEC_QUERY}`,
      "-f",
      `owner=${owner}`,
      "-f",
      `name=${name}`,
      "-F",
      `number=${number}`,
    ]);
    if (errors?.length) throw new Error(`GitHub GraphQL 错误：${errors.map((e) => e.message).join("; ")}`);
    if (!data) throw new Error("GitHub GraphQL 返回空数据。");

    const issue = data.repository.issue;
    if (!issue) throw new Error(`未找到 Spec #${number}。`);
    for (const [k, p] of Object.entries({
      labels: issue.labels,
      comments: issue.comments,
      linkedBranches: issue.linkedBranches,
      subIssues: issue.subIssues,
    })) {
      assertNoOverflow(p, `spec #${number} ${k}`);
    }
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
        for (const [k, p] of Object.entries({ labels: t.labels, comments: t.comments, blockedBy: t.blockedBy })) {
          assertNoOverflow(p, `ticket #${t.number} ${k}`);
        }
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

  async function isSpecAuthorized(number: number): Promise<boolean> {
    const issue = await ghJson<{ state: string; labels: { name: string }[] }>([
      "issue",
      "view",
      String(number),
      "--repo",
      repo,
      "--json",
      "state,labels",
    ]);
    return isSpecReady(
      issue.state,
      issue.labels.map((l) => l.name),
    );
  }

  async function pauseSpec(specNumber: number, reason: string): Promise<void> {
    const ops = [
      ["添加 needs-attention", ["issue", "edit", String(specNumber), "--repo", repo, "--add-label", "needs-attention"]],
      [
        "写入暂停评论",
        ["issue", "comment", String(specNumber), "--repo", repo, "--body", `Sandcastle AFK 已暂停：${reason}`],
      ],
    ] as const;
    for (const [label, args] of ops) {
      await gh(...args).catch((err: unknown) => {
        console.error(`Spec #${specNumber} ${label}失败：${err instanceof Error ? err.message : String(err)}`);
      });
    }
  }

  async function findOpenPullRequest(specBranch: string, baseBranch: string): Promise<OpenPullRequest | undefined> {
    type RawPr = OpenPullRequest & { isCrossRepository: boolean; headRefName: string; baseRefName: string };
    const fields = "number,url,body,state,headRefOid,isCrossRepository,headRefName,baseRefName";
    const prs = await ghJson<RawPr[]>([
      "pr",
      "list",
      "--repo",
      repo,
      "--state",
      "open",
      "--head",
      specBranch,
      "--base",
      baseBranch,
      "--json",
      fields,
    ]);
    return prs.find((p) => !p.isCrossRepository && p.headRefName === specBranch && p.baseRefName === baseBranch);
  }

  async function upsertPullRequest(opts: {
    specBranch: string;
    baseBranch: string;
    title: string;
    body: string;
    closeNums: number[];
    draft?: boolean;
  }): Promise<string> {
    const { specBranch, baseBranch, title, body, closeNums, draft } = opts;
    const existing = await findOpenPullRequest(specBranch, baseBranch);
    if (existing) {
      if (existing.state !== "OPEN") throw new Error(`PR #${existing.number} 状态为 ${existing.state}，拒绝复用。`);
      const updated = ensureClosesLines(existing.body, closeNums);
      if (updated !== existing.body) await gh("pr", "edit", String(existing.number), "--repo", repo, "--body", updated);
      return existing.url;
    }
    const out = await gh(
      "pr",
      "create",
      "--repo",
      repo,
      "--base",
      baseBranch,
      "--head",
      specBranch,
      "--title",
      title,
      "--body",
      ensureClosesLines(body, closeNums),
      ...(draft ? ["--draft"] : []),
    );
    const url = out.trimEnd().split(/\r?\n/).at(-1);
    if (!url) throw new Error("创建 PR 后未返回 URL。");
    return url;
  }

  async function removeReadyLabel(issueNumber: number): Promise<void> {
    await gh("issue", "edit", String(issueNumber), "--repo", repo, "--remove-label", "ready-for-agent");
  }

  return {
    listReadySpecNumbers,
    readSpec,
    isSpecAuthorized,
    pauseSpec,
    findOpenPullRequest,
    upsertPullRequest,
    removeReadyLabel,
  };
}

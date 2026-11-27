import { stripVTControlCharacters } from "node:util";
import { type ExecFn, runCommand } from "./git.ts";

export const CI_GATE_CHECK_NAME = "ci-gate";
export const DEFAULT_CI_LOG_TAIL_LINES = 200;
export const DEFAULT_CI_LOG_MAX_CHARS = 32_000;
const MAX_CHECK_RUN_PAGES = 10;

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

export type OpenPullRequest = {
  number: number;
  url: string;
  body: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
};

export type PullRequestState = {
  number: number;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
};

export type CheckRun = {
  id: number;
  name: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  html_url?: string | null;
  details_url?: string | null;
};

export type WorkflowRun = {
  id: number;
  name?: string | null;
  head_sha: string;
  status: string;
  conclusion: string | null;
  html_url?: string | null;
  run_attempt?: number;
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

export async function findOpenPullRequest(opts: {
  repo: string;
  cwd: string;
  specBranch: string;
  baseBranch: string;
  execFn?: ExecFn;
}): Promise<OpenPullRequest | undefined> {
  const execFn = opts.execFn ?? runCommand;
  type RawOpenPr = {
    number: number;
    url: string;
    body: string;
    state?: "OPEN" | "CLOSED" | "MERGED";
    isDraft?: boolean;
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
          "number,url,body,state,isDraft,isCrossRepository,headRefName,baseRefName",
        ],
        opts.cwd,
      ),
    ) as RawOpenPr[]
  ).filter((pr) => !pr.isCrossRepository && pr.headRefName === opts.specBranch && pr.baseRefName === opts.baseBranch);

  const match = openPrs[0];
  if (!match) return undefined;
  return {
    number: match.number,
    url: match.url,
    body: match.body,
    state: match.state ?? "OPEN",
    isDraft: Boolean(match.isDraft),
  };
}

export async function readPullRequestState(
  repo: string,
  prRef: number | string,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<PullRequestState> {
  const raw = await execFn(
    "gh",
    ["pr", "view", String(prRef), "--repo", repo, "--json", "number,url,state,isDraft"],
    cwd,
  );
  const parsed = JSON.parse(raw) as Partial<PullRequestState>;
  if (typeof parsed.number !== "number" || typeof parsed.url !== "string" || typeof parsed.state !== "string") {
    throw new Error(`无法解析 PR（${prRef}）状态：${raw}`);
  }
  return {
    number: parsed.number,
    url: parsed.url,
    state: parsed.state as PullRequestState["state"],
    isDraft: Boolean(parsed.isDraft),
  };
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
  const existing = await findOpenPullRequest({
    repo: opts.repo,
    cwd: opts.cwd,
    specBranch: opts.specBranch,
    baseBranch: opts.baseBranch,
    execFn,
  });

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

export async function listCommitCheckRuns(
  repo: string,
  headSha: string,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<CheckRun[]> {
  const { owner, name } = splitRepo(repo);
  const collected: CheckRun[] = [];
  for (let page = 1; page <= MAX_CHECK_RUN_PAGES; page++) {
    const endpoint =
      page === 1
        ? `repos/${owner}/${name}/commits/${headSha}/check-runs?per_page=100`
        : `repos/${owner}/${name}/commits/${headSha}/check-runs?per_page=100&page=${page}`;
    const raw = await execFn("gh", ["api", endpoint], cwd);
    const parsed = JSON.parse(raw) as { total_count?: number; check_runs?: CheckRun[] };
    const runs = parsed.check_runs ?? [];
    for (const run of runs) {
      if (run.head_sha === headSha) collected.push(run);
    }
    const totalCount = typeof parsed.total_count === "number" ? parsed.total_count : runs.length;
    if (runs.length === 0 || page * 100 >= totalCount) break;
  }
  return collected;
}

export function selectLatestCiGateCheckRun(
  checkRuns: readonly CheckRun[],
  headSha: string,
  checkName = CI_GATE_CHECK_NAME,
): CheckRun | undefined {
  let latest: CheckRun | undefined;
  for (const run of checkRuns) {
    if (run.head_sha !== headSha || run.name !== checkName) continue;
    if (!latest || run.id > latest.id) latest = run;
  }
  return latest;
}

export async function listCommitWorkflowRuns(
  repo: string,
  headSha: string,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<WorkflowRun[]> {
  const { owner, name } = splitRepo(repo);
  const raw = await execFn("gh", ["api", `repos/${owner}/${name}/actions/runs?head_sha=${headSha}&per_page=100`], cwd);
  const parsed = JSON.parse(raw) as { workflow_runs?: WorkflowRun[] };
  return (parsed.workflow_runs ?? []).filter((run) => run.head_sha === headSha).sort((a, b) => b.id - a.id);
}

export function redactSensitiveLog(text: string): string {
  let out = text;
  // 1. PEM private key blocks (complete and dangling/truncated).
  out = out.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    "[REDACTED_PRIVATE_KEY]",
  );
  out = out.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*/g, "[REDACTED_PRIVATE_KEY]");

  // 2. Authorization / Bearer / Basic headers and tokens.
  out = out.replace(/(\b(?:proxy-)?authorization\s*[:=]\s*)(?:bearer|basic|token)\s+[^\s'",;]+/gi, "$1[REDACTED]");
  out = out.replace(/(\b(?:proxy-)?authorization\s*[:=]\s*)[^\s'",;]{8,}/gi, "$1[REDACTED]");
  out = out.replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[REDACTED]");
  out = out.replace(/(\bBasic\s+)[A-Za-z0-9+/=]{12,}/gi, "$1[REDACTED]");

  // 3. Cookie / Set-Cookie headers.
  out = out.replace(/(\b(?:set-cookie|cookie)\s*[:=]\s*)[^\r\n]+/gi, "$1[REDACTED]");

  // 4. Connection URL credentials (scheme://user:pass@host, scheme://:pass@host, scheme://token@host).
  out = out.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)([^/\s:@]*):([^/\s@]+)@/gi, "$1$2:[REDACTED]@");
  out = out.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)([^/\s:@]{8,})@/gi, "$1[REDACTED]@");

  // 5. Well-known token formats (GitHub, OpenAI/sk-, AWS, JWT).
  out = out.replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_TOKEN]");
  out = out.replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_TOKEN]");
  out = out.replace(/\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_TOKEN]");
  out = out.replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[REDACTED_TOKEN]");
  out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_JWT]");

  // 6. JSON & key=value / key:value secret fields.
  out = out.replace(
    /("(?:[^"]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|session[_-]?id|cookie)[^"]*)"\s*:\s*")([^"\\]*(?:\\.[^"\\]*)*)(")/gi,
    "$1[REDACTED]$3",
  );
  out = out.replace(
    /(\b(?:[A-Z0-9_]*?(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET|AUTH_KEY)|(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|x-api-key))\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s&'",;)}\]]+)/gi,
    "$1[REDACTED]",
  );

  return out;
}

export function sanitizeCiFailureLogs(raw: string, opts: { maxLines?: number; maxChars?: number } = {}): string {
  const maxLines = opts.maxLines ?? DEFAULT_CI_LOG_TAIL_LINES;
  const maxChars = opts.maxChars ?? DEFAULT_CI_LOG_MAX_CHARS;
  const normalized = redactSensitiveLog(stripVTControlCharacters(raw).replace(/\r\n/g, "\n")).trimEnd();
  if (!normalized) return "";

  const lines = normalized.split("\n");
  let bounded: string;
  if (lines.length > maxLines) {
    if (maxLines <= 1) {
      bounded = lines.at(-1) ?? "";
    } else {
      const keepCount = maxLines - 1;
      const dropped = lines.length - keepCount;
      bounded = [`[... truncated ${dropped} earlier lines ...]`, ...lines.slice(-keepCount)].join("\n");
    }
  } else {
    bounded = normalized;
  }

  if (bounded.length > maxChars) {
    const marker = `[... truncated to last ${maxChars} chars ...]\n`;
    if (maxChars <= marker.length) return bounded.slice(-maxChars);
    bounded = `${marker}${bounded.slice(-(maxChars - marker.length))}`;
  }

  return bounded;
}

async function fetchWorkflowRunJobsSummary(repo: string, runId: number, cwd: string, execFn: ExecFn): Promise<string> {
  const { owner, name } = splitRepo(repo);
  try {
    const raw = await execFn("gh", ["api", `repos/${owner}/${name}/actions/runs/${runId}/jobs?per_page=100`], cwd);
    const parsed = JSON.parse(raw) as {
      jobs?: {
        name: string;
        status: string;
        conclusion: string | null;
        html_url?: string | null;
        steps?: { name: string; status: string; conclusion: string | null }[];
      }[];
    };
    const failingJobs = (parsed.jobs ?? []).filter((j) => j.conclusion !== "success" && j.conclusion !== "skipped");
    if (failingJobs.length === 0) return "";
    return failingJobs
      .map((job) => {
        const failedSteps = (job.steps ?? [])
          .filter((s) => s.conclusion !== "success" && s.conclusion !== "skipped")
          .map((s) => `  - step "${s.name}": status=${s.status}, conclusion=${s.conclusion ?? "unknown"}`)
          .join("\n");
        return `Job "${job.name}": status=${job.status}, conclusion=${job.conclusion ?? "unknown"}${job.html_url ? ` (${job.html_url})` : ""}${failedSteps ? `\n${failedSteps}` : ""}`;
      })
      .join("\n");
  } catch {
    return "";
  }
}

export async function fetchSanitizedCiFailureLogs(opts: {
  repo: string;
  headSha: string;
  cwd: string;
  ciGate?: CheckRun;
  maxLines?: number;
  maxChars?: number;
  execFn?: ExecFn;
}): Promise<string> {
  const execFn = opts.execFn ?? runCommand;
  const maxLines = opts.maxLines ?? DEFAULT_CI_LOG_TAIL_LINES;
  const maxChars = opts.maxChars ?? DEFAULT_CI_LOG_MAX_CHARS;

  const runs = await listCommitWorkflowRuns(opts.repo, opts.headSha, opts.cwd, execFn).catch(() => [] as WorkflowRun[]);
  const nonSuccessRuns = runs.filter((r) => r.conclusion !== "success" && r.conclusion !== "skipped");
  const targetRuns = (nonSuccessRuns.length > 0 ? nonSuccessRuns : runs).slice(0, 2);

  const sections: string[] = [];
  for (const run of targetRuns) {
    const runHeader = `=== Workflow Run #${run.id} (${run.name ?? "CI"}, status=${run.status}, conclusion=${run.conclusion ?? "unknown"}) ===`;
    const failedLog = await execFn("gh", ["run", "view", String(run.id), "--repo", opts.repo, "--log-failed"], opts.cwd)
      .then((out) => out.trim())
      .catch(() => "");
    if (failedLog) {
      sections.push(`${runHeader}\n${failedLog}`);
      continue;
    }
    const jobsSummary = await fetchWorkflowRunJobsSummary(opts.repo, run.id, opts.cwd, execFn);
    if (jobsSummary) {
      sections.push(`${runHeader}\n${jobsSummary}`);
    } else {
      sections.push(`${runHeader}\n(failed job logs unavailable; url=${run.html_url ?? "unknown"})`);
    }
  }

  const checkSummary = opts.ciGate
    ? `ci-gate check_run #${opts.ciGate.id} (head_sha=${opts.ciGate.head_sha}, status=${opts.ciGate.status}, conclusion=${opts.ciGate.conclusion ?? "unknown"}, url=${opts.ciGate.html_url ?? opts.ciGate.details_url ?? "unknown"})`
    : `head_sha=${opts.headSha}`;

  if (sections.length === 0) {
    return sanitizeCiFailureLogs(`${checkSummary}\nNo matching GitHub Actions failed logs were returned.`, {
      maxLines,
      maxChars,
    });
  }

  return sanitizeCiFailureLogs(`${checkSummary}\n${sections.join("\n\n")}`, { maxLines, maxChars });
}

export async function removeReadyLabel(
  repo: string,
  issueNumber: number,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<void> {
  await execFn("gh", ["issue", "edit", String(issueNumber), "--repo", repo, "--remove-label", "ready-for-agent"], cwd);
}

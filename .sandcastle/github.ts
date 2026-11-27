import { stripVTControlCharacters } from "node:util";
import { type ExecFn, runCommand } from "./git.ts";

export const CI_GATE_CHECK_NAME = "ci-gate";
export const DEFAULT_CI_LOG_TAIL_LINES = 200;
export const DEFAULT_CI_LOG_MAX_CHARS = 32_000;

export type CommentNote = { author: string; createdAt: string; body: string };
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
export type PullRequestState = { number: number; url: string; state: "OPEN" | "CLOSED" | "MERGED"; isDraft: boolean };
export type OpenPullRequest = PullRequestState & { body: string };
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
type RawComment = { body: string; createdAt: string; author: { login: string } | null };

const LIST_SPECS_QUERY = `query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    issues(first:50,states:OPEN,labels:["type:spec","ready-for-agent"]){
      pageInfo{hasNextPage} nodes{number labels(first:20){pageInfo{hasNextPage} nodes{name}}}
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
  repository(owner:$owner,name:$name){issue(number:$number){state labels(first:20){pageInfo{hasNextPage} nodes{name}}}}
}`;

const REDACT_RULES: readonly [RegExp, string][] = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*/g, "[REDACTED_PRIVATE_KEY]"],
  [/(\b(?:proxy-)?authorization\s*[:=]\s*)(?:bearer|basic|token)\s+[^\s'",;]+/gi, "$1[REDACTED]"],
  [/(\b(?:proxy-)?authorization\s*[:=]\s*)[^\s'",;]{8,}/gi, "$1[REDACTED]"],
  [/(\bBearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[REDACTED]"],
  [/(\bBasic\s+)[A-Za-z0-9+/=]{12,}/gi, "$1[REDACTED]"],
  [/(\b(?:set-cookie|cookie)\s*[:=]\s*)[^\r\n]+/gi, "$1[REDACTED]"],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)([^/\s:@]*):([^/\s@]+)@/gi, "$1$2:[REDACTED]@"],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)([^/\s:@]{8,})@/gi, "$1[REDACTED]@"],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_TOKEN]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_TOKEN]"],
  [/\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_TOKEN]"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[REDACTED_TOKEN]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_JWT]"],
  [
    /("(?:[^"]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|session[_-]?id|cookie)[^"]*)"\s*:\s*")([^"\\]*(?:\\.[^"\\]*)*)(")/gi,
    "$1[REDACTED]$3",
  ],
  [
    /(\b(?:[A-Z0-9_]*?(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET|AUTH_KEY)|(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|x-api-key))\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s&'",;)}\]]+)/gi,
    "$1[REDACTED]",
  ],
];

function splitRepo(repo: string): { owner: string; name: string } {
  const [owner, name, extra] = repo.split("/");
  if (!owner || !name || extra) throw new Error(`无效的仓库标识：${repo}`);
  return { owner, name };
}

function assertNoOverflow(page: { pageInfo: { hasNextPage: boolean } }, scope: string): void {
  if (page.pageInfo.hasNextPage) throw new Error(`GitHub 分页溢出（${scope}），请缩小范围后再运行。`);
}

const ghJson = async <T>(args: string[], cwd: string, execFn: ExecFn = runCommand): Promise<T> =>
  JSON.parse(await execFn("gh", args, cwd)) as T;

async function ghGraphql<T>(
  query: string,
  vars: Record<string, string | number>,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<T> {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) args.push(typeof v === "number" ? "-F" : "-f", `${k}=${v}`);
  const parsed = await ghJson<{ data?: T; errors?: { message: string }[] }>(args, cwd, execFn);
  if (parsed.errors?.length) throw new Error(`GitHub GraphQL 错误：${parsed.errors.map((e) => e.message).join("; ")}`);
  if (!parsed.data) throw new Error("GitHub GraphQL 返回空数据。");
  return parsed.data;
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

export async function ensurePrClosesLines(
  repo: string,
  pr: Pick<OpenPullRequest, "number" | "body">,
  closeNums: number[],
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<void> {
  const updated = ensureClosesLines(pr.body, closeNums);
  if (updated !== pr.body)
    await execFn("gh", ["pr", "edit", String(pr.number), "--repo", repo, "--body", updated], cwd);
}

export async function listReadySpecNumbers(repo: string, cwd: string, execFn: ExecFn = runCommand): Promise<number[]> {
  const { repository } = await ghGraphql<{
    repository: { issues: Page<{ number: number; labels: Page<{ name: string }> }> };
  }>(LIST_SPECS_QUERY, splitRepo(repo), cwd, execFn);
  assertNoOverflow(repository.issues, "ready specs");
  return repository.issues.nodes
    .filter((i) => {
      assertNoOverflow(i.labels, `spec #${i.number} labels`);
      return isSpecReady(
        "OPEN",
        i.labels.nodes.map((l) => l.name),
      );
    })
    .map((i) => i.number)
    .sort((a, b) => a - b);
}

export async function readSpec(
  repo: string,
  number: number,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<SpecIssue> {
  type RawIssue = {
    number: number;
    title: string;
    body: string;
    state: "OPEN" | "CLOSED";
    labels: Page<{ name: string }>;
    comments: Page<RawComment>;
  };
  const { repository } = await ghGraphql<{
    repository: {
      issue:
        | (RawIssue & {
            linkedBranches: Page<{ ref: { name: string } | null }>;
            subIssues: Page<RawIssue & { blockedBy: Page<{ number: number; state: "OPEN" | "CLOSED" }> }>;
          })
        | null;
    };
  }>(READ_SPEC_QUERY, { ...splitRepo(repo), number }, cwd, execFn);

  const issue = repository.issue;
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

export async function isSpecAuthorized(
  repo: string,
  number: number,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<boolean> {
  const { repository } = await ghGraphql<{
    repository: { issue: { state: string; labels: Page<{ name: string }> } | null };
  }>(SPEC_LABELS_QUERY, { ...splitRepo(repo), number }, cwd, execFn);
  if (!repository.issue) return false;
  assertNoOverflow(repository.issue.labels, `spec #${number} labels`);
  return isSpecReady(
    repository.issue.state,
    repository.issue.labels.nodes.map((l) => l.name),
  );
}

export async function pauseSpec(
  repo: string,
  specNumber: number,
  reason: string,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<void> {
  const ops = [
    ["添加 needs-attention", ["issue", "edit", String(specNumber), "--repo", repo, "--add-label", "needs-attention"]],
    [
      "写入暂停评论",
      ["issue", "comment", String(specNumber), "--repo", repo, "--body", `Sandcastle AFK 已暂停：${reason}`],
    ],
  ] as const;
  for (const [label, args] of ops) {
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
  const { repo, cwd, specBranch, baseBranch, execFn } = opts;
  type RawPr = OpenPullRequest & { isCrossRepository: boolean; headRefName: string; baseRefName: string };
  const fields = "number,url,body,state,isDraft,isCrossRepository,headRefName,baseRefName";
  const prs = await ghJson<RawPr[]>(
    ["pr", "list", "--repo", repo, "--state", "open", "--head", specBranch, "--base", baseBranch, "--json", fields],
    cwd,
    execFn,
  );
  const m = prs.find((p) => !p.isCrossRepository && p.headRefName === specBranch && p.baseRefName === baseBranch);
  return m
    ? { number: m.number, url: m.url, body: m.body, state: m.state ?? "OPEN", isDraft: Boolean(m.isDraft) }
    : undefined;
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
  return { number: parsed.number, url: parsed.url, state: parsed.state, isDraft: Boolean(parsed.isDraft) };
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
  const existing = await findOpenPullRequest(opts);
  if (existing) {
    await ensurePrClosesLines(opts.repo, existing, opts.closeNums, opts.cwd, execFn);
    return existing.url;
  }
  const { repo, baseBranch, specBranch, title, body, draft, cwd } = opts;
  const args = [
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
    body,
    ...(draft ? ["--draft"] : []),
  ];
  return (await execFn("gh", args, cwd)).split(/\r?\n/).at(-1) ?? "";
}

export async function listCommitCheckRuns(
  repo: string,
  headSha: string,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<CheckRun[]> {
  const { owner, name } = splitRepo(repo);
  const collected: CheckRun[] = [];
  for (let page = 1; page <= 10; page++) {
    const parsed = await ghJson<{ total_count?: number; check_runs?: CheckRun[] }>(
      ["api", `repos/${owner}/${name}/commits/${headSha}/check-runs?per_page=100${page > 1 ? `&page=${page}` : ""}`],
      cwd,
      execFn,
    );
    const runs = parsed.check_runs ?? [];
    for (const r of runs) if (r.head_sha === headSha) collected.push(r);
    if (!runs.length || page * 100 >= (parsed.total_count ?? runs.length)) break;
  }
  return collected;
}

export function selectLatestCiGateCheckRun(
  checkRuns: readonly CheckRun[],
  headSha: string,
  checkName = CI_GATE_CHECK_NAME,
): CheckRun | undefined {
  let latest: CheckRun | undefined;
  for (const r of checkRuns) {
    if (r.head_sha === headSha && r.name === checkName && (!latest || r.id > latest.id)) latest = r;
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
  const { workflow_runs = [] } = await ghJson<{ workflow_runs?: WorkflowRun[] }>(
    ["api", `repos/${owner}/${name}/actions/runs?head_sha=${headSha}&per_page=100`],
    cwd,
    execFn,
  );
  return workflow_runs.filter((r) => r.head_sha === headSha).sort((a, b) => b.id - a.id);
}

export function redactSensitiveLog(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REDACT_RULES) out = out.replace(pattern, replacement);
  return out;
}

export function sanitizeCiFailureLogs(raw: string, opts: { maxLines?: number; maxChars?: number } = {}): string {
  const maxLines = opts.maxLines ?? DEFAULT_CI_LOG_TAIL_LINES;
  const maxChars = opts.maxChars ?? DEFAULT_CI_LOG_MAX_CHARS;
  const normalized = redactSensitiveLog(stripVTControlCharacters(raw).replace(/\r\n/g, "\n")).trimEnd();
  if (!normalized) return "";
  const lines = normalized.split("\n");
  let bounded =
    lines.length <= maxLines
      ? normalized
      : maxLines <= 1
        ? (lines.at(-1) ?? "")
        : [`[... truncated ${lines.length - (maxLines - 1)} earlier lines ...]`, ...lines.slice(-(maxLines - 1))].join(
            "\n",
          );
  if (bounded.length > maxChars) {
    const marker = `[... truncated to last ${maxChars} chars ...]\n`;
    bounded =
      maxChars <= marker.length ? bounded.slice(-maxChars) : `${marker}${bounded.slice(-(maxChars - marker.length))}`;
  }
  return bounded;
}

async function fetchWorkflowRunJobsSummary(repo: string, runId: number, cwd: string, execFn: ExecFn): Promise<string> {
  const { owner, name } = splitRepo(repo);
  type Step = { name: string; status: string; conclusion: string | null };
  type Job = Step & { html_url?: string | null; steps?: Step[] };
  const isFail = (x: { conclusion: string | null }) => x.conclusion !== "success" && x.conclusion !== "skipped";
  try {
    const { jobs = [] } = await ghJson<{ jobs?: Job[] }>(
      ["api", `repos/${owner}/${name}/actions/runs/${runId}/jobs?per_page=100`],
      cwd,
      execFn,
    );
    return jobs
      .filter(isFail)
      .map((j) => {
        const steps = (j.steps ?? [])
          .filter(isFail)
          .map((s) => `  - step "${s.name}": status=${s.status}, conclusion=${s.conclusion ?? "unknown"}`)
          .join("\n");
        return `Job "${j.name}": status=${j.status}, conclusion=${j.conclusion ?? "unknown"}${j.html_url ? ` (${j.html_url})` : ""}${steps ? `\n${steps}` : ""}`;
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
  const runs = await listCommitWorkflowRuns(opts.repo, opts.headSha, opts.cwd, execFn).catch(() => [] as WorkflowRun[]);
  const failing = runs.filter((r) => r.conclusion !== "success" && r.conclusion !== "skipped");
  const sections: string[] = [];
  for (const r of (failing.length ? failing : runs).slice(0, 2)) {
    const header = `=== Workflow Run #${r.id} (${r.name ?? "CI"}, status=${r.status}, conclusion=${r.conclusion ?? "unknown"}) ===`;
    const body =
      (await execFn("gh", ["run", "view", String(r.id), "--repo", opts.repo, "--log-failed"], opts.cwd)
        .then((o) => o.trim())
        .catch(() => "")) ||
      (await fetchWorkflowRunJobsSummary(opts.repo, r.id, opts.cwd, execFn)) ||
      `(failed job logs unavailable; url=${r.html_url ?? "unknown"})`;
    sections.push(`${header}\n${body}`);
  }
  const checkSummary = opts.ciGate
    ? `ci-gate check_run #${opts.ciGate.id} (head_sha=${opts.ciGate.head_sha}, status=${opts.ciGate.status}, conclusion=${opts.ciGate.conclusion ?? "unknown"}, url=${opts.ciGate.html_url ?? opts.ciGate.details_url ?? "unknown"})`
    : `head_sha=${opts.headSha}`;
  const detail = sections.length ? sections.join("\n\n") : "No matching GitHub Actions failed logs were returned.";
  return sanitizeCiFailureLogs(`${checkSummary}\n${detail}`, { maxLines: opts.maxLines, maxChars: opts.maxChars });
}

export async function removeReadyLabel(
  repo: string,
  issueNumber: number,
  cwd: string,
  execFn: ExecFn = runCommand,
): Promise<void> {
  await execFn("gh", ["issue", "edit", String(issueNumber), "--repo", repo, "--remove-label", "ready-for-agent"], cwd);
}

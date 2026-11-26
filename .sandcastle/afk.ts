import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseEnv, promisify } from "node:util";
import {
  type AgentProvider,
  type BindMountSandboxProvider,
  type BindMountSandboxProviderConfig,
  createBindMountSandboxProvider,
  run,
  type SandboxHooks,
  type SandboxProvider,
} from "@ai-hero/sandcastle";

const exec = promisify(execFile);
const COMPLETE = "<promise>COMPLETE</promise>";
const GH_MAX_BUFFER = 16 * 1024 * 1024;
const TRAILER_PREFIX = "Sandcastle-Ticket: #";

export type AgentSlot = { provider: AgentProvider; instructions: string };

export type SessionConfig = {
  sandbox: BindMountSandboxProvider;
  hooks?: SandboxHooks;
  cleanup?: () => Promise<void>;
};

export type AfkOptions = {
  repo: string;
  cwd?: string;
  remote?: string;
  baseBranch?: string;
  specNumber?: number;
  maxSpecs?: number;
  maxParallel?: number;
  draft?: boolean;
  agents: {
    light: AgentSlot;
    standard: AgentSlot;
    deep: AgentSlot;
    reviewStandards: AgentSlot;
    reviewSpec: AgentSlot;
    repair: AgentSlot;
  };
  createSession: (ctx: {
    phase: "implement" | "merge" | "review-standards" | "review-spec" | "repair-and-verify";
    readonly: boolean;
    runId: string;
  }) => Promise<SessionConfig>;
  promptsDir: string;
};

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

export type AfkResult = {
  delivered: { spec: number; branch: string; prUrl: string; tickets: number[] }[];
  paused: { spec: number; reason: string }[];
  stopped: number[];
};

type ExecFn = (file: string, args: string[], cwd: string) => Promise<string>;
type RuntimeBindMount = BindMountSandboxProvider & {
  readonly tag: "bind-mount";
  readonly create: BindMountSandboxProviderConfig["create"];
};

export async function runCommand(file: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await exec(file, args, { cwd, maxBuffer: GH_MAX_BUFFER });
  return stdout.trimEnd();
}

export function readonlySandbox(provider: SandboxProvider): BindMountSandboxProvider {
  if (
    !(
      "tag" in provider &&
      provider.tag === "bind-mount" &&
      "create" in provider &&
      typeof provider.create === "function"
    )
  ) {
    throw new Error(`readonlySandbox requires a bind-mount provider, got "${provider.name}".`);
  }
  const inner = provider as RuntimeBindMount;
  const innerCreate = inner.create.bind(inner);
  return createBindMountSandboxProvider({
    name: inner.name,
    env: inner.env,
    sandboxHomedir: inner.sandboxHomedir,
    create: (opts) => innerCreate({ ...opts, mounts: opts.mounts.map((m) => ({ ...m, readonly: true })) }),
  });
}

async function checkDotEnvFile(dir: string): Promise<void> {
  const envPath = join(dir, ".sandcastle", ".env");
  const raw = await readFile(envPath, "utf8").catch((err: unknown) => {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return undefined;
    throw err;
  });
  if (raw === undefined) return;
  const parsed = parseEnv(raw);
  if (Object.hasOwn(parsed, "GH_TOKEN") || Object.hasOwn(parsed, "GITHUB_TOKEN")) {
    throw new Error(`拒绝启动：${envPath} 不得声明 GH_TOKEN 或 GITHUB_TOKEN（含空值）。`);
  }
}

export async function preflightCredentials(cwd: string, extraDirs: string[] = []): Promise<void> {
  const dirs = [...new Set([resolve(cwd), ...extraDirs.map((d) => resolve(d))])];
  for (const dir of dirs) await checkDotEnvFile(dir);

  const gitConfig = await readFile(join(cwd, ".git", "config"), "utf8").catch((err: unknown) => {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return "";
    throw err;
  });
  if (/(?:https?:\/\/[^/\s@]+@)|(?:extraheader\s*=.*authorization)/i.test(gitConfig)) {
    throw new Error("拒绝启动：.git/config 包含内嵌凭据或 HTTP Authorization header。");
  }
}

export function parseGitHubRepoUrl(url: string): string | undefined {
  const trimmed = url.trim();
  const scp = /^git@github\.com:([^/\s]+\/[^/\s]+?)(?:\.git)?$/i.exec(trimmed);
  if (scp?.[1]) return scp[1].toLowerCase();
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLowerCase() !== "github.com") return undefined;
    if (parsed.protocol !== "https:" && parsed.protocol !== "ssh:") return undefined;
    const match = /^\/([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i.exec(parsed.pathname);
    return match?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

export async function verifyGitRemote(
  cwd: string,
  remote: string,
  repo: string,
  execFn: ExecFn = runCommand,
): Promise<void> {
  const pushOut = await execFn("git", ["remote", "get-url", "--push", "--all", remote], cwd);
  const urls = pushOut
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (urls.length === 0) throw new Error(`远端 ${remote} 未配置 push URL。`);
  const expected = repo.toLowerCase();
  for (const url of urls) {
    if (parseGitHubRepoUrl(url) !== expected) {
      throw new Error(`远端 ${remote} 的 push URL（${url}）与目标仓库 github.com/${repo} 不一致。`);
    }
  }
}

function splitRepo(repo: string): { owner: string; name: string } {
  const [owner, name, extra] = repo.split("/");
  if (!owner || !name || extra) throw new Error(`无效的仓库标识：${repo}`);
  return { owner, name };
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
  if (parsed.errors?.length) throw new Error(`GitHub GraphQL 错误：${parsed.errors.map((e) => e.message).join("; ")}`);
  if (!parsed.data) throw new Error("GitHub GraphQL 返回空数据。");
  return parsed.data;
}

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

type Page<T> = { pageInfo: { hasNextPage: boolean }; nodes: T[] };
function assertNoOverflow(page: { pageInfo: { hasNextPage: boolean } }, scope: string): void {
  if (page.pageInfo.hasNextPage) throw new Error(`GitHub 分页溢出（${scope}），请缩小范围后再运行。`);
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
      return !issue.labels.nodes.some((l) => l.name === "needs-attention");
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

export function resolveSpecBranch(spec: SpecIssue, baseBranch: string): string {
  if (spec.linkedBranches.length > 1) {
    throw new Error(`Spec #${spec.number} 关联了多个分支（${spec.linkedBranches.join(", ")}），无法唯一确定集成分支。`);
  }
  const branch = spec.linkedBranches[0] ?? `sandcastle/spec-${spec.number}`;
  if (branch === baseBranch) throw new Error(`Spec #${spec.number} 的集成分支不得与基线分支 ${baseBranch} 同名。`);
  return branch;
}

async function isSpecAuthorized(repo: string, number: number, cwd: string): Promise<boolean> {
  const { owner, name } = splitRepo(repo);
  const data = await ghGraphql<{
    repository: { issue: { state: string; labels: Page<{ name: string }> } | null };
  }>(SPEC_LABELS_QUERY, { owner, name, number }, cwd);
  const issue = data.repository.issue;
  if (issue?.state !== "OPEN") return false;
  assertNoOverflow(issue.labels, `spec #${number} labels`);
  const names = new Set(issue.labels.nodes.map((l) => l.name));
  return names.has("ready-for-agent") && !names.has("needs-attention");
}

export async function branchExists(cwd: string, branch: string, execFn: ExecFn = runCommand): Promise<boolean> {
  try {
    await execFn("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], cwd);
    return true;
  } catch {
    return false;
  }
}

async function listWorktrees(cwd: string): Promise<{ path: string; branch?: string }[]> {
  const out = await runCommand("git", ["worktree", "list", "--porcelain"], cwd);
  const items: { path: string; branch?: string }[] = [];
  let current: { path: string; branch?: string } | undefined;
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) items.push(current);
      current = { path: resolve(line.slice(9)) };
    } else if (line.startsWith("branch refs/heads/") && current) {
      current.branch = line.slice("branch refs/heads/".length);
    }
  }
  if (current) items.push(current);
  return items;
}

async function assertClean(dir: string, label: string): Promise<void> {
  const status = await runCommand("git", ["status", "--porcelain"], dir);
  if (status.length > 0) throw new Error(`${label} 存在未提交改动：\n${status}`);
}

async function ensureWorktree(cwd: string, dir: string, branch: string, startRef: string): Promise<string> {
  const target = resolve(dir);
  const active = (await listWorktrees(cwd)).find((w) => w.branch === branch);
  if (active) {
    if (active.path !== target) throw new Error(`分支 ${branch} 已被外部工作树占用：${active.path}`);
    await assertClean(target, `工作树 ${target}`);
    return target;
  }
  await mkdir(resolve(target, ".."), { recursive: true });
  if (await branchExists(cwd, branch)) {
    await runCommand("git", ["worktree", "add", target, branch], cwd);
  } else {
    await runCommand("git", ["worktree", "add", "-b", branch, target, startRef], cwd);
  }
  return target;
}

async function removeWorktreeIfClean(cwd: string, dir: string): Promise<void> {
  const target = resolve(dir);
  const active = (await listWorktrees(cwd)).find((w) => w.path === target);
  if (!active) return;
  await assertClean(target, `清理工作树 ${target}`);
  await runCommand("git", ["worktree", "remove", target], cwd);
}

async function deleteBranchCas(cwd: string, branch: string, expectedSha: string): Promise<void> {
  const active = (await listWorktrees(cwd)).find((w) => w.branch === branch);
  if (active) throw new Error(`分支 ${branch} 仍被工作树 ${active.path} 检出，拒绝删除。`);
  await runCommand("git", ["update-ref", "-d", `refs/heads/${branch}`, expectedSha], cwd);
}

async function integratedTickets(cwd: string, mergeBase: string, specBranch: string): Promise<Map<number, string>> {
  const log = await runCommand(
    "git",
    ["log", "--first-parent", "--merges", "--format=%H%n%B%x00", `${mergeBase}..${specBranch}`],
    cwd,
  );
  const done = new Map<number, string>();
  for (const entry of log.split("\0")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const newline = trimmed.indexOf("\n");
    const sha = newline === -1 ? trimmed : trimmed.slice(0, newline);
    const msg = newline === -1 ? "" : trimmed.slice(newline + 1);
    for (const match of msg.matchAll(/^Sandcastle-Ticket:\s*#(\d+)\s*$/gm)) {
      if (match[1] && !done.has(Number(match[1]))) done.set(Number(match[1]), sha);
    }
  }
  return done;
}

function formatIssue(issue: {
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

function selectSlot(ticket: TicketIssue, agents: AfkOptions["agents"]): AgentSlot {
  const light = ticket.labels.includes("agent:light");
  const deep = ticket.labels.includes("agent:deep");
  if (light && deep) throw new Error(`Ticket #${ticket.number} 同时带有 agent:light 与 agent:deep 标签。`);
  return light ? agents.light : deep ? agents.deep : agents.standard;
}

function extractTag(text: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(text);
  return match?.[1]?.trim() || undefined;
}

function ensureClosesLines(body: string, numbers: number[]): string {
  const existing = new Set([...body.matchAll(/\bCloses\s+#(\d+)\b/gi)].map((m) => Number(m[1])));
  const missing = [...new Set(numbers)].filter((n) => !existing.has(n));
  if (missing.length === 0) return body;
  return `${body.trimEnd()}\n\n${missing.map((n) => `Closes #${n}`).join("\n")}\n`;
}

async function pauseSpec(repo: string, specNumber: number, reason: string, cwd: string): Promise<void> {
  await runCommand(
    "gh",
    ["issue", "edit", String(specNumber), "--repo", repo, "--add-label", "needs-attention"],
    cwd,
  ).catch(() => {});
  await runCommand(
    "gh",
    ["issue", "comment", String(specNumber), "--repo", repo, "--body", `Sandcastle AFK 已暂停：${reason}`],
    cwd,
  ).catch(() => {});
}

async function runPhase(opts: {
  afk: AfkOptions;
  cwd: string;
  worktree: string;
  phase: "implement" | "merge" | "review-standards" | "review-spec" | "repair-and-verify";
  readonly: boolean;
  runId: string;
  slot: AgentSlot;
  promptFile: string;
  promptArgs: Record<string, string>;
}): Promise<string> {
  await preflightCredentials(opts.cwd, [opts.worktree]);
  const logsDir = join(opts.cwd, ".sandcastle", "logs");
  await mkdir(logsDir, { recursive: true });
  const session = await opts.afk.createSession({ phase: opts.phase, readonly: opts.readonly, runId: opts.runId });
  try {
    const result = await run({
      cwd: opts.worktree,
      agent: opts.slot.provider,
      sandbox: opts.readonly ? readonlySandbox(session.sandbox) : session.sandbox,
      hooks: opts.readonly ? undefined : session.hooks,
      branchStrategy: { type: "head" },
      promptFile: opts.promptFile,
      promptArgs: { ROLE_INSTRUCTIONS: opts.slot.instructions, ...opts.promptArgs },
      completionSignal: COMPLETE,
      maxIterations: 1,
      name: opts.runId,
      logging: { type: "file", path: join(logsDir, `${opts.runId}.log`) },
    });
    if (result.completionSignal !== COMPLETE) throw new Error(`${opts.runId} 未输出完成标记 ${COMPLETE}。`);
    return result.stdout;
  } finally {
    await session.cleanup?.();
  }
}

async function mergeTicketIntoSpec(opts: {
  afk: AfkOptions;
  cwd: string;
  spec: SpecIssue;
  specWorktree: string;
  ticket: TicketIssue;
  ticketBranch: string;
  ticketTip: string;
}): Promise<void> {
  const { afk, cwd, spec, specWorktree, ticket, ticketBranch, ticketTip } = opts;
  const specTipBefore = await runCommand("git", ["rev-parse", "HEAD"], specWorktree);
  const mergeMsg = `Merge #${ticket.number}: ${ticket.title}\n\n${TRAILER_PREFIX}${ticket.number}`;
  try {
    await runCommand("git", ["merge", "--no-ff", "-m", mergeMsg, ticketBranch], specWorktree);
    return;
  } catch {
    await runCommand("git", ["merge", "--abort"], specWorktree).catch(() => {});
  }

  await runPhase({
    afk,
    cwd,
    worktree: specWorktree,
    phase: "merge",
    readonly: false,
    runId: `spec-${spec.number}-merge-${ticket.number}-${Date.now()}`,
    slot: afk.agents.standard,
    promptFile: join(afk.promptsDir, "merge.md"),
    promptArgs: {
      TICKET_NUMBER: String(ticket.number),
      TICKET_BRANCH: ticketBranch,
      TICKET_TIP: ticketTip,
      SPEC_TIP: specTipBefore,
      SPEC: formatIssue(spec),
      TICKET: formatIssue(ticket),
    },
  });

  await assertClean(specWorktree, `Merger 工作树（#${ticket.number}）`);
  await runCommand("git", ["merge-base", "--is-ancestor", specTipBefore, "HEAD"], specWorktree);
  await runCommand("git", ["merge-base", "--is-ancestor", ticketTip, "HEAD"], specWorktree);
  const mergeSha = await runCommand(
    "git",
    ["rev-list", "--first-parent", "--merges", "-n", "1", `${specTipBefore}..HEAD`],
    specWorktree,
  );
  if (!mergeSha) throw new Error(`Merger 未在 Spec 分支产生有效合并提交（#${ticket.number}）。`);
  const headMsg = await runCommand("git", ["log", "-1", "--pretty=%B"], specWorktree);
  if (!headMsg.includes(`${TRAILER_PREFIX}${ticket.number}`)) {
    await runCommand(
      "git",
      ["commit", "--amend", "--no-verify", "-m", `${headMsg.trimEnd()}\n\n${TRAILER_PREFIX}${ticket.number}`],
      specWorktree,
    );
  }
}

export async function checkAfk(opts: Pick<AfkOptions, "repo" | "cwd" | "remote" | "baseBranch">) {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const remote = opts.remote ?? "origin";
  const baseBranch = opts.baseBranch ?? "main";
  await preflightCredentials(cwd);
  await verifyGitRemote(cwd, remote, opts.repo);
  await runCommand("git", ["fetch", remote, baseBranch], cwd);
  const readySpecs = await listReadySpecNumbers(opts.repo, cwd);
  return { repo: opts.repo, remote, baseBranch, readySpecs };
}

export async function runAfk(options: AfkOptions): Promise<AfkResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const remote = options.remote ?? "origin";
  const baseBranch = options.baseBranch ?? "main";
  const maxSpecs = options.maxSpecs ?? 1;
  const maxParallel = Math.max(1, options.maxParallel ?? 4);
  const result: AfkResult = { delivered: [], paused: [], stopped: [] };

  await preflightCredentials(cwd);
  await verifyGitRemote(cwd, remote, options.repo);
  await runCommand("git", ["fetch", remote, baseBranch], cwd);

  const candidates =
    options.specNumber !== undefined
      ? [options.specNumber]
      : (await listReadySpecNumbers(options.repo, cwd)).slice(0, maxSpecs);

  for (const specNumber of candidates) {
    try {
      let spec = await readSpec(options.repo, specNumber, cwd);
      if (
        spec.state !== "OPEN" ||
        !spec.labels.includes("ready-for-agent") ||
        spec.labels.includes("needs-attention")
      ) {
        result.stopped.push(specNumber);
        continue;
      }

      const specBranch = resolveSpecBranch(spec, baseBranch);
      await runCommand("git", ["check-ref-format", "--branch", specBranch], cwd);
      let startRef = `${remote}/${baseBranch}`;
      if (spec.linkedBranches.length === 1 && !(await branchExists(cwd, specBranch))) {
        await runCommand("git", ["fetch", remote, specBranch], cwd);
        startRef = `${remote}/${specBranch}`;
      }

      const specWorktree = await ensureWorktree(
        cwd,
        join(cwd, ".sandcastle", "worktrees", `spec-${specNumber}`),
        specBranch,
        startRef,
      );
      const mergeBase = await runCommand("git", ["merge-base", specBranch, `${remote}/${baseBranch}`], cwd);
      const done = await integratedTickets(cwd, mergeBase, specBranch);

      // Parallel ticket execution with single-loop serial merge & on-demand Merger.
      type InFlight = {
        ticket: TicketIssue;
        branch: string;
        worktree: string;
        baseSha: string;
        promise: Promise<{ ticket: TicketIssue; branch: string; worktree: string; baseSha: string; error?: unknown }>;
      };
      const inFlight = new Map<number, InFlight>();
      const failed: string[] = [];
      let softStopped = false;

      while (true) {
        if (!softStopped && failed.length === 0) {
          const internalIds = new Set(spec.subIssues.map((t) => t.number));
          const ready = spec.subIssues
            .filter(
              (t) =>
                t.state === "OPEN" && t.labels.includes("ready-for-agent") && !t.labels.includes("needs-attention"),
            )
            .filter((t) => !done.has(t.number) && !inFlight.has(t.number))
            .filter((t) =>
              t.blockedBy.every((b) => (internalIds.has(b.number) ? done.has(b.number) : b.state === "CLOSED")),
            )
            .sort((a, b) => a.number - b.number);

          for (const ticket of ready) {
            if (inFlight.size >= maxParallel) break;
            if (!(await isSpecAuthorized(options.repo, specNumber, cwd))) {
              softStopped = true;
              break;
            }
            const slot = selectSlot(ticket, options.agents);
            const branch = `sandcastle/ticket-${ticket.number}`;
            const specTip = await runCommand("git", ["rev-parse", "HEAD"], specWorktree);
            const worktree = await ensureWorktree(
              cwd,
              join(cwd, ".sandcastle", "worktrees", `ticket-${ticket.number}`),
              branch,
              specTip,
            );
            const baseSha = await runCommand("git", ["rev-parse", "HEAD"], worktree);
            for (const blocker of ticket.blockedBy) {
              const blockerSha = done.get(blocker.number);
              if (blockerSha) {
                try {
                  await runCommand("git", ["merge-base", "--is-ancestor", blockerSha, baseSha], worktree);
                } catch {
                  throw new Error(
                    `复用票分支 ${branch} 缺少已集成前置 #${blocker.number}（${blockerSha.slice(0, 8)}），请清理旧票分支后重试。`,
                  );
                }
              }
            }
            const promise = runPhase({
              afk: options,
              cwd,
              worktree,
              phase: "implement",
              readonly: false,
              runId: `spec-${specNumber}-ticket-${ticket.number}-${Date.now()}`,
              slot,
              promptFile: join(options.promptsDir, "implement.md"),
              promptArgs: { BASE_SHA: baseSha, SPEC: formatIssue(spec), TICKET: formatIssue(ticket) },
            }).then(
              () => ({ ticket, branch, worktree, baseSha }),
              (error: unknown) => ({ ticket, branch, worktree, baseSha, error }),
            );
            inFlight.set(ticket.number, { ticket, branch, worktree, baseSha, promise });
          }
        }

        if (inFlight.size === 0) {
          if (softStopped || failed.length > 0) break;
          spec = await readSpec(options.repo, specNumber, cwd);
          const remaining = spec.subIssues.filter(
            (t) =>
              t.state === "OPEN" &&
              t.labels.includes("ready-for-agent") &&
              !t.labels.includes("needs-attention") &&
              !done.has(t.number),
          );
          if (remaining.length === 0) break;
          const internalIds = new Set(spec.subIssues.map((t) => t.number));
          const anyUnblocked = remaining.some((t) =>
            t.blockedBy.every((b) => (internalIds.has(b.number) ? done.has(b.number) : b.state === "CLOSED")),
          );
          if (!anyUnblocked) {
            throw new Error(`存在未解决阻塞或环依赖：${remaining.map((t) => `#${t.number}`).join(", ")}`);
          }
          continue;
        }

        const finished = await Promise.race([...inFlight.values()].map((item) => item.promise));
        inFlight.delete(finished.ticket.number);

        if (finished.error) {
          failed.push(
            `#${finished.ticket.number}: ${finished.error instanceof Error ? finished.error.message : String(finished.error)}`,
          );
          continue;
        }
        try {
          await assertClean(finished.worktree, `Ticket #${finished.ticket.number}`);
          const ticketTip = await runCommand("git", ["rev-parse", "HEAD"], finished.worktree);
          await runCommand("git", ["merge-base", "--is-ancestor", finished.baseSha, ticketTip], finished.worktree);
          await mergeTicketIntoSpec({
            afk: options,
            cwd,
            spec,
            specWorktree,
            ticket: finished.ticket,
            ticketBranch: finished.branch,
            ticketTip,
          });
          done.set(finished.ticket.number, await runCommand("git", ["rev-parse", "HEAD"], specWorktree));
          await removeWorktreeIfClean(cwd, finished.worktree);
          await deleteBranchCas(cwd, finished.branch, ticketTip);
        } catch (error) {
          failed.push(`#${finished.ticket.number}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (failed.length > 0) throw new Error(`子票执行或合并失败：${failed.join("；")}`);
      if (softStopped || !(await isSpecAuthorized(options.repo, specNumber, cwd))) {
        result.stopped.push(specNumber);
        continue;
      }

      // Dual-axis read-only review + single writable repair-and-verify.
      await assertClean(specWorktree, `Spec #${specNumber}`);
      const reviewBase = await runCommand("git", ["merge-base", specBranch, `${remote}/${baseBranch}`], cwd);
      const candidateSha = await runCommand("git", ["rev-parse", "HEAD"], specWorktree);
      const integratedList = spec.subIssues.filter((t) => done.has(t.number)).sort((a, b) => a.number - b.number);
      const ticketsSummary = integratedList.map(formatIssue).join("\n\n---\n\n") || "(none)";

      const [standardsReport, specReport] = await Promise.all([
        runPhase({
          afk: options,
          cwd,
          worktree: specWorktree,
          phase: "review-standards",
          readonly: true,
          runId: `spec-${specNumber}-review-standards-${Date.now()}`,
          slot: options.agents.reviewStandards,
          promptFile: join(options.promptsDir, "review-standards.md"),
          promptArgs: {
            BASE_SHA: reviewBase,
            CANDIDATE_SHA: candidateSha,
            SPEC: formatIssue(spec),
            TICKETS: ticketsSummary,
          },
        }),
        runPhase({
          afk: options,
          cwd,
          worktree: specWorktree,
          phase: "review-spec",
          readonly: true,
          runId: `spec-${specNumber}-review-spec-${Date.now()}`,
          slot: options.agents.reviewSpec,
          promptFile: join(options.promptsDir, "review-spec.md"),
          promptArgs: {
            BASE_SHA: reviewBase,
            CANDIDATE_SHA: candidateSha,
            SPEC: formatIssue(spec),
            TICKETS: ticketsSummary,
          },
        }),
      ]);
      if ((await runCommand("git", ["rev-parse", "HEAD"], specWorktree)) !== candidateSha) {
        throw new Error("只读双轴评审期间 Spec 分支 HEAD 发生异常变动。");
      }

      const repairOut = await runPhase({
        afk: options,
        cwd,
        worktree: specWorktree,
        phase: "repair-and-verify",
        readonly: false,
        runId: `spec-${specNumber}-repair-${Date.now()}`,
        slot: options.agents.repair,
        promptFile: join(options.promptsDir, "repair-and-verify.md"),
        promptArgs: {
          BASE_SHA: reviewBase,
          CANDIDATE_SHA: candidateSha,
          REVIEW_REPORT: `### Standards Review\n\n${standardsReport}\n\n### Spec Review\n\n${specReport}`,
          SPEC: formatIssue(spec),
          TICKETS: ticketsSummary,
        },
      });
      await assertClean(specWorktree, `Repair 工作树（Spec #${specNumber}）`);
      const finalSha = await runCommand("git", ["rev-parse", "HEAD"], specWorktree);
      await runCommand("git", ["merge-base", "--is-ancestor", candidateSha, finalSha], specWorktree);

      if (!(await isSpecAuthorized(options.repo, specNumber, cwd))) {
        result.stopped.push(specNumber);
        continue;
      }

      // Ordered idempotent PR delivery.
      await runCommand("git", ["push", "-u", remote, specBranch], cwd);
      const remoteRef = await runCommand("git", ["ls-remote", "--heads", remote, specBranch], cwd);
      if (!remoteRef.startsWith(`${finalSha}\t`)) {
        throw new Error(`远端分支 ${specBranch} SHA 与最终候选 ${finalSha} 不一致。`);
      }

      const ticketNums = [...done.keys()].sort((a, b) => a - b);
      const closeNums = [specNumber, ...ticketNums];
      const fallbackBody = `## Summary\n\n完成 Spec #${specNumber}（${spec.title}）。\n\n## Evidence\n\n- Branch: \`${specBranch}\` @ \`${finalSha}\`\n- Base: \`${reviewBase}\`\n- Tickets: ${ticketNums.map((n) => `#${n}`).join(", ") || "(none)"}`;
      const prBody = ensureClosesLines(extractTag(repairOut, "pr-body") ?? fallbackBody, closeNums);

      const openPrs = JSON.parse(
        await runCommand(
          "gh",
          [
            "pr",
            "list",
            "--repo",
            options.repo,
            "--state",
            "open",
            "--head",
            specBranch,
            "--base",
            baseBranch,
            "--json",
            "number,url,body",
          ],
          cwd,
        ),
      ) as { number: number; url: string; body: string }[];

      let prUrl: string;
      if (openPrs[0]) {
        const updated = ensureClosesLines(openPrs[0].body, closeNums);
        if (updated !== openPrs[0].body) {
          await runCommand(
            "gh",
            ["pr", "edit", String(openPrs[0].number), "--repo", options.repo, "--body", updated],
            cwd,
          );
        }
        prUrl = openPrs[0].url;
      } else {
        const createArgs = [
          "pr",
          "create",
          "--repo",
          options.repo,
          "--base",
          baseBranch,
          "--head",
          specBranch,
          "--title",
          spec.title,
          "--body",
          prBody,
          ...(options.draft ? ["--draft"] : []),
        ];
        prUrl = (await runCommand("gh", createArgs, cwd)).split(/\r?\n/).at(-1) ?? "";
      }

      for (const n of ticketNums) {
        await runCommand(
          "gh",
          ["issue", "edit", String(n), "--repo", options.repo, "--remove-label", "ready-for-agent"],
          cwd,
        );
      }
      await removeWorktreeIfClean(cwd, specWorktree);
      await runCommand(
        "gh",
        ["issue", "edit", String(specNumber), "--repo", options.repo, "--remove-label", "ready-for-agent"],
        cwd,
      );
      result.delivered.push({ spec: specNumber, branch: specBranch, prUrl, tickets: ticketNums });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await pauseSpec(options.repo, specNumber, reason, cwd);
      result.paused.push({ spec: specNumber, reason });
    }
  }

  return result;
}

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type AgentProvider, type BindMountSandboxProvider, run, type SandboxHooks } from "@ai-hero/sandcastle";
import {
  assertClean,
  branchExists,
  deleteBranchCas,
  type ExecFn,
  ensureWorktree,
  integratedTickets,
  preflightCredentials,
  removeWorktreeIfClean,
  runCommand,
  TRAILER_PREFIX,
  verifyGitRemote,
  verifyMergeCommit,
} from "./git.ts";
import {
  DEFAULT_CI_LOG_TAIL_LINES,
  ensureClosesLines,
  ensurePrClosesLines,
  fetchSanitizedCiFailureLogs,
  findBlockingOpenTickets,
  findOpenPullRequest,
  formatIssue,
  isOpenTicket,
  isSpecAuthorized,
  isSpecReady,
  listCommitCheckRuns,
  listCommitWorkflowRuns,
  listReadySpecNumbers,
  pauseSpec,
  readPullRequestState,
  readSpec,
  removeReadyLabel,
  resolveSpecBranch,
  type SpecIssue,
  selectLatestCiGateCheckRun,
  type TicketIssue,
  upsertPullRequest,
} from "./github.ts";

const COMPLETE = "<promise>COMPLETE</promise>";
export const DEFAULT_CI_POLL_INTERVAL_MS = 30_000;
export const DEFAULT_CI_TIMEOUT_MS = 45 * 60_000;
export const DEFAULT_CI_RUN_APPEARANCE_TIMEOUT_MS = 5 * 60_000;
export const DEFAULT_CI_MAX_REPAIRS = 2;

export type AgentSlot = { provider: AgentProvider; instructions: string };
export type SessionConfig = { sandbox: BindMountSandboxProvider; hooks?: SandboxHooks; cleanup?: () => Promise<void> };
export type AfkOptions = {
  repo: string;
  cwd?: string;
  remote?: string;
  baseBranch?: string;
  specNumber?: number;
  maxSpecs?: number;
  maxParallel?: number;
  draft?: boolean;
  ciPollIntervalMs?: number;
  ciTimeoutMs?: number;
  ciRunAppearanceTimeoutMs?: number;
  ciMaxRepairs?: number;
  ciLogTailLines?: number;
  agents: {
    light: AgentSlot;
    standard: AgentSlot;
    deep: AgentSlot;
    reviewStandards: AgentSlot;
    reviewSpec: AgentSlot;
    repair: AgentSlot;
  };
  createSession: (ctx: { worktree: string; readonly: boolean; runId: string }) => Promise<SessionConfig>;
  promptsDir: string;
  ghExec?: ExecFn;
  gitExec?: ExecFn;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};
export type AfkResult = {
  delivered: { spec: number; branch: string; prUrl: string; tickets: number[] }[];
  paused: { spec: number; reason: string }[];
  stopped: number[];
};

type RuntimeCtx = {
  afk: AfkOptions;
  cwd: string;
  remote: string;
  baseBranch: string;
  maxParallel: number;
  ghExec: ExecFn;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  ci: {
    pollIntervalMs: number;
    timeoutMs: number;
    runAppearanceTimeoutMs: number;
    maxRepairs: number;
    logTailLines: number;
  };
};

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const git = (dir: string, ...args: string[]): Promise<string> => runCommand("git", args, dir);
const headSha = (dir: string): Promise<string> => git(dir, "rev-parse", "HEAD");
const authorized = (ctx: RuntimeCtx, specNum: number) => isSpecAuthorized(ctx.afk.repo, specNum, ctx.cwd, ctx.ghExec);
const isReadyTicket = (t: TicketIssue): boolean =>
  isOpenTicket(t) && t.labels.includes("ready-for-agent") && !t.labels.includes("needs-attention");
const blockersMet = (t: TicketIssue, ids: ReadonlySet<number>, done: ReadonlyMap<number, string>): boolean =>
  t.blockedBy.every((b) => (ids.has(b.number) ? done.has(b.number) : b.state === "CLOSED"));

export const extractTag = (text: string, tag: string): string | undefined =>
  [...text.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].at(-1)?.[1]?.trim() || undefined;

export const hasStandaloneCompletion = (stdout: string): boolean =>
  stdout.split(/\r?\n/).some((line) => line.trim() === COMPLETE);

function selectSlot(ticket: TicketIssue, agents: AfkOptions["agents"]): AgentSlot {
  const [light, deep] = [ticket.labels.includes("agent:light"), ticket.labels.includes("agent:deep")];
  if (light && deep) throw new Error(`Ticket #${ticket.number} 同时带有 agent:light 与 agent:deep 标签。`);
  return light ? agents.light : deep ? agents.deep : agents.standard;
}

function describeSpecNotReady(spec: SpecIssue): string {
  const reasons = [
    spec.state !== "OPEN" && `state=${spec.state}（需为 OPEN）`,
    !spec.labels.includes("type:spec") && "缺少标签 type:spec",
    spec.labels.includes("type:ticket") && "存在冲突标签 type:ticket",
    !spec.labels.includes("ready-for-agent") && "缺少标签 ready-for-agent",
    spec.labels.includes("needs-attention") && "存在冲突标签 needs-attention",
  ].filter(Boolean);
  return `Spec #${spec.number} 未就绪（${reasons.join("；")}）。`;
}

async function assertAncestor(dir: string, ancestor: string, descendant: string, msg: string): Promise<void> {
  await git(dir, "merge-base", "--is-ancestor", ancestor, descendant).catch(() => {
    throw new Error(msg);
  });
}

async function remoteMatchesSha(remote: string, branch: string, sha: string, cwd: string): Promise<boolean> {
  const ref = `refs/heads/${branch}`;
  return (await git(cwd, "ls-remote", "--heads", remote, ref)).trim() === `${sha}\t${ref}`;
}

async function pushExactSha(ctx: RuntimeCtx, branch: string, sha: string, label: string): Promise<void> {
  await git(ctx.cwd, "push", "-u", ctx.remote, `${sha}:refs/heads/${branch}`);
  if (!(await remoteMatchesSha(ctx.remote, branch, sha, ctx.cwd))) {
    throw new Error(`远端分支 ${branch} SHA 与${label} ${sha} 不一致。`);
  }
}

async function assertPrOpenReady(ctx: RuntimeCtx, prUrl: string, duringRepair = false): Promise<void> {
  const pr = await readPullRequestState(ctx.afk.repo, prUrl, ctx.cwd, ctx.ghExec);
  if (duringRepair && (pr.state !== "OPEN" || pr.isDraft)) {
    throw new Error(
      `PR #${pr.number}（${pr.url}）在 CI 修红期间状态已变为 ${pr.state}${pr.isDraft ? " (Draft)" : ""}，拒绝推送。`,
    );
  }
  if (pr.state !== "OPEN")
    throw new Error(`PR #${pr.number}（${pr.url}）状态已变为 ${pr.state}，停止等待远端 ci-gate。`);
  if (pr.isDraft) throw new Error(`PR #${pr.number}（${pr.url}）当前为 Draft 状态，无法通过远端 ci-gate。`);
}

async function runPhase(
  ctx: RuntimeCtx,
  worktree: string,
  readonly: boolean,
  runId: string,
  slot: AgentSlot,
  promptFile: string,
  promptArgs: Record<string, string>,
): Promise<string> {
  await preflightCredentials(ctx.cwd, [worktree]);
  const logsDir = join(ctx.cwd, ".sandcastle", "logs");
  await mkdir(logsDir, { recursive: true });
  const session = await ctx.afk.createSession({ worktree, readonly, runId });
  try {
    const res = await run({
      cwd: worktree,
      agent: slot.provider,
      sandbox: session.sandbox,
      hooks: readonly ? undefined : session.hooks,
      branchStrategy: { type: "head" },
      promptFile: join(ctx.afk.promptsDir, promptFile),
      promptArgs: { ROLE_INSTRUCTIONS: slot.instructions, ...promptArgs },
      completionSignal: COMPLETE,
      maxIterations: 1,
      name: runId,
      logging: { type: "file", path: join(logsDir, `${runId}.log`) },
    });
    if (res.completionSignal !== COMPLETE || !hasStandaloneCompletion(res.stdout))
      throw new Error(`${runId} 未输出独立行完成标记 ${COMPLETE}。`);
    return res.stdout;
  } finally {
    await session.cleanup?.();
  }
}

async function prepareSpecWorktree(ctx: RuntimeCtx, spec: SpecIssue) {
  const specBranch = resolveSpecBranch(spec, ctx.baseBranch);
  await git(ctx.cwd, "check-ref-format", "--branch", specBranch);
  let startRef = `${ctx.remote}/${ctx.baseBranch}`;
  const localExists = await branchExists(ctx.cwd, specBranch);
  if ((await git(ctx.cwd, "ls-remote", "--heads", ctx.remote, `refs/heads/${specBranch}`)).trim()) {
    await git(ctx.cwd, "fetch", ctx.remote, `refs/heads/${specBranch}:refs/remotes/${ctx.remote}/${specBranch}`);
    if (localExists) {
      await assertAncestor(
        ctx.cwd,
        `refs/remotes/${ctx.remote}/${specBranch}`,
        `refs/heads/${specBranch}`,
        `本地分支 ${specBranch} 未包含远端 ${ctx.remote}/${specBranch} 的最新提交，请先同步后重试。`,
      );
    } else startRef = `refs/remotes/${ctx.remote}/${specBranch}`;
  } else if (spec.linkedBranches.length === 1 && !localExists) {
    throw new Error(`Spec #${spec.number} 关联分支 ${specBranch} 在本地与远端 ${ctx.remote} 均不存在。`);
  }
  const specWorktree = await ensureWorktree(
    ctx.cwd,
    join(ctx.cwd, ".sandcastle", "worktrees", `spec-${spec.number}`),
    specBranch,
    startRef,
  );
  const mergeBase = await git(ctx.cwd, "merge-base", specBranch, `${ctx.remote}/${ctx.baseBranch}`);
  return { specBranch, specWorktree, mergeBase, done: await integratedTickets(ctx.cwd, mergeBase, specBranch) };
}

async function mergeTicket(
  ctx: RuntimeCtx,
  spec: SpecIssue,
  specWorktree: string,
  ticket: TicketIssue,
  ticketBranch: string,
  ticketTip: string,
) {
  const specTipBefore = await headSha(specWorktree);
  try {
    await git(
      specWorktree,
      "merge",
      "--no-ff",
      "-m",
      `Merge #${ticket.number}: ${ticket.title}\n\n${TRAILER_PREFIX}${ticket.number}`,
      ticketTip,
    );
    return await verifyMergeCommit(specWorktree, specTipBefore, ticketTip, ticket.number);
  } catch (mergeError) {
    const hasMergeHead = await git(specWorktree, "rev-parse", "--verify", "--quiet", "MERGE_HEAD").then(
      () => true,
      () => false,
    );
    const conflicted = hasMergeHead
      ? await git(specWorktree, "diff", "--name-only", "--diff-filter=U").catch(() => "")
      : "";
    if (!hasMergeHead || !conflicted) {
      if (hasMergeHead) await git(specWorktree, "merge", "--abort").catch(() => {});
      throw mergeError;
    }
    await git(specWorktree, "merge", "--abort");
    await assertClean(specWorktree, `中止合并后 Spec 工作树（#${ticket.number}）`);
  }
  await runPhase(
    ctx,
    specWorktree,
    false,
    `spec-${spec.number}-merge-${ticket.number}-${ctx.now()}`,
    ctx.afk.agents.standard,
    "merge.md",
    {
      TICKET_NUMBER: String(ticket.number),
      TICKET_BRANCH: ticketBranch,
      TICKET_TIP: ticketTip,
      SPEC_TIP: specTipBefore,
      SPEC: formatIssue(spec),
      TICKET: formatIssue(ticket),
    },
  );
  await assertClean(specWorktree, `Merger 工作树（#${ticket.number}）`);
  return verifyMergeCommit(specWorktree, specTipBefore, ticketTip, ticket.number);
}

async function runTicketLoop(ctx: RuntimeCtx, initialSpec: SpecIssue, specWorktree: string, done: Map<number, string>) {
  type TicketOutcome = { ticket: TicketIssue; branch: string; worktree: string; baseSha: string; error?: unknown };
  let spec = initialSpec;
  const inFlight = new Map<number, Promise<TicketOutcome>>();
  const failed: string[] = [];
  let [softStopped, authFresh, ticketsMerged] = [false, true, 0];

  while (true) {
    if (!softStopped && !failed.length && inFlight.size < ctx.maxParallel) {
      const ids = new Set(spec.subIssues.map((t) => t.number));
      const ready = spec.subIssues
        .filter((t) => isReadyTicket(t) && !done.has(t.number) && !inFlight.has(t.number) && blockersMet(t, ids, done))
        .sort((a, b) => a.number - b.number);
      if (ready.length && !authFresh) {
        if (!(await authorized(ctx, spec.number))) softStopped = true;
        authFresh = true;
      }
      if (!softStopped) {
        for (const ticket of ready) {
          if (inFlight.size >= ctx.maxParallel) break;
          try {
            const slot = selectSlot(ticket, ctx.afk.agents);
            const branch = `sandcastle/ticket-${ticket.number}`;
            const wt = await ensureWorktree(
              ctx.cwd,
              join(ctx.cwd, ".sandcastle", "worktrees", `ticket-${ticket.number}`),
              branch,
              await headSha(specWorktree),
            );
            const baseSha = await headSha(wt);
            for (const b of ticket.blockedBy) {
              const sha = done.get(b.number);
              if (sha)
                await assertAncestor(
                  wt,
                  sha,
                  baseSha,
                  `复用票分支 ${branch} 缺少已集成前置 #${b.number}（${sha.slice(0, 8)}），请清理旧票分支后重试。`,
                );
            }
            const args = { BASE_SHA: baseSha, SPEC: formatIssue(spec), TICKET: formatIssue(ticket) };
            inFlight.set(
              ticket.number,
              runPhase(
                ctx,
                wt,
                false,
                `spec-${spec.number}-ticket-${ticket.number}-${ctx.now()}`,
                slot,
                "implement.md",
                args,
              ).then(
                () => ({ ticket, branch, worktree: wt, baseSha }),
                (error: unknown) => ({ ticket, branch, worktree: wt, baseSha, error }),
              ),
            );
          } catch (err) {
            failed.push(`#${ticket.number}: ${errMsg(err)}`);
            break;
          }
        }
      }
    }

    if (!inFlight.size) {
      if (softStopped || failed.length) break;
      spec = await readSpec(ctx.afk.repo, spec.number, ctx.cwd, ctx.ghExec);
      authFresh = true;
      if (!isSpecReady(spec.state, spec.labels)) {
        softStopped = true;
        break;
      }
      const openPending = findBlockingOpenTickets(spec, done);
      if (!openPending.length) {
        if (!done.size) throw new Error(`Spec #${spec.number} 没有任何可实施或已集成子票，禁止空交付。`);
        break;
      }
      const ids = new Set(spec.subIssues.map((t) => t.number));
      if (!openPending.some((t) => isReadyTicket(t) && blockersMet(t, ids, done))) {
        throw new Error(
          `Spec #${spec.number} 仍有未准入、暂停或受阻的 open 子票：${openPending.map((t) => `#${t.number}`).join(", ")}`,
        );
      }
      continue;
    }

    const fin = await Promise.race(inFlight.values());
    inFlight.delete(fin.ticket.number);
    authFresh = false;
    if (fin.error) {
      failed.push(`#${fin.ticket.number}: ${errMsg(fin.error)}`);
      continue;
    }
    try {
      await assertClean(fin.worktree, `Ticket #${fin.ticket.number}`);
      const tip = await headSha(fin.worktree);
      await git(fin.worktree, "merge-base", "--is-ancestor", fin.baseSha, tip);
      done.set(fin.ticket.number, await mergeTicket(ctx, spec, specWorktree, fin.ticket, fin.branch, tip));
      ticketsMerged += 1;
      await removeWorktreeIfClean(ctx.cwd, fin.worktree);
      await deleteBranchCas(ctx.cwd, fin.branch, tip);
    } catch (err) {
      failed.push(`#${fin.ticket.number}: ${errMsg(err)}`);
    }
  }

  if (failed.length) throw new Error(`子票执行或合并失败：${failed.join("；")}`);
  return { spec, ticketsMerged, stopped: softStopped || (!authFresh && !(await authorized(ctx, spec.number))) };
}

async function reviewAndOpenPr(
  ctx: RuntimeCtx,
  spec: SpecIssue,
  specBranch: string,
  specWorktree: string,
  mergeBase: string,
  candidateSha: string,
  ticketNums: number[],
  ticketsSummary: string,
): Promise<{ prUrl: string; sha: string } | { stopped: true }> {
  const reviewArgs = {
    BASE_SHA: mergeBase,
    CANDIDATE_SHA: candidateSha,
    SPEC: formatIssue(spec),
    TICKETS: ticketsSummary,
  };
  const settled = await Promise.allSettled([
    runPhase(
      ctx,
      specWorktree,
      true,
      `spec-${spec.number}-review-standards-${ctx.now()}`,
      ctx.afk.agents.reviewStandards,
      "review-standards.md",
      reviewArgs,
    ),
    runPhase(
      ctx,
      specWorktree,
      true,
      `spec-${spec.number}-review-spec-${ctx.now()}`,
      ctx.afk.agents.reviewSpec,
      "review-spec.md",
      reviewArgs,
    ),
  ]);
  const errs = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => errMsg(r.reason));
  if (errs.length) throw new Error(`双轴只读评审失败：${errs.join("；")}`);
  if ((await headSha(specWorktree)) !== candidateSha) throw new Error("只读双轴评审期间 Spec 分支 HEAD 发生异常变动。");

  const [stdOut, specOut] = settled.map((r) => (r as PromiseFulfilledResult<string>).value);
  const repairOut = await runPhase(
    ctx,
    specWorktree,
    false,
    `spec-${spec.number}-repair-${ctx.now()}`,
    ctx.afk.agents.repair,
    "repair-and-verify.md",
    {
      ...reviewArgs,
      REVIEW_REPORT: `### Standards Review\n\n${stdOut}\n\n### Spec Review\n\n${specOut}`,
    },
  );
  await assertClean(specWorktree, `Repair 工作树（Spec #${spec.number}）`);
  const finalSha = await headSha(specWorktree);
  await git(specWorktree, "merge-base", "--is-ancestor", candidateSha, finalSha);
  if (!(await authorized(ctx, spec.number))) return { stopped: true };
  await pushExactSha(ctx, specBranch, finalSha, "最终候选");

  const closeNums = [spec.number, ...ticketNums];
  const fallbackBody = `## Summary\n\n完成 Spec #${spec.number}（${spec.title}）。\n\n## Evidence\n\n- Branch: \`${specBranch}\` @ \`${finalSha}\`\n- Base: \`${mergeBase}\`\n- Tickets: ${ticketNums.map((n) => `#${n}`).join(", ") || "(none)"}`;
  const prUrl = await upsertPullRequest({
    repo: ctx.afk.repo,
    cwd: ctx.cwd,
    specBranch,
    baseBranch: ctx.baseBranch,
    title: spec.title,
    body: ensureClosesLines(extractTag(repairOut, "pr-body") ?? fallbackBody, closeNums),
    closeNums,
    draft: ctx.afk.draft,
    execFn: ctx.ghExec,
  });
  return { prUrl, sha: finalSha };
}

async function waitAndRepairCiGate(
  ctx: RuntimeCtx,
  opts: {
    spec: SpecIssue;
    specBranch: string;
    specWorktree: string;
    mergeBase: string;
    ticketsSummary: string;
    prUrl: string;
    initialSha: string;
  },
): Promise<"passed" | "stopped"> {
  let [currentSha, repairs, pushAt] = [opts.initialSha, 0, ctx.now()];
  let missingSince: number | undefined;

  while (true) {
    if (!(await authorized(ctx, opts.spec.number))) return "stopped";
    await assertPrOpenReady(ctx, opts.prUrl);
    const checkRuns = await listCommitCheckRuns(ctx.afk.repo, currentSha, ctx.cwd, ctx.ghExec);
    const ciGate = selectLatestCiGateCheckRun(checkRuns, currentSha);

    if (ciGate?.status === "completed") {
      if (ciGate.conclusion === "success") return "passed";
      if (repairs >= ctx.ci.maxRepairs) {
        throw new Error(
          `远端 ci-gate（${currentSha.slice(0, 8)}）失败（conclusion=${ciGate.conclusion ?? "unknown"}），已达到自动修红上限（${ctx.ci.maxRepairs} 次）。`,
        );
      }
      const failureLogs = await fetchSanitizedCiFailureLogs({
        repo: ctx.afk.repo,
        headSha: currentSha,
        cwd: ctx.cwd,
        ciGate,
        maxLines: ctx.ci.logTailLines,
        execFn: ctx.ghExec,
      });
      await assertClean(opts.specWorktree, `CI 修红前 Spec 工作树（Spec #${opts.spec.number}）`);
      const headBefore = await headSha(opts.specWorktree);
      if (headBefore !== currentSha)
        throw new Error(
          `CI 修红前 Spec 工作树 HEAD（${headBefore.slice(0, 8)}）与远端候选 ${currentSha.slice(0, 8)} 不一致。`,
        );

      const attempt = repairs + 1;
      await runPhase(
        ctx,
        opts.specWorktree,
        false,
        `spec-${opts.spec.number}-repair-ci-${attempt}-${ctx.now()}`,
        ctx.afk.agents.repair,
        "repair-ci.md",
        {
          BASE_SHA: opts.mergeBase,
          FAILED_SHA: currentSha,
          PR_URL: opts.prUrl,
          REPAIR_ATTEMPT: String(attempt),
          MAX_REPAIRS: String(ctx.ci.maxRepairs),
          CI_CONCLUSION: ciGate.conclusion ?? "unknown",
          CI_CHECK_URL: ciGate.html_url ?? ciGate.details_url ?? opts.prUrl,
          CI_FAILURE_LOGS: failureLogs,
          SPEC: formatIssue(opts.spec),
          TICKETS: opts.ticketsSummary,
        },
      );
      await assertClean(opts.specWorktree, `CI 修红后工作树（Spec #${opts.spec.number}，第 ${attempt} 次）`);
      const newSha = await headSha(opts.specWorktree);
      if (newSha === currentSha)
        throw new Error(
          `CI 自动修红（第 ${attempt}/${ctx.ci.maxRepairs} 次）未产生新提交（HEAD 仍为 ${currentSha.slice(0, 8)}）。`,
        );
      await assertAncestor(
        opts.specWorktree,
        currentSha,
        newSha,
        `CI 自动修红后 HEAD（${newSha.slice(0, 8)}）未包含原失败提交 ${currentSha.slice(0, 8)}，拒绝推送。`,
      );
      if (!(await authorized(ctx, opts.spec.number))) return "stopped";
      await assertPrOpenReady(ctx, opts.prUrl, true);
      await pushExactSha(ctx, opts.specBranch, newSha, "CI 修红提交");
      [repairs, currentSha, pushAt, missingSince] = [attempt, newSha, ctx.now(), undefined];
      continue;
    }

    const active =
      Boolean(ciGate) ||
      checkRuns.some((r) => r.status !== "completed") ||
      (await listCommitWorkflowRuns(ctx.afk.repo, currentSha, ctx.cwd, ctx.ghExec)).some(
        (r) => r.status !== "completed",
      );
    if (active) missingSince = undefined;
    else {
      missingSince ??= ctx.now();
      if (ctx.now() - missingSince >= ctx.ci.runAppearanceTimeoutMs) {
        throw new Error(
          `等待 ${currentSha.slice(0, 8)} 触发远端 ci-gate 超时（已等待 ${ctx.ci.runAppearanceTimeoutMs}ms），未检测到运行中的 workflow 或 ci-gate 检查。`,
        );
      }
    }
    if (ctx.now() - pushAt >= ctx.ci.timeoutMs)
      throw new Error(`等待远端 ci-gate（${currentSha.slice(0, 8)}）完成超时（已等待 ${ctx.ci.timeoutMs}ms）。`);
    await ctx.sleep(ctx.ci.pollIntervalMs);
  }
}

export async function checkAfk(
  opts: Pick<AfkOptions, "repo" | "cwd" | "remote" | "baseBranch" | "ghExec" | "gitExec">,
) {
  const [cwd, remote, baseBranch] = [
    resolve(opts.cwd ?? process.cwd()),
    opts.remote ?? "origin",
    opts.baseBranch ?? "main",
  ];
  await preflightCredentials(cwd);
  await verifyGitRemote(cwd, remote, opts.repo, opts.gitExec ?? runCommand);
  await git(cwd, "fetch", remote, baseBranch);
  return {
    repo: opts.repo,
    remote,
    baseBranch,
    readySpecs: await listReadySpecNumbers(opts.repo, cwd, opts.ghExec ?? runCommand),
  };
}

export async function runAfk(options: AfkOptions): Promise<AfkResult> {
  const [cwd, remote, baseBranch] = [
    resolve(options.cwd ?? process.cwd()),
    options.remote ?? "origin",
    options.baseBranch ?? "main",
  ];
  const [maxSpecs, maxParallel] = [options.maxSpecs ?? 1, options.maxParallel ?? 4];
  const ci = {
    pollIntervalMs: options.ciPollIntervalMs ?? DEFAULT_CI_POLL_INTERVAL_MS,
    timeoutMs: options.ciTimeoutMs ?? DEFAULT_CI_TIMEOUT_MS,
    runAppearanceTimeoutMs: options.ciRunAppearanceTimeoutMs ?? DEFAULT_CI_RUN_APPEARANCE_TIMEOUT_MS,
    maxRepairs: options.ciMaxRepairs ?? DEFAULT_CI_MAX_REPAIRS,
    logTailLines: options.ciLogTailLines ?? DEFAULT_CI_LOG_TAIL_LINES,
  };
  for (const [k, v, min] of [
    ["maxSpecs", maxSpecs, 1],
    ["maxParallel", maxParallel, 1],
    ["ciPollIntervalMs", ci.pollIntervalMs, 1],
    ["ciTimeoutMs", ci.timeoutMs, 1],
    ["ciRunAppearanceTimeoutMs", ci.runAppearanceTimeoutMs, 1],
    ["ciMaxRepairs", ci.maxRepairs, 0],
    ["ciLogTailLines", ci.logTailLines, 1],
  ] as const) {
    if (!Number.isSafeInteger(v) || v < min) throw new Error(`无效的 ${k}：${v}`);
  }

  const ctx: RuntimeCtx = {
    afk: options,
    cwd,
    remote,
    baseBranch,
    maxParallel,
    ghExec: options.ghExec ?? runCommand,
    sleep: options.sleep ?? defaultSleep,
    now: options.now ?? Date.now,
    ci,
  };
  const result: AfkResult = { delivered: [], paused: [], stopped: [] };
  await preflightCredentials(cwd);
  await verifyGitRemote(cwd, remote, options.repo, options.gitExec ?? runCommand);
  await git(cwd, "fetch", remote, baseBranch);

  const candidates =
    options.specNumber !== undefined
      ? [options.specNumber]
      : (await listReadySpecNumbers(options.repo, cwd, ctx.ghExec)).slice(0, maxSpecs);
  for (const specNumber of candidates) {
    let spec: SpecIssue;
    try {
      spec = await readSpec(options.repo, specNumber, cwd, ctx.ghExec);
    } catch (error) {
      if (options.specNumber !== undefined) throw error;
      const reason = errMsg(error);
      await pauseSpec(options.repo, specNumber, reason, cwd, ctx.ghExec);
      result.paused.push({ spec: specNumber, reason });
      continue;
    }
    if (!isSpecReady(spec.state, spec.labels)) {
      if (options.specNumber !== undefined) throw new Error(describeSpecNotReady(spec));
      result.stopped.push(specNumber);
      continue;
    }

    try {
      const { specBranch, specWorktree, mergeBase, done } = await prepareSpecWorktree(ctx, spec);
      const loop = await runTicketLoop(ctx, spec, specWorktree, done);
      if (loop.stopped) {
        result.stopped.push(specNumber);
        continue;
      }
      spec = loop.spec;
      await assertClean(specWorktree, `Spec #${specNumber}`);
      const candidateSha = await headSha(specWorktree);
      const ticketNums = [...done.keys()].sort((a, b) => a - b);
      const ticketsSummary =
        spec.subIssues
          .filter((t) => done.has(t.number))
          .sort((a, b) => a.number - b.number)
          .map(formatIssue)
          .join("\n\n---\n\n") || "(none)";

      let prUrl: string | undefined;
      let currentSha = candidateSha;
      if (!options.draft && loop.ticketsMerged === 0) {
        const existing = await findOpenPullRequest({
          repo: options.repo,
          cwd,
          specBranch,
          baseBranch,
          execFn: ctx.ghExec,
        });
        if (existing && !existing.isDraft && (await remoteMatchesSha(remote, specBranch, candidateSha, cwd))) {
          await ensurePrClosesLines(options.repo, existing, [specNumber, ...ticketNums], cwd, ctx.ghExec);
          prUrl = existing.url;
        }
      }
      if (!prUrl) {
        const opened = await reviewAndOpenPr(
          ctx,
          spec,
          specBranch,
          specWorktree,
          mergeBase,
          candidateSha,
          ticketNums,
          ticketsSummary,
        );
        if ("stopped" in opened) {
          result.stopped.push(specNumber);
          continue;
        }
        [prUrl, currentSha] = [opened.prUrl, opened.sha];
      }

      if (!prUrl) throw new Error(`Spec #${specNumber} 未能确定 Pull Request URL。`);
      if (
        !options.draft &&
        (await waitAndRepairCiGate(ctx, {
          spec,
          specBranch,
          specWorktree,
          mergeBase,
          ticketsSummary,
          prUrl,
          initialSha: currentSha,
        })) === "stopped"
      ) {
        result.stopped.push(specNumber);
        continue;
      }
      for (const n of ticketNums) await removeReadyLabel(options.repo, n, cwd, ctx.ghExec);
      await removeWorktreeIfClean(cwd, specWorktree);
      await removeReadyLabel(options.repo, specNumber, cwd, ctx.ghExec);
      result.delivered.push({ spec: specNumber, branch: specBranch, prUrl, tickets: ticketNums });
    } catch (error) {
      const reason = errMsg(error);
      await pauseSpec(options.repo, specNumber, reason, cwd, ctx.ghExec);
      result.paused.push({ spec: specNumber, reason });
    }
  }
  return result;
}

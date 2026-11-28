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
  createGitHubClient,
  findBlockingOpenTickets,
  formatIssue,
  isOpenTicket,
  isSpecReady,
  resolveSpecBranch,
  type SpecIssue,
  type TicketIssue,
} from "./github.ts";

const COMPLETE = "<promise>COMPLETE</promise>";
type SessionConfig = { sandbox: BindMountSandboxProvider; hooks?: SandboxHooks; cleanup?: () => Promise<void> };
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
    light: AgentProvider;
    standard: AgentProvider;
    deep: AgentProvider;
    reviewStandards: AgentProvider;
    reviewSpec: AgentProvider;
    repair: AgentProvider;
  };
  createSession: (ctx: { readonly: boolean }) => Promise<SessionConfig>;
  promptsDir: string;
  ghExec?: ExecFn;
  gitRemoteExec?: ExecFn;
};
type AfkResult = {
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
  github: ReturnType<typeof createGitHubClient>;
};

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const git = (dir: string, ...args: string[]): Promise<string> => runCommand("git", args, dir);
const headSha = (dir: string): Promise<string> => git(dir, "rev-parse", "HEAD");
const isReadyTicket = (t: TicketIssue): boolean =>
  isOpenTicket(t) && t.labels.includes("ready-for-agent") && !t.labels.includes("needs-attention");
const blockersMet = (t: TicketIssue, ids: ReadonlySet<number>, done: ReadonlyMap<number, string>): boolean =>
  t.blockedBy.every((b) => (ids.has(b.number) ? done.has(b.number) : b.state === "CLOSED"));

export const extractTag = (text: string, tag: string): string | undefined =>
  [...text.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].at(-1)?.[1]?.trim() || undefined;

export const hasStandaloneCompletion = (stdout: string): boolean =>
  stdout.split(/\r?\n/).some((line) => line.trim() === COMPLETE);

function selectSlot(ticket: TicketIssue, agents: AfkOptions["agents"]): AgentProvider {
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

async function pushExactSha(ctx: RuntimeCtx, branch: string, sha: string): Promise<void> {
  await git(ctx.cwd, "push", "-u", ctx.remote, `${sha}:refs/heads/${branch}`);
  if (!(await remoteMatchesSha(ctx.remote, branch, sha, ctx.cwd))) {
    throw new Error(`远端分支 ${branch} SHA 与最终候选 ${sha} 不一致。`);
  }
}

async function runPhase(
  ctx: RuntimeCtx,
  worktree: string,
  readonly: boolean,
  runId: string,
  agent: AgentProvider,
  promptFile: string,
  promptArgs: Record<string, string>,
): Promise<string> {
  await preflightCredentials(ctx.cwd, [worktree]);
  const logsDir = join(ctx.cwd, ".sandcastle", "logs");
  await mkdir(logsDir, { recursive: true });
  const session = await ctx.afk.createSession({ readonly });
  const phaseBoundaries = [
    "## AFK 沙箱约束",
    "- GitHub API 与远端 Git 操作由宿主执行。禁止在沙箱内调用 GitHub API、推送分支或变更 GitHub 状态。",
    ...(readonly
      ? ["- 严格只读。禁止修改文件、Git 或 GitHub 状态，也禁止派生子代理。"]
      : [
          "- 保留提交 Hook，禁止使用 `--no-verify`。核对 Hook 改动并重跑失效的检查。",
          "- 无特权方案 X 在会话就绪后提供专用 PostgreSQL、Redis 和 APISIX 测试端点。沙箱无 `docker.sock`，禁止运行 `pnpm test:e2e`。",
          "- Bun 真实 I/O 先用普通 `await`（失败时先捕获 rejection），再做同步断言。禁止使用 `.resolves`、`.rejects` 或 async `toThrow`。",
        ]),
    `- 完成阶段任务并通过必需检查${readonly ? "" : "、确认工作树干净"}后，在最后一行单独输出 \`${COMPLETE}\`。受阻时报告原因与安全恢复点，省略完成标记。`,
  ].join("\n");
  try {
    const res = await run({
      cwd: worktree,
      agent,
      sandbox: session.sandbox,
      hooks: readonly ? undefined : session.hooks,
      branchStrategy: { type: "head" },
      promptFile: join(ctx.afk.promptsDir, promptFile),
      promptArgs: { PHASE_BOUNDARIES: phaseBoundaries, ...promptArgs },
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

async function prepareSpecWorktree(ctx: RuntimeCtx, spec: SpecIssue, specBranch: string) {
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
  return { specWorktree, mergeBase, done: await integratedTickets(ctx.cwd, mergeBase, specBranch) };
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
    const mergedSha = await headSha(specWorktree);
    if (mergedSha === specTipBefore) throw new Error(`合并 #${ticket.number} 未产生新提交。`);
    return mergedSha;
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
    `spec-${spec.number}-merge-${ticket.number}-${Date.now()}`,
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
  let [softStopped, authFresh] = [false, true];

  while (true) {
    if (!softStopped && !failed.length && inFlight.size < ctx.maxParallel) {
      const ids = new Set(spec.subIssues.map((t) => t.number));
      const ready = spec.subIssues
        .filter((t) => isReadyTicket(t) && !done.has(t.number) && !inFlight.has(t.number) && blockersMet(t, ids, done))
        .sort((a, b) => a.number - b.number);
      if (ready.length && !authFresh) {
        if (!(await ctx.github.isSpecAuthorized(spec.number))) softStopped = true;
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
                `spec-${spec.number}-ticket-${ticket.number}-${Date.now()}`,
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
      spec = await ctx.github.readSpec(spec.number);
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
      await removeWorktreeIfClean(ctx.cwd, fin.worktree);
      await deleteBranchCas(ctx.cwd, fin.branch, tip);
    } catch (err) {
      failed.push(`#${fin.ticket.number}: ${errMsg(err)}`);
    }
  }

  if (failed.length) throw new Error(`子票执行或合并失败：${failed.join("；")}`);
  return { spec, stopped: softStopped || (!authFresh && !(await ctx.github.isSpecAuthorized(spec.number))) };
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
): Promise<string | undefined> {
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
      `spec-${spec.number}-review-standards-${Date.now()}`,
      ctx.afk.agents.reviewStandards,
      "review-standards.md",
      reviewArgs,
    ),
    runPhase(
      ctx,
      specWorktree,
      true,
      `spec-${spec.number}-review-spec-${Date.now()}`,
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
    `spec-${spec.number}-repair-${Date.now()}`,
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
  if (!(await ctx.github.isSpecAuthorized(spec.number))) return undefined;
  const existing = await ctx.github.findOpenPullRequest(specBranch, ctx.baseBranch);
  if (existing) {
    if (existing.state !== "OPEN") throw new Error(`PR #${existing.number} 状态为 ${existing.state}，拒绝推送。`);
    await assertAncestor(
      specWorktree,
      existing.headRefOid,
      finalSha,
      `PR #${existing.number} 当前提交 ${existing.headRefOid} 不在最终候选 ${finalSha} 的历史中，拒绝推送。`,
    );
  }
  await pushExactSha(ctx, specBranch, finalSha);

  const closeNums = [spec.number, ...ticketNums];
  const fallbackBody = `## Summary\n\n完成 Spec #${spec.number}（${spec.title}）。\n\n## Evidence\n\n- Branch: \`${specBranch}\` @ \`${finalSha}\`\n- Base: \`${mergeBase}\`\n- Tickets: ${ticketNums.map((n) => `#${n}`).join(", ") || "(none)"}`;
  return ctx.github.upsertPullRequest({
    specBranch,
    baseBranch: ctx.baseBranch,
    title: spec.title,
    body: extractTag(repairOut, "pr-body") ?? fallbackBody,
    closeNums,
    draft: ctx.afk.draft,
  });
}

export async function checkAfk(opts: Pick<AfkOptions, "repo" | "cwd" | "remote" | "baseBranch">) {
  const [cwd, remote, baseBranch] = [
    resolve(opts.cwd ?? process.cwd()),
    opts.remote ?? "origin",
    opts.baseBranch ?? "main",
  ];
  await preflightCredentials(cwd);
  await verifyGitRemote(cwd, remote, opts.repo);
  await git(cwd, "fetch", remote, baseBranch);
  return {
    repo: opts.repo,
    remote,
    baseBranch,
    readySpecs: await createGitHubClient({ repo: opts.repo, cwd }).listReadySpecNumbers(),
  };
}

export async function runAfk(options: AfkOptions): Promise<AfkResult> {
  const [cwd, remote, baseBranch] = [
    resolve(options.cwd ?? process.cwd()),
    options.remote ?? "origin",
    options.baseBranch ?? "main",
  ];
  const [maxSpecs, maxParallel] = [options.maxSpecs ?? 1, options.maxParallel ?? 4];
  for (const [key, value] of Object.entries({ maxSpecs, maxParallel })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`无效的 ${key}：${value}`);
  }

  const ctx: RuntimeCtx = {
    afk: options,
    cwd,
    remote,
    baseBranch,
    maxParallel,
    github: createGitHubClient({ repo: options.repo, cwd, execFn: options.ghExec }),
  };
  const result: AfkResult = { delivered: [], paused: [], stopped: [] };
  await preflightCredentials(cwd);
  await verifyGitRemote(cwd, remote, options.repo, options.gitRemoteExec);
  await git(cwd, "fetch", remote, baseBranch);

  const candidates =
    options.specNumber !== undefined
      ? [options.specNumber]
      : (await ctx.github.listReadySpecNumbers()).slice(0, maxSpecs);
  for (const specNumber of candidates) {
    let spec: SpecIssue;
    try {
      spec = await ctx.github.readSpec(specNumber);
    } catch (error) {
      if (options.specNumber !== undefined) throw error;
      const reason = errMsg(error);
      await ctx.github.pauseSpec(specNumber, reason);
      result.paused.push({ spec: specNumber, reason });
      continue;
    }
    if (!isSpecReady(spec.state, spec.labels)) {
      if (options.specNumber !== undefined) throw new Error(describeSpecNotReady(spec));
      result.stopped.push(specNumber);
      continue;
    }

    try {
      const specBranch = resolveSpecBranch(spec, baseBranch);
      const { specWorktree, mergeBase, done } = await prepareSpecWorktree(ctx, spec, specBranch);
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

      const prUrl = await reviewAndOpenPr(
        ctx,
        spec,
        specBranch,
        specWorktree,
        mergeBase,
        candidateSha,
        ticketNums,
        ticketsSummary,
      );
      if (!prUrl) {
        result.stopped.push(specNumber);
        continue;
      }
      for (const n of ticketNums) await ctx.github.removeReadyLabel(n);
      await removeWorktreeIfClean(cwd, specWorktree);
      await ctx.github.removeReadyLabel(specNumber);
      result.delivered.push({ spec: specNumber, branch: specBranch, prUrl, tickets: ticketNums });
    } catch (error) {
      const reason = errMsg(error);
      await ctx.github.pauseSpec(specNumber, reason);
      result.paused.push({ spec: specNumber, reason });
    }
  }
  return result;
}

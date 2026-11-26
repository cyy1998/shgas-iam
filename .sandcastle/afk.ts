import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type AgentProvider, type BindMountSandboxProvider, run, type SandboxHooks } from "@ai-hero/sandcastle";
import {
  assertClean,
  branchExists,
  deleteBranchCas,
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
  ensureClosesLines,
  findBlockingOpenTickets,
  formatIssue,
  isOpenTicket,
  isSpecAuthorized,
  isSpecReady,
  listReadySpecNumbers,
  pauseSpec,
  readSpec,
  removeReadyLabel,
  resolveSpecBranch,
  type SpecIssue,
  type TicketIssue,
  upsertPullRequest,
} from "./github.ts";

const COMPLETE = "<promise>COMPLETE</promise>";

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
  createSession: (ctx: { worktree: string; readonly: boolean; runId: string }) => Promise<SessionConfig>;
  promptsDir: string;
};

export type AfkResult = {
  delivered: { spec: number; branch: string; prUrl: string; tickets: number[] }[];
  paused: { spec: number; reason: string }[];
  stopped: number[];
};

export function extractTag(text: string, tag: string): string | undefined {
  const matches = [...text.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))];
  return matches.at(-1)?.[1]?.trim() || undefined;
}

export function hasStandaloneCompletion(stdout: string): boolean {
  return stdout.split(/\r?\n/).some((line) => line.trim() === COMPLETE);
}

function selectSlot(ticket: TicketIssue, agents: AfkOptions["agents"]): AgentSlot {
  const light = ticket.labels.includes("agent:light");
  const deep = ticket.labels.includes("agent:deep");
  if (light && deep) throw new Error(`Ticket #${ticket.number} 同时带有 agent:light 与 agent:deep 标签。`);
  return light ? agents.light : deep ? agents.deep : agents.standard;
}

function isReadyTicket(ticket: TicketIssue): boolean {
  return (
    isOpenTicket(ticket) && ticket.labels.includes("ready-for-agent") && !ticket.labels.includes("needs-attention")
  );
}

function describeSpecNotReady(spec: SpecIssue): string {
  const reasons: string[] = [];
  if (spec.state !== "OPEN") reasons.push(`state=${spec.state}（需为 OPEN）`);
  if (!spec.labels.includes("type:spec")) reasons.push("缺少标签 type:spec");
  if (spec.labels.includes("type:ticket")) reasons.push("存在冲突标签 type:ticket");
  if (!spec.labels.includes("ready-for-agent")) reasons.push("缺少标签 ready-for-agent");
  if (spec.labels.includes("needs-attention")) reasons.push("存在冲突标签 needs-attention");
  return `Spec #${spec.number} 未就绪（${reasons.join("；")}）。`;
}

async function runPhase(opts: {
  afk: AfkOptions;
  cwd: string;
  worktree: string;
  readonly: boolean;
  runId: string;
  slot: AgentSlot;
  promptFile: string;
  promptArgs: Record<string, string>;
}): Promise<string> {
  await preflightCredentials(opts.cwd, [opts.worktree]);
  const logsDir = join(opts.cwd, ".sandcastle", "logs");
  await mkdir(logsDir, { recursive: true });
  const session = await opts.afk.createSession({ worktree: opts.worktree, readonly: opts.readonly, runId: opts.runId });
  try {
    const result = await run({
      cwd: opts.worktree,
      agent: opts.slot.provider,
      sandbox: session.sandbox,
      hooks: opts.readonly ? undefined : session.hooks,
      branchStrategy: { type: "head" },
      promptFile: opts.promptFile,
      promptArgs: { ROLE_INSTRUCTIONS: opts.slot.instructions, ...opts.promptArgs },
      completionSignal: COMPLETE,
      maxIterations: 1,
      name: opts.runId,
      logging: { type: "file", path: join(logsDir, `${opts.runId}.log`) },
    });
    if (result.completionSignal !== COMPLETE || !hasStandaloneCompletion(result.stdout)) {
      throw new Error(`${opts.runId} 未输出独立行完成标记 ${COMPLETE}。`);
    }
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
}): Promise<string> {
  const { afk, cwd, spec, specWorktree, ticket, ticketBranch, ticketTip } = opts;
  const specTipBefore = await runCommand("git", ["rev-parse", "HEAD"], specWorktree);
  const mergeMsg = `Merge #${ticket.number}: ${ticket.title}\n\n${TRAILER_PREFIX}${ticket.number}`;
  try {
    await runCommand("git", ["merge", "--no-ff", "-m", mergeMsg, ticketTip], specWorktree);
    return await verifyMergeCommit(specWorktree, specTipBefore, ticketTip, ticket.number);
  } catch (mergeError) {
    const hasMergeHead = await runCommand("git", ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], specWorktree)
      .then(() => true)
      .catch(() => false);
    const conflicted = hasMergeHead
      ? await runCommand("git", ["diff", "--name-only", "--diff-filter=U"], specWorktree).catch(() => "")
      : "";
    if (!hasMergeHead || conflicted.length === 0) {
      if (hasMergeHead) await runCommand("git", ["merge", "--abort"], specWorktree).catch(() => {});
      throw mergeError;
    }
    await runCommand("git", ["merge", "--abort"], specWorktree);
    await assertClean(specWorktree, `中止合并后 Spec 工作树（#${ticket.number}）`);
  }

  await runPhase({
    afk,
    cwd,
    worktree: specWorktree,
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
  return verifyMergeCommit(specWorktree, specTipBefore, ticketTip, ticket.number);
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
  const maxParallel = options.maxParallel ?? 4;
  if (!Number.isSafeInteger(maxSpecs) || maxSpecs < 1) throw new Error(`无效的 maxSpecs：${maxSpecs}`);
  if (!Number.isSafeInteger(maxParallel) || maxParallel < 1) throw new Error(`无效的 maxParallel：${maxParallel}`);
  const result: AfkResult = { delivered: [], paused: [], stopped: [] };

  await preflightCredentials(cwd);
  await verifyGitRemote(cwd, remote, options.repo);
  await runCommand("git", ["fetch", remote, baseBranch], cwd);

  const candidates =
    options.specNumber !== undefined
      ? [options.specNumber]
      : (await listReadySpecNumbers(options.repo, cwd)).slice(0, maxSpecs);

  for (const specNumber of candidates) {
    let spec: SpecIssue;
    try {
      spec = await readSpec(options.repo, specNumber, cwd);
    } catch (error) {
      if (options.specNumber !== undefined) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      await pauseSpec(options.repo, specNumber, reason, cwd);
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
      await runCommand("git", ["check-ref-format", "--branch", specBranch], cwd);
      let startRef = `${remote}/${baseBranch}`;
      if (spec.linkedBranches.length === 1) {
        const localExists = await branchExists(cwd, specBranch);
        const remoteRef = await runCommand("git", ["ls-remote", "--heads", remote, `refs/heads/${specBranch}`], cwd);
        if (remoteRef.trim()) {
          await runCommand(
            "git",
            ["fetch", remote, `refs/heads/${specBranch}:refs/remotes/${remote}/${specBranch}`],
            cwd,
          );
          if (localExists) {
            try {
              await runCommand(
                "git",
                ["merge-base", "--is-ancestor", `refs/remotes/${remote}/${specBranch}`, `refs/heads/${specBranch}`],
                cwd,
              );
            } catch {
              throw new Error(`本地分支 ${specBranch} 未包含远端 ${remote}/${specBranch} 的最新提交，请先同步后重试。`);
            }
          } else {
            startRef = `refs/remotes/${remote}/${specBranch}`;
          }
        } else if (!localExists) {
          throw new Error(`Spec #${specNumber} 关联分支 ${specBranch} 在本地与远端 ${remote} 均不存在。`);
        }
      }

      const specWorktree = await ensureWorktree(
        cwd,
        join(cwd, ".sandcastle", "worktrees", `spec-${specNumber}`),
        specBranch,
        startRef,
      );
      const mergeBase = await runCommand("git", ["merge-base", specBranch, `${remote}/${baseBranch}`], cwd);
      const done = await integratedTickets(cwd, mergeBase, specBranch);

      type TicketOutcome = { ticket: TicketIssue; branch: string; worktree: string; baseSha: string; error?: unknown };
      const inFlight = new Map<number, Promise<TicketOutcome>>();
      const failed: string[] = [];
      let softStopped = false;
      let specAuthFresh = true;

      while (true) {
        if (!softStopped && failed.length === 0 && inFlight.size < maxParallel) {
          const internalIds = new Set(spec.subIssues.map((t) => t.number));
          const ready = spec.subIssues
            .filter(isReadyTicket)
            .filter((t) => !done.has(t.number) && !inFlight.has(t.number))
            .filter((t) =>
              t.blockedBy.every((b) => (internalIds.has(b.number) ? done.has(b.number) : b.state === "CLOSED")),
            )
            .sort((a, b) => a.number - b.number);

          if (ready.length > 0 && !specAuthFresh) {
            if (!(await isSpecAuthorized(options.repo, specNumber, cwd))) softStopped = true;
            specAuthFresh = true;
          }

          if (!softStopped) {
            for (const ticket of ready) {
              if (inFlight.size >= maxParallel) break;
              try {
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
                  if (!blockerSha) continue;
                  try {
                    await runCommand("git", ["merge-base", "--is-ancestor", blockerSha, baseSha], worktree);
                  } catch {
                    throw new Error(
                      `复用票分支 ${branch} 缺少已集成前置 #${blocker.number}（${blockerSha.slice(0, 8)}），请清理旧票分支后重试。`,
                    );
                  }
                }
                const promise = runPhase({
                  afk: options,
                  cwd,
                  worktree,
                  readonly: false,
                  runId: `spec-${specNumber}-ticket-${ticket.number}-${Date.now()}`,
                  slot,
                  promptFile: join(options.promptsDir, "implement.md"),
                  promptArgs: { BASE_SHA: baseSha, SPEC: formatIssue(spec), TICKET: formatIssue(ticket) },
                }).then(
                  () => ({ ticket, branch, worktree, baseSha }),
                  (error: unknown) => ({ ticket, branch, worktree, baseSha, error }),
                );
                inFlight.set(ticket.number, promise);
              } catch (prepError) {
                failed.push(`#${ticket.number}: ${prepError instanceof Error ? prepError.message : String(prepError)}`);
                break;
              }
            }
          }
        }

        if (inFlight.size === 0) {
          if (softStopped || failed.length > 0) break;
          spec = await readSpec(options.repo, specNumber, cwd);
          specAuthFresh = true;
          if (!isSpecReady(spec.state, spec.labels)) {
            softStopped = true;
            break;
          }
          const openPending = findBlockingOpenTickets(spec, done);
          if (openPending.length === 0) {
            if (done.size === 0) throw new Error(`Spec #${specNumber} 没有任何可实施或已集成子票，禁止空交付。`);
            break;
          }
          const internalIds = new Set(spec.subIssues.map((t) => t.number));
          const anyDispatchable = openPending.some(
            (t) =>
              isReadyTicket(t) &&
              t.blockedBy.every((b) => (internalIds.has(b.number) ? done.has(b.number) : b.state === "CLOSED")),
          );
          if (!anyDispatchable) {
            throw new Error(
              `Spec #${specNumber} 仍有未准入、暂停或受阻的 open 子票：${openPending.map((t) => `#${t.number}`).join(", ")}`,
            );
          }
          continue;
        }

        const finished = await Promise.race(inFlight.values());
        inFlight.delete(finished.ticket.number);
        specAuthFresh = false;

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
          const mergeSha = await mergeTicketIntoSpec({
            afk: options,
            cwd,
            spec,
            specWorktree,
            ticket: finished.ticket,
            ticketBranch: finished.branch,
            ticketTip,
          });
          done.set(finished.ticket.number, mergeSha);
          await removeWorktreeIfClean(cwd, finished.worktree);
          await deleteBranchCas(cwd, finished.branch, ticketTip);
        } catch (error) {
          failed.push(`#${finished.ticket.number}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (failed.length > 0) throw new Error(`子票执行或合并失败：${failed.join("；")}`);
      if (softStopped || (!specAuthFresh && !(await isSpecAuthorized(options.repo, specNumber, cwd)))) {
        result.stopped.push(specNumber);
        continue;
      }

      await assertClean(specWorktree, `Spec #${specNumber}`);
      const candidateSha = await runCommand("git", ["rev-parse", "HEAD"], specWorktree);
      const integratedList = spec.subIssues.filter((t) => done.has(t.number)).sort((a, b) => a.number - b.number);
      const ticketsSummary = integratedList.map(formatIssue).join("\n\n---\n\n") || "(none)";
      const reviewArgs = {
        BASE_SHA: mergeBase,
        CANDIDATE_SHA: candidateSha,
        SPEC: formatIssue(spec),
        TICKETS: ticketsSummary,
      };

      const reviewSettled = await Promise.allSettled([
        runPhase({
          afk: options,
          cwd,
          worktree: specWorktree,
          readonly: true,
          runId: `spec-${specNumber}-review-standards-${Date.now()}`,
          slot: options.agents.reviewStandards,
          promptFile: join(options.promptsDir, "review-standards.md"),
          promptArgs: reviewArgs,
        }),
        runPhase({
          afk: options,
          cwd,
          worktree: specWorktree,
          readonly: true,
          runId: `spec-${specNumber}-review-spec-${Date.now()}`,
          slot: options.agents.reviewSpec,
          promptFile: join(options.promptsDir, "review-spec.md"),
          promptArgs: reviewArgs,
        }),
      ]);
      const reviewErrors = reviewSettled
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
      if (reviewErrors.length > 0) throw new Error(`双轴只读评审失败：${reviewErrors.join("；")}`);
      const standardsReport = (reviewSettled[0] as PromiseFulfilledResult<string>).value;
      const specReport = (reviewSettled[1] as PromiseFulfilledResult<string>).value;
      if ((await runCommand("git", ["rev-parse", "HEAD"], specWorktree)) !== candidateSha) {
        throw new Error("只读双轴评审期间 Spec 分支 HEAD 发生异常变动。");
      }

      const repairOut = await runPhase({
        afk: options,
        cwd,
        worktree: specWorktree,
        readonly: false,
        runId: `spec-${specNumber}-repair-${Date.now()}`,
        slot: options.agents.repair,
        promptFile: join(options.promptsDir, "repair-and-verify.md"),
        promptArgs: {
          ...reviewArgs,
          REVIEW_REPORT: `### Standards Review\n\n${standardsReport}\n\n### Spec Review\n\n${specReport}`,
        },
      });
      await assertClean(specWorktree, `Repair 工作树（Spec #${specNumber}）`);
      const finalSha = await runCommand("git", ["rev-parse", "HEAD"], specWorktree);
      await runCommand("git", ["merge-base", "--is-ancestor", candidateSha, finalSha], specWorktree);

      if (!(await isSpecAuthorized(options.repo, specNumber, cwd))) {
        result.stopped.push(specNumber);
        continue;
      }

      await runCommand("git", ["push", "-u", remote, `${finalSha}:refs/heads/${specBranch}`], cwd);
      const remoteRef = await runCommand("git", ["ls-remote", "--heads", remote, `refs/heads/${specBranch}`], cwd);
      if (remoteRef.trim() !== `${finalSha}\trefs/heads/${specBranch}`) {
        throw new Error(`远端分支 ${specBranch} SHA 与最终候选 ${finalSha} 不一致。`);
      }

      const ticketNums = [...done.keys()].sort((a, b) => a - b);
      const closeNums = [specNumber, ...ticketNums];
      const fallbackBody = `## Summary\n\n完成 Spec #${specNumber}（${spec.title}）。\n\n## Evidence\n\n- Branch: \`${specBranch}\` @ \`${finalSha}\`\n- Base: \`${mergeBase}\`\n- Tickets: ${ticketNums.map((n) => `#${n}`).join(", ") || "(none)"}`;
      const prBody = ensureClosesLines(extractTag(repairOut, "pr-body") ?? fallbackBody, closeNums);

      const prUrl = await upsertPullRequest({
        repo: options.repo,
        cwd,
        specBranch,
        baseBranch,
        title: spec.title,
        body: prBody,
        closeNums,
        draft: options.draft,
      });

      for (const n of ticketNums) await removeReadyLabel(options.repo, n, cwd);
      await removeWorktreeIfClean(cwd, specWorktree);
      await removeReadyLabel(options.repo, specNumber, cwd);
      result.delivered.push({ spec: specNumber, branch: specBranch, prUrl, tickets: ticketNums });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await pauseSpec(options.repo, specNumber, reason, cwd);
      result.paused.push({ spec: specNumber, reason });
    }
  }

  return result;
}

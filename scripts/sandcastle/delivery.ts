import { lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { command } from "./commands.ts";
import type { FinalizedSpec } from "./finalization.ts";
import type { PullRequestInfo } from "./github.ts";
import { GitStateError, isManagedWorktreePath, type TicketContext } from "./tickets.ts";

export type DeliveredSpec = FinalizedSpec & {
  prNumber: number;
  prUrl: string;
  deliveryHandoff: string;
};

const maxPrBodyChars = 60_000;

export function buildPullRequestBody(
  result: FinalizedSpec,
  owned: readonly { context: Readonly<TicketContext>; candidate: string }[],
): string {
  const { workspace } = result;
  const specNumber = workspace.graph.spec.number;
  const linkedIssues = [
    "## Linked Issues",
    "",
    `- Closes #${specNumber}`,
    ...owned.map(({ context }) => `- Closes #${context.ticket.number}`),
  ].join("\n");
  const ticketTable = [
    "## Integrated Tickets",
    "",
    "| Ticket | 标题 | 实施角色 | 合入提交 |",
    "| --- | --- | --- | --- |",
    ...owned.map(
      ({ context }) =>
        `| #${context.ticket.number} | ${context.ticket.title.replaceAll("|", "\\|")} | \`${context.ticket.implementer}\` | \`${context.mergedSha!.slice(0, 12)}\` |`,
    ),
  ].join("\n");
  const metadataFooter = [
    "---",
    `Spec: #${specNumber}`,
    `Base-Branch: ${workspace.invocationBranch}`,
    `Head-Branch: ${workspace.branch}`,
    `Review-Base: ${result.reviewBase}`,
    `Review-Candidate: ${result.reviewCandidate}`,
    `Final-Candidate: ${result.finalCandidate}`,
  ].join("\n");

  const buildDetails = (reviewText: string, repairText: string) =>
    [
      "<details>",
      "<summary>AFK 双轴评审与最终验证详情</summary>",
      "",
      "### 真实双轴报告",
      "",
      reviewText.trim(),
      "",
      "### findings 处置与最终验证",
      "",
      repairText.trim(),
      "",
      "</details>",
    ].join("\n");

  const assemble = (prBody: string, detailsSection?: string) =>
    [prBody.trim(), linkedIssues, ticketTable, ...(detailsSection ? [detailsSection] : []), metadataFooter].join(
      "\n\n",
    );

  const fullDetails = buildDetails(result.reviewReport, result.repairAndValidation);
  const full = assemble(result.prBody, fullDetails);
  if (full.length <= maxPrBodyChars) return full;

  const compactDetails = [
    "<details>",
    "<summary>AFK 双轴评审与最终验证详情（已截断，完整原文见父 Spec 评论）</summary>",
    "",
    `完整双轴评审报告与最终验证记录超过 PR 正文长度预算，已完整归档至父 Spec #${specNumber} 评论。`,
    "",
    "</details>",
  ].join("\n");
  const withoutVerboseDetails = assemble(result.prBody, compactDetails);
  if (withoutVerboseDetails.length <= maxPrBodyChars) return withoutVerboseDetails;

  const fixedOverhead = assemble("", compactDetails).length + 120;
  const available = Math.max(1000, maxPrBodyChars - fixedOverhead);
  const truncatedPrBody = `${result.prBody.trim().slice(0, available)}\n\n> PR 描述过长已截断，完整交付记录见父 Spec #${specNumber} 评论。`;
  return assemble(truncatedPrBody, compactDetails);
}

/** Delivery progress is recorded in remote branch/PR state and ordinary issue comments, never in a checkpoint. */
export function createSpecDelivery(options: {
  cwd: string;
  remote: string;
  draft?: boolean;
  creatorsStopped: () => boolean;
  recordHandoff: (number: number, body: string) => Promise<void>;
  findOpenPrs: (headBranch: string, baseBranch: string) => Promise<PullRequestInfo[]>;
  createPr: (input: {
    base: string;
    head: string;
    title: string;
    body: string;
    draft?: boolean;
  }) => Promise<PullRequestInfo>;
  readPr: (number: number) => Promise<PullRequestInfo>;
  removeReadyLabel: (number: number) => Promise<void>;
  onPrOpened?: (numbers: number[]) => Promise<void>;
  signal?: AbortSignal;
}) {
  const attempted = new Set<number>();
  async function gitAt(path: string, ...args: string[]) {
    try {
      return await command("git", args, path);
    } catch (cause) {
      throw new GitStateError(
        `Spec 交付的 Git 操作失败，保留现场：${path}。${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }
  const git = (...args: string[]) => gitAt(options.cwd, ...args);
  function stopped() {
    options.signal?.throwIfAborted();
    if (!options.creatorsStopped()) throw new GitStateError("创建者尚未确认停止，保留工作树与分支。");
  }
  async function checkout(path: string, branch: string, candidate: string) {
    if (
      (await gitAt(path, "branch", "--show-current")) !== branch ||
      (await gitAt(path, "rev-parse", "HEAD")) !== candidate ||
      (await gitAt(path, "status", "--porcelain", "--untracked-files=all"))
    )
      throw new GitStateError(`分支、候选或工作树状态漂移，保留现场：${path}。`);
  }
  async function lsRemoteHead(branch: string): Promise<string | undefined> {
    const output = await git("ls-remote", options.remote, `refs/heads/${branch}`);
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return undefined;
    if (lines.length > 1) throw new GitStateError(`远端分支 ${branch} 返回多个引用，保留现场。`);
    const sha = lines[0]!.split(/\s+/)[0];
    if (!sha || !/^[a-f0-9]{40}$/.test(sha)) throw new GitStateError(`远端分支 ${branch} 返回无效 SHA，保留现场。`);
    return sha;
  }
  function summary(result: FinalizedSpec, pr: PullRequestInfo) {
    const { workspace } = result;
    return (
      `Spec #${workspace.graph.spec.number} 已确认 PR 交付（待人工验收并合入）。\n\n` +
      `PR：#${pr.number}（${pr.url}）；目标分支：${workspace.invocationBranch}；Spec 分支：${workspace.branch}。\n` +
      `review base：${result.reviewBase}；评审候选：${result.reviewCandidate}；最终候选：${result.finalCandidate}。\n\n` +
      `真实双轴报告：\n${result.reviewReport}\n\nfindings 处置与最终验证：\n${result.repairAndValidation}`
    );
  }
  function hasDeliveredComment(
    issue: { comments?: { body: string }[] },
    specNumber: number,
    prNumber: number,
    finalCandidate: string,
  ): boolean {
    return (issue.comments ?? []).some(({ body }) => {
      const normalized = body.replaceAll("\r\n", "\n");
      return (
        normalized.startsWith(`Spec #${specNumber} 已确认 PR 交付`) &&
        normalized.includes(`PR：#${prNumber}（`) &&
        normalized.includes(`最终候选：${finalCandidate}`)
      );
    });
  }

  return {
    async deliver(
      result: FinalizedSpec,
      contexts: ReadonlyMap<number, Readonly<TicketContext>>,
      recovery?: { prNumber?: number },
    ): Promise<DeliveredSpec> {
      const { workspace } = result;
      const number = workspace.graph.spec.number;
      if (attempted.has(number)) throw new Error(`Spec #${number} 本次已尝试交付，先核对 Git 和 PR 后恢复。`);
      attempted.add(number);
      let pr: PullRequestInfo | undefined;
      let stage = "尚未推送 Spec 分支";
      const unlabeled: number[] = [];

      async function inspectCleanupTarget(path: string, branch: string, candidate: string) {
        const registrations = (await git("worktree", "list", "--porcelain", "-z"))
          .split("\0\0")
          .filter((item) => item.split("\0").includes(`branch refs/heads/${branch}`));
        const ref = await git("for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`);
        let exists = true;
        try {
          await lstat(path);
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
          exists = false;
        }
        if (ref && ref !== candidate) throw new GitStateError(`清理候选漂移，保留 ${branch}。`);
        if (!exists && !registrations.length) return { worktreeExists: false, refExists: Boolean(ref) };
        const lines = registrations[0]?.split("\0");
        if (
          !ref ||
          !exists ||
          registrations.length !== 1 ||
          !lines?.some((line) => line.startsWith("worktree ") && resolve(line.slice(9)) === resolve(path)) ||
          lines.some((line) => line === "locked" || line.startsWith("locked "))
        )
          throw new GitStateError(`工作树登记或占用无法确认，保留 ${branch}。`);
        await checkout(path, branch, candidate);
        return { worktreeExists: true, refExists: true };
      }

      async function observe() {
        stopped();
        await checkout(options.cwd, workspace.invocationBranch, workspace.invocationBase);
        if (!recovery) {
          await checkout(workspace.worktreePath, workspace.branch, result.finalCandidate);
        } else {
          const state = await inspectCleanupTarget(workspace.worktreePath, workspace.branch, result.finalCandidate);
          if (!state.refExists) throw new GitStateError(`恢复交付的 Spec 分支 ${workspace.branch} 不存在，保留现场。`);
        }
      }

      try {
        if (
          result.reviewBase !== workspace.invocationBase ||
          !result.reviewReport.trim() ||
          !result.repairAndValidation.trim() ||
          !result.prBody.trim() ||
          !result.handoff.trim() ||
          !workspace.graph.tickets.length
        )
          throw new Error("缺少完整可信的最终验收交接或 PR 描述草稿，不能交付。");
        const owned = workspace.graph.tickets.map((issue) => {
          const context = contexts.get(issue.number);
          if (
            !context ||
            context.spec !== workspace ||
            context.ticket.number !== issue.number ||
            !context.candidate ||
            !context.handoff?.trim() ||
            !context.mergedSha
          )
            throw new Error(`#${issue.number} 缺少票级集成交接，不能交付。`);
          return { context, candidate: context.candidate };
        });

        await observe();
        await git("merge-base", "--is-ancestor", result.reviewBase, result.reviewCandidate);
        await git("merge-base", "--is-ancestor", result.reviewCandidate, result.finalCandidate);
        for (const { context, candidate } of owned) {
          await git("merge-base", "--is-ancestor", candidate, context.mergedSha!);
          await git("merge-base", "--is-ancestor", context.mergedSha!, result.finalCandidate);
        }

        // Stage 1: Push Spec integration branch non-forcefully and bind upstream tracking.
        stage = "推送 Spec 分支到远端";
        const remoteTipBefore = await lsRemoteHead(workspace.branch);
        if (remoteTipBefore !== result.finalCandidate) {
          if (remoteTipBefore) {
            await git("fetch", options.remote, `refs/heads/${workspace.branch}`);
            const isAncestor = await command(
              "git",
              ["merge-base", "--is-ancestor", remoteTipBefore, result.finalCandidate],
              options.cwd,
            )
              .then(() => true)
              .catch(() => false);
            if (!isAncestor) {
              throw new GitStateError(
                `远端分支 ${options.remote}/${workspace.branch} (${remoteTipBefore}) 不是本地最终候选的祖先，禁止强推，保留现场。`,
              );
            }
          }
          await observe();
          await git("push", options.remote, `${result.finalCandidate}:refs/heads/${workspace.branch}`);
        }
        const remoteTipAfter = await lsRemoteHead(workspace.branch);
        if (remoteTipAfter !== result.finalCandidate) {
          throw new GitStateError(
            `推送后远端分支 ${options.remote}/${workspace.branch} 与最终候选不符（远端：${remoteTipAfter ?? "缺失"}），保留现场。`,
          );
        }
        await git("fetch", options.remote, `refs/heads/${workspace.branch}`);
        await git("branch", "--set-upstream-to", `${options.remote}/${workspace.branch}`, workspace.branch);

        // Stage 2: Find existing open PR or create a new one, then verify its state.
        stage = "创建或核验 GitHub PR";
        await observe();
        const openPrs = await options.findOpenPrs(workspace.branch, workspace.invocationBranch);
        if (openPrs.length > 1) {
          throw new GitStateError(
            `发现多个 ${workspace.branch} -> ${workspace.invocationBranch} 的 Open PR，保留现场人工确认。`,
          );
        }
        if (openPrs.length === 1) {
          const existing = openPrs[0]!;
          if (recovery?.prNumber && existing.number !== recovery.prNumber) {
            throw new GitStateError(
              `恢复 PR 编号冲突：预期 #${recovery.prNumber}，实际 #${existing.number}，保留现场。`,
            );
          }
          if (existing.headRefOid !== result.finalCandidate) {
            throw new GitStateError(
              `已存在的 Open PR #${existing.number} HEAD (${existing.headRefOid}) 与最终候选不符，保留现场。`,
            );
          }
          pr = existing;
        } else {
          if (recovery?.prNumber) {
            throw new GitStateError(`恢复记录中的 Open PR #${recovery.prNumber} 已不可见，先核对 GitHub PR 状态。`);
          }
          const body = buildPullRequestBody(result, owned);
          pr = await options.createPr({
            base: workspace.invocationBranch,
            head: workspace.branch,
            title: `Spec #${number}: ${workspace.graph.spec.title}`,
            body,
            draft: Boolean(options.draft),
          });
        }
        const verifiedPr = await options.readPr(pr.number);
        if (
          verifiedPr.state !== "OPEN" ||
          verifiedPr.baseRefName !== workspace.invocationBranch ||
          verifiedPr.headRefName !== workspace.branch ||
          verifiedPr.headRefOid !== result.finalCandidate
        ) {
          throw new GitStateError(
            `PR #${pr.number} 状态、分支或 HEAD 核验未通过（state=${verifiedPr.state}, head=${verifiedPr.headRefOid}），保留现场。`,
          );
        }
        pr = verifiedPr;

        // Stage 3: Record PR delivery handoffs, remove ready-for-agent labels, and move board to PR Open.
        const deliveryHandoff = summary(result, pr);
        stage = "PR 已核验，交付记录或移除标签尚未完成";
        if (!hasDeliveredComment(workspace.graph.spec, number, pr.number, result.finalCandidate)) {
          await observe();
          await options.recordHandoff(
            number,
            `${deliveryHandoff}\n\n下一动作：移除 tickets 与父 Spec 的 ready-for-agent 标签并清理临时 worktree，保留本地 Spec 分支供人工验收；合入 PR 后由 GitHub 自动关闭关联 issues。`,
          );
        }
        for (const issue of workspace.graph.tickets) {
          if (!hasDeliveredComment(issue, number, pr.number, result.finalCandidate)) {
            await observe();
            await options.recordHandoff(
              issue.number,
              `${deliveryHandoff}\n\n本票已随 Spec PR #${pr.number} 交付，移除 ready-for-agent 等待人工验收并合入（合入 PR 后自动关闭）。`,
            );
          }
          if (!recovery || issue.labels.includes("ready-for-agent")) {
            await observe();
            await options.removeReadyLabel(issue.number);
          }
          unlabeled.push(issue.number);
        }
        if (!recovery || workspace.graph.spec.labels.includes("ready-for-agent")) {
          await observe();
          await options.removeReadyLabel(number);
        }
        unlabeled.push(number);
        await options.onPrOpened?.([number, ...workspace.graph.tickets.map((issue) => issue.number)]);

        // Stage 4: Clean up all ticket worktrees/branches and the Spec integration worktree,
        // while retaining the local Spec branch ref (tracking github/<branch>) for manual testing.
        stage = "PR 与交接已完成，清理临时工作树尚未完成";
        if ((await lsRemoteHead(workspace.branch)) !== result.finalCandidate) {
          throw new GitStateError(`清理前远端分支 ${options.remote}/${workspace.branch} 发生漂移，保留本地工作树。`);
        }
        const common = await git("rev-parse", "--path-format=absolute", "--git-common-dir");
        const managedRoot = join(dirname(common), ".sandcastle", "worktrees");
        const cleanups = [
          ...owned.map(({ context, candidate }) => ({
            path: context.worktreePath,
            branch: context.ticket.branch,
            candidate,
            deleteRef: true,
          })),
          {
            path: workspace.worktreePath,
            branch: workspace.branch,
            candidate: result.finalCandidate,
            deleteRef: false,
          },
        ];
        await observe();
        for (const entry of cleanups) {
          if (resolve(entry.path) === resolve(options.cwd)) throw new GitStateError("不能清理启动工作树。");
          if (!isManagedWorktreePath(managedRoot, entry.path))
            throw new GitStateError(`工作树不在 Sandcastle 托管目录内，禁止清理：${entry.path}。`);
          if (!recovery) await checkout(entry.path, entry.branch, entry.candidate);
          await inspectCleanupTarget(entry.path, entry.branch, entry.candidate);
        }
        for (const entry of cleanups) {
          stopped();
          const state = await inspectCleanupTarget(entry.path, entry.branch, entry.candidate);
          if (state.worktreeExists) {
            await git("worktree", "remove", entry.path);
            try {
              await lstat(entry.path);
              throw new GitStateError(`worktree 目录仍存在，保留分支以便恢复：${entry.path}。`);
            } catch (cause) {
              if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT"))
                throw new GitStateError(`worktree 移除结果无法确认，保留分支：${entry.branch}。`, { cause });
            }
            if (
              (await git("worktree", "list", "--porcelain", "-z"))
                .split("\0")
                .includes(`branch refs/heads/${entry.branch}`)
            )
              throw new GitStateError(`分支仍被工作树占用，保留 ${entry.branch}。`);
          }
          if (entry.deleteRef && state.refExists) {
            await git("update-ref", "-d", `refs/heads/${entry.branch}`, entry.candidate);
          }
        }
        const retainedSpecTip = await git("for-each-ref", "--format=%(objectname)", `refs/heads/${workspace.branch}`);
        if (retainedSpecTip !== result.finalCandidate) {
          throw new GitStateError(`清理后保留的本地 Spec 分支 ${workspace.branch} 发生漂移，请核对 Git 状态。`);
        }
        await checkout(options.cwd, workspace.invocationBranch, workspace.invocationBase);
        return { ...result, prNumber: pr.number, prUrl: pr.url, deliveryHandoff };
      } catch (error) {
        let actual = "无法确认";
        try {
          actual = await git("rev-parse", `refs/heads/${workspace.invocationBranch}`);
        } catch {}
        try {
          await options.recordHandoff(
            number,
            `Spec #${number} PR 交付收尾未完成，保留实际进度。\n\n` +
              `目标分支：${workspace.invocationBranch}；Spec 分支：${workspace.branch}；Spec 工作树：${workspace.worktreePath}。\n` +
              `review base：${result.reviewBase}；评审候选：${result.reviewCandidate}；最终候选：${result.finalCandidate}；` +
              `PR：${pr ? `#${pr.number}（${pr.url}）` : "尚未确认"}；本地启动分支 HEAD：${actual}。\n` +
              `阶段：${stage}；已移除 ready-for-agent：${unlabeled.map((value) => `#${value}`).join("、") || "无"}。\n\n` +
              `失败：${error instanceof Error ? error.message : String(error)}\n\n` +
              "下一动作：先核对远端分支、GitHub PR、issue 与工作树；已有对应 PR 时下次恢复将幂等补完剩余记录、标签与临时 worktree 清理，禁止重复建 PR 或强推。",
          );
        } catch (handoffError) {
          throw new AggregateError(
            [error, handoffError],
            `Spec #${number} PR 交付与失败交接同时失败，保留 Git 和已有日志。`,
          );
        }
        throw error;
      }
    },
  };
}

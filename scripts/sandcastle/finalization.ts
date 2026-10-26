import { command } from "./commands.ts";
import { GitStateError, type IntegratedTicket, type SpecWorkspace, type TicketContext } from "./tickets.ts";

export type FinalizationRun = (input: {
  phase: "review" | "repair-and-verify";
  workspace: Readonly<SpecWorkspace>;
  tickets: readonly Readonly<IntegratedTicket>[];
  reviewBase: string;
  reviewCandidate: string;
  reviewReport?: string;
}) => Promise<{ completed: boolean; handoff: string }>;

/** In-memory evidence for delivery; Git and ordinary issue handoffs remain the recovery sources. */
export type FinalizedSpec = {
  workspace: SpecWorkspace;
  reviewBase: string;
  reviewCandidate: string;
  finalCandidate: string;
  reviewReport: string;
  repairAndValidation: string;
  handoff: string;
};

export function createFinalizationLifecycle(options: {
  cwd: string;
  runFinal: FinalizationRun;
  recordHandoff: (number: number, body: string) => Promise<void>;
  signal?: AbortSignal;
}) {
  const attempted = new Set<number>();
  async function gitAt(path: string, ...args: string[]) {
    try {
      return await command("git", args, path);
    } catch (cause) {
      throw new GitStateError(`最终验收的 Git 状态无法确认，保留现场：${path}。`, { cause });
    }
  }
  async function checkout(path: string, branch: string) {
    options.signal?.throwIfAborted();
    if ((await gitAt(path, "branch", "--show-current")) !== branch || (await gitAt(path, "status", "--porcelain")))
      throw new GitStateError(`最终验收工作树分支或干净状态不匹配，保留现场：${path}。`);
    return gitAt(path, "rev-parse", "HEAD");
  }
  async function observed(workspace: SpecWorkspace) {
    const invocation = await checkout(options.cwd, workspace.invocationBranch);
    if (invocation !== workspace.invocationBase) throw new GitStateError("启动分支已前进，先恢复基线后重新验收。");
    return checkout(workspace.worktreePath, workspace.branch);
  }

  return {
    async finalize(
      workspace: SpecWorkspace,
      contexts: ReadonlyMap<number, Readonly<TicketContext>>,
      integrated: ReadonlySet<number>,
    ): Promise<FinalizedSpec> {
      const number = workspace.graph.spec.number;
      if (attempted.has(number)) throw new Error(`Spec #${number} 本次已尝试最终验收，不自动重开失败会话。`);
      attempted.add(number);
      let reviewCandidate: string | undefined;
      let reviewReport = "尚未取得完整双轴报告。";
      let repairAndValidation = "尚未完成集中修复与最终验证。";
      try {
        const tickets: IntegratedTicket[] = [];
        if (!workspace.graph.tickets.length) throw new Error("空子票列表不能作为完整 Spec 的最终验收依据。");
        for (const issue of workspace.graph.tickets) {
          const context = contexts.get(issue.number);
          if (
            issue.parent !== number ||
            !issue.labels.includes("type:ticket") ||
            issue.labels.includes("type:spec") ||
            !integrated.has(issue.number) ||
            context?.spec !== workspace ||
            context.ticket.number !== issue.number ||
            !context.candidate ||
            !context.handoff?.trim() ||
            !context.acceptance?.trim() ||
            !context.mergedSha
          )
            throw new Error(`#${issue.number} 尚无完整验收和集成证据，Spec 保持未完成。`);
          tickets.push({
            ...context,
            candidate: context.candidate,
            handoff: context.handoff,
            acceptance: context.acceptance,
            mergedSha: context.mergedSha,
          });
        }
        reviewCandidate = await observed(workspace);
        await gitAt(workspace.worktreePath, "merge-base", "--is-ancestor", workspace.invocationBase, reviewCandidate);
        for (const ticket of tickets) {
          await gitAt(workspace.worktreePath, "merge-base", "--is-ancestor", ticket.candidate, ticket.mergedSha);
          await gitAt(workspace.worktreePath, "merge-base", "--is-ancestor", ticket.mergedSha, reviewCandidate);
        }
        const input = { workspace, tickets, reviewBase: workspace.invocationBase, reviewCandidate };
        const review = await options.runFinal({ ...input, phase: "review" });
        reviewReport = review.handoff;
        if ((await observed(workspace)) !== reviewCandidate)
          throw new GitStateError("双轴评审期间候选发生变化，固定候选报告失效，保留现场。");
        if (!review.completed || !reviewReport.trim()) throw new Error("双轴评审缺失、失败或未完成，不能进入交付。");
        const repair = await options.runFinal({ ...input, phase: "repair-and-verify", reviewReport });
        repairAndValidation = repair.handoff;
        if (!repair.completed || !repairAndValidation.trim())
          throw new Error("仍有未解决 findings 或必需验证未通过，Spec 保持未完成。");
        const finalCandidate = await observed(workspace);
        await gitAt(workspace.worktreePath, "merge-base", "--is-ancestor", reviewCandidate, finalCandidate);
        const handoff =
          `Spec #${number} 最终评审、集中修复与验证完成，等待 squash 交付；tickets 与父 Spec 保持 open。\n\n` +
          `启动分支：${workspace.invocationBranch}；Spec 分支：${workspace.branch}。\n` +
          `固定 review base：${workspace.invocationBase}；评审候选：${reviewCandidate}；修复后最终候选：${finalCandidate}。\n\n` +
          `真实双轴报告：\n${reviewReport}\n\nfindings 处置与最终验证：\n${repairAndValidation}\n\n` +
          "下一动作：核对最终候选与启动分支，完成单一 squash 交付，再统一记录并关闭 tickets 和父 Spec。";
        await options.recordHandoff(number, handoff);
        if ((await observed(workspace)) !== finalCandidate)
          throw new GitStateError("最终交接期间候选漂移，交付证据失效。");
        return {
          workspace,
          reviewBase: input.reviewBase,
          reviewCandidate,
          finalCandidate,
          reviewReport,
          repairAndValidation,
          handoff,
        };
      } catch (error) {
        try {
          await options.recordHandoff(
            number,
            `Spec #${number} 最终验收尚未完成，保留分支 ${workspace.branch} 与工作树 ${workspace.worktreePath}。\n` +
              `review base：${workspace.invocationBase}；评审候选：${reviewCandidate ?? "尚未固定"}。\n\n` +
              `阻碍：${error instanceof Error ? error.message : String(error)}\n\n${reviewReport}\n\n${repairAndValidation}\n\n` +
              "下一动作：下次启动核对 Git、issue 和已有日志后恢复；本次不自动重开会话，保持 tickets 和父 Spec open。",
          );
        } catch (handoffError) {
          throw new AggregateError(
            [error, handoffError],
            `Spec #${number} 最终验收与失败交接同时失败，保留 Git 和已有日志。`,
          );
        }
        throw error;
      }
    },
  };
}

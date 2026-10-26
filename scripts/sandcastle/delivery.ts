import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { command } from "./commands.ts";
import type { FinalizedSpec } from "./finalization.ts";
import { githubRepo } from "./github.ts";
import { ExecutorInfrastructureError } from "./resources.ts";
import { GitStateError, type TicketContext } from "./tickets.ts";

export type DeliveredSpec = FinalizedSpec & { squashSha: string; deliveryHandoff: string };

export async function closeDeliveredIssue(
  cwd: string,
  number: number,
  runGh: (args: string[]) => Promise<string> = (args) => command("gh", args, cwd),
): Promise<void> {
  try {
    await runGh(["issue", "close", String(number), "--repo", githubRepo]);
    const state: unknown = JSON.parse(
      await runGh(["issue", "view", String(number), "--repo", githubRepo, "--json", "number,state"]),
    );
    if (
      !state ||
      typeof state !== "object" ||
      !("number" in state) ||
      state.number !== number ||
      !("state" in state) ||
      state.state !== "CLOSED"
    )
      throw new Error(`#${number} 的关闭状态未确认。`);
  } catch (cause) {
    throw new ExecutorInfrastructureError(`GitHub #${number} 关票或状态核验失败，先核对实际 issue 状态。`, { cause });
  }
}

/** Delivery progress is recorded in ordinary commits and issue comments, never in a checkpoint. */
export function createSpecDelivery(options: {
  cwd: string;
  creatorsStopped: () => boolean;
  recordHandoff: (number: number, body: string) => Promise<void>;
  closeIssue: (number: number) => Promise<void>;
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
  async function observed(result: FinalizedSpec, invocation: string) {
    stopped();
    await checkout(options.cwd, result.workspace.invocationBranch, invocation);
    await checkout(result.workspace.worktreePath, result.workspace.branch, result.finalCandidate);
  }
  function summary(result: FinalizedSpec, squashSha: string) {
    const { workspace } = result;
    return (
      `Spec #${workspace.graph.spec.number} 已确认本地 squash 交付。\n\n` +
      `启动分支：${workspace.invocationBranch}；Spec 分支：${workspace.branch}。\n` +
      `review base：${result.reviewBase}；评审候选：${result.reviewCandidate}；最终候选：${result.finalCandidate}；实际 squash 提交：${squashSha}。\n\n` +
      `真实双轴报告：\n${result.reviewReport}\n\nfindings 处置与最终验证：\n${result.repairAndValidation}`
    );
  }

  return {
    async deliver(
      result: FinalizedSpec,
      contexts: ReadonlyMap<number, Readonly<TicketContext>>,
      recovery?: { squashSha: string },
    ): Promise<DeliveredSpec> {
      const { workspace } = result;
      const number = workspace.graph.spec.number;
      if (attempted.has(number)) throw new Error(`Spec #${number} 本次已尝试交付，先核对 Git 和 issue 后恢复。`);
      attempted.add(number);
      let squashSha: string | undefined = recovery?.squashSha;
      let stage = "尚未执行 squash";
      const closed: number[] = [];
      const invocation = recovery
        ? await git("rev-parse", `refs/heads/${workspace.invocationBranch}`)
        : workspace.invocationBase;
      async function remaining(path: string, branch: string, candidate: string) {
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
        if (!exists && !registrations.length) return Boolean(ref);
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
        return true;
      }
      async function observe(candidate: string) {
        if (!recovery) return observed(result, candidate);
        stopped();
        await checkout(options.cwd, workspace.invocationBranch, invocation);
        await git("merge-base", "--is-ancestor", recovery.squashSha, invocation);
        await remaining(workspace.worktreePath, workspace.branch, result.finalCandidate);
      }
      try {
        if (
          result.reviewBase !== workspace.invocationBase ||
          !result.reviewReport.trim() ||
          !result.repairAndValidation.trim() ||
          !result.handoff.trim() ||
          !workspace.graph.tickets.length
        )
          throw new Error("缺少完整可信的最终验收交接，不能交付或关票。");
        const owned = workspace.graph.tickets.map((issue) => {
          const context = contexts.get(issue.number);
          if (
            !context ||
            context.spec !== workspace ||
            context.ticket.number !== issue.number ||
            !context.candidate ||
            !context.acceptance?.trim() ||
            !context.handoff?.trim() ||
            !context.mergedSha
          )
            throw new Error(`#${issue.number} 缺少票级集成交接，不能交付。`);
          return { context, candidate: context.candidate };
        });
        await observe(workspace.invocationBase);
        await git("merge-base", "--is-ancestor", result.reviewBase, result.reviewCandidate);
        await git("merge-base", "--is-ancestor", result.reviewCandidate, result.finalCandidate);
        for (const { context, candidate } of owned) {
          await git("merge-base", "--is-ancestor", candidate, context.mergedSha!);
          await git("merge-base", "--is-ancestor", context.mergedSha!, result.finalCandidate);
        }
        const tree = await git("rev-parse", `${result.finalCandidate}^{tree}`);
        if (!recovery) {
          stage = "squash 尚未确认提交";
          await git("merge", "--squash", "--ff", result.finalCandidate);
          if ((await git("write-tree")) !== tree) throw new GitStateError("squash 暂存树与最终候选不符，保留现场。");
          stopped();
          if (
            (await git("branch", "--show-current")) !== workspace.invocationBranch ||
            (await git("rev-parse", "HEAD")) !== workspace.invocationBase
          )
            throw new GitStateError("squash 期间启动分支漂移，保留暂存现场并重新核对验收。");
          await git(
            "commit",
            "-m",
            `Deliver Spec #${number}: ${workspace.graph.spec.title}\n\n` +
              `Spec: #${number}\nInvocation-Branch: ${workspace.invocationBranch}\nIntegration-Branch: ${workspace.branch}\n` +
              `Review-Base: ${result.reviewBase}\nReview-Candidate: ${result.reviewCandidate}\nFinal-Candidate: ${result.finalCandidate}`,
          );
          squashSha = await git("rev-parse", "HEAD");
        }
        if (!squashSha) throw new GitStateError("无法确认交付 SHA，保留现场。");
        stage = "squash 提交待核验";
        await observe(squashSha);
        if (
          (await git("rev-list", "--parents", "-n", "1", squashSha)) !== `${squashSha} ${result.reviewBase}` ||
          (await git("rev-parse", `${squashSha}^{tree}`)) !== tree ||
          (await git("rev-list", "--count", `${result.reviewBase}..${squashSha}`)) !== "1"
        )
          throw new GitStateError("目标分支未形成唯一且文件树一致的 squash 提交，保留现场。");
        if (recovery) {
          const message = (await git("show", "-s", "--format=%B", squashSha)).split("\n");
          for (const line of [
            `Spec: #${number}`,
            `Invocation-Branch: ${workspace.invocationBranch}`,
            `Integration-Branch: ${workspace.branch}`,
            `Review-Base: ${result.reviewBase}`,
            `Review-Candidate: ${result.reviewCandidate}`,
            `Final-Candidate: ${result.finalCandidate}`,
          ])
            if (!message.includes(line)) throw new GitStateError("恢复交付提交与普通最终交接不符，禁止关票。 ");
        }
        const deliveryHandoff = summary(result, squashSha);
        stage = "squash 已核验，交付记录或关票尚未完成";
        await options.recordHandoff(
          number,
          `${deliveryHandoff}\n\n下一动作：统一记录并关闭 tickets，最后关闭父 Spec。`,
        );
        for (const issue of workspace.graph.tickets) {
          if (recovery && issue.state === "CLOSED") {
            closed.push(issue.number);
            continue;
          }
          await observe(squashSha);
          await options.recordHandoff(issue.number, `${deliveryHandoff}\n\n本票已随整个 Spec 交付，执行关票。`);
          await observe(squashSha);
          await options.closeIssue(issue.number);
          closed.push(issue.number);
        }
        await observe(squashSha);
        if (!recovery || workspace.graph.spec.state !== "CLOSED") {
          await options.recordHandoff(number, `${deliveryHandoff}\n\n全部 tickets 已关闭，执行父 Spec 关票。`);
          await observe(squashSha);
          await options.closeIssue(number);
        }
        closed.push(number);
        stage = "squash 与关票已完成，清理尚未完成";
        // Validate every checkout before the first removal. Git removes only exact,
        // clean, unlocked registrations; expected-old-value ref deletion prevents drift.
        const cleanups = [
          ...owned.map(({ context, candidate }) => ({
            path: context.worktreePath,
            branch: context.ticket.branch,
            candidate,
          })),
          { path: workspace.worktreePath, branch: workspace.branch, candidate: result.finalCandidate },
        ];
        await observe(squashSha);
        for (const entry of cleanups) {
          if (resolve(entry.path) === resolve(options.cwd)) throw new GitStateError("不能清理启动工作树。");
          if (!recovery) await checkout(entry.path, entry.branch, entry.candidate);
          await remaining(entry.path, entry.branch, entry.candidate);
        }
        for (const entry of cleanups) {
          stopped();
          if (!(await remaining(entry.path, entry.branch, entry.candidate))) continue;
          const registered = (await git("worktree", "list", "--porcelain", "-z"))
            .split("\0")
            .includes(`branch refs/heads/${entry.branch}`);
          if (registered) await git("worktree", "remove", entry.path);
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
          await git("update-ref", "-d", `refs/heads/${entry.branch}`, entry.candidate);
        }
        await checkout(options.cwd, workspace.invocationBranch, recovery ? invocation : squashSha);
        return { ...result, squashSha, deliveryHandoff };
      } catch (error) {
        let actual = "无法确认";
        try {
          actual = await git("rev-parse", `refs/heads/${workspace.invocationBranch}`);
        } catch {}
        try {
          await options.recordHandoff(
            number,
            `Spec #${number} 交付收尾未完成，保留实际进度。\n\n` +
              `启动分支：${workspace.invocationBranch}；Spec 分支：${workspace.branch}；Spec 工作树：${workspace.worktreePath}。\n` +
              `review base：${result.reviewBase}；评审候选：${result.reviewCandidate}；最终候选：${result.finalCandidate}；` +
              `实际 squash 提交：${squashSha ?? "尚未确认"}；启动分支实际 HEAD：${actual}。\n` +
              `阶段：${stage}；已确认关闭：${closed.map((value) => `#${value}`).join("、") || "无"}。\n\n` +
              `失败：${error instanceof Error ? error.message : String(error)}\n\n` +
              "下一动作：先核对 Git 提交、文件树、issue 和已有日志；已 squash 时只补交付记录及剩余关票/清理，禁止重复交付或 reset。",
          );
        } catch (handoffError) {
          throw new AggregateError(
            [error, handoffError],
            `Spec #${number} 交付与失败交接同时失败，保留 Git 和已有日志。`,
          );
        }
        throw error;
      }
    },
  };
}

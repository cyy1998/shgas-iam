import { lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isImplementer } from "./agents.ts";
import { command } from "./commands.ts";
import type { FinalizedSpec } from "./finalization.ts";
import type { SpecGraph, SpecProgress, TrackedIssue } from "./specs.ts";
import {
  type createTicketLifecycle,
  GitStateError,
  type SpecWorkspace,
  type TicketContext,
  type TicketRecovery,
} from "./tickets.ts";
import type { Ticket } from "./workflow.ts";

const sha = "[a-f0-9]{40}";
function metadata(body: string): string {
  return body.split(/\n\n(?:实施交接|真实双轴报告|findings 处置与最终验证|失败|阻碍)[:：]/)[0]!;
}
function field(body: string, label: string): string | undefined {
  return new RegExp(`${label}：([^；。\\n]+)`).exec(metadata(body))?.[1]?.trim();
}
function hash(body: string, label: string): string | undefined {
  return new RegExp(`${label}：(${sha})(?=[；。\\s]|$)`).exec(metadata(body))?.[1];
}

export type RecoveredSpec = { workspace: SpecWorkspace; finalized?: FinalizedSpec; squashSha?: string };

/** Rebuild ephemeral contexts from ordinary issue handoffs, checking every claimed Git fact. */
export function createSpecRecovery(options: {
  cwd: string;
  invocationBranch: string;
  actor: string;
  tickets: ReturnType<typeof createTicketLifecycle>;
  recordHandoff?: (number: number, body: string) => Promise<void>;
}) {
  const recoverable = new Set<number>();
  const resumable = new Map<number, TicketRecovery>();
  const delivered = new Set<number>();
  const git = async (...args: string[]) => {
    try {
      return await command("git", args, options.cwd);
    } catch (cause) {
      throw new GitStateError("恢复的 Git 事实无法确认，保留分支、工作树和普通记录。", { cause });
    }
  };
  const owned = (issue: TrackedIssue) => issue.assignees.every((entry) => entry === options.actor);
  const comments = (issue: TrackedIssue) =>
    (issue.comments ?? []).map((entry) => ({ ...entry, body: entry.body.replaceAll("\r\n", "\n") }));
  const ownedComments = (issue: TrackedIssue) => comments(issue).filter((entry) => entry.author === options.actor);
  const records = (graph: SpecGraph) =>
    [graph.spec, ...graph.tickets]
      .flatMap(ownedComments)
      .map((entry) => entry.body)
      .filter(
        (body) =>
          body.startsWith(`开始 Spec #${graph.spec.number} `) ||
          body.startsWith(`Spec #${graph.spec.number} `) ||
          body.startsWith(`AFK 本轮暂停 Spec #${graph.spec.number}`),
      );
  async function registration(branch: string, recorded?: string, allowRemoved = false): Promise<string | undefined> {
    const entries = (await git("worktree", "list", "--porcelain", "-z"))
      .split("\0\0")
      .filter((entry) => entry.split("\0").includes(`branch refs/heads/${branch}`));
    if (entries.length > 1) throw new GitStateError(`分支 ${branch} 有重复 worktree 登记，保留现场。`);
    const lines = entries[0]?.split("\0");
    if (!lines) {
      if (recorded) {
        if (!allowRemoved) throw new GitStateError(`恢复路径已失去 worktree 登记，保留现场：${recorded}。`);
        try {
          await lstat(recorded);
          throw new GitStateError(`未登记目录仍存在，保留现场：${recorded}。`);
        } catch (error) {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        }
      }
      return;
    }
    const path = lines.find((line) => line.startsWith("worktree "))?.slice(9);
    if (
      !path ||
      lines.some((line) => line === "locked" || line.startsWith("locked ")) ||
      (recorded && resolve(recorded) !== resolve(path)) ||
      resolve(path) === resolve(options.cwd)
    )
      throw new GitStateError(`恢复 worktree 路径或锁无法确认，保留 ${branch}。`);
    return path;
  }
  function finalRecord(graph: SpecGraph, workspace: SpecWorkspace): FinalizedSpec | undefined {
    const body = ownedComments(graph.spec)
      .map((entry) => entry.body)
      .filter(
        (body) =>
          body.startsWith(`Spec #${graph.spec.number} 最终评审、`) ||
          body.startsWith(`Spec #${graph.spec.number} 最终验收尚未完成`),
      )
      .at(-1);
    if (!body?.startsWith(`Spec #${graph.spec.number} 最终评审、`)) return;
    const reviewBase = hash(body, "固定 review base");
    const reviewCandidate = hash(body, "评审候选");
    const finalCandidate = hash(body, "修复后最终候选");
    const reviewReport = body.split("真实双轴报告：\n")[1]?.split("\n\nfindings 处置与最终验证：\n")[0];
    const repairAndValidation = body.split("findings 处置与最终验证：\n")[1]?.split("\n\n下一动作：")[0];
    if (
      !reviewBase ||
      !reviewCandidate ||
      !finalCandidate ||
      !reviewReport?.trim() ||
      !repairAndValidation?.trim() ||
      field(body, "启动分支") !== options.invocationBranch ||
      field(body, "Spec 分支") !== workspace.branch
    )
      return;
    return { workspace, reviewBase, reviewCandidate, finalCandidate, reviewReport, repairAndValidation, handoff: body };
  }
  return {
    get progress(): SpecProgress {
      return { integrated: options.tickets.integrated, recoverable, delivered };
    },
    hasEvidence: (graph: SpecGraph) => owned(graph.spec) && records(graph).length > 0,
    async select(graphs: readonly SpecGraph[]): Promise<RecoveredSpec | undefined> {
      for (const graph of graphs) {
        if (!this.hasEvidence(graph)) continue;
        const restored = await this.restore(graph);
        if (restored) return restored;
      }
    },
    async localSpecs(): Promise<number[]> {
      const commits = (
        await git("log", options.invocationBranch, "--format=%H", "--extended-regexp", "--grep=^Spec: #[0-9]+$")
      )
        .split("\n")
        .filter(Boolean);
      const specs = new Set<number>();
      for (const commit of commits) {
        const body = await git("show", "-s", "--format=%B", commit);
        const number = /^Spec: #([1-9]\d*)$/m.exec(body)?.[1];
        const branch = /^Integration-Branch: ([\w./-]+)$/m.exec(body)?.[1];
        if (number && branch && (await git("for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`)))
          specs.add(Number(number));
      }
      return [...specs];
    },
    async confirmDelivered(issue: TrackedIssue): Promise<void> {
      const body = comments(issue)
        .map((entry) => entry.body)
        .filter((body) => /^Spec #[1-9]\d* 已确认本地 squash 交付。/.test(body))
        .at(-1);
      if (!body) return;
      const number = /^Spec #([1-9]\d*)/.exec(body)?.[1];
      const squash = hash(body, "实际 squash 提交");
      const base = hash(body, "review base");
      const review = hash(body, "评审候选");
      const final = hash(body, "最终候选");
      const branch = field(body, "Spec 分支");
      if (
        !number ||
        !squash ||
        !base ||
        !review ||
        !final ||
        !branch ||
        !body.includes("\n\n真实双轴报告：\n") ||
        !body.includes("\n\nfindings 处置与最终验证：\n") ||
        field(body, "启动分支") !== options.invocationBranch ||
        (issue.parent ?? issue.number) !== Number(number)
      )
        return;
      const message = (await git("show", "-s", "--format=%B", squash)).split("\n");
      if (
        ![
          `Spec: #${number}`,
          `Invocation-Branch: ${options.invocationBranch}`,
          `Integration-Branch: ${branch}`,
          `Review-Base: ${base}`,
          `Review-Candidate: ${review}`,
          `Final-Candidate: ${final}`,
        ].every((line) => message.includes(line)) ||
        (await git("rev-list", "--parents", "-n", "1", squash)) !== `${squash} ${base}`
      )
        throw new GitStateError("跨 Spec 的交付记录与实际 Git 不符，保留为未知结果。");
      // Delivery checks the final tree and implementation ancestry before committing.
      // After cleanup those objects may be collected; the squash and its ordinary trailers persist.
      await git("cat-file", "-e", `${squash}^{tree}`);
      await git("merge-base", "--is-ancestor", squash, options.invocationBranch);
      delivered.add(issue.number);
    },
    execute: (workspace: SpecWorkspace, ticket: Ticket) =>
      options.tickets.execute(workspace, ticket, resumable.get(ticket.number)),
    async restore(graph: SpecGraph): Promise<RecoveredSpec | undefined> {
      if (
        !owned(graph.spec) ||
        !graph.spec.labels.includes("type:spec") ||
        graph.spec.labels.includes("type:ticket") ||
        !graph.spec.labels.includes("ready-for-agent")
      )
        return;
      const specRecords = ownedComments(graph.spec)
        .map((entry) => entry.body)
        .filter((body) => records(graph).includes(body));
      const record = [...specRecords, ...(!specRecords.length ? records(graph) : [])]
        .reverse()
        .find(
          (body) =>
            (field(body, "Spec 分支") ?? field(body, "集成分支")) &&
            field(body, "启动分支") &&
            (hash(body, "Spec 启动基线") ?? hash(body, "启动基线") ?? hash(body, "review base")),
        );
      if (!record) return;
      const branch = field(record, "Spec 分支") ?? field(record, "集成分支");
      const invocationBase = hash(record, "Spec 启动基线") ?? hash(record, "启动基线") ?? hash(record, "review base");
      if (!branch || !invocationBase || field(record, "启动分支") !== options.invocationBranch)
        throw new GitStateError("恢复交接缺少准确分支或基线，保留现场。");
      const tip = await git("for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`);
      if (!tip) throw new GitStateError(`恢复的 Spec 分支 ${branch} 不存在，保留记录并核对 Git。`);
      const commits = (
        await git(
          "log",
          options.invocationBranch,
          "--format=%H",
          "--extended-regexp",
          `--grep=^Spec: #${graph.spec.number}$`,
        )
      )
        .split("\n")
        .filter(Boolean);
      if (commits.length > 1) throw new GitStateError("发现多个可能的 Spec 交付提交，保留现场，不重复交付。");
      const closing = Boolean(commits.length);
      if (graph.spec.state === "CLOSED" && !closing)
        throw new GitStateError("父 Spec 已关闭但未确认实际交付，保留现场。");
      const pathRecord = [...specRecords]
        .reverse()
        .map((body) => field(body, "Spec 工作树"))
        .find(Boolean);
      const registered = await registration(branch, pathRecord, closing);
      if (closing && !registered && !pathRecord)
        throw new GitStateError("缺少待回收 Spec worktree 的准确路径，保留现场。");
      const workspace: SpecWorkspace = closing
        ? {
            graph,
            branch,
            invocationBranch: options.invocationBranch,
            invocationBase,
            worktreePath: registered ?? pathRecord!,
          }
        : await options.tickets.prepareSpec(graph, { branch, invocationBase });
      recoverable.add(graph.spec.number);
      for (const issue of graph.tickets) {
        if (
          !owned(issue) ||
          issue.parent !== graph.spec.number ||
          !issue.labels.includes("type:ticket") ||
          issue.labels.includes("type:spec")
        )
          continue;
        const body = ownedComments(issue)
          .map((entry) => entry.body)
          .filter(
            (body) =>
              body.startsWith(`开始 Spec #${graph.spec.number} 的票级实施`) ||
              body.startsWith(`Spec #${graph.spec.number} 的票级集成已完成`) ||
              body.startsWith(`Spec #${graph.spec.number} 的 ticket #${issue.number} `),
          )
          .at(-1);
        if (!body) continue;
        if (
          field(body, "Spec 分支") !== branch ||
          field(body, "ticket 分支") !== `codex/sandcastle/issue-${issue.number}`
        )
          throw new GitStateError(`#${issue.number} 的恢复归属不一致，保留现场。`);
        const originalRole = [...ownedComments(issue)]
          .reverse()
          .map((entry) => field(entry.body, "实施者"))
          .find(isImplementer);
        const ticket: Ticket = {
          number: issue.number,
          title: issue.title,
          branch: field(body, "ticket 分支")!,
          implementer: originalRole ?? "implementer_standard",
          reason: "复用已核验的普通票级验收交接",
        };
        const baseSha = hash(body, "实施基线");
        if (!baseSha) throw new GitStateError("恢复的票级实施基线缺失，保留现场。");
        const ticketPath =
          field(body, "ticket 工作树") ??
          [...ownedComments(issue)]
            .reverse()
            .map((entry) => field(entry.body, "ticket 工作树"))
            .find(Boolean);
        const worktreePath = await registration(ticket.branch, ticketPath, closing);
        const candidate =
          (await git("for-each-ref", "--format=%(objectname)", `refs/heads/${ticket.branch}`)) ||
          (closing ? hash(body, "候选") : undefined);
        if (!candidate) throw new GitStateError(`#${issue.number} 恢复分支不存在，保留记录。`);
        await git("merge-base", "--is-ancestor", baseSha, candidate);
        await git("merge-base", "--is-ancestor", baseSha, tip);
        const recordedCandidate = hash(body, "候选");
        const recordedHead = recordedCandidate ?? hash(body, "实际 HEAD");
        if (recordedHead && recordedHead !== candidate)
          throw new GitStateError(`#${issue.number} 候选漂移，旧验收失效，保留现场。`);
        const handoff = body.split("实施交接：\n")[1]?.split("\n\n票级验收：\n")[0];
        const acceptance = body.split("票级验收：\n")[1]?.split("\n\n下一动作：")[0];
        if (body.startsWith(`Spec #${graph.spec.number} 的票级集成已完成`)) {
          if (!worktreePath && (!closing || !ticketPath))
            throw new GitStateError("已集成票缺少准确 worktree 登记，保留现场。");
          const context: TicketContext = {
            spec: workspace,
            ticket,
            baseSha,
            candidate: recordedCandidate,
            mergedSha: hash(body, "普通合入"),
            handoff,
            acceptance,
            worktreePath: worktreePath ?? ticketPath!,
          };
          await options.tickets.restoreIntegrated(context);
        } else {
          const status = worktreePath ? await command("git", ["status", "--porcelain"], worktreePath) : "";
          let confirmedPath = field(body, "ticket 工作树") ? worktreePath : undefined;
          if (status && !confirmedPath && worktreePath && recordedHead === candidate) {
            const common = await git("rev-parse", "--path-format=absolute", "--git-common-dir");
            const canonical = join(dirname(common), ".sandcastle", "worktrees", `issue-${issue.number}`);
            if (resolve(worktreePath) === resolve(canonical)) confirmedPath = worktreePath;
          }
          if (status && !confirmedPath) throw new GitStateError("未提交工作缺少准确归属路径，保留现场。");
          // Ancestry avoids replaying a merge but never supplies acceptance evidence.
          const alreadyMerged = candidate !== baseSha && (await git("rev-list", `${tip}..${candidate}`)) === "";
          resumable.set(issue.number, {
            baseSha,
            worktreePath: confirmedPath,
            candidate: recordedCandidate,
            acceptOnly: !status && (Boolean(recordedCandidate) || alreadyMerged),
            handoff:
              handoff ??
              "恢复发现保留的候选；核对普通 issue 和已有日志，重新完成实施报告及全部票级验收，不以 Git 祖先关系代替验证。",
          });
        }
        recoverable.add(issue.number);
      }
      const finalized = finalRecord(graph, workspace);
      if (commits.length) {
        if (!finalized)
          throw new GitStateError("发现可能已 squash 的 Spec，但缺少完整最终验收交接，先核对已有日志，禁止重复交付。");
        const squashSha = commits[0]!;
        const message = await git("show", "-s", "--format=%B", squashSha);
        const trailers = [
          `Spec: #${graph.spec.number}`,
          `Invocation-Branch: ${options.invocationBranch}`,
          `Integration-Branch: ${branch}`,
          `Review-Base: ${finalized.reviewBase}`,
          `Review-Candidate: ${finalized.reviewCandidate}`,
          `Final-Candidate: ${finalized.finalCandidate}`,
        ];
        if (
          !trailers.every((line) => message.split("\n").includes(line)) ||
          (await git("rev-list", "--parents", "-n", "1", squashSha)) !== `${squashSha} ${finalized.reviewBase}` ||
          (await git("rev-parse", `${squashSha}^{tree}`)) !==
            (await git("rev-parse", `${finalized.finalCandidate}^{tree}`))
        )
          throw new GitStateError("可能的交付提交与最终门禁、parent 或文件树不符，保留现场，禁止重复 squash。");
        await git("merge-base", "--is-ancestor", finalized.reviewBase, finalized.reviewCandidate);
        await git("merge-base", "--is-ancestor", finalized.reviewCandidate, finalized.finalCandidate);
        if (
          tip !== finalized.finalCandidate ||
          graph.tickets.some((issue) => !options.tickets.integrated.has(issue.number))
        )
          throw new GitStateError("已交付 Spec 的候选或完整票级交接不符，保留现场。 ");
        delivered.add(graph.spec.number);
        for (const issue of graph.tickets) delivered.add(issue.number);
        return { workspace, finalized, squashSha };
      }
      const current = await git("rev-parse", options.invocationBranch);
      if (current !== invocationBase) {
        await git("merge-base", "--is-ancestor", invocationBase, current);
        // Preserve the old review range in ordinary history and require fresh combination checks.
        await command("git", ["merge", "--no-edit", current], workspace.worktreePath).catch((cause) => {
          throw new GitStateError("启动分支新基线整合失败，保留冲突现场并停止恢复。", { cause });
        });
        workspace.invocationBase = current;
        await options.recordHandoff?.(
          graph.spec.number,
          `Spec #${graph.spec.number} 恢复时已整合启动分支的新基线，旧最终门禁失效。\n\n` +
            `启动分支：${options.invocationBranch}；Spec 启动基线：${current}；Spec 分支：${branch}；Spec 工作树：${workspace.worktreePath}。\n\n` +
            `原基线：${invocationBase}；下一动作：保留已验收集成历史，在当前组合候选重新进行正式评审、集中修复及最终必需验证。`,
        );
        return { workspace };
      }
      if (finalized) {
        const actual = await command("git", ["rev-parse", "HEAD"], workspace.worktreePath);
        if (actual !== finalized.finalCandidate || finalized.reviewBase !== workspace.invocationBase)
          return { workspace };
        await git("merge-base", "--is-ancestor", finalized.reviewBase, finalized.reviewCandidate);
        await git("merge-base", "--is-ancestor", finalized.reviewCandidate, finalized.finalCandidate);
      }
      return { workspace, finalized };
    },
  };
}

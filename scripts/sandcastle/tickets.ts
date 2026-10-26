import { access, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { command } from "./commands.ts";
import type { SpecGraph } from "./specs.ts";
import type { Ticket } from "./workflow.ts";

export class GitStateError extends Error {}

export type SpecWorkspace = {
  graph: SpecGraph;
  branch: string;
  worktreePath: string;
  invocationBranch: string;
  invocationBase: string;
};

export type TicketContext = {
  spec: SpecWorkspace;
  ticket: Ticket;
  worktreePath: string;
  baseSha: string;
  candidate?: string;
  handoff?: string;
  acceptance?: string;
  mergedSha?: string;
};

export type IntegratedTicket = TicketContext & {
  candidate: string;
  handoff: string;
  acceptance: string;
  mergedSha: string;
};

export type TicketRecovery = {
  baseSha: string;
  worktreePath?: string;
  candidate?: string;
  handoff?: string;
  acceptOnly?: boolean;
};

function integratedTicket(context: TicketContext): IntegratedTicket {
  const { candidate, handoff, acceptance, mergedSha } = context;
  if (!candidate || !handoff || !acceptance || !mergedSha) throw new GitStateError("缺少完整票级集成交接，保留现场。");
  return { ...context, candidate, handoff, acceptance, mergedSha };
}

export type TicketRun = (input: {
  phase: "implement" | "accept";
  context: Readonly<TicketContext>;
  integrationSha: string;
}) => Promise<{ completed: boolean; handoff: string }>;

export function createTicketLifecycle(options: {
  cwd: string;
  invocationBranch: string;
  runTicket: TicketRun;
  recordHandoff: (number: number, body: string) => Promise<void>;
  signal?: AbortSignal;
}) {
  const { cwd, invocationBranch, signal } = options;
  async function gitAt(path: string, ...args: string[]) {
    try {
      return await command("git", args, path);
    } catch (cause) {
      throw new GitStateError(
        `Git 状态无法确认，保留现场：${path}。${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }
  const git = (...args: string[]) => gitAt(cwd, ...args);
  const contexts = new Map<number, TicketContext>();
  const workspaces = new Map<number, SpecWorkspace>();
  const integrated = new Set<number>();
  let mergeQueue: Promise<unknown> = Promise.resolve();
  let fatalGitFailure: GitStateError | undefined;

  async function assertCheckout(path: string, branch: string, allowDirty = false) {
    signal?.throwIfAborted();
    const status = (await gitAt(path, "status", "--porcelain=v2", "--branch", "--untracked-files=all")).split(/\r?\n/);
    if (!status.includes(`# branch.head ${branch}`))
      throw new GitStateError(`工作树分支不匹配，保留现场：${path}，预期 ${branch}。`);
    if (!allowDirty && status.some((line) => line && !line.startsWith("# ")))
      throw new GitStateError(`工作树有未提交改动，保留现场：${path}。`);
    const head = status.find((line) => line.startsWith("# branch.oid "))?.slice(13);
    if (!head || !/^[a-f0-9]{40}$/.test(head)) throw new GitStateError(`无法确认工作树 HEAD，保留现场：${path}。`);
    const dotGit = join(path, ".git");
    let gitDirectory = dotGit;
    try {
      if (!(await stat(dotGit)).isDirectory()) {
        const pointer = /^gitdir: (.+)$/m.exec(await readFile(dotGit, "utf8"))?.[1]?.trim();
        if (!pointer) throw new Error("worktree 缺少准确 Git 元数据指针");
        gitDirectory = resolve(path, pointer);
      }
    } catch (cause) {
      throw new GitStateError(`无法确认 checkout Git 元数据，保留现场：${path}。`, { cause });
    }
    for (const entry of ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD", "rebase-merge", "rebase-apply"]) {
      try {
        await access(join(gitDirectory, entry));
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
        throw new GitStateError(`无法确认未完成 Git 操作，保留现场：${path}。`, { cause: error });
      }
      throw new GitStateError(`工作树有未完成 Git 操作，保留现场：${path}。`);
    }
    return head;
  }

  async function assertInvocation(expected?: string) {
    const actual = await assertCheckout(cwd, invocationBranch);
    if (expected && actual !== expected) throw new GitStateError("启动分支 HEAD 已变化，保留现场并先恢复基线。");
    return actual;
  }

  async function checkout(branch: string, base: string, name: string, recoveryPath?: string) {
    const common = await git("rev-parse", "--path-format=absolute", "--git-common-dir");
    const path = join(dirname(common), ".sandcastle", "worktrees", name);
    const entries = (await git("worktree", "list", "--porcelain", "-z")).split("\0\0");
    const entry = entries.find((entry) => entry.split("\0").includes(`branch refs/heads/${branch}`));
    if (entry) {
      const registered = entry
        .split("\0")
        .find((line) => line.startsWith("worktree "))
        ?.slice(9);
      if (!registered || entry.split("\0").some((line) => line === "locked" || line.startsWith("locked ")))
        throw new GitStateError("Git worktree 登记缺少准确路径或被锁定，保留现场。");
      if (resolve(registered) === resolve(cwd))
        throw new GitStateError(`不能把启动 checkout 用作集成工作树：${branch}。`);
      if (recoveryPath && resolve(registered) !== resolve(recoveryPath))
        throw new GitStateError(`恢复工作树路径与真实登记不符，保留现场：${branch}。`);
      await assertCheckout(registered, branch, Boolean(recoveryPath));
      return registered;
    }
    if (recoveryPath) throw new GitStateError(`恢复 worktree 已失去准确登记，保留现场：${recoveryPath}。`);
    let exists = false;
    try {
      await access(path);
      exists = true;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (exists) throw new GitStateError(`未登记目录已存在，归属未知，保留现场：${path}。`);
    await mkdir(dirname(path), { recursive: true });
    const existing = await git("for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`);
    await git("worktree", "add", ...(existing ? [path, branch] : ["-b", branch, path, base]));
    await assertCheckout(path, branch);
    return path;
  }

  async function observed(context: TicketContext, ancestor: string) {
    const actual = await assertCheckout(context.worktreePath, context.ticket.branch);
    await gitAt(context.worktreePath, "merge-base", "--is-ancestor", ancestor, actual);
    return actual;
  }

  async function integrate(workspace: SpecWorkspace, ticket: Ticket): Promise<Readonly<IntegratedTicket>> {
    const context = contexts.get(ticket.number);
    if (!context?.candidate || !context.handoff || context.spec !== workspace)
      throw new Error(`#${ticket.number} 缺少本次实施的候选与验证交接。`);
    await assertInvocation(workspace.invocationBase);
    await assertCheckout(workspace.worktreePath, workspace.branch);
    if ((await observed(context, context.baseSha)) !== context.candidate)
      throw new GitStateError(`#${ticket.number} 候选已漂移，保留分支与交接。`);
    if (context.mergedSha)
      await gitAt(workspace.worktreePath, "merge-base", "--is-ancestor", context.mergedSha, "HEAD");
    if (integrated.has(ticket.number)) return integratedTicket(context);
    if (!context.mergedSha) {
      const integrationSha = await gitAt(workspace.worktreePath, "rev-parse", "HEAD");
      if (
        context.candidate !== integrationSha &&
        (await gitAt(workspace.worktreePath, "rev-list", `${integrationSha}..${context.candidate}`)) === ""
      ) {
        // A previous process may have merged before its ordinary acceptance record was written.
        // Advance only by fast-forward, then obtain the missing real acceptance at the existing snapshot.
        await gitAt(context.worktreePath, "merge", "--ff-only", integrationSha);
        context.candidate = await observed(context, context.candidate);
      }
      try {
        const accepted = await options.runTicket({ phase: "accept", context: { ...context }, integrationSha });
        context.acceptance = accepted.handoff;
        if (!accepted.completed || !accepted.handoff.trim())
          throw new Error(`#${ticket.number} 票级验收或必需验证未完成，保留现场。${accepted.handoff}`);
      } catch (error) {
        const actual = await gitAt(context.worktreePath, "rev-parse", "HEAD");
        if ((await gitAt(context.worktreePath, "branch", "--show-current")) !== ticket.branch)
          throw new GitStateError("验收失败后的分支归属无法确认，保留现场。", { cause: error });
        await gitAt(context.worktreePath, "merge-base", "--is-ancestor", context.candidate, actual);
        try {
          await options.recordHandoff(
            ticket.number,
            `Spec #${workspace.graph.spec.number} 的 ticket #${ticket.number} 票级验收尚未完成，保留分支与 worktree。\n\n` +
              `启动分支：${invocationBranch}；Spec 启动基线：${workspace.invocationBase}；Spec 分支：${workspace.branch}；` +
              `ticket 分支：${ticket.branch}；ticket 工作树：${context.worktreePath}；实施基线：${context.baseSha}；候选：${actual}；实际 HEAD：${actual}。\n\n` +
              `实施交接：\n${context.handoff}\n\n票级验收：\n${context.acceptance ?? "验收会话未返回完整报告。"}\n\n` +
              `失败：${error instanceof Error ? error.message : String(error)}\n\n` +
              "下一动作：下次启动核对实际 HEAD 与已有日志，重新完成票级验收和必需验证；本轮不重开失败会话。",
          );
        } catch (handoffError) {
          throw new AggregateError([error, handoffError], "票级验收与准确失败交接同时失败，保留 Git 和已有日志。");
        }
        throw error;
      }
      await observed(context, context.candidate);
      context.candidate = await observed(context, integrationSha);
      await assertInvocation(workspace.invocationBase);
      await assertCheckout(workspace.worktreePath, workspace.branch);
      if ((await gitAt(workspace.worktreePath, "rev-parse", "HEAD")) !== integrationSha)
        throw new GitStateError(`Spec #${workspace.graph.spec.number} 验收期间集成候选漂移，保留现场。`);
      if ((await observed(context, context.baseSha)) !== context.candidate)
        throw new GitStateError(`#${ticket.number} 票级验收后的候选已漂移，保留现场。`);
      await options.recordHandoff(
        ticket.number,
        `Spec #${workspace.graph.spec.number} 的 ticket #${ticket.number} 票级验收完成，等待普通合入。\n\n` +
          `启动分支：${invocationBranch}；Spec 启动基线：${workspace.invocationBase}；Spec 分支：${workspace.branch}；` +
          `ticket 分支：${ticket.branch}；ticket 工作树：${context.worktreePath}；实施基线：${context.baseSha}；候选：${context.candidate}。\n\n` +
          `实施交接：\n${context.handoff}\n\n票级验收：\n${context.acceptance}`,
      );
      await assertInvocation(workspace.invocationBase);
      if (
        (await assertCheckout(workspace.worktreePath, workspace.branch)) !== integrationSha ||
        (await observed(context, context.baseSha)) !== context.candidate
      )
        throw new GitStateError("票级验收记录期间候选漂移，保留现场。");
      signal?.throwIfAborted();
      await gitAt(workspace.worktreePath, "merge", "--no-ff", "--no-edit", context.candidate);
      await assertCheckout(workspace.worktreePath, workspace.branch);
      await gitAt(workspace.worktreePath, "merge-base", "--is-ancestor", context.candidate, "HEAD");
      context.mergedSha = await gitAt(workspace.worktreePath, "rev-parse", "HEAD");
    }
    signal?.throwIfAborted();
    await options.recordHandoff(
      ticket.number,
      `Spec #${workspace.graph.spec.number} 的票级集成已完成，等待整个 Spec 的最终评审、验证与交付；ticket 和父 Spec 保持 open。\n\n` +
        `启动分支：${invocationBranch}；Spec 启动基线：${workspace.invocationBase}；Spec 分支：${workspace.branch}；ticket 分支：${ticket.branch}。\n` +
        `实施基线：${context.baseSha}；候选：${context.candidate}；普通合入：${context.mergedSha}。\n\n` +
        `实施交接：\n${context.handoff}\n\n票级验收：\n${context.acceptance}\n\n下一动作：继续 Spec 内可执行切片，最终门禁通过后再交付和关票。`,
    );
    integrated.add(ticket.number);
    return integratedTicket(context);
  }

  return {
    get contexts(): ReadonlyMap<number, Readonly<TicketContext>> {
      return new Map([...contexts].map(([key, value]) => [key, { ...value }]));
    },
    get integrated(): ReadonlySet<number> {
      return new Set(integrated);
    },
    async prepareSpec(
      graph: SpecGraph,
      selection: { branch?: string; invocationBase?: string } = {},
    ): Promise<SpecWorkspace> {
      if (fatalGitFailure) throw fatalGitFailure;
      const invocationBase = selection.invocationBase ?? (await assertInvocation());
      if (selection.invocationBase) await assertInvocation();
      const known = workspaces.get(graph.spec.number);
      if (known) {
        await assertInvocation(known.invocationBase);
        await assertCheckout(known.worktreePath, known.branch);
        if (selection.branch && selection.branch !== known.branch)
          throw new GitStateError("Spec 分支选择与在途上下文冲突。");
        return known;
      }
      const declared = [
        ...graph.spec.body.matchAll(
          /(?:复用功能\/集成分支|集成分支|功能分支|Integration branch)\s*[:：]\s*`?([\w./-]+)/gi,
        ),
      ].flatMap((match) => (match[1] ? [match[1]] : []));
      const choices = new Set(declared);
      if (!selection.branch && choices.size > 1)
        throw new GitStateError(`Spec #${graph.spec.number} 的集成分支归属有歧义。`);
      const explicit = selection.branch ?? declared[0];
      const branch = explicit ?? `codex/sandcastle/spec-${graph.spec.number}`;
      await git("check-ref-format", "--branch", branch);
      if (branch === invocationBranch) throw new GitStateError("Spec 集成分支不能与启动分支相同。");
      const previous = await git("for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`);
      if (previous && !explicit) throw new GitStateError(`已有 ${branch} 缺少可信归属交接，保留分支并等待恢复。`);
      if (previous) await git("merge-base", "--is-ancestor", invocationBase, previous);
      const worktreePath = await checkout(branch, invocationBase, `spec-${graph.spec.number}`);
      const workspace = { graph, branch, worktreePath, invocationBranch, invocationBase };
      workspaces.set(graph.spec.number, workspace);
      if (!selection.invocationBase)
        await options.recordHandoff(
          graph.spec.number,
          `开始 Spec #${graph.spec.number} 的集成。启动分支：${invocationBranch}；Spec 启动基线：${invocationBase}；` +
            `Spec 分支：${branch}；Spec 工作树：${worktreePath}。\n\n下一动作：实施当前可执行切片，未交付。`,
        );
      return workspace;
    },
    async restoreIntegrated(context: TicketContext): Promise<void> {
      const complete = integratedTicket(context);
      if (contexts.has(context.ticket.number)) throw new GitStateError("恢复的 ticket 上下文重复，保留现场。");
      await git("merge-base", "--is-ancestor", complete.candidate, complete.mergedSha);
      await git("merge-base", "--is-ancestor", complete.mergedSha, context.spec.branch);
      contexts.set(context.ticket.number, { ...context });
      integrated.add(context.ticket.number);
    },
    async execute(workspace: SpecWorkspace, ticket: Ticket, recovery?: TicketRecovery): Promise<boolean> {
      if (fatalGitFailure) throw fatalGitFailure;
      if (contexts.has(ticket.number)) throw new Error(`#${ticket.number} 本次已启动，不自动重开实施会话。`);
      await assertInvocation(workspace.invocationBase);
      await assertCheckout(workspace.worktreePath, workspace.branch);
      if (
        !workspace.graph.tickets.some(
          (entry) => entry.number === ticket.number && entry.parent === workspace.graph.spec.number,
        )
      )
        throw new Error(`#${ticket.number} 不属于当前 Spec。`);
      if (ticket.branch !== `codex/sandcastle/issue-${ticket.number}`) throw new Error("ticket 分支归属不匹配。");
      const current = await gitAt(workspace.worktreePath, "rev-parse", "HEAD");
      const previous = await git("for-each-ref", "--format=%(objectname)", `refs/heads/${ticket.branch}`);
      if (previous && !recovery) throw new GitStateError(`#${ticket.number} 已有分支缺少可信恢复交接，保留现场。`);
      const baseSha = recovery?.baseSha ?? current;
      await git("merge-base", "--is-ancestor", baseSha, current);
      if (previous) await git("merge-base", "--is-ancestor", baseSha, previous);
      if (recovery?.candidate && previous !== recovery.candidate)
        throw new GitStateError(`#${ticket.number} 恢复候选与分支 HEAD 不符，保留现场。`);
      const worktreePath = await checkout(ticket.branch, current, `issue-${ticket.number}`, recovery?.worktreePath);
      const context: TicketContext = {
        spec: workspace,
        ticket: { ...ticket },
        worktreePath,
        baseSha,
        candidate: recovery?.acceptOnly ? previous : undefined,
        handoff: recovery?.handoff,
      };
      contexts.set(ticket.number, context);
      if (recovery?.acceptOnly) {
        await assertCheckout(worktreePath, ticket.branch);
        return true;
      }
      await options.recordHandoff(
        ticket.number,
        `开始 Spec #${workspace.graph.spec.number} 的票级实施。启动分支：${invocationBranch}；Spec 启动基线：${workspace.invocationBase}；` +
          `Spec 分支：${workspace.branch}；ticket 分支：${ticket.branch}；ticket 工作树：${worktreePath}；实施基线：${baseSha}；当前集成快照：${current}。\n\n` +
          `实施者：${ticket.implementer}；选择依据：${ticket.reason}。下一动作：在本票 worktree 完成实施及聚焦验证，尚未验收、集成或交付。`,
      );
      try {
        const result = await options.runTicket({
          phase: "implement",
          context: { ...context },
          integrationSha: current,
        });
        context.handoff = result.handoff;
        if (!result.completed || !result.handoff.trim())
          throw new Error(`#${ticket.number} 实施或必需验证未完成，保留现场。`);
        await observed(context, current);
        context.candidate = await observed(context, baseSha);
        await options.recordHandoff(
          ticket.number,
          `Spec #${workspace.graph.spec.number} 的 ticket #${ticket.number} 实施完成，等待票级验收。\n\n` +
            `启动分支：${invocationBranch}；Spec 启动基线：${workspace.invocationBase}；Spec 分支：${workspace.branch}；` +
            `ticket 分支：${ticket.branch}；ticket 工作树：${worktreePath}；实施基线：${baseSha}；候选：${context.candidate}。\n\n实施交接：\n${context.handoff}`,
        );
        return true;
      } catch (error) {
        if (error instanceof GitStateError) fatalGitFailure = error;
        try {
          const actual = await gitAt(worktreePath, "rev-parse", "HEAD");
          await options.recordHandoff(
            ticket.number,
            `Spec #${workspace.graph.spec.number} 的 ticket #${ticket.number} 尚未验收或集成；保留分支与 worktree。\n\n` +
              `启动分支：${invocationBranch}；Spec 启动基线：${workspace.invocationBase}；Spec 分支：${workspace.branch}；ticket 分支：${ticket.branch}；ticket 工作树：${worktreePath}；实施基线：${baseSha}；实际 HEAD：${actual}。\n` +
              `失败：${error instanceof Error ? error.message : String(error)}\n\n${context.handoff ?? "会话未返回验证交接。"}\n\n` +
              `下一动作：下次启动核对 Git、issue 与已有日志后恢复，本次不重开失败实施会话。`,
          );
        } catch (handoffError) {
          throw new AggregateError(
            [error, handoffError],
            `#${ticket.number} 实施与失败交接同时失败，保留已有日志和 Git 现场。`,
          );
        }
        throw error;
      }
    },
    integrate(workspace: SpecWorkspace, ticket: Ticket) {
      const pending = mergeQueue
        .then(() => {
          if (fatalGitFailure) throw fatalGitFailure;
          return integrate(workspace, ticket);
        })
        .catch((error: unknown) => {
          if (error instanceof GitStateError) fatalGitFailure = error;
          throw error;
        });
      mergeQueue = pending.catch(() => {});
      return pending;
    },
  };
}

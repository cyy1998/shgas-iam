import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sandbox } from "@ai-hero/sandcastle";
import { codex, createSandbox, createWorktree, run } from "@ai-hero/sandcastle";
import { implementerCatalog, loadAgentRoles } from "./agents.ts";
import type { CodexAuth } from "./auth.ts";
import { prepareCodexAuth } from "./auth.ts";
import { codexConfigProbe, configuredCodex, prepareAgentConfig, shellQuote } from "./codex-provider.mts";
import { command } from "./commands.ts";
import { closeDeliveredIssue, createSpecDelivery } from "./delivery.ts";
import { createFinalizationLifecycle, type FinalizedSpec } from "./finalization.ts";
import { createFinalizationExecutor } from "./finalization-runtime.mts";
import { createGitHubIssueTracker, githubRepo } from "./github.ts";
import { hookCommitProbe, hookSmokeEnvironment, snapshotHostHooks } from "./hook-smoke.mts";
import { createSpecRecovery, type RecoveredSpec } from "./recovery.ts";
import { smokeCommandResources, smokeExecutorRecovery } from "./resource-smoke.mts";
import { ExecutorTerminationError, withExecutorResources } from "./resources.ts";
import {
  cachePreflight,
  dockerPreflight,
  dockerSandbox,
  frontendGeneratedPaths,
  turboCacheDirectory,
  withCachePreflight,
  withDockerPreflight,
  withFrontendMounts,
  withWorkspacePreparation,
} from "./sandbox.mts";
import type { SpecGraph } from "./specs.ts";
import { loadSpecBacklog, loadSpecGraph, parseSpecPlan, specFrontier } from "./specs.ts";
import {
  createTicketExecutor,
  type ExecutorDependencies,
  ExecutorInfrastructureError,
  recordTicketHandoff,
} from "./ticket-runtime.mts";
import { createTicketLifecycle, GitStateError, type SpecWorkspace } from "./tickets.ts";
import type { SpecFrontier, SpecSelection, Ticket } from "./workflow.ts";
import { dependencyVolumeTargets } from "./workspace-dependencies.mts";

export { githubRepo } from "./github.ts";

const complete = "<promise>COMPLETE</promise>";
const invocationArgs = (branch: string) => ({ REPO: githubRepo, INVOCATION_BRANCH: branch });

export type RuntimeOptions = {
  cwd: string;
  branch: string;
  model: string;
  image: string;
  signal: AbortSignal;
};

export async function checkedExec(sandbox: Sandbox, script: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const quoted = shellQuote(script);
  const pending = sandbox.exec(`timeout --kill-after=10s 1200s sh -lc ${quoted}`);
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal?.reason ?? new Error("Sandbox command aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
  let result: Awaited<typeof pending>;
  try {
    result = await Promise.race([pending, interrupted]);
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
  if (result.exitCode !== 0)
    throw new Error(
      `Sandbox 命令失败 (${result.exitCode})：${script}\n${result.stdout.slice(-3000)}\n${result.stderr.slice(-3000)}`,
    );
  return result.stdout.trim();
}

export type RuntimeDependencies = ExecutorDependencies & {
  prepareAuth?: () => Promise<CodexAuth>;
};

export async function createRuntime(options: RuntimeOptions, dependencies: RuntimeDependencies = {}) {
  const { cwd, branch, model, image, signal } = options;
  const runGh = dependencies.runGh ?? ((args: string[]) => command("gh", args, cwd));
  const actor = await runGh(["api", "user", "--jq", ".login"]);
  if (!actor.trim()) throw new ExecutorInfrastructureError("无法确认当前 GitHub 认领身份，停止启动。");
  const githubCredentials = dependencies.runGh
    ? {}
    : Object.fromEntries(["GH_TOKEN"].flatMap((key) => (process.env[key] ? [[key, process.env[key]!]] : [])));
  const roles = await loadAgentRoles(cwd);
  const agentConfig = await prepareAgentConfig(roles);
  let auth: CodexAuth;
  try {
    auth = await (dependencies.prepareAuth ?? prepareCodexAuth)();
  } catch (error) {
    try {
      await agentConfig.close();
    } catch (closeError) {
      throw new AggregateError([error, closeError], "Codex 初始化与配置收尾同时失败。");
    }
    throw error;
  }
  const mounts = [...auth.mounts, ...agentConfig.mounts];
  if (auth.mode === "chatgpt") console.log(`Codex 登录凭据暂存与恢复目录：${auth.mounts[0]!.hostPath}`);
  const promptFile = (name: string) => join(cwd, ".sandcastle", `${name}-prompt.md`);
  const git = (...args: string[]) => command("git", args, cwd);
  const common = invocationArgs(branch);
  const tracker = createGitHubIssueTracker(cwd, runGh);
  const recordHandoff = (number: number, body: string) => recordTicketHandoff(cwd, number, body, runGh);
  let selectedSpec: SpecGraph | undefined;
  let specWorkspace: SpecWorkspace | undefined;
  let recovered: RecoveredSpec | undefined;
  let unsafeCreator = false;
  const onUnsafeClose = () => {
    unsafeCreator = true;
  };

  const tickets = createTicketLifecycle({
    cwd,
    invocationBranch: branch,
    signal,
    runTicket: createTicketExecutor({
      ...dependencies,
      cwd,
      model,
      image,
      signal,
      roles,
      auth,
      mounts,
      githubCredentials,
      onUnsafeClose,
      canClose: () => !unsafeCreator,
    }),
    recordHandoff,
  });
  const recovery = createSpecRecovery({
    cwd,
    invocationBranch: branch,
    actor,
    tickets,
    recordHandoff,
  });

  const assertTarget = async () => {
    if (unsafeCreator)
      throw new ExecutorTerminationError("仍有未确认停止的创建者；停止启动后续模型任务，先恢复 executor.json。");
    if ((await git("branch", "--show-current")) !== branch)
      throw new GitStateError(`宿主已离开目标分支 ${branch}；停止运行。`);
    if (await git("status", "--porcelain")) throw new GitStateError("目标工作区有未提交改动；保留现场并停止运行。");
  };

  async function planFrontier(backlog: { specs: SpecGraph[] }, attempted: ReadonlySet<number>, name: string) {
    await assertTarget();
    const baseSha = await git("rev-parse", "HEAD");
    const planning = backlog.specs.map((graph) => {
      const frontier = specFrontier(graph, recovery.progress);
      return {
        ...graph,
        frontier: { ...frontier, ready: frontier.ready.filter((entry) => !attempted.has(entry.number)) },
      };
    });
    for (const entry of planning)
      for (const blocked of entry.frontier.blocked) console.log(`#${blocked.number}: ${blocked.reasons.join(" ")}`);
    if (!planning.some((entry) => entry.frontier.ready.length)) return { graph: undefined, tickets: [] };
    let result: { stdout: string };
    try {
      result = await withExecutorResources({ cwd, image, signal, onUnsafeClose }, (resources) =>
        (dependencies.run ?? run)({
          cwd,
          branchStrategy: { type: "head" },
          sandbox: dockerSandbox({
            ...resources,
            imageName: image,
            env: { ...githubCredentials, ...auth.env, ...resources.env },
            mounts: [...mounts, ...resources.mounts],
          }),
          agent: withDockerPreflight(
            withCachePreflight(
              dependencies.agent?.({
                worktreePath: cwd,
                name,
                promptFile: promptFile("plan"),
                promptArgs: {
                  ...common,
                  IMPLEMENTERS: implementerCatalog(roles),
                  SPEC_BACKLOG: JSON.stringify(planning),
                },
              }) ?? configuredCodex(model, roles),
            ),
          ),
          promptFile: promptFile("plan"),
          promptArgs: { ...common, IMPLEMENTERS: implementerCatalog(roles), SPEC_BACKLOG: JSON.stringify(planning) },
          maxIterations: 1,
          name,
          signal,
        }),
      );
    } catch (cause) {
      throw new ExecutorInfrastructureError("Planner 执行器或公共资源失败；停止本次运行。", { cause });
    }
    await assertTarget();
    if ((await git("rev-parse", "HEAD")) !== baseSha)
      throw new GitStateError("规划期间启动分支 HEAD 发生变化；请核对现场后重新启动。");
    const plan = parseSpecPlan(result.stdout, backlog, recovery.progress);
    if (plan.tickets.some((entry) => attempted.has(entry.number)))
      throw new Error("Planner 重新选择了本轮已尝试的 ticket；停止重复派发。");
    return plan;
  }

  const finalization = createFinalizationLifecycle({
    cwd,
    signal,
    runFinal: createFinalizationExecutor({
      ...dependencies,
      cwd,
      model,
      image,
      signal,
      roles,
      auth,
      mounts,
      githubCredentials,
      onUnsafeClose,
      canClose: () => !unsafeCreator,
    }),
    recordHandoff,
  });
  const delivery = createSpecDelivery({
    cwd,
    signal,
    creatorsStopped: () => !unsafeCreator,
    recordHandoff,
    closeIssue: (number) => closeDeliveredIssue(cwd, number, runGh),
  });

  return {
    get selectedSpec() {
      return selectedSpec;
    },
    get specWorkspace() {
      return specWorkspace;
    },
    get ticketContexts() {
      return tickets.contexts;
    },
    get integrated() {
      return tickets.integrated;
    },
    finalize: async (workspace = specWorkspace) => {
      if (!workspace) throw new Error("尚未准备 Spec 集成工作树。");
      await assertTarget();
      if (recovered?.workspace === workspace && recovered.finalized) return recovered.finalized;
      return finalization.finalize(workspace, tickets.contexts, tickets.integrated);
    },
    deliver: async (finalized: FinalizedSpec) => {
      await assertTarget();
      if (finalized.workspace !== specWorkspace) throw new GitStateError("最终验收交接不属于当前 Spec，保留现场。");
      return delivery.deliver(
        finalized,
        tickets.contexts,
        recovered?.squashSha ? { squashSha: recovered.squashSha } : undefined,
      );
    },
    prepareSpec: async (graph: SpecGraph, selection?: { branch?: string }) => {
      selectedSpec = graph;
      specWorkspace = await tickets.prepareSpec(graph, selection);
      return specWorkspace;
    },
    integrate: async (ticket: Ticket) => {
      if (!specWorkspace) throw new Error("尚未准备 Spec 集成工作树。");
      return tickets.integrate(specWorkspace, ticket);
    },
    signal,
    report: (message: string) => console.log(message),
    close: async () => {
      if (unsafeCreator)
        throw new ExecutorTerminationError(
          "创建者 sandbox 尚未确认停止；保留 Codex auth/config 挂载，先按 executor.json 恢复。",
        );
      const failures: unknown[] = [];
      try {
        await auth.close();
      } catch (error) {
        failures.push(error);
      }
      try {
        await agentConfig.close();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length) throw new AggregateError(failures, "Codex auth/config 收尾失败。");
    },

    async plan(attempt: number, excludedSpecs: ReadonlySet<number>): Promise<SpecSelection | undefined> {
      await assertTarget();
      const backlog = await loadSpecBacklog(tracker);
      // Only local unfinished closeout branches add closed parents; never sweep historical closed issues.
      const localCloseouts = await recovery.localSpecs();
      for (const number of localCloseouts) {
        if (!backlog.specs.some((graph) => graph.spec.number === number))
          backlog.specs.push(await loadSpecGraph(tracker, await tracker.readIssue(number)));
      }
      for (const issue of new Map(
        backlog.specs.flatMap((graph) => graph.dependencies).map((issue) => [issue.number, issue]),
      ).values())
        await recovery.confirmDelivered(issue);
      for (const rejected of backlog.rejected) console.log(`#${rejected.number}: ${rejected.reasons.join(" ")}`);
      const available = { specs: backlog.specs.filter((graph) => !excludedSpecs.has(graph.spec.number)) };
      recovered = await recovery.select(available.specs);
      if (recovered) {
        selectedSpec = recovered.workspace.graph;
        specWorkspace = recovered.workspace;
        const plan = recovered.squashSha
          ? { tickets: [] }
          : await planFrontier(
              { specs: [selectedSpec] },
              new Set(),
              `Planner recovered Spec #${selectedSpec.spec.number}`,
            );
        return { workspace: specWorkspace, tickets: plan.tickets };
      }
      if (available.specs.some((graph) => localCloseouts.includes(graph.spec.number)))
        throw new GitStateError(
          "本地仍有 Spec 交付收尾现场，但当前类型、准入、认领或普通交接不允许恢复；保留分支和工作树，先核对报告。",
        );
      const plan = await planFrontier(available, new Set(), `Planner Spec ${attempt}`);
      if (!plan.graph) return undefined;
      selectedSpec = plan.graph;
      specWorkspace = await tickets.prepareSpec(selectedSpec);
      return { workspace: specWorkspace, tickets: plan.tickets };
    },

    async frontier(workspace: SpecWorkspace, attemptedTickets: ReadonlySet<number>): Promise<SpecFrontier> {
      if (workspace !== specWorkspace) throw new GitStateError("当前 Spec 工作树与调度上下文不匹配；保留现场。");
      if (recovered?.workspace === workspace && recovered.squashSha)
        return { tickets: [], complete: true, blocked: [] };
      const frontier = specFrontier(workspace.graph, recovery.progress);
      const plan = await planFrontier(
        { specs: [workspace.graph] },
        attemptedTickets,
        `Planner Spec #${workspace.graph.spec.number} frontier`,
      );
      return { tickets: plan.tickets, complete: frontier.complete, blocked: frontier.blocked };
    },

    async pause(
      workspace: SpecWorkspace,
      outcome: { integrated: number[]; failed: number[]; blocked: { number: number; reasons: string[] }[] },
    ): Promise<void> {
      const contexts = workspace.graph.tickets.flatMap((entry) => {
        const context = tickets.contexts.get(entry.number);
        return context
          ? [
              `#${entry.number}: branch=${context.ticket.branch}; base=${context.baseSha}; candidate=${context.candidate ?? "pending"}; merged=${context.mergedSha ?? "pending"}`,
            ]
          : [];
      });
      try {
        await recordTicketHandoff(
          cwd,
          workspace.graph.spec.number,
          [
            `AFK 本轮暂停 Spec #${workspace.graph.spec.number}，保留未完成工作。`,
            `集成分支：${workspace.branch}；启动分支：${workspace.invocationBranch}；启动基线：${workspace.invocationBase}。`,
            `本轮集成：${outcome.integrated.join(", ") || "无"}；失败：${outcome.failed.join(", ") || "无"}。`,
            ...contexts,
            ...outcome.blocked.map((entry) => `#${entry.number}: ${entry.reasons.join(" ")}`),
            "恢复时先核对真实 Git、票级交接和日志；本轮不重派失败项，未确认最终交付，不关闭 issues。",
          ].join("\n\n"),
          runGh,
        );
      } catch (cause) {
        throw new ExecutorInfrastructureError("无法保存 Spec 普通交接；停止本次运行并保留 Git 与日志。", { cause });
      }
    },

    async execute(ticket: Ticket): Promise<boolean> {
      if (!specWorkspace) throw new Error("尚未准备 Spec 集成工作树。");
      return recovery.execute(specWorkspace, ticket);
    },
  };
}

export async function smoke(options: Pick<RuntimeOptions, "cwd" | "image" | "signal">): Promise<void> {
  const { cwd, image, signal } = options;
  const roles = await loadAgentRoles(cwd);
  const agentConfig = await prepareAgentConfig(roles);
  const branch = `codex/sandcastle/smoke-${Date.now()}`;
  let unsafeCreator = false;
  try {
    // A read-only cache must prevent the agent command from starting.
    let cacheFailure: unknown;
    const blocked = await createSandbox({
      cwd,
      branch,
      sandbox: dockerSandbox({
        imageName: image,
        mounts: [{ ...agentConfig.mounts[0]!, sandboxPath: turboCacheDirectory }],
      }),
    });
    try {
      await checkedExec(blocked, 'git config --global --add safe.directory "$PWD"');
      await blocked.run({
        agent: withCachePreflight({
          ...codex("smoke-no-model", { captureSessions: false }),
          buildPrintCommand: () => ({ command: "touch /tmp/cache-smoke-agent-started" }),
        }),
        prompt: "Cache permission smoke; do not invoke a model.",
        signal,
      });
    } catch (error) {
      cacheFailure = error;
    } finally {
      try {
        await checkedExec(blocked, "test ! -e /tmp/cache-smoke-agent-started", signal);
      } finally {
        await blocked.close();
      }
    }
    if (!String(cacheFailure).includes("Turbo 缓存目录不可写"))
      throw new Error("只读 Turbo 缓存未产生预期错误。", { cause: cacheFailure });
    console.log("只读 Turbo 缓存已阻止 agent 命令启动。");
    const worktree = await createWorktree({ cwd, branchStrategy: { type: "branch", branch } });
    let hostHooksBefore: string | undefined;
    let smokeCandidate: string | undefined;
    const smokeFailures: unknown[] = [];
    try {
      hostHooksBefore = await snapshotHostHooks(cwd, worktree.worktreePath);
      for (const path of frontendGeneratedPaths) {
        const directory = join(worktree.worktreePath, path);
        await mkdir(join(directory, "core"), { recursive: true });
        await writeFile(join(directory, "host-sentinel"), "host-generated-output", "utf8");
        await writeFile(
          join(directory, "core", "historyIntelli.ts"),
          "export type UmiHistory = import('D:/missing-windows-dependencies/history').History;\n",
          "utf8",
        );
      }
      await withFrontendMounts(
        async (generatedMounts) =>
          withExecutorResources(
            {
              cwd,
              image,
              signal,
              anonymousVolumes: await dependencyVolumeTargets(worktree.worktreePath),
              onUnsafeClose: () => {
                unsafeCreator = true;
              },
            },
            async (resources) => {
              const anonymousVolumes = resources.anonymousVolumes;
              const sandbox = await worktree.createSandbox({
                sandbox: dockerSandbox({
                  ...resources,
                  imageName: image,
                  anonymousVolumes,
                  mounts: [...agentConfig.mounts, ...generatedMounts, ...resources.mounts],
                  env: {
                    ...resources.env,
                    ...hookSmokeEnvironment,
                    PATH: "/tmp/iam-afk-smoke-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                  },
                }),
              });
              try {
                await checkedExec(sandbox, dockerPreflight, signal);
                await checkedExec(sandbox, cachePreflight, signal);
                await checkedExec(sandbox, 'git config --global --add safe.directory "$PWD"');
                console.log(
                  await checkedExec(
                    sandbox,
                    "node --version && pnpm --version && bun --version && codex --version && gh --version" +
                      " && git status --short && test -f .agents/skills/implement/SKILL.md" +
                      " && docker compose version && docker buildx version",
                  ),
                );
                console.log(await checkedExec(sandbox, `node -e ${shellQuote(codexConfigProbe(roles))}`, signal));
                for (const path of frontendGeneratedPaths)
                  await checkedExec(sandbox, `test ! -e ${shellQuote(`${path}/host-sentinel`)}`, signal);
                await checkedExec(sandbox, "mkdir -p /tmp/iam-afk-smoke-bin", signal);
                for (const phase of ["install", "setup"]) {
                  const failureMessage = `smoke-${phase}-failure`;
                  const stub =
                    phase === "install"
                      ? `#!/bin/sh
if [ "$1" = --version ] || [ "$1" = list ]; then exec /usr/local/bin/pnpm "$@"; fi
echo ${failureMessage} >&2
exit 71
`
                      : `#!/bin/sh
if [ "$1" = --version ] || [ "$1" = list ]; then exec /usr/local/bin/pnpm "$@"; fi
if [ "$1" = install ]; then exit 0; fi
echo ${failureMessage} >&2
exit 72
`;
                  await checkedExec(
                    sandbox,
                    `printf '%s' ${shellQuote(stub)} > /tmp/iam-afk-smoke-bin/pnpm` +
                      " && chmod +x /tmp/iam-afk-smoke-bin/pnpm",
                    signal,
                  );
                  let failure: unknown;
                  try {
                    await sandbox.run({
                      agent: withWorkspacePreparation({
                        ...codex("smoke-no-model", { captureSessions: false }),
                        buildPrintCommand: () => ({ command: "touch /tmp/preparation-smoke-agent-started" }),
                      }),
                      prompt: "Initialization failure smoke; do not invoke a model.",
                      signal,
                    });
                  } catch (error) {
                    failure = error;
                  } finally {
                    await checkedExec(sandbox, "rm -f /tmp/iam-afk-smoke-bin/pnpm", signal);
                  }
                  await checkedExec(sandbox, "test ! -e /tmp/preparation-smoke-agent-started", signal);
                  if (!String(failure).includes(failureMessage))
                    throw new Error(`${phase} 初始化失败未阻止 agent。`, { cause: failure });
                  console.log(`${phase} 初始化失败已阻止 agent 命令启动。`);
                }
                for (const path of frontendGeneratedPaths)
                  await checkedExec(sandbox, `touch ${shellQuote(`${path}/stale-container-output`)}`, signal);
                const preparationPrompt = "Initialization must preserve this prompt on stdin.";
                const preparationProgram = (prompt: string) => `let input = ""; process.stdin.setEncoding("utf8");
            process.stdin.on("data", chunk => { input += chunk; });
            process.stdin.on("end", () => {
              if (input !== ${JSON.stringify(prompt)}) throw new Error("Initialization consumed prompt stdin");
              console.log(JSON.stringify({ type: "thread.started", thread_id: "smoke-preparation" }));
              console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: ${JSON.stringify(complete)} } }));
            });`;
                const prepared = await sandbox.run({
                  agent: withWorkspacePreparation({
                    ...codex("smoke-no-model", { captureSessions: false }),
                    buildPrintCommand: ({ prompt }: { prompt: string }) => ({
                      command: `${hookCommitProbe("Implementer")}\nnode -e ${shellQuote(preparationProgram(prompt))}`,
                      stdin: prompt,
                    }),
                  }),
                  prompt: preparationPrompt,
                  signal,
                });
                if (prepared.completionSignal !== complete) throw new Error("初始化后 agent 未正确接收 prompt stdin。");
                await smokeCommandResources(sandbox, cwd, resources, signal);
                if ((await snapshotHostHooks(cwd, worktree.worktreePath)) !== hostHooksBefore)
                  throw new Error("Implementer 初始化或提交改变了宿主 Git 配置/Husky 包装文件。");
                console.log("Implementer 真实提交门禁及宿主 Git/Husky 隔离检查通过。");
                for (const path of frontendGeneratedPaths)
                  await checkedExec(sandbox, `test ! -e ${shellQuote(`${path}/stale-container-output`)}`, signal);
                console.log(await checkedExec(sandbox, "pnpm --filter @iam/admin --filter @iam/sso typecheck", signal));
                for (const path of frontendGeneratedPaths) {
                  const directory = join(worktree.worktreePath, path);
                  const sentinel = await readFile(join(directory, "host-sentinel"), "utf8");
                  const history = await readFile(join(directory, "core", "historyIntelli.ts"), "utf8");
                  if (
                    sentinel !== "host-generated-output" ||
                    history !== "export type UmiHistory = import('D:/missing-windows-dependencies/history').History;\n"
                  ) {
                    throw new Error(`容器初始化改变了宿主生成文件：${path}`);
                  }
                }
                console.log("容器前端生成目录隔离及 Admin/SSO 类型检查通过，宿主生成文件保持不变。");
                await checkedExec(sandbox, "cd apps/admin && node ../../scripts/playwright-e2e-preflight.mjs", signal);
                const browserProbe = `
            const { chromium } = require("@playwright/test");
            (async () => {
              for (const channel of [undefined, "chromium"]) {
                const browser = await chromium.launch({ headless: true, channel });
                try {
                  const page = await browser.newPage();
                  await page.setContent("<script>document.title = 'browser-ready'</script>");
                  if (await page.title() !== "browser-ready") throw new Error("Chromium script execution failed");
                  console.log("Chromium " + (channel ?? "headless-shell") + " " + browser.version() + " launched");
                } finally {
                  await browser.close();
                }
              }
            })().catch(error => { console.error(error); process.exitCode = 1; });
          `;
                console.log(await checkedExec(sandbox, `cd apps/admin && node -e ${shellQuote(browserProbe)}`, signal));
                const cacheTask = "pnpm exec turbo typecheck --filter=@iam/contracts --output-logs=full";
                await checkedExec(sandbox, cacheTask, signal);
                const cached = await checkedExec(sandbox, cacheTask, signal);
                if (!cached.includes("cache hit")) throw new Error("Turbo smoke 未命中前一次执行写入的缓存。");
                console.log("Turbo 缓存写入及再次命中通过。");
                console.log(await checkedExec(sandbox, "pnpm verify:static && git diff --check", signal));
                // Make only the container-private hook directory unwritable. Stub
                // dependency setup so this case reaches the hook initialization
                // boundary without another install; the real setup passed above.
                await checkedExec(
                  sandbox,
                  "chmod 500 /tmp/iam-sandcastle-hooks" +
                    " && printf '%s\\n' '#!/bin/sh' 'if [ \"$1\" = --version ] || [ \"$1\" = list ]; then exec /usr/local/bin/pnpm \"$@\"; fi' 'exit 0' > /tmp/iam-afk-smoke-bin/pnpm" +
                    " && chmod +x /tmp/iam-afk-smoke-bin/pnpm",
                  signal,
                );
                let hookInitializationFailure: unknown;
                try {
                  await sandbox.run({
                    agent: withWorkspacePreparation({
                      ...codex("smoke-no-model", { captureSessions: false }),
                      buildPrintCommand: () => ({ command: "touch /tmp/hook-smoke-agent-started" }),
                    }),
                    prompt: "Hook initialization failure smoke; do not invoke a model.",
                    signal,
                  });
                } catch (error) {
                  hookInitializationFailure = error;
                } finally {
                  await checkedExec(
                    sandbox,
                    "chmod 700 /tmp/iam-sandcastle-hooks && rm -f /tmp/iam-afk-smoke-bin/pnpm",
                  );
                }
                await checkedExec(sandbox, "test ! -e /tmp/hook-smoke-agent-started", signal);
                if (!String(hookInitializationFailure).includes("Sandcastle hook 初始化失败"))
                  throw new Error("Hook 初始化失败未阻止 agent。", { cause: hookInitializationFailure });
                console.log("Hook 初始化失败已阻止 agent 命令启动。");
              } finally {
                await sandbox.close();
              }
              // Match the production Spec finalization's head checkout. Its host is the
              // disposable smoke worktree, so ordinary commits cannot move the
              // caller's feature branch even though Git common metadata is shared.
              const headProbe = await withExecutorResources(
                {
                  cwd,
                  image,
                  signal,
                  anonymousVolumes,
                  onUnsafeClose: () => {
                    unsafeCreator = true;
                  },
                },
                (headResources) =>
                  run({
                    cwd: worktree.worktreePath,
                    branchStrategy: { type: "head" },
                    sandbox: dockerSandbox({
                      ...headResources,
                      imageName: image,
                      anonymousVolumes,
                      mounts: [...agentConfig.mounts, ...generatedMounts, ...headResources.mounts],
                      env: { ...headResources.env, ...hookSmokeEnvironment },
                    }),
                    agent: withDockerPreflight(
                      withWorkspacePreparation({
                        ...codex("smoke-no-model", { captureSessions: false }),
                        buildPrintCommand: () => ({
                          command:
                            hookCommitProbe("Finalization") +
                            `\nprintf '%s\\n' ${shellQuote(
                              JSON.stringify({
                                type: "item.completed",
                                item: { type: "agent_message", text: complete },
                              }),
                            )}`,
                        }),
                      }),
                    ),
                    prompt: "Spec finalization head checkout hook smoke; do not invoke a model.",
                    signal,
                  }),
              );
              if (headProbe.completionSignal !== complete)
                throw new Error("Spec finalization 真实提交门禁检查未完成。");
              if ((await snapshotHostHooks(cwd, worktree.worktreePath)) !== hostHooksBefore)
                throw new Error("Spec finalization 初始化或提交改变了宿主 Git 配置/Husky 包装文件。");
              smokeCandidate = await command("git", ["rev-parse", "HEAD"], worktree.worktreePath);
              console.log("Spec finalization head checkout 真实提交门禁及宿主 Git/Husky 隔离检查通过。");
            },
          ),
        () => !unsafeCreator,
      );
    } catch (error) {
      smokeFailures.push(error);
    }
    try {
      if (hostHooksBefore !== undefined && (await snapshotHostHooks(cwd, worktree.worktreePath)) !== hostHooksBefore)
        throw new Error("Smoke 执行后宿主 Git 配置/Husky 包装文件发生变化；保留差异以便恢复。");
    } catch (error) {
      smokeFailures.push(error);
    }
    try {
      if (unsafeCreator) throw new Error(`创建者尚未确认停止；保留 smoke worktree：${worktree.worktreePath}`);
      const closed = await worktree.close();
      if (closed.preservedWorktreePath)
        throw new Error(`Smoke 工作区仍有改动，保留分支和恢复目录：${closed.preservedWorktreePath}`);
    } catch (error) {
      smokeFailures.push(error);
    }
    if (smokeFailures.length === 1) throw smokeFailures[0];
    if (smokeFailures.length > 1)
      throw new AggregateError(
        smokeFailures,
        "Smoke 与隔离检查/清理同时失败；保留测试分支供恢复。\n" +
          smokeFailures.map((error) => (error instanceof Error ? error.message : String(error))).join("\n"),
      );
    if (!smokeCandidate) throw new Error("Smoke 缺少已验证候选；保留测试分支供恢复。");
    // The owned smoke branch now contains test commits. Delete only its exact
    // observed tip after successful cleanup, never another writer's update.
    await command("git", ["update-ref", "-d", `refs/heads/${branch}`, smokeCandidate], cwd);
    await smokeExecutorRecovery({ cwd, image, signal });
    const { controlledWorkflowJourney } = await import("./workflow-smoke.mts");
    await controlledWorkflowJourney({ sourceCwd: cwd, mode: "docker", scenario: "complete", image, signal });
  } finally {
    if (!unsafeCreator) await agentConfig.close();
  }
}

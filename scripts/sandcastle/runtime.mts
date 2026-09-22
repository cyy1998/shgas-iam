import type { Sandbox } from "@ai-hero/sandcastle";
import type { CodexAuth } from "./auth.ts";
import type { Ticket } from "./workflow.ts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { codex, createSandbox, createWorktree, run } from "@ai-hero/sandcastle";
import { implementerCatalog, loadAgentRoles } from "./agents.ts";
import { prepareCodexAuth } from "./auth.ts";
import { codexConfigProbe, configuredCodex, prepareAgentConfig, shellQuote } from "./codex-provider.mts";
import { command, deleteMergedTicketBranch } from "./commands.ts";
import { withTestResources } from "./resources.ts";
import { cachePreflight, dockerSandbox, frontendGeneratedPaths, turboCacheDirectory, withCachePreflight, withFrontendMounts, withWorkspacePreparation } from "./sandbox.mts";
import { parsePlan } from "./workflow.ts";

export const githubRepo = "cyy1998/shgas-iam";
const complete = "<promise>COMPLETE</promise>";
const invocationArgs = (branch: string) => ({ REPO: githubRepo, INVOCATION_BRANCH: branch });

export type RuntimeOptions = {
  cwd: string;
  branch: string;
  model: string;
  image: string;
  signal: AbortSignal;
};

async function mergerDependencyMounts(cwd: string) {
  const manifests = await command("git", [
    "ls-files",
    "apps/*/package.json",
    "packages/*/package.json",
    "gateway/package.json",
    "e2e/system/package.json",
  ], cwd);
  const paths = ["node_modules", ...manifests.split("\n").filter(Boolean).map(path => `${dirname(path)}/node_modules`)];
  return Promise.all(paths.map(async (sandboxPath) => {
    const hostPath = join(cwd, ".sandcastle", "dependencies", sandboxPath);
    await mkdir(hostPath, { recursive: true });
    return { hostPath, sandboxPath: `/home/agent/workspace/${sandboxPath.replaceAll("\\", "/")}` };
  }));
}

export async function checkedExec(sandbox: Sandbox, script: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const quoted = shellQuote(script);
  const pending = sandbox.exec(`timeout --kill-after=10s 1200s sh -lc ${quoted}`);
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal?.reason ?? new Error("Sandbox command aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted)
      onAbort();
  });
  let result;
  try {
    result = await Promise.race([pending, interrupted]);
  }
  finally {
    if (onAbort)
      signal?.removeEventListener("abort", onAbort);
  }
  if (result.exitCode !== 0)
    throw new Error(`Sandbox 命令失败 (${result.exitCode})：${script}\n${result.stdout.slice(-3000)}\n${result.stderr.slice(-3000)}`);
  return result.stdout.trim();
}

export async function createRuntime(options: RuntimeOptions) {
  const { cwd, branch, model, image, signal } = options;
  const githubCredentials = Object.fromEntries(["GH_TOKEN"]
    .flatMap(key => process.env[key] ? [[key, process.env[key]!]] : []));
  const roles = await loadAgentRoles(cwd);
  const agentConfig = await prepareAgentConfig(roles);
  let auth: CodexAuth;
  try {
    auth = await prepareCodexAuth();
  }
  catch (error) {
    await agentConfig.close();
    throw error;
  }
  const mounts = [...auth.mounts, ...agentConfig.mounts];
  if (auth.mode === "chatgpt")
    console.log(`Codex 登录凭据暂存与恢复目录：${auth.mounts[0]!.hostPath}`);
  const agent = withCachePreflight(configuredCodex(model, roles));
  const promptFile = (name: string) => join(cwd, ".sandcastle", `${name}-prompt.md`);
  const git = (...args: string[]) => command("git", args, cwd);
  const common = invocationArgs(branch);
  const candidates = new Map<number, string>();
  let baseSha = "";

  const assertTarget = async () => {
    if (await git("branch", "--show-current") !== branch)
      throw new Error(`宿主已离开目标分支 ${branch}；停止运行。`);
    if (await git("status", "--porcelain"))
      throw new Error("目标工作区有未提交改动；保留现场并停止运行。");
  };

  return {
    signal,
    report: (message: string) => console.log(message),
    close: async () => {
      try {
        await auth.close();
      }
      finally {
        await agentConfig.close();
      }
    },

    async plan(iteration: number): Promise<Ticket[]> {
      await assertTarget();
      baseSha = await git("rev-parse", "HEAD");
      candidates.clear();
      const result = await run({
        cwd,
        branchStrategy: { type: "head" },
        sandbox: dockerSandbox({ imageName: image, env: { ...githubCredentials, ...auth.env }, mounts }),
        agent,
        promptFile: promptFile("plan"),
        promptArgs: { ...common, IMPLEMENTERS: implementerCatalog(roles) },
        maxIterations: 1,
        name: `Planner ${iteration}`,
        signal,
      });
      await assertTarget();
      if (await git("rev-parse", "HEAD") !== baseSha)
        throw new Error("规划期间目标 HEAD 发生变化；请核对现场后重新启动。");
      return parsePlan(result.stdout);
    },

    async execute(ticket: Ticket): Promise<boolean> {
      const role = roles[ticket.implementer];
      console.log(`#${ticket.number}: ${role.name} (${role.model}, ${role.effort}) — ${ticket.reason}`);
      return withTestResources(cwd, ({ network, env }) => withFrontendMounts(async (generatedMounts) => {
        signal.throwIfAborted();
        const worktree = await createWorktree({
          cwd,
          branchStrategy: { type: "branch", branch: ticket.branch, baseBranch: baseSha },
        });
        let sandbox: Sandbox | undefined;
        try {
          sandbox = await worktree.createSandbox({
            sandbox: dockerSandbox({
              imageName: image,
              network,
              env: { ...githubCredentials, ...auth.env, ...env },
              mounts: [...mounts, ...generatedMounts],
            }),
          });
          signal.throwIfAborted();
          const promptArgs = {
            ...common,
            ISSUE_NUMBER: String(ticket.number),
            BRANCH: ticket.branch,
            BASE_SHA: baseSha,
            IMPLEMENTER: role.name,
            SELECTION_REASON: ticket.reason,
          };
          await mkdir(join(cwd, ".sandcastle", "logs"), { recursive: true });
          const implemented = await sandbox.run({
            agent: withWorkspacePreparation(configuredCodex(model, roles, role)),
            name: `Implementer #${ticket.number}`,
            promptFile: promptFile("implement"),
            promptArgs,
            maxIterations: 1,
            signal,
            logging: {
              type: "file",
              path: join(cwd, ".sandcastle", "logs", `issue-${ticket.number}-${Date.now()}.log`),
              verbose: true,
            },
          });
          if (implemented.completionSignal !== complete)
            throw new Error(`#${ticket.number} 未报告实现完成；保留分支，下轮可恢复。`);
          if (await checkedExec(sandbox, "git branch --show-current") !== ticket.branch)
            throw new Error(`#${ticket.number} 评审后分支不匹配。`);
          await checkedExec(sandbox, `git merge-base --is-ancestor ${baseSha} HEAD`);
          if (await checkedExec(sandbox, "git status --porcelain"))
            throw new Error(`#${ticket.number} 仍有未提交改动；保留 worktree。`);
          const candidate = await checkedExec(sandbox, "git rev-parse HEAD");
          candidates.set(ticket.number, candidate);
          return true;
        }
        finally {
          try {
            await sandbox?.close();
          }
          finally {
            // SDK close treats an unreadable Git status as clean; keep the worktree in that case.
            await command("git", ["status", "--porcelain"], worktree.worktreePath);
            const closed = await worktree.close();
            if (closed.preservedWorktreePath)
              console.log(`保留 ticket 恢复目录：${closed.preservedWorktreePath}`);
          }
        }
      }), signal);
    },

    async finish(): Promise<void> {
      await this.merge([]);
    },

    async merge(tickets: Ticket[]): Promise<void> {
      await assertTarget();
      if (await git("rev-parse", "HEAD") !== baseSha)
        throw new Error("并行实施期间目标 HEAD 发生变化；停止自动合并。");
      await withTestResources(cwd, ({ network, env }) => withFrontendMounts(async (generatedMounts) => {
        signal.throwIfAborted();
        const dependencyMounts = await mergerDependencyMounts(cwd);
        const result = await run({
          cwd,
          branchStrategy: { type: "head" },
          sandbox: dockerSandbox({
            imageName: image,
            network,
            env: { ...githubCredentials, ...auth.env, ...env },
            mounts: [...dependencyMounts, ...mounts, ...generatedMounts],
          }),
          agent: withWorkspacePreparation(configuredCodex(model, roles)),
          promptFile: promptFile("merge"),
          promptArgs: {
            ...common,
            BASE_SHA: baseSha,
            BRANCHES: tickets.map(ticket => `- ${ticket.branch}: ${candidates.get(ticket.number)}`).join("\n"),
            ISSUES: tickets.map(ticket => `- #${ticket.number}`).join("\n"),
          },
          maxIterations: 10,
          name: "Merger",
          signal,
        });
        if (result.completionSignal !== complete)
          throw new Error("Merger 达到迭代上限仍未报告完成；保留合并现场和 issue 实际状态。");
      }), signal);
      await assertTarget();
      for (const ticket of tickets) {
        const candidate = candidates.get(ticket.number);
        if (!candidate)
          throw new Error(`#${ticket.number} 缺少候选 SHA。`);
        await git("merge-base", "--is-ancestor", candidate, "HEAD");
        const state = await command("gh", [
          "issue",
          "view",
          String(ticket.number),
          "--repo",
          githubRepo,
          "--json",
          "state",
          "--jq",
          ".state",
        ], cwd);
        if (state !== "CLOSED")
          throw new Error(`#${ticket.number} 已合入但尚未关闭；停止并保留交接现场。`);
      }
      for (const ticket of tickets) {
        await deleteMergedTicketBranch(cwd, ticket.branch, candidates.get(ticket.number)!);
        console.log(`已清理合入的 ticket 分支：${ticket.branch}`);
      }
    },
  };
}

export async function smoke(options: Pick<RuntimeOptions, "cwd" | "image" | "signal">): Promise<void> {
  const { cwd, image, signal } = options;
  const roles = await loadAgentRoles(cwd);
  const agentConfig = await prepareAgentConfig(roles);
  const branch = `codex/sandcastle/smoke-${Date.now()}`;
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
      await checkedExec(blocked, "git config --global --add safe.directory \"$PWD\"");
      await blocked.run({
        agent: withCachePreflight({
          ...codex("smoke-no-model", { captureSessions: false }),
          buildPrintCommand: () => ({ command: "touch /tmp/cache-smoke-agent-started" }),
        }),
        prompt: "Cache permission smoke; do not invoke a model.",
        signal,
      });
    }
    catch (error) {
      cacheFailure = error;
    }
    finally {
      try {
        await checkedExec(blocked, "test ! -e /tmp/cache-smoke-agent-started", signal);
      }
      finally {
        await blocked.close();
      }
    }
    if (!String(cacheFailure).includes("Turbo 缓存目录不可写"))
      throw new Error("只读 Turbo 缓存未产生预期错误。", { cause: cacheFailure });
    console.log("只读 Turbo 缓存已阻止 agent 命令启动。");
    const worktree = await createWorktree({ cwd, branchStrategy: { type: "branch", branch } });
    try {
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
      await withTestResources(cwd, ({ network, env }) => withFrontendMounts(async (generatedMounts) => {
        const mounts = await mergerDependencyMounts(cwd);
        const sandbox = await worktree.createSandbox({
          sandbox: dockerSandbox({
            imageName: image,
            network,
            mounts: [...mounts, ...agentConfig.mounts, ...generatedMounts],
            env: { ...env, PATH: "/tmp/iam-afk-smoke-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" },
          }),
        });
        try {
          await checkedExec(sandbox, cachePreflight, signal);
          await checkedExec(sandbox, "git config --global --add safe.directory \"$PWD\"");
          console.log(await checkedExec(sandbox, "node --version && pnpm --version && bun --version && codex --version && gh --version"
          + " && git status --short && test -f .agents/skills/implement/SKILL.md"
          + " && pg_isready -h postgres -U iam_afk -d iam_afk && redis-cli -h redis ping"));
          console.log(await checkedExec(sandbox, `node -e ${shellQuote(codexConfigProbe(roles))}`, signal));
          for (const path of frontendGeneratedPaths)
            await checkedExec(sandbox, `test ! -e ${shellQuote(`${path}/host-sentinel`)}`, signal);
          await checkedExec(sandbox, "mkdir -p /tmp/iam-afk-smoke-bin", signal);
          for (const phase of ["install", "setup"]) {
            const failureMessage = `smoke-${phase}-failure`;
            const stub = phase === "install"
              ? `#!/bin/sh
echo ${failureMessage} >&2
exit 71
`
              : `#!/bin/sh
if [ "$1" = install ]; then exit 0; fi
echo ${failureMessage} >&2
exit 72
`;
            await checkedExec(sandbox, `printf '%s' ${shellQuote(stub)} > /tmp/iam-afk-smoke-bin/pnpm`
            + " && chmod +x /tmp/iam-afk-smoke-bin/pnpm", signal);
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
            }
            catch (error) {
              failure = error;
            }
            finally {
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
                command: `node -e ${shellQuote(preparationProgram(prompt))}`,
                stdin: prompt,
              }),
            }),
            prompt: preparationPrompt,
            signal,
          });
          if (prepared.completionSignal !== complete)
            throw new Error("初始化后 agent 未正确接收 prompt stdin。");
          for (const path of frontendGeneratedPaths)
            await checkedExec(sandbox, `test ! -e ${shellQuote(`${path}/stale-container-output`)}`, signal);
          console.log(await checkedExec(sandbox, "pnpm --filter @iam/admin --filter @iam/sso typecheck", signal));
          for (const path of frontendGeneratedPaths) {
            const directory = join(worktree.worktreePath, path);
            const sentinel = await readFile(join(directory, "host-sentinel"), "utf8");
            const history = await readFile(join(directory, "core", "historyIntelli.ts"), "utf8");
            if (sentinel !== "host-generated-output"
              || history !== "export type UmiHistory = import('D:/missing-windows-dependencies/history').History;\n") {
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
          const cacheTask = "pnpm exec turbo lint --filter=@iam/contracts --output-logs=full";
          await checkedExec(sandbox, cacheTask, signal);
          const cached = await checkedExec(sandbox, cacheTask, signal);
          if (!cached.includes("cache hit"))
            throw new Error("Turbo smoke 未命中前一次执行写入的缓存。");
          console.log("Turbo 缓存写入及再次命中通过。");
          console.log(await checkedExec(sandbox, "pnpm verify:static && git diff --check", signal));
          // Exercise the real SDK's prompt preprocessing without GitHub traffic or model calls.
          await checkedExec(sandbox, "mkdir -p /tmp/iam-afk-smoke-bin"
          + " && printf '%s\\n' '#!/bin/sh' 'printf \"[]\\n\"' > /tmp/iam-afk-smoke-bin/gh"
          + " && chmod +x /tmp/iam-afk-smoke-bin/gh");
          const baseSha = await checkedExec(sandbox, "git rev-parse HEAD");
          const response = "<plan>{\"issues\":[]}</plan>\n<promise>COMPLETE</promise>";
          const stream = [
            { type: "thread.started", thread_id: "smoke-parent" },
            {
              type: "item.completed",
              item: { type: "agent_message", text: response },
            },
          ];
          const program = `process.stdin.resume(); process.stdin.on("end", () => {
          for (const event of ${JSON.stringify(stream)}) console.log(JSON.stringify(event));
        });`;
          const probe = withCachePreflight({
            ...codex("smoke-no-model", { captureSessions: false }),
            buildPrintCommand: ({ prompt }: { prompt: string }) => ({ command: `node -e ${shellQuote(program)}`, stdin: prompt }),
          });
          await mkdir(join(cwd, ".sandcastle", "logs"), { recursive: true });
          for (const stage of ["plan", "implement", "merge"]) {
            const result = await sandbox.run({
              agent: probe,
              name: `Smoke ${stage}`,
              promptFile: join(cwd, ".sandcastle", `${stage}-prompt.md`),
              promptArgs: {
                ...invocationArgs(branch),
                ISSUE_NUMBER: "42",
                BRANCH: branch,
                BASE_SHA: baseSha,
                BRANCHES: `- ${branch}: ${baseSha}`,
                ISSUES: "- #42",
                IMPLEMENTERS: implementerCatalog(roles),
                IMPLEMENTER: "implementer_standard",
                SELECTION_REASON: "Smoke fixture",
              },
              signal,
              logging: {
                type: "file",
                path: join(cwd, ".sandcastle", "logs", `smoke-${stage}.log`),
              },
            });
            if (result.completionSignal !== complete)
              throw new Error(`${stage} 的 SDK prompt 接线检查未完成。`);
            if (stage === "plan")
              parsePlan(result.stdout);
          }
        }
        finally {
          await sandbox.close();
        }
      }), signal);
    }
    finally {
      await worktree.close();
    }
    await command("git", ["branch", "-d", branch], cwd);
  }
  finally {
    await agentConfig.close();
  }
}

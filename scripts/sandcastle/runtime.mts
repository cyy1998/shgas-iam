import type { Sandbox } from "@ai-hero/sandcastle";
import type { CodexAuth } from "./auth.ts";
import type { Ticket } from "./workflow.ts";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { codex, createSandbox, createWorktree, run } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { implementerCatalog, loadAgentRoles } from "./agents.ts";
import { prepareCodexAuth } from "./auth.ts";
import { codexConfigProbe, configuredCodex, prepareAgentConfig, shellQuote } from "./codex-provider.mts";
import { command } from "./commands.ts";
import { withTestResources } from "./resources.ts";
import { createReviewEvidence } from "./review.ts";
import { parsePlan } from "./workflow.ts";

export const githubRepo = "cyy1998/shgas-iam";
const complete = "<promise>COMPLETE</promise>";
const install = "HUSKY=0 pnpm install --frozen-lockfile";
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
  const agent = configuredCodex(model, roles);
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
        sandbox: docker({ imageName: image, env: { ...githubCredentials, ...auth.env }, mounts }),
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
      return withTestResources(cwd, async ({ network, env }) => {
        signal.throwIfAborted();
        const worktree = await createWorktree({
          cwd,
          branchStrategy: { type: "branch", branch: ticket.branch, baseBranch: baseSha },
        });
        let sandbox: Sandbox | undefined;
        try {
          sandbox = await worktree.createSandbox({
            sandbox: docker({
              imageName: image,
              network,
              env: { ...githubCredentials, ...auth.env, ...env },
              mounts,
            }),
          });
          signal.throwIfAborted();
          await checkedExec(sandbox, "git config --global --add safe.directory \"$PWD\"");
          await checkedExec(sandbox, install, signal);
          const promptArgs = {
            ...common,
            ISSUE_NUMBER: String(ticket.number),
            BRANCH: ticket.branch,
            BASE_SHA: baseSha,
            IMPLEMENTER: role.name,
            SELECTION_REASON: ticket.reason,
          };
          const evidence = createReviewEvidence();
          await mkdir(join(cwd, ".sandcastle", "logs"), { recursive: true });
          const implemented = await sandbox.run({
            agent: configuredCodex(model, roles, role),
            name: `Implementer #${ticket.number}`,
            promptFile: promptFile("implement"),
            promptArgs,
            maxIterations: 1,
            signal,
            logging: {
              type: "file",
              path: join(cwd, ".sandcastle", "logs", `issue-${ticket.number}-${Date.now()}.log`),
              verbose: true,
              onAgentStreamEvent: (event) => {
                if (event.type === "raw")
                  evidence.observe(event.line);
              },
            },
          });
          if (implemented.completionSignal !== complete)
            throw new Error(`#${ticket.number} 未报告实现完成；保留分支，下轮可恢复。`);
          await checkedExec(sandbox, `git merge-base --is-ancestor ${baseSha} HEAD`);
          await checkedExec(sandbox, "pnpm verify:static && git diff --check", signal);
          if (await checkedExec(sandbox, "git branch --show-current") !== ticket.branch)
            throw new Error(`#${ticket.number} 评审后分支不匹配。`);
          await checkedExec(sandbox, `git merge-base --is-ancestor ${baseSha} HEAD`);
          if (await checkedExec(sandbox, "git status --porcelain"))
            throw new Error(`#${ticket.number} 仍有未提交改动；保留 worktree。`);
          const candidate = await checkedExec(sandbox, "git rev-parse HEAD");
          evidence.assertPassed(baseSha, candidate);
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
      }, signal);
    },

    async finish(): Promise<void> {
      await this.merge([]);
    },

    async merge(tickets: Ticket[]): Promise<void> {
      await assertTarget();
      if (await git("rev-parse", "HEAD") !== baseSha)
        throw new Error("并行实施期间目标 HEAD 发生变化；停止自动合并。");
      await withTestResources(cwd, async ({ network, env }) => {
        signal.throwIfAborted();
        const dependencyMounts = await mergerDependencyMounts(cwd);
        const result = await run({
          cwd,
          branchStrategy: { type: "head" },
          sandbox: docker({
            imageName: image,
            network,
            env: { ...githubCredentials, ...auth.env, ...env },
            mounts: [...dependencyMounts, ...mounts],
          }),
          agent,
          promptFile: promptFile("merge"),
          promptArgs: {
            ...common,
            BASE_SHA: baseSha,
            BRANCHES: tickets.map(ticket => `- ${ticket.branch}: ${candidates.get(ticket.number)}`).join("\n"),
            ISSUES: tickets.map(ticket => `- #${ticket.number}`).join("\n"),
          },
          hooks: { sandbox: { onSandboxReady: [{ command: install }] } },
          maxIterations: 1,
          name: "Merger",
          signal,
        });
        if (result.completionSignal !== complete)
          throw new Error("Merger 未报告完成；保留合并现场和 issue 实际状态。");
      }, signal);
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
    },
  };
}

export async function smoke(options: Pick<RuntimeOptions, "cwd" | "image" | "signal">): Promise<void> {
  const { cwd, image, signal } = options;
  const roles = await loadAgentRoles(cwd);
  const agentConfig = await prepareAgentConfig(roles);
  const branch = `codex/sandcastle/smoke-${Date.now()}`;
  try {
    await withTestResources(cwd, async ({ network, env }) => {
      const mounts = await mergerDependencyMounts(cwd);
      const sandbox = await createSandbox({
        cwd,
        branch,
        sandbox: docker({
          imageName: image,
          network,
          mounts: [...mounts, ...agentConfig.mounts],
          env: { ...env, PATH: "/tmp/iam-afk-smoke-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" },
        }),
      });
      try {
        await checkedExec(sandbox, "git config --global --add safe.directory \"$PWD\"");
        console.log(await checkedExec(sandbox, "node --version && pnpm --version && bun --version && codex --version && gh --version"
        + " && git status --short && test -f .agents/skills/implement/SKILL.md"
        + " && pg_isready -h postgres -U iam_afk -d iam_afk && redis-cli -h redis ping"));
        console.log(await checkedExec(sandbox, `node -e ${shellQuote(codexConfigProbe(roles))}`, signal));
        // Exercise the real SDK's prompt preprocessing without GitHub traffic or model calls.
        await checkedExec(sandbox, "mkdir -p /tmp/iam-afk-smoke-bin"
        + " && printf '%s\\n' '#!/bin/sh' 'printf \"[]\\n\"' > /tmp/iam-afk-smoke-bin/gh"
        + " && chmod +x /tmp/iam-afk-smoke-bin/gh");
        const baseSha = await checkedExec(sandbox, "git rev-parse HEAD");
        const response = "<plan>{\"issues\":[]}</plan>\n<promise>COMPLETE</promise>";
        const stream = [
          { type: "thread.started", thread_id: "smoke-parent" },
          ...["standards", "spec"].flatMap(axis => [
            { type: "item.completed", item: {
              type: "collab_tool_call",
              tool: "spawn_agent",
              status: "completed",
              sender_thread_id: "smoke-parent",
              receiver_thread_ids: [axis],
              agents_states: { [axis]: { status: "running", message: null } },
            } },
            { type: "item.completed", item: {
              type: "collab_tool_call",
              tool: "wait",
              status: "completed",
              sender_thread_id: "smoke-parent",
              receiver_thread_ids: [axis],
              agents_states: { [axis]: {
                status: "completed",
                message: `<axis-review>${JSON.stringify({ axis, round: 1, baseSha, candidateSha: baseSha, status: "pass", findings: [] })}</axis-review>`,
              } },
            } },
          ]),
          {
            type: "item.completed",
            item: { type: "agent_message", text: response },
          },
        ];
        const program = `process.stdin.resume(); process.stdin.on("end", () => {
        for (const event of ${JSON.stringify(stream)}) console.log(JSON.stringify(event));
      });`;
        const probe = {
          ...codex("smoke-no-model", { captureSessions: false }),
          buildPrintCommand: ({ prompt }: { prompt: string }) => ({ command: `node -e ${shellQuote(program)}`, stdin: prompt }),
        };
        await mkdir(join(cwd, ".sandcastle", "logs"), { recursive: true });
        for (const stage of ["plan", "implement", "merge"]) {
          const evidence = createReviewEvidence();
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
              onAgentStreamEvent: (event) => {
                if (event.type === "raw")
                  evidence.observe(event.line);
              },
            },
          });
          if (result.completionSignal !== complete)
            throw new Error(`${stage} 的 SDK prompt 接线检查未完成。`);
          if (stage === "plan")
            parsePlan(result.stdout);
          if (stage === "implement")
            evidence.assertPassed(baseSha, baseSha);
        }
      }
      finally {
        await sandbox.close();
      }
    }, signal);
    await command("git", ["branch", "-d", branch], cwd);
  }
  finally {
    await agentConfig.close();
  }
}

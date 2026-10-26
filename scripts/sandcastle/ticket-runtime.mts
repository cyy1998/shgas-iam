import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentProvider, type RunOptions, type RunResult, run } from "@ai-hero/sandcastle";
import type { DockerOptions } from "@ai-hero/sandcastle/sandboxes/docker";
import type { AgentRole, loadAgentRoles } from "./agents.ts";
import type { CodexAuth } from "./auth.ts";
import { configuredCodex } from "./codex-provider.mts";
import { command } from "./commands.ts";
import { githubRepo } from "./github.ts";
import { ExecutorInfrastructureError, hasUnstoppedExecutor, withExecutorResources } from "./resources.ts";
import { dockerSandbox, withDockerPreflight, withFrontendMounts, withWorkspacePreparation } from "./sandbox.mts";
import type { TicketRun } from "./tickets.ts";
import { dependencyVolumeTargets } from "./workspace-dependencies.mts";

export { ExecutorInfrastructureError } from "./resources.ts";

export async function assertTicketIssuesOpen(
  cwd: string,
  numbers: number[],
  runGh: (args: string[]) => Promise<string> = (args) => command("gh", args, cwd),
): Promise<void> {
  let states: string[];
  try {
    states = await Promise.all(
      numbers.map((number) =>
        runGh(["issue", "view", String(number), "--repo", githubRepo, "--json", "state", "--jq", ".state"]),
      ),
    );
  } catch (cause) {
    throw new ExecutorInfrastructureError("GitHub issue 状态查询失败；停止本次运行并保留现场。", { cause });
  }
  if (states.some((state) => state !== "OPEN"))
    throw new Error("票级执行期间 issue 已关闭；保留现场并核对交接，不能报告已集成。");
}

export type WorkspaceAgentInput = {
  worktreePath: string;
  role?: AgentRole;
  name: string;
  promptFile: string;
  promptArgs: Record<string, string>;
};

/** External model/SDK and GitHub boundaries; checkout and lifecycle decisions stay in the runner. */
export type ExecutorDependencies = {
  agent?: (input: WorkspaceAgentInput) => AgentProvider;
  run?: (input: RunOptions) => Promise<Pick<RunResult, "stdout" | "completionSignal">>;
  runGh?: (args: string[]) => Promise<string>;
};

export type ExecutorOptions = ExecutorDependencies & {
  cwd: string;
  model: string;
  image: string;
  signal: AbortSignal;
  roles: Awaited<ReturnType<typeof loadAgentRoles>>;
  auth: CodexAuth;
  mounts: NonNullable<DockerOptions["mounts"]>;
  githubCredentials: Record<string, string>;
  onUnsafeClose: () => void;
  canClose: () => boolean;
};

export function createWorkspaceExecutor(options: ExecutorOptions) {
  return async (input: WorkspaceAgentInput & { logName: string }) => {
    const { cwd, image, signal, roles, auth } = options;
    if (!options.canClose()) throw new ExecutorInfrastructureError("创建者尚未确认停止，禁止启动后续执行器。");
    let executionFailure: unknown;
    let sandboxCreated = false;
    try {
      const anonymousVolumes = await dependencyVolumeTargets(input.worktreePath);
      return await withFrontendMounts(
        (generatedMounts) =>
          withExecutorResources(
            { cwd, image, signal, anonymousVolumes, onUnsafeClose: options.onUnsafeClose },
            async (resources) => {
              await mkdir(join(cwd, ".sandcastle", "logs"), { recursive: true });
              try {
                // Bind the inspected checkout without SDK branch reuse or managed-directory pruning.
                const sandbox = dockerSandbox({
                  ...resources,
                  imageName: image,
                  anonymousVolumes,
                  env: { ...options.githubCredentials, ...auth.env, ...resources.env },
                  mounts: [...options.mounts, ...generatedMounts, ...resources.mounts],
                });
                const result = await (options.run ?? run)({
                  cwd: input.worktreePath,
                  branchStrategy: { type: "head" },
                  sandbox: {
                    ...sandbox,
                    create: async (input) => {
                      const handle = await sandbox.create(input);
                      sandboxCreated = true;
                      return handle;
                    },
                  },
                  agent: withDockerPreflight(
                    withWorkspacePreparation(
                      options.agent?.(input) ?? configuredCodex(options.model, roles, input.role),
                    ),
                  ),
                  name: input.name,
                  promptFile: input.promptFile,
                  promptArgs: input.promptArgs,
                  maxIterations: 1,
                  signal,
                  logging: {
                    type: "file",
                    path: join(cwd, ".sandcastle", "logs", `${input.logName}-${Date.now()}.log`),
                    verbose: true,
                  },
                });
                return {
                  completed: result.completionSignal === "<promise>COMPLETE</promise>",
                  handoff: result.stdout.replaceAll("<promise>COMPLETE</promise>", "").trim(),
                };
              } catch (error) {
                executionFailure = error;
                throw error;
              }
            },
          ),
        options.canClose,
      );
    } catch (error) {
      if (hasUnstoppedExecutor(error) || signal.aborted || (sandboxCreated && error === executionFailure)) throw error;
      throw new ExecutorInfrastructureError("执行器初始化或资源收尾失败；停止本次运行并保留准确恢复记录。", {
        cause: error,
      });
    }
  };
}

export function createTicketExecutor(options: ExecutorOptions): TicketRun {
  const execute = createWorkspaceExecutor(options);
  return async ({ phase, context, integrationSha }) => {
    const role = options.roles[context.ticket.implementer];
    const result = await execute({
      worktreePath: context.worktreePath,
      role,
      name: `${phase === "implement" ? "Implementer" : "Ticket acceptance"} #${context.ticket.number}`,
      promptFile: join(
        options.cwd,
        ".sandcastle",
        `${phase === "implement" ? "implement" : "ticket-accept"}-prompt.md`,
      ),
      promptArgs: {
        REPO: githubRepo,
        INVOCATION_BRANCH: context.spec.invocationBranch,
        SPEC_NUMBER: String(context.spec.graph.spec.number),
        INTEGRATION_BRANCH: context.spec.branch,
        INTEGRATION_SHA: integrationSha,
        ISSUE_NUMBER: String(context.ticket.number),
        BRANCH: context.ticket.branch,
        BASE_SHA: context.baseSha,
        CANDIDATE_SHA: context.candidate ?? "not-yet-implemented",
        HANDOFF: context.handoff ?? "首次实施；读取父 Spec 和 ticket 的实际正文及评论。",
        IMPLEMENTER: role.name,
        SELECTION_REASON: context.ticket.reason,
      },
      logName: `issue-${context.ticket.number}-${phase}`,
    });
    await assertTicketIssuesOpen(options.cwd, [context.ticket.number, context.spec.graph.spec.number], options.runGh);
    return result;
  };
}

export async function recordTicketHandoff(
  cwd: string,
  number: number,
  body: string,
  runGh: (args: string[]) => Promise<string> = (args) => command("gh", args, cwd),
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "iam-afk-handoff-"));
  try {
    const path = join(directory, "comment.md");
    await writeFile(path, body, "utf8");
    try {
      await runGh(["issue", "comment", String(number), "--repo", githubRepo, "--body-file", path]);
    } catch (cause) {
      throw new ExecutorInfrastructureError("GitHub 交接写入失败；停止本次运行并保留 Git 与日志。", { cause });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

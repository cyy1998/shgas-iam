import "../require-linux.mjs";
import { closeSync } from "node:fs";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { formatResourceFailure } from "../test-resources/managed-resources.mjs";
import { loadAgentRoles } from "./agents.ts";
import { checkCodexAuth } from "./auth.ts";
import { command } from "./commands.ts";
import { checkDockerConfig } from "./docker-config.ts";
import { smokeDocker } from "./docker-smoke.mts";
import { githubRepo, resolveGitRemote } from "./github.ts";
import { connectGitHubProject } from "./projects.ts";
import { hasUnstoppedExecutor, recoverExecutorResources } from "./resources.ts";
import { createRuntime, smoke } from "./runtime.mts";
import { runWorkflow, workflowLimits } from "./workflow.ts";

const cwd = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const projectToken = process.env.SANDCASTLE_PROJECT_TOKEN?.trim();
try {
  process.loadEnvFile(join(cwd, ".sandcastle", ".env"));
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
}
// Only accept a Project token from the host, outside the checkout mounted by the runner.
delete process.env.SANDCASTLE_PROJECT_TOKEN;

const { values } = parseArgs({
  options: {
    help: { type: "boolean" },
    check: { type: "boolean" },
    smoke: { type: "boolean" },
    "smoke-docker": { type: "boolean" },
    "smoke-workflow": { type: "boolean" },
    build: { type: "boolean" },
    "recover-executor": { type: "string" },
    model: { type: "string" },
    iterations: { type: "string" },
    parallel: { type: "string" },
    draft: { type: "boolean" },
  },
});

// The pinned SDK patch lets this runner await cancellation and resource cleanup.
process.env.SANDCASTLE_HOST_HANDLES_SIGNALS = "1";

async function main() {
  if (values.help) {
    console.log("用法：pnpm sandcastle [--iterations 1] [--parallel 4] [--model <model>] [--draft]");
    console.log("--iterations 本次最多尝试的 Spec 数量（含恢复）；--parallel 同一 Spec 内最多并行实施的 ticket 数量。");
    console.log("--draft 创建 Draft PR（默认创建 Ready for Review PR，也可由 SANDCASTLE_PR_DRAFT=true 控制）。");
    console.log("--check 预检；--build 构建镜像；--smoke 检查临时 sandbox 与测试资源，不调用模型。");
    console.log("--smoke-docker 只验证共享宿主 Docker、host networking、构建、浏览器、导出与并行清理。");
    console.log(
      "--smoke-workflow 仅在宿主运行全部 4 个受控工作流场景（complete/conflict/interrupt/pr-interrupt），跳过 Docker。",
    );
    console.log("--model 覆盖 Planner 与最终评审协调者；实施者与独立评审模型读取 .codex/agents/ 的角色配置。");
    console.log(
      "--recover-executor <repository-relative executor.json> 停止准确 sandbox 后按 registry 恢复，尊重 keep。",
    );
    console.log(
      "运行模式读取全仓 ready-for-agent Spec，逐票集成后进入整个 Spec 的最终验收；推送 Spec 分支并创建 PR，不改动本地启动分支。",
    );
    console.log("设置 SANDCASTLE_PROJECT_URL 可将任务进度同步到 GitHub Projects 的 Status 列。");
    return;
  }
  const actions = [
    values.check,
    values.build,
    values.smoke,
    values["smoke-docker"],
    values["smoke-workflow"],
    values["recover-executor"],
  ].filter(Boolean);
  if (actions.length > 1)
    throw new Error("--check、--build、--smoke、--smoke-docker、--smoke-workflow 每次只选择一个。");
  if (values["recover-executor"]) {
    await recoverExecutorResources(cwd, values["recover-executor"]);
    return;
  }
  if (values["smoke-workflow"]) {
    const { controlledWorkflowJourney, verifyWorkspaceRemountBehavior } = await import("./workflow-smoke.mts");
    await verifyWorkspaceRemountBehavior(cwd);
    console.log("宿主受控工作流 [workspace-remount] 通过。");
    for (const scenario of ["complete", "conflict", "interrupt", "pr-interrupt"] as const) {
      const report = await controlledWorkflowJourney({ sourceCwd: cwd, mode: "host", scenario });
      console.log(
        `宿主受控工作流 [${scenario}] 通过 (${report.elapsedMs}ms)：PR #${report.pr.number} (${report.pr.headRefName})。`,
      );
    }
    return;
  }
  const model = values.model ?? process.env.SANDCASTLE_MODEL ?? "gpt-6-astra";
  const draft = values.draft ?? /^(?:1|true)$/i.test(process.env.SANDCASTLE_PR_DRAFT?.trim() ?? "");
  const projectUrl = process.env.SANDCASTLE_PROJECT_URL?.trim();
  const image = process.env.SANDCASTLE_IMAGE ?? "iam-sandcastle:local";
  const { maxSpecs, maxParallel } = workflowLimits({
    maxSpecs: Number(values.iterations ?? process.env.SANDCASTLE_ITERATIONS ?? "1"),
    maxParallel: Number(values.parallel ?? process.env.SANDCASTLE_PARALLEL ?? "4"),
  });
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("宿主 runner 需要 Node.js 24。");
  await command("docker", ["info", "--format", "{{.ServerVersion}}"], cwd);
  if (values.build) {
    console.log(`正在构建 ${image}，Docker 构建输出保存在 .sandcastle/logs/build.log。`);
    const { spawn } = await import("node:child_process");
    const { createWriteStream } = await import("node:fs");
    await mkdir(join(cwd, ".sandcastle", "logs"), { recursive: true });
    const log = createWriteStream(join(cwd, ".sandcastle", "logs", "build.log"));
    const code = await new Promise<number | null>((resolveCode, reject) => {
      const child = spawn("docker", ["build", "-t", image, "-f", ".sandcastle/Dockerfile", ".sandcastle"], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.pipe(log, { end: false });
      child.stderr.pipe(log, { end: false });
      child.once("error", reject);
      child.once("close", resolveCode);
    }).finally(() => log.end());
    if (code !== 0) throw new Error(`镜像构建失败 (${code})；查看 .sandcastle/logs/build.log。`);
    console.log(`镜像 ${image} 已构建。`);
    return;
  }
  await command("docker", ["image", "inspect", image, "--format", "{{.Id}}"], cwd);
  const dockerConfigProvided = await checkDockerConfig(cwd);
  const branch = await command("git", ["branch", "--show-current"], cwd);
  if (!branch) throw new Error("需要一个已检出的命名分支。");
  if (!/^[\w./-]+$/.test(branch)) throw new Error("AFK 目标分支名只接受字母、数字、下划线、点、斜杠和连字符。");
  let authMode = "未检查";
  let remote: string | undefined;
  if (!values.smoke && !values["smoke-docker"]) {
    await command("gh", ["--version"], cwd);
    if (!process.env.GH_TOKEN?.trim())
      throw new Error("缺少 GH_TOKEN；按 .sandcastle/.env.example 配置本机 .sandcastle/.env。");
    authMode = await checkCodexAuth();
    if (await command("git", ["status", "--porcelain"], cwd))
      throw new Error("启动 AFK 前请提交或另行保存当前改动；runner 需要干净的目标工作区。");
    remote = await resolveGitRemote(cwd, branch, process.env.SANDCASTLE_GIT_REMOTE);
  }
  if (values.check) {
    await loadAgentRoles(cwd);
    let remoteOutput: string;
    try {
      remoteOutput = await command("git", ["ls-remote", "--exit-code", remote!, `refs/heads/${branch}`], cwd);
    } catch (cause) {
      throw new Error(
        `远端 ${remote} 不存在目标分支 ${branch} 或无法访问；请切回远端存在的 PR 目标分支（如 main）并核对 Git 凭据。`,
        { cause },
      );
    }
    const remoteSha = remoteOutput.split(/\s+/)[0]?.trim();
    const localSha = await command("git", ["rev-parse", "HEAD"], cwd);
    await command("gh", ["pr", "list", "--repo", githubRepo, "--limit", "1", "--json", "number"], cwd);
    if (projectUrl) {
      await connectGitHubProject({ url: projectUrl, token: projectToken, cwd });
      console.log(`GitHub Project 与 Status 列预检通过：${projectUrl}`);
    }
    if (remoteSha && remoteSha !== localSha) {
      console.warn(
        `注意：本地分支 ${branch} (${localSha.slice(0, 12)}) 与远端 ${remote}/${branch} (${remoteSha.slice(0, 12)}) 尚未对齐；正式运行 pnpm sandcastle 前请先同步。`,
      );
    }
    console.log(
      `本机预检通过：目标分支 ${branch}（remote ${remote}，PR 模式：${draft ? "Draft" : "Ready for Review"}），镜像 ${image}，模型 ${model}，Codex 认证 ${authMode}，Docker registry 配置${dockerConfigProvided ? "已提供" : "未提供"}。`,
    );
    return;
  }

  const lockPath = join(cwd, ".sandcastle", "run.lock");
  let lock: Awaited<ReturnType<typeof open>>;
  try {
    lock = await open(lockPath, "wx");
  } catch {
    const owner = await readFile(lockPath, "utf8").catch(() => "无法读取持有者");
    throw new Error(`已有 runner 锁：${owner}。确认旧进程已结束后，仅移除 ${lockPath} 再重试。`);
  }
  const controller = new AbortController();
  let retainLock = false;
  // Keep a fallback if another integration exits synchronously before our finalizer.
  const releaseLockOnExit = () => {
    try {
      closeSync(lock.fd);
    } catch {
      /* The normal finalizer may already have closed the handle. */
    }
    // A synchronous exit cannot prove Docker creators stopped or clean their records.
    // The lock remains a recovery pointer; the normal finalizer removes it explicitly.
  };
  process.once("exit", releaseLockOnExit);
  const abort = () => controller.abort(new Error("用户中断 Sandcastle；正在等待已启动任务清理。"));
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, branch, startedAt: new Date().toISOString() }));
    const options = { cwd, branch, remote, draft, model, image, signal: controller.signal };
    if (values["smoke-docker"]) {
      await smokeDocker(options);
    } else if (values.smoke) {
      await smokeDocker(options);
      await smoke(options);
      console.log("Sandbox、skills、共享 Docker 与每命令独立资源 smoke 通过；未调用模型或修改 issues。");
    } else {
      console.log(
        `Sandcastle：${branch}（remote ${remote}，PR 模式：${draft ? "Draft" : "Ready for Review"}），最多尝试 ${maxSpecs} 个 Spec，并行实施 ${maxParallel} 张 ticket，${model}。`,
      );
      const reportProjectStage = projectUrl
        ? await connectGitHubProject({ url: projectUrl, token: projectToken, cwd }).catch((error: unknown) => {
            console.warn(
              `Sandcastle 本次无法连接 GitHub Project。${error instanceof Error ? error.message : String(error)}`,
            );
            return undefined;
          })
        : undefined;
      if (reportProjectStage) console.log(`GitHub Project：${projectUrl}`);
      const runtime = await createRuntime({ ...options, reportProjectStage });
      const failures: unknown[] = [];
      try {
        const result = await runWorkflow({ maxSpecs, maxParallel }, runtime);
        console.log(JSON.stringify(result, null, 2));
        if (
          result.incompleteSpecs.length > 0 ||
          result.failed.length > 0 ||
          result.attemptedSpecs.some((number) => !result.delivered.includes(number))
        )
          process.exitCode = 1;
      } catch (error) {
        failures.push(error);
      } finally {
        try {
          await runtime.close?.();
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length) throw new AggregateError(failures, "Sandcastle 运行或收尾失败。");
    }
  } catch (error) {
    retainLock = hasUnstoppedExecutor(error);
    throw error;
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
    await lock.close();
    if (!retainLock) await rm(lockPath);
    process.removeListener("exit", releaseLockOnExit);
  }
}

main().catch((error: unknown) => {
  console.error(formatResourceFailure(error));
  process.exitCode = 1;
});

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
import { hasUnstoppedExecutor, recoverExecutorResources } from "./resources.ts";
import { createRuntime, smoke } from "./runtime.mts";
import { runWorkflow, workflowLimits } from "./workflow.ts";

const cwd = resolve(fileURLToPath(new URL("../..", import.meta.url)));
try {
  process.loadEnvFile(join(cwd, ".sandcastle", ".env"));
} catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
}

const { values } = parseArgs({
  options: {
    help: { type: "boolean" },
    check: { type: "boolean" },
    smoke: { type: "boolean" },
    "smoke-docker": { type: "boolean" },
    build: { type: "boolean" },
    "recover-executor": { type: "string" },
    model: { type: "string" },
    iterations: { type: "string" },
    parallel: { type: "string" },
  },
});

// The pinned SDK patch lets this runner await cancellation and resource cleanup.
process.env.SANDCASTLE_HOST_HANDLES_SIGNALS = "1";

async function main() {
  if (values.help) {
    console.log("用法：pnpm sandcastle [--iterations 1] [--parallel 4] [--model <model>]");
    console.log("--iterations 本次最多尝试的 Spec 数量（含恢复）；--parallel 同一 Spec 内最多并行实施的 ticket 数量。");
    console.log("--check 预检；--build 构建镜像；--smoke 检查临时 sandbox 与测试资源，不调用模型。");
    console.log("--smoke-docker 只验证共享宿主 Docker、host networking、构建、浏览器、导出与并行清理。");
    console.log("--model 覆盖 Planner 与最终评审协调者；实施者与独立评审模型读取 .codex/agents/ 的角色配置。");
    console.log(
      "--recover-executor <repository-relative executor.json> 停止准确 sandbox 后按 registry 恢复，尊重 keep。",
    );
    console.log(
      "运行模式读取全仓 ready-for-agent Spec，逐票集成后进入整个 Spec 的最终验收；本地交付后更新 GitHub issues。",
    );
    return;
  }
  const actions = [values.check, values.build, values.smoke, values["smoke-docker"], values["recover-executor"]].filter(
    Boolean,
  );
  if (actions.length > 1) throw new Error("--check、--build、--smoke、--smoke-docker 每次只选择一个。");
  if (values["recover-executor"]) {
    await recoverExecutorResources(cwd, values["recover-executor"]);
    return;
  }
  const model = values.model ?? process.env.SANDCASTLE_MODEL ?? "gpt-6-astra";
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
        windowsHide: true,
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
  if (!values.smoke && !values["smoke-docker"]) {
    await command("gh", ["--version"], cwd);
    if (!process.env.GH_TOKEN?.trim())
      throw new Error("缺少 GH_TOKEN；按 .sandcastle/.env.example 配置本机 .sandcastle/.env。");
    authMode = await checkCodexAuth();
    if (await command("git", ["status", "--porcelain"], cwd))
      throw new Error("启动 AFK 前请提交或另行保存当前改动；runner 需要干净的目标工作区。");
  }
  if (values.check) {
    await loadAgentRoles(cwd);
    console.log(
      `本机预检通过：分支 ${branch}，镜像 ${image}，模型 ${model}，Codex 认证 ${authMode}，Docker registry 配置${dockerConfigProvided ? "已提供" : "未提供"}。联网认证待实际调用验证。`,
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
    const options = { cwd, branch, model, image, signal: controller.signal };
    if (values["smoke-docker"]) {
      await smokeDocker(options);
    } else if (values.smoke) {
      await smokeDocker(options);
      await smoke(options);
      console.log("Sandbox、skills、共享 Docker 与每命令独立资源 smoke 通过；未调用模型或修改 issues。");
    } else {
      console.log(`Sandcastle：${branch}，最多尝试 ${maxSpecs} 个 Spec，并行实施 ${maxParallel} 张 ticket，${model}。`);
      const runtime = await createRuntime(options);
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

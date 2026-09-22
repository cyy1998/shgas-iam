import { closeSync, unlinkSync } from "node:fs";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadAgentRoles } from "./agents.ts";
import { checkCodexAuth } from "./auth.ts";
import { command } from "./commands.ts";
import { createRuntime, smoke } from "./runtime.mts";
import { runWorkflow } from "./workflow.ts";

const cwd = resolve(fileURLToPath(new URL("../..", import.meta.url)));
try {
  process.loadEnvFile(join(cwd, ".sandcastle", ".env"));
}
catch (error) {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT")
    throw error;
}

const { values } = parseArgs({
  options: {
    help: { type: "boolean" },
    check: { type: "boolean" },
    smoke: { type: "boolean" },
    build: { type: "boolean" },
    model: { type: "string" },
    iterations: { type: "string" },
    parallel: { type: "string" },
  },
});

// The pinned SDK patch lets this runner await cancellation and resource cleanup.
process.env.SANDCASTLE_HOST_HANDLES_SIGNALS = "1";

async function main() {
  if (values.help) {
    console.log("用法：pnpm sandcastle [--iterations 10] [--parallel 2] [--model <model>]");
    console.log("--check 预检；--build 构建镜像；--smoke 检查临时 sandbox 与测试资源，不调用模型。");
    console.log("--model 仅覆盖 Planner/Merger；实施者与评审模型读取 .codex/agents/ 的角色配置。");
    console.log("运行模式读取全仓 ready-for-agent，在当前分支自动合并通过评审的 tickets 并更新 GitHub issues。");
    return;
  }
  const actions = [values.check, values.build, values.smoke].filter(Boolean);
  if (actions.length > 1)
    throw new Error("--check、--build、--smoke 每次只选择一个。");
  const model = values.model ?? process.env.SANDCASTLE_MODEL ?? "gpt-6-astra";
  const image = process.env.SANDCASTLE_IMAGE ?? "iam-sandcastle:local";
  const maxIterations = Number(values.iterations ?? process.env.SANDCASTLE_ITERATIONS ?? "10");
  const maxParallel = Number(values.parallel ?? process.env.SANDCASTLE_PARALLEL ?? "2");
  if (![maxIterations, maxParallel].every(value => Number.isSafeInteger(value) && value > 0))
    throw new Error("iterations 与 parallel 必须为正整数。");
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw new Error("宿主 runner 需要 Node.js 24。");
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
    if (code !== 0)
      throw new Error(`镜像构建失败 (${code})；查看 .sandcastle/logs/build.log。`);
    console.log(`镜像 ${image} 已构建。`);
    return;
  }
  await command("docker", ["image", "inspect", image, "--format", "{{.Id}}"], cwd);
  const branch = await command("git", ["branch", "--show-current"], cwd);
  if (!branch)
    throw new Error("需要一个已检出的命名分支。");
  if (!/^[\w./-]+$/.test(branch))
    throw new Error("AFK 目标分支名只接受字母、数字、下划线、点、斜杠和连字符。");
  let authMode = "未检查";
  if (!values.smoke) {
    await command("gh", ["--version"], cwd);
    if (!process.env.GH_TOKEN?.trim())
      throw new Error("缺少 GH_TOKEN；按 .sandcastle/.env.example 配置本机 .sandcastle/.env。");
    authMode = await checkCodexAuth();
    if (await command("git", ["status", "--porcelain"], cwd))
      throw new Error("启动 AFK 前请提交或另行保存当前改动；runner 需要干净的目标工作区。");
  }
  if (values.check) {
    await loadAgentRoles(cwd);
    console.log(`本机预检通过：分支 ${branch}，镜像 ${image}，模型 ${model}，Codex 认证 ${authMode}。联网认证待实际调用验证。`);
    return;
  }

  const lockPath = join(cwd, ".sandcastle", "run.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx");
  }
  catch {
    const owner = await readFile(lockPath, "utf8").catch(() => "无法读取持有者");
    throw new Error(`已有 runner 锁：${owner}。确认旧进程已结束后，仅移除 ${lockPath} 再重试。`);
  }
  const controller = new AbortController();
  // Keep a fallback if another integration exits synchronously before our finalizer.
  const releaseLockOnExit = () => {
    try {
      closeSync(lock.fd);
    }
    catch { /* The normal finalizer may already have closed the handle. */ }
    try {
      unlinkSync(lockPath);
    }
    catch { /* Keep the original process exit status. */ }
  };
  process.once("exit", releaseLockOnExit);
  const abort = () => controller.abort(new Error("用户中断 Sandcastle；正在等待已启动任务清理。"));
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, branch, startedAt: new Date().toISOString() }));
    const options = { cwd, branch, model, image, signal: controller.signal };
    if (values.smoke) {
      await smoke(options);
      console.log("Sandbox、skills 与独占 PostgreSQL/Redis 连接 smoke 通过；未调用模型或修改 issues。");
    }
    else {
      console.log(`Sandcastle：${branch}，最多 ${maxIterations} 批，并发 ${maxParallel}，${model}。`);
      const runtime = await createRuntime(options);
      try {
        const result = await runWorkflow({ maxIterations, maxParallel }, runtime);
        console.log(JSON.stringify(result, null, 2));
        if (!result.exhausted || result.failed.length > 0)
          process.exitCode = 1;
      }
      finally {
        await runtime.close?.();
      }
    }
  }
  finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
    await lock.close();
    await rm(lockPath);
    process.removeListener("exit", releaseLockOnExit);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

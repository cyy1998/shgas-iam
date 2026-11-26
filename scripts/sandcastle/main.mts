import "../require-linux.mjs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadRepoSandcastleConfig } from "../../.sandcastle/config.ts";
import { command, hasCode } from "./core/command.ts";
import { checkWorkflow, runWorkflow } from "./core/workflow.ts";
import { smoke } from "./smoke.mts";

const cwd = fileURLToPath(new URL("../..", import.meta.url));

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      check: { type: "boolean" },
      build: { type: "boolean" },
      smoke: { type: "boolean" },
      model: { type: "string" },
      iterations: { type: "string" },
      parallel: { type: "string" },
      draft: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(`用法：pnpm sandcastle [--iterations 1] [--parallel 4] [--model <model>] [--draft]
--check 检查宿主、凭据与调用分支；--build 构建沙箱镜像；--smoke 运行单容器 Docker 冒烟。
--iterations 最多尝试的 Spec 数；--parallel 同一 Spec 内最多并行实施的 ticket 数。
--model 覆盖 Planner 的模型；其他角色读取 .codex/agents/ 下的定义。
--draft 创建 Draft PR，也可设置 SANDCASTLE_PR_DRAFT=true。
默认运行处理 ready-for-agent Spec 并交付 PR，调用分支保持只读。`);
    return;
  }
  if ([values.check, values.build, values.smoke].filter(Boolean).length > 1) {
    throw new Error("--check、--build、--smoke 每次只选择一个。");
  }

  const { env } = process;
  const projectToken = env.SANDCASTLE_PROJECT_TOKEN;
  try {
    process.loadEnvFile(join(cwd, ".sandcastle", ".env"));
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
  delete env.SANDCASTLE_PROJECT_TOKEN;

  await command("docker", ["info", "--format", "{{.ServerVersion}}"], cwd);
  if (values.smoke) {
    await smoke(cwd);
    return;
  }

  const config = await loadRepoSandcastleConfig({ cwd, env, model: values.model, draft: values.draft, projectToken });
  const { image, dockerfile } = config.sandbox;
  if (values.build) {
    await new Promise<void>((resolve, reject) => {
      const build = spawn("docker", ["build", "-t", image, "-f", dockerfile, dirname(dockerfile)], {
        cwd,
        stdio: "inherit",
      });
      build.once("error", reject);
      build.once("close", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`Docker 镜像构建失败（${signal ?? code}）。`));
      });
    });
    return;
  }
  await command("docker", ["image", "inspect", image, "--format", "{{.Id}}"], cwd);
  if (!config.sandbox.env?.GH_TOKEN) throw new Error("缺少 GH_TOKEN，请检查 .sandcastle/.env。");
  const options = { cwd, config, remote: env.SANDCASTLE_GIT_REMOTE?.trim() || undefined };
  if (values.check) {
    console.log("Sandcastle 预检通过。", await checkWorkflow(options));
    return;
  }
  const result = await runWorkflow({
    ...options,
    maxSpecs: Number(values.iterations ?? env.SANDCASTLE_ITERATIONS ?? "1"),
    maxParallel: Number(values.parallel ?? env.SANDCASTLE_PARALLEL ?? "4"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed.length || result.incompleteSpecs.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

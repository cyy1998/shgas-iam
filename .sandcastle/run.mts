import "../scripts/require-linux.mjs";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv, promisify } from "node:util";
import type { BindMountSandboxProvider, MountConfig, SandboxHooks, SandboxProvider } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { type AfkOptions, checkAfk, runAfk } from "../scripts/sandcastle/core/index.ts";
import { checkCodexAuth, dockerRegistryAuthMount, loadCodexAgents, stageCodexAuth } from "./codex.ts";
import { smoke } from "./smoke.mts";
import { withTestResources } from "./test-resources.ts";

const exec = promisify(execFile);
const cwd = fileURLToPath(new URL("..", import.meta.url));
const repo = "cyy1998/shgas-iam";
const sandboxHome = "/home/agent";
const sandboxStore = `${sandboxHome}/.pnpm-store`;
const dockerSocket = "/var/run/docker.sock";
const writableHooks: SandboxHooks = {
  sandbox: {
    onSandboxReady: [
      {
        command:
          "sh .sandcastle/hooks/prepare-workspace.sh </dev/null && sh .sandcastle/hooks/enable-git-hooks.sh </dev/null",
        timeoutMs: 1_200_000,
      },
    ],
  },
};

function asBindMountSandbox(provider: SandboxProvider): BindMountSandboxProvider {
  if (
    "tag" in provider &&
    provider.tag === "bind-mount" &&
    "create" in provider &&
    typeof provider.create === "function"
  ) {
    return provider as BindMountSandboxProvider;
  }
  throw new Error(`Expected bind-mount sandbox provider, got "${provider.name}".`);
}

async function dockerSocketGid(): Promise<number> {
  const info = await stat(dockerSocket);
  if (!info.isSocket()) throw new Error(`Expected a Docker socket at ${dockerSocket}.`);
  return info.gid;
}

async function loadDotEnv(): Promise<void> {
  const envFile = await readFile(join(cwd, ".sandcastle", ".env"), "utf8").catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
    throw error;
  });
  for (const [key, value] of Object.entries(parseEnv(envFile))) {
    // Never import GitHub credentials from .sandcastle/.env into process.env; core preflightCredentials rejects them.
    if (!value || key === "GH_TOKEN" || key === "GITHUB_TOKEN") continue;
    process.env[key] ??= value;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean" },
      check: { type: "boolean" },
      build: { type: "boolean" },
      smoke: { type: "boolean" },
      iterations: { type: "string" },
      parallel: { type: "string" },
      draft: { type: "boolean" },
    },
  });

  if (values.help) {
    console.log(`用法：pnpm sandcastle [--iterations 1] [--parallel 4] [--draft]
--check 检查宿主、凭据、Docker 与 GitHub 访问；--build 构建沙箱镜像；--smoke 运行真实 Docker 沙箱冒烟。
--iterations 最多尝试的 Spec 数（默认 1）；--parallel 同一 Spec 内最多并行实施的 ticket 数（默认 4）。
--draft 创建 Draft PR，也可设置 SANDCASTLE_PR_DRAFT=true。
默认运行按编号最早的 ready-for-agent Spec 实施、双轴评审、修复验证并交付 PR，不改动本地当前分支。`);
    return;
  }
  if ([values.check, values.build, values.smoke].filter(Boolean).length > 1) {
    throw new Error("--check、--build、--smoke 每次只选择一个。");
  }

  await loadDotEnv();
  const { env } = process;
  const imageName = env.SANDCASTLE_IMAGE?.trim() || "iam-sandcastle:local";
  const remote = env.SANDCASTLE_GIT_REMOTE?.trim() || undefined;
  const baseBranch = env.SANDCASTLE_BASE_BRANCH?.trim() || undefined;

  await exec("docker", ["info", "--format", "{{.ServerVersion}}"], { cwd });
  if (values.build) {
    await new Promise<void>((resolveBuild, rejectBuild) => {
      const child = spawn("docker", ["build", "-t", imageName, "-f", ".sandcastle/Dockerfile", ".sandcastle"], {
        cwd,
        stdio: "inherit",
      });
      child.once("error", rejectBuild);
      child.once("close", (code, signal) => {
        if (code === 0) resolveBuild();
        else rejectBuild(new Error(`Docker 镜像构建失败（${signal ?? code}）。`));
      });
    });
    return;
  }
  if (values.smoke) {
    await smoke(cwd);
    return;
  }

  await exec("docker", ["image", "inspect", imageName, "--format", "{{.Id}}"], { cwd });
  await checkCodexAuth({ cwd, env });
  const dockerGid = await dockerSocketGid();
  const registryMount = await dockerRegistryAuthMount({ cwd, env });
  const agents = await loadCodexAgents({ cwd, env });

  if (values.check) {
    const checkResult = await checkAfk({ repo, cwd, remote, baseBranch });
    console.log("Sandcastle 预检通过。", checkResult);
    return;
  }

  const hostStore = resolve(cwd, env.SANDCASTLE_PNPM_STORE_DIR?.trim() || join(homedir(), ".pnpm-store"));
  await mkdir(hostStore, { recursive: true });

  const sandbox: AfkOptions["sandbox"] = async (ctx) => {
    const stagedAuth = await stageCodexAuth({ cwd, env });
    try {
      // In api-key mode, loadCodexAgents already injects CODEX_API_KEY on AgentProvider.env; avoid SDK env overlap.
      const authEnv = stagedAuth.mode === "chatgpt" ? stagedAuth.env : {};
      const mounts: MountConfig[] = [
        { hostPath: hostStore, sandboxPath: sandboxStore, readonly: ctx.readonly },
        ...(registryMount ? [registryMount] : []),
        ...stagedAuth.mounts,
        ...(!ctx.readonly ? [{ hostPath: dockerSocket, sandboxPath: dockerSocket }] : []),
      ];
      const sandboxEnv: Record<string, string> = ctx.readonly
        ? { ...authEnv }
        : {
            ...authEnv,
            IAM_AFK_PNPM_STORE_DIR: sandboxStore,
            IAM_E2E_LIFECYCLE: "fresh",
            TURBO_CACHE_DIR: "/tmp/iam-sandcastle-turbo/cache",
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "core.hooksPath",
            GIT_CONFIG_VALUE_0: "/tmp/iam-sandcastle-hooks",
            DOCKER_HOST: `unix://${dockerSocket}`,
          };
      const rawProvider = docker({
        imageName,
        mounts,
        env: sandboxEnv,
        groups: ctx.readonly ? undefined : [dockerGid],
        network: ctx.readonly ? undefined : "host",
      });
      if (ctx.readonly) {
        return {
          sandbox: asBindMountSandbox(rawProvider),
          cleanup: () => stagedAuth.close(),
        };
      }
      const managed = withTestResources({ cwd, id: ctx.runId, sandbox: rawProvider });
      return {
        sandbox: managed.sandbox,
        hooks: writableHooks,
        cleanup: async () => {
          const errors: unknown[] = [];
          await managed.cleanup().catch((error: unknown) => errors.push(error));
          await stagedAuth.close().catch((error: unknown) => errors.push(error));
          if (errors.length === 1) throw errors[0];
          if (errors.length > 1) throw new AggregateError(errors, "Sandbox session cleanup failed.");
        },
      };
    } catch (error) {
      await stagedAuth.close().catch(() => {});
      throw error;
    }
  };

  const result = await runAfk({
    repo,
    cwd,
    remote,
    baseBranch,
    maxSpecs: Number(values.iterations ?? (env.SANDCASTLE_ITERATIONS?.trim() || "1")),
    maxParallel: Number(values.parallel ?? (env.SANDCASTLE_PARALLEL?.trim() || "4")),
    draft: values.draft ?? /^(?:1|true)$/i.test(env.SANDCASTLE_PR_DRAFT?.trim() ?? ""),
    agents,
    sandbox,
    promptsDir: join(cwd, ".sandcastle", "prompts"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed.length > 0 || result.paused.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

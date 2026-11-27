import "../scripts/require-linux.mjs";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv, promisify } from "node:util";
import { checkAfk, runAfk } from "./afk.ts";
import { checkCodexAuth, createRepoSessionFactory, loadCodexAgents, resolveHostPnpmStore } from "./session.ts";
import { smoke } from "./smoke.mts";

const exec = promisify(execFile);
const cwd = fileURLToPath(new URL("..", import.meta.url));
const REPO = "cyy1998/shgas-iam";

export function parsePositiveInt(name: string, raw: string): number {
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) throw new Error(`参数 ${name} 必须为正整数，收到：${JSON.stringify(raw)}`);
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`参数 ${name} 超出安全整数范围：${raw}`);
  return value;
}

async function loadDotEnv(): Promise<void> {
  const raw = await readFile(join(cwd, ".sandcastle", ".env"), "utf8").catch((err: unknown) => {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") return "";
    throw err;
  });
  for (const [key, value] of Object.entries(parseEnv(raw))) {
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
      spec: { type: "string" },
      iterations: { type: "string" },
      parallel: { type: "string" },
      draft: { type: "boolean" },
    },
  });

  if (values.help) {
    console.log(`用法：pnpm sandcastle [--spec <N>] [--iterations 1] [--parallel 4] [--draft]
--check 预检凭据、远端与 GitHub 访问；--build 构建沙箱镜像；--smoke 运行真实 Docker 沙箱冒烟。`);
    return;
  }
  if ([values.check, values.build, values.smoke].filter(Boolean).length > 1) {
    throw new Error("--check、--build、--smoke 每次只选择一个。");
  }

  await loadDotEnv();
  const { env } = process;
  const specNumber = values.spec !== undefined ? parsePositiveInt("--spec", values.spec) : undefined;
  const maxSpecs = parsePositiveInt("--iterations", values.iterations ?? (env.SANDCASTLE_ITERATIONS?.trim() || "1"));
  const maxParallel = parsePositiveInt("--parallel", values.parallel ?? (env.SANDCASTLE_PARALLEL?.trim() || "4"));
  const imageName = env.SANDCASTLE_IMAGE?.trim() || "iam-sandcastle:local";
  const remote = env.SANDCASTLE_GIT_REMOTE?.trim() || undefined;
  const baseBranch = env.SANDCASTLE_BASE_BRANCH?.trim() || undefined;

  await exec("docker", ["info", "--format", "{{.ServerVersion}}"], { cwd });
  if (values.build) {
    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    await new Promise<void>((ok, fail) => {
      const child = spawn(
        "docker",
        [
          "build",
          "--build-arg",
          `AGENT_UID=${uid}`,
          "--build-arg",
          `AGENT_GID=${gid}`,
          "-t",
          imageName,
          "-f",
          ".sandcastle/Dockerfile",
          ".sandcastle",
        ],
        { cwd, stdio: "inherit" },
      );
      child.once("error", fail);
      child.once("close", (code, sig) =>
        code === 0 ? ok() : fail(new Error(`Docker 镜像构建失败（${sig ?? code}）。`)),
      );
    });
    return;
  }
  if (values.smoke) {
    await smoke(cwd, imageName);
    return;
  }

  await exec("docker", ["image", "inspect", imageName, "--format", "{{.Id}}"], { cwd });
  await checkCodexAuth(cwd, env);
  const agents = await loadCodexAgents(cwd, env);

  if (values.check) {
    console.log("Sandcastle 预检通过。", await checkAfk({ repo: REPO, cwd, remote, baseBranch }));
    return;
  }

  const hostStore = resolveHostPnpmStore(cwd, env);
  const turboCacheDir = join(cwd, ".sandcastle", "cache", "turbo");
  await mkdir(hostStore, { recursive: true });
  await mkdir(turboCacheDir, { recursive: true });

  const result = await runAfk({
    repo: REPO,
    cwd,
    remote,
    baseBranch,
    specNumber,
    maxSpecs,
    maxParallel,
    draft: values.draft ?? /^(?:1|true)$/i.test(env.SANDCASTLE_PR_DRAFT?.trim() ?? ""),
    agents,
    createSession: createRepoSessionFactory({
      cwd,
      env,
      imageName,
      hostStore,
      turboCacheDir,
    }),
    promptsDir: join(cwd, ".sandcastle", "prompts"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.paused.length > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

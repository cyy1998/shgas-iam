import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, posix, relative, resolve } from "node:path";
import { promisify } from "node:util";
import {
  type BindMountSandboxProvider,
  type BindMountSandboxProviderConfig,
  type CodexOptions,
  codex,
  createBindMountSandboxProvider,
  type MountConfig,
  type SandboxHooks,
  type SandboxProvider,
} from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { parse } from "smol-toml";
import {
  cleanupManagedResources,
  type ManagedComposeCommandOptions,
  managedCleanupCommand,
  readManagedResourceRegistry,
  readManagedResourceRun,
  repositoryPath,
} from "../scripts/test-resources/managed-resources.mjs";
import type { AfkOptions, AgentSlot } from "./afk.ts";

const exec = promisify(execFile);
const DOCKER_SOCKET = "/var/run/docker.sock";
const SANDBOX_HOME = "/home/agent";
const SANDBOX_STORE = `${SANDBOX_HOME}/.pnpm-store`;
const SANDBOX_TURBO_CACHE = `${SANDBOX_HOME}/.turbo-cache`;
const SANDBOX_CODEX_HOME = `${SANDBOX_HOME}/.codex`;
const REGISTRY_ROOT = ".sandcastle/resources";
const ARTIFACTS_DIR = "test-results/integration";

const WRITABLE_HOOKS: SandboxHooks = {
  sandbox: {
    onSandboxReady: [
      {
        command: `HUSKY=0 pnpm install --frozen-lockfile --prefer-offline --store-dir ${SANDBOX_STORE}`,
        timeoutMs: 1_200_000,
      },
    ],
  },
};

type CodexEffort = NonNullable<CodexOptions["effort"]>;
type RuntimeBindMount = BindMountSandboxProvider & {
  readonly tag: "bind-mount";
  readonly create: BindMountSandboxProviderConfig["create"];
};

const ROLE_NAMES = [
  "implementer_light",
  "implementer_standard",
  "implementer_deep",
  "standards_reviewer",
  "spec_reviewer",
] as const;

function wrapBindMount(
  provider: SandboxProvider,
  wrapCreate: (innerCreate: BindMountSandboxProviderConfig["create"]) => BindMountSandboxProviderConfig["create"],
): BindMountSandboxProvider {
  if (
    !(
      "tag" in provider &&
      provider.tag === "bind-mount" &&
      "create" in provider &&
      typeof provider.create === "function"
    )
  ) {
    throw new Error(`Expected bind-mount sandbox provider, got "${provider.name}".`);
  }
  const inner = provider as RuntimeBindMount;
  return createBindMountSandboxProvider({
    name: inner.name,
    env: inner.env,
    sandboxHomedir: inner.sandboxHomedir,
    create: wrapCreate(inner.create.bind(inner)),
  });
}

function resolveCodexAuth(cwd: string, env: NodeJS.ProcessEnv) {
  const mode = (env.CODEX_AUTH?.trim().toLowerCase() || "chatgpt") as "chatgpt" | "api-key";
  if (mode !== "chatgpt" && mode !== "api-key") throw new Error("CODEX_AUTH 仅接受 chatgpt 或 api-key。");
  const apiKey = env.CODEX_API_KEY?.trim();
  if (mode === "api-key" && !apiKey) throw new Error("CODEX_AUTH=api-key 时需要 CODEX_API_KEY。");
  const codexHome = resolve(cwd, env.CODEX_HOME?.trim() || join(homedir(), ".codex"));
  const authFile = resolve(cwd, env.CODEX_AUTH_FILE?.trim() || join(codexHome, "auth.json"));
  return { mode, apiKey, authFile };
}

export async function checkCodexAuth(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const { mode, authFile } = resolveCodexAuth(cwd, env);
  if (mode === "api-key") return;
  const info = await lstat(authFile).catch(() => undefined);
  if (!info?.isFile()) throw new Error(`Codex chatgpt 认证需要可读文件：${authFile}`);
  await access(authFile, constants.R_OK);
}

export async function stageCodexAuth(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  env: Record<string, string>;
  mounts: MountConfig[];
  close: () => Promise<void>;
}> {
  const { mode, authFile } = resolveCodexAuth(cwd, env);
  if (mode === "api-key") return { env: {}, mounts: [], close: async () => {} };
  const contents = await readFile(authFile, "utf8");
  const dir = await mkdtemp(join(tmpdir(), "sandcastle-codex-auth-"));
  const staged = join(dir, "auth.json");
  try {
    await writeFile(staged, contents, { flag: "wx", mode: 0o600 });
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    env: { CODEX_HOME: SANDBOX_CODEX_HOME },
    mounts: [{ hostPath: staged, sandboxPath: `${SANDBOX_CODEX_HOME}/auth.json`, readonly: true }],
    close: () => rm(dir, { recursive: true, force: true }),
  };
}

export async function loadCodexAgents(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AfkOptions["agents"]> {
  const { mode, apiKey } = resolveCodexAuth(cwd, env);
  const loadSlot = async (name: (typeof ROLE_NAMES)[number]): Promise<AgentSlot> => {
    const raw = await readFile(join(cwd, ".codex", "agents", `${name.replaceAll("_", "-")}.toml`), "utf8");
    const role = parse(raw);
    const effort = role.model_reasoning_effort;
    if (
      role.name !== name ||
      typeof role.model !== "string" ||
      !role.model.trim() ||
      typeof role.developer_instructions !== "string" ||
      !role.developer_instructions.trim() ||
      (effort !== "low" && effort !== "medium" && effort !== "high" && effort !== "xhigh")
    ) {
      throw new Error(`无效的 AFK 角色配置：${name}`);
    }
    const provider = codex(role.model, {
      effort: effort as CodexEffort,
      captureSessions: false,
      env: mode === "api-key" && apiKey ? { CODEX_API_KEY: apiKey } : {},
    });
    return { provider, instructions: role.developer_instructions };
  };

  const [light, standard, deep, reviewStandards, reviewSpec] = await Promise.all(ROLE_NAMES.map(loadSlot));
  if (!light || !standard || !deep || !reviewStandards || !reviewSpec) {
    throw new Error("AFK 角色配置加载不完整。");
  }
  return { light, standard, deep, reviewStandards, reviewSpec, repair: deep };
}

export function resolveHostPnpmStore(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.SANDCASTLE_PNPM_STORE_DIR?.trim();
  if (explicit) return resolve(cwd, explicit);
  const xdgDataHome = env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
  return join(xdgDataHome, "pnpm", "store");
}

export async function dockerRegistryMount(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MountConfig | undefined> {
  const raw = env.SANDCASTLE_DOCKER_CONFIG_FILE?.trim();
  if (!raw) return undefined;
  const hostPath = resolve(cwd, raw);
  const info = await stat(hostPath);
  if (!info.isFile()) throw new Error(`Docker registry 配置须为可读文件：${hostPath}`);
  await access(hostPath, constants.R_OK);
  return { hostPath, sandboxPath: `${SANDBOX_HOME}/.docker/config.json`, readonly: true };
}

export async function verifyContainerStopped(
  sandboxId: string | undefined,
  cwd: string,
  inspectFn?: (sandboxId: string) => Promise<{ exists: boolean; running: boolean }>,
): Promise<void> {
  if (!sandboxId) throw new Error("缺少沙箱容器标识，无法确认容器已停止，保留测试资源 registry。");
  if (inspectFn) {
    const state = await inspectFn(sandboxId);
    if (state.exists && state.running) {
      throw new Error(`沙箱容器 ${sandboxId} 仍在运行，保留测试资源 registry。`);
    }
    return;
  }
  let running: string;
  try {
    const { stdout } = await exec("docker", ["inspect", "--format", "{{.State.Running}}", sandboxId], { cwd });
    running = stdout.trim();
  } catch (error: unknown) {
    const msg = error instanceof Error && "stderr" in error ? String(error.stderr) : String(error);
    if (/No such (?:object|container)/i.test(msg)) return;
    throw new Error(`无法确认沙箱容器 ${sandboxId} 已停止，保留测试资源 registry：${msg}`);
  }
  if (running !== "false") {
    throw new Error(`沙箱容器 ${sandboxId} 未确认停止（State.Running=${running || "empty"}），保留测试资源 registry。`);
  }
}

export type RepoSessionFactoryOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  imageName: string;
  hostStore: string;
  turboCacheDir: string;
  dockerGid: number;
  registryMount?: MountConfig;
  createDockerProvider?: typeof docker;
  inspectContainer?: (sandboxId: string) => Promise<{ exists: boolean; running: boolean }>;
  runComposeCommand?: ManagedComposeCommandOptions["runCommand"];
};

export function createRepoSessionFactory(opts: RepoSessionFactoryOptions): AfkOptions["createSession"] {
  const makeDocker = opts.createDockerProvider ?? docker;
  return async ({ worktree, readonly, runId }) => {
    const auth = await stageCodexAuth(opts.cwd, opts.env);
    try {
      if (readonly) {
        const sandbox = wrapBindMount(
          makeDocker({ imageName: opts.imageName, mounts: [...auth.mounts], env: { ...auth.env } }),
          (innerCreate) => (createOpts) =>
            innerCreate({ ...createOpts, mounts: createOpts.mounts.map((m) => ({ ...m, readonly: true })) }),
        );
        return { sandbox, cleanup: () => auth.close() };
      }

      const worktreeRoot = resolve(worktree);
      const safeId = runId.replace(/[^a-zA-Z0-9_-]/g, "-") || "run";
      const mounts: MountConfig[] = [
        { hostPath: opts.hostStore, sandboxPath: SANDBOX_STORE },
        { hostPath: opts.turboCacheDir, sandboxPath: SANDBOX_TURBO_CACHE },
        ...(opts.registryMount ? [opts.registryMount] : []),
        ...auth.mounts,
        { hostPath: DOCKER_SOCKET, sandboxPath: DOCKER_SOCKET },
      ];
      let sandboxId: string | undefined;
      let created: { dir: string; relDir: string; registryFile: string } | undefined;

      const sandbox = wrapBindMount(
        makeDocker({
          imageName: opts.imageName,
          mounts,
          env: {
            ...auth.env,
            TURBO_CACHE_DIR: SANDBOX_TURBO_CACHE,
            IAM_E2E_LIFECYCLE: "fresh",
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "core.hooksPath",
            GIT_CONFIG_VALUE_0: ".husky",
            DOCKER_HOST: `unix://${DOCKER_SOCKET}`,
          },
          groups: [opts.dockerGid],
          network: "host",
        }),
        (innerCreate) => async (createOpts) => {
          await mkdir(join(opts.cwd, REGISTRY_ROOT), { recursive: true });
          const dir = await mkdtemp(join(opts.cwd, REGISTRY_ROOT, `run-${safeId}-`));
          const relDir = relative(opts.cwd, dir).replaceAll("\\", "/");
          const registryFile = `${relDir}/registry.jsonl`;
          let createInvoked = false;
          try {
            await writeFile(join(opts.cwd, registryFile), "", { flag: "wx", mode: 0o600 });
            await mkdir(join(opts.cwd, ARTIFACTS_DIR), { recursive: true });
            await mkdir(join(worktreeRoot, ARTIFACTS_DIR), { recursive: true });
            await mkdir(join(worktreeRoot, relDir), { recursive: true });
            const sandboxRoot =
              createOpts.mounts.find((m) => resolve(m.hostPath) === resolve(createOpts.worktreePath))?.sandboxPath ??
              `${SANDBOX_HOME}/workspace`;
            createInvoked = true;
            const handle = await innerCreate({
              ...createOpts,
              env: { ...createOpts.env, IAM_TEST_RESOURCE_REGISTRY: registryFile },
              mounts: [
                ...createOpts.mounts,
                { hostPath: join(opts.cwd, relDir), sandboxPath: posix.join(sandboxRoot, relDir) },
                { hostPath: join(opts.cwd, ARTIFACTS_DIR), sandboxPath: posix.join(sandboxRoot, ARTIFACTS_DIR) },
              ],
            });
            created = { dir, relDir, registryFile };
            sandboxId = handle.sandboxId;
            return handle;
          } catch (error) {
            if (!createInvoked) {
              await rm(dir, { recursive: true, force: true });
              await rm(join(worktreeRoot, relDir), { recursive: true, force: true });
            }
            throw error;
          }
        },
      );

      return {
        sandbox,
        hooks: WRITABLE_HOOKS,
        cleanup: async () => {
          const errors: unknown[] = [];
          if (created) {
            try {
              await verifyContainerStopped(sandboxId, opts.cwd, opts.inspectContainer);
              const records = await readManagedResourceRegistry(
                opts.cwd,
                repositoryPath(opts.cwd, created.registryFile),
              );
              let kept = false;
              for (const record of [...records].reverse()) {
                const runInfo = await readManagedResourceRun(opts.cwd, record);
                await cleanupManagedResources(runInfo, { respectKeep: true, runCommand: opts.runComposeCommand });
                if (runInfo.record.keep) {
                  kept = true;
                  console.log(`保留测试环境 ${runInfo.record.project}；清理：${managedCleanupCommand(runInfo)}`);
                }
              }
              if (!kept) {
                await rm(created.dir, { recursive: true, force: true });
                await rm(join(worktreeRoot, created.relDir), { recursive: true, force: true });
              }
            } catch (error) {
              errors.push(error);
            }
          }
          await auth.close().catch((error: unknown) => errors.push(error));
          if (errors.length === 1) throw errors[0];
          if (errors.length > 1) throw new AggregateError(errors, "沙箱资源清理失败。");
        },
      };
    } catch (error) {
      await auth.close().catch(() => {});
      throw error;
    }
  };
}

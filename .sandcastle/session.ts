import { constants } from "node:fs";
import { access, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
import type { AfkOptions, AgentSlot } from "./afk.ts";

const SANDBOX_HOME = "/home/agent";
const SANDBOX_STORE = `${SANDBOX_HOME}/.pnpm-store`;
const SANDBOX_TURBO_CACHE = `${SANDBOX_HOME}/.turbo-cache`;
const SANDBOX_CODEX_HOME = `${SANDBOX_HOME}/.codex`;

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

function assertBindMount(provider: SandboxProvider): RuntimeBindMount {
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
  return provider as RuntimeBindMount;
}

function wrapBindMount(
  provider: SandboxProvider,
  wrapCreate: (innerCreate: BindMountSandboxProviderConfig["create"]) => BindMountSandboxProviderConfig["create"],
): BindMountSandboxProvider {
  const inner = assertBindMount(provider);
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

export type RepoSessionFactoryOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  imageName: string;
  hostStore: string;
  turboCacheDir: string;
  createDockerProvider?: typeof docker;
};

export function createRepoSessionFactory(opts: RepoSessionFactoryOptions): AfkOptions["createSession"] {
  const makeDocker = opts.createDockerProvider ?? docker;
  return async ({ readonly }) => {
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

      const mounts: MountConfig[] = [
        { hostPath: opts.hostStore, sandboxPath: SANDBOX_STORE },
        { hostPath: opts.turboCacheDir, sandboxPath: SANDBOX_TURBO_CACHE },
        ...auth.mounts,
      ];
      const sandbox = assertBindMount(
        makeDocker({
          imageName: opts.imageName,
          mounts,
          env: {
            ...auth.env,
            IAM_TEST_RESOURCE_PROVIDER: "native",
            TURBO_CACHE_DIR: SANDBOX_TURBO_CACHE,
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "core.hooksPath",
            GIT_CONFIG_VALUE_0: ".husky",
          },
        }),
      );

      return {
        sandbox,
        hooks: WRITABLE_HOOKS,
        cleanup: () => auth.close(),
      };
    } catch (error) {
      await auth.close().catch(() => {});
      throw error;
    }
  };
}

import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type AgentProvider, type CodexOptions, codex, type MountConfig } from "@ai-hero/sandcastle";
import { parse } from "smol-toml";

export const codexImplementerNames = ["implementer_light", "implementer_standard", "implementer_deep"] as const;
export const codexReviewerNames = ["standards_reviewer", "spec_reviewer"] as const;
const codexRoleNames = [...codexImplementerNames, ...codexReviewerNames] as const;

export type CodexRoleName = (typeof codexRoleNames)[number];
export type CodexEffort = NonNullable<CodexOptions["effort"]>;
export type CodexAuthMode = "chatgpt" | "api-key";

export type CodexRole = {
  name: CodexRoleName;
  description: string;
  model: string;
  effort: CodexEffort;
  instructions: string;
};

export type CodexRoles = Record<CodexRoleName, CodexRole>;

export type CodexAgentSlot = {
  provider: AgentProvider;
  instructions: string;
};

export type CodexAgentSlots = {
  implementLight: CodexAgentSlot;
  implementStandard: CodexAgentSlot;
  implementDeep: CodexAgentSlot;
  reviewStandards: CodexAgentSlot;
  reviewSpec: CodexAgentSlot;
  repair: CodexAgentSlot;
};

export type CodexAuthOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  mode?: CodexAuthMode;
  source?: string;
  apiKey?: string;
};

export type StageCodexAuthOptions = CodexAuthOptions & {
  sandboxHome?: string;
  warn?: (message: string) => void;
};

export type StagedCodexAuth = {
  mode: CodexAuthMode;
  env: Record<string, string>;
  mounts: MountConfig[];
  close: () => Promise<void>;
};

export type DockerRegistryAuthMountOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  source?: string;
  sandboxPath?: string;
};

const defaultSandboxCodexHome = "/home/agent/.codex";
const defaultSandboxDockerConfig = "/home/agent/.docker/config.json";
const writebackChains = new Map<string, Promise<void>>();

function isReviewerRole(name: CodexRoleName): boolean {
  return (codexReviewerNames as readonly string[]).includes(name);
}

function isCodexEffort(value: unknown): value is CodexEffort {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function resolveCodexHome(cwd: string, env: NodeJS.ProcessEnv): string {
  return resolve(cwd, env.CODEX_HOME?.trim() || join(homedir(), ".codex"));
}

function resolveAuthInputs(options: CodexAuthOptions) {
  const env = options.env ?? process.env;
  const mode = resolveCodexAuthMode(env, options.mode);
  const apiKey = options.apiKey !== undefined ? options.apiKey.trim() : env.CODEX_API_KEY?.trim();
  const codexHome = resolveCodexHome(options.cwd, env);
  const source = resolve(
    options.cwd,
    options.source?.trim() || env.CODEX_AUTH_FILE?.trim() || join(codexHome, "auth.json"),
  );
  return { mode, apiKey, source, codexHome };
}

async function readAuthFile(path: string): Promise<{ contents: string; mode: number }> {
  try {
    const file = await lstat(path);
    if (!file.isFile()) throw new Error();
    return { contents: await readFile(path, "utf8"), mode: file.mode & 0o777 };
  } catch {
    throw new Error("Codex chatgpt authentication requires a readable auth.json.");
  }
}

function serializeWriteback(source: string, task: () => Promise<void>): Promise<void> {
  const previous = writebackChains.get(source) ?? Promise.resolve();
  const current = previous.then(task, task);
  const tracked = current.then(
    () => {
      if (writebackChains.get(source) === tracked) writebackChains.delete(source);
    },
    () => {
      if (writebackChains.get(source) === tracked) writebackChains.delete(source);
    },
  );
  writebackChains.set(source, tracked);
  return current;
}

export function resolveCodexAuthMode(
  env: NodeJS.ProcessEnv = process.env,
  explicitMode?: CodexAuthMode,
): CodexAuthMode {
  const mode = explicitMode ?? (env.CODEX_AUTH?.trim().toLowerCase() || "chatgpt");
  if (mode !== "chatgpt" && mode !== "api-key") {
    throw new Error("CODEX_AUTH 仅接受 chatgpt 或 api-key。");
  }
  return mode;
}

export function parseCodexRole(source: string, name: CodexRoleName): CodexRole {
  const role = parse(source);
  const effort = role.model_reasoning_effort;
  if (
    role.name !== name ||
    typeof role.description !== "string" ||
    !role.description.trim() ||
    typeof role.model !== "string" ||
    !role.model.trim() ||
    typeof role.developer_instructions !== "string" ||
    !role.developer_instructions.trim() ||
    !isCodexEffort(effort)
  ) {
    throw new Error(`无效的 AFK 角色配置：${name}`);
  }
  if (isReviewerRole(name) && role.sandbox_mode !== "read-only") {
    throw new Error(`AFK 只读角色必须为 read-only：${name}`);
  }
  return {
    name,
    description: role.description,
    model: role.model,
    effort,
    instructions: role.developer_instructions,
  };
}

export async function loadCodexRoles(cwd: string): Promise<CodexRoles> {
  const entries = await Promise.all(
    codexRoleNames.map(async (name) => {
      const source = await readFile(join(cwd, ".codex", "agents", `${name.replaceAll("_", "-")}.toml`), "utf8");
      return [name, parseCodexRole(source, name)] as const;
    }),
  );
  return Object.fromEntries(entries) as CodexRoles;
}

export async function loadCodexAgents(options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<CodexAgentSlots> {
  const env = options.env ?? process.env;
  const authMode = resolveCodexAuthMode(env);
  const apiKey = env.CODEX_API_KEY?.trim();
  if (authMode === "api-key" && !apiKey) {
    throw new Error("CODEX_AUTH=api-key 时需要 CODEX_API_KEY。");
  }

  const codexHome = resolveCodexHome(options.cwd, env);
  const definitions = await loadCodexRoles(options.cwd);
  const providers = new Map<string, AgentProvider>();

  const providerFor = (model: string, effort: CodexEffort): AgentProvider => {
    const key = JSON.stringify([model, effort]);
    const existing = providers.get(key);
    if (existing) return existing;
    const provider = codex(model, {
      effort,
      env: authMode === "api-key" && apiKey ? { CODEX_API_KEY: apiKey } : {},
      sessionStorage: { hostSessionsDir: join(codexHome, "sessions") },
    });
    providers.set(key, provider);
    return provider;
  };

  const slotFor = (role: CodexRole): CodexAgentSlot => ({
    provider: providerFor(role.model, role.effort),
    instructions: role.instructions,
  });

  const implementDeep = slotFor(definitions.implementer_deep);
  return {
    implementLight: slotFor(definitions.implementer_light),
    implementStandard: slotFor(definitions.implementer_standard),
    implementDeep,
    reviewStandards: slotFor(definitions.standards_reviewer),
    reviewSpec: slotFor(definitions.spec_reviewer),
    repair: { provider: implementDeep.provider, instructions: implementDeep.instructions },
  };
}

export async function checkCodexAuth(options: CodexAuthOptions): Promise<void> {
  const { mode, apiKey, source } = resolveAuthInputs(options);
  if (mode === "api-key") {
    if (!apiKey) throw new Error("CODEX_AUTH=api-key 时需要 CODEX_API_KEY。");
    return;
  }
  await readAuthFile(source);
}

export async function stageCodexAuth(options: StageCodexAuthOptions): Promise<StagedCodexAuth> {
  const { mode, apiKey, source } = resolveAuthInputs(options);
  if (mode === "api-key") {
    if (!apiKey) throw new Error("CODEX_AUTH=api-key 时需要 CODEX_API_KEY。");
    return {
      mode,
      env: { CODEX_API_KEY: apiKey },
      mounts: [],
      close: async () => {},
    };
  }

  const original = await readAuthFile(source);
  const sandboxHome = options.sandboxHome ?? defaultSandboxCodexHome;
  const warn = options.warn ?? console.warn;
  const directory = await mkdtemp(join(tmpdir(), "sandcastle-codex-auth-"));
  const stagedPath = join(directory, "auth.json");
  try {
    await writeFile(stagedPath, original.contents, { flag: "wx", mode: 0o600 });
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }

  let closePromise: Promise<void> | undefined;
  return {
    mode,
    env: { CODEX_HOME: sandboxHome },
    mounts: [{ hostPath: directory, sandboxPath: sandboxHome }],
    close: () => {
      closePromise ??= serializeWriteback(source, async () => {
        const refreshed = await readAuthFile(stagedPath);
        if (refreshed.contents !== original.contents) {
          const current = await readAuthFile(source);
          if (current.contents !== refreshed.contents) {
            if (current.contents !== original.contents) {
              warn(
                `Codex authentication writeback skipped because ${source} was updated concurrently. Staged credentials retained in ${directory}.`,
              );
              return;
            }
            const temp = `${source}.${randomUUID()}.tmp`;
            try {
              await writeFile(temp, refreshed.contents, { flag: "wx", mode: current.mode });
              await rename(temp, source);
            } finally {
              await rm(temp, { force: true });
            }
          }
        }
        await rm(directory, { recursive: true, force: true });
      });
      return closePromise;
    },
  };
}

export async function dockerRegistryAuthMount(
  options: DockerRegistryAuthMountOptions,
): Promise<MountConfig | undefined> {
  const env = options.env ?? process.env;
  const raw = options.source !== undefined ? options.source.trim() : env.SANDCASTLE_DOCKER_CONFIG_FILE?.trim();
  if (!raw) return undefined;

  const hostPath = resolve(options.cwd, raw);
  try {
    const info = await stat(hostPath);
    if (!info.isFile()) throw new Error();
    await access(hostPath, constants.R_OK);
  } catch {
    throw new Error(`Docker registry configuration requires a readable file: ${hostPath}`);
  }

  return {
    hostPath,
    sandboxPath: options.sandboxPath ?? defaultSandboxDockerConfig,
    readonly: true,
  };
}

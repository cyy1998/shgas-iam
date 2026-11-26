import { mkdir, stat } from "node:fs/promises";
import { dirname, posix, resolve, sep } from "node:path";
import type { AgentProvider } from "@ai-hero/sandcastle";
import type { DockerOptions } from "@ai-hero/sandcastle/sandboxes/docker";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { shellQuote } from "./codex-provider.mts";

const sandboxHomedir = "/home/agent";
export const turboCacheDirectory = "/tmp/iam-sandcastle-turbo/cache";

const cacheProbe = `
  const fs = require("node:fs");
  const path = require("node:path");
  const directory = process.env.TURBO_CACHE_DIR;
  try {
    fs.mkdirSync(directory, { recursive: true });
    const probe = path.join(directory, ".write-probe-" + require("node:crypto").randomUUID());
    fs.writeFileSync(probe, "ok", { flag: "wx" });
    fs.unlinkSync(probe);
  } catch (error) {
    console.error("Turbo 缓存目录不可写：" + directory + " (" + error.code + ")");
    process.exitCode = 1;
  }
`;

export const cachePreflight = `timeout --kill-after=5s 30s node -e ${shellQuote(cacheProbe)}`;

const hostNetworkProbe = `
  fetch(process.env.IAM_AFK_HOST_PROBE_URL, { signal: AbortSignal.timeout(10000) })
    .then(response => response.text()).then(value => {
      if (value !== process.env.IAM_AFK_HOST_PROBE_VALUE) throw Error("host loopback response mismatch");
    }).catch(error => { console.error("Host networking 预检失败：" + error.message); process.exitCode = 1; });
`;
export const dockerPreflight = `timeout --kill-after=5s 30s sh -c ${shellQuote(
  'test "$(id -u)" = 1000 && docker info --format "{{.OSType}}"' +
    " && docker compose version && docker buildx version && " +
    `node -e ${shellQuote(hostNetworkProbe)}`,
)}`;

export const workspacePreparation = `${cachePreflight} && sh scripts/sandcastle/prepare-workspace.sh </dev/null`;

export type DockerDaemonAccess = { socketGroupId: number };
type DockerSandboxOptions = DockerOptions & { daemonAccess?: DockerDaemonAccess };

function normalizeSandboxPath(path: string, sandboxWorkspace: string): string {
  const expanded =
    path === "~"
      ? sandboxHomedir
      : path.startsWith("~/")
        ? `${sandboxHomedir}${path.slice(1)}`
        : path.startsWith("/")
          ? path
          : `${sandboxWorkspace}/${path}`;
  return posix.normalize(expanded).replace(/\/+$/u, "") || "/";
}

function resolveWorktreeMountpoint(
  worktreeRoot: string,
  sandboxWorkspace: string,
  sandboxPath: string,
): string | undefined {
  const normalized = normalizeSandboxPath(sandboxPath, sandboxWorkspace);
  if (!normalized.startsWith(`${sandboxWorkspace}/`)) return undefined;
  const relativeTarget = normalized.slice(sandboxWorkspace.length + 1);
  if (!relativeTarget) return undefined;
  const hostTarget = resolve(worktreeRoot, relativeTarget);
  if (hostTarget !== worktreeRoot && !hostTarget.startsWith(`${worktreeRoot}${sep}`)) {
    throw new Error(`Sandbox 挂载路径超出 worktree 范围：${sandboxPath}`);
  }
  return hostTarget;
}

/**
 * Pre-create host mountpoint directories inside the worktree as the current user so the Linux
 * Docker daemon never materializes root-owned directories that block `git worktree remove`.
 */
export async function prepareWorkspaceMountpoints(options: {
  worktreePath: string;
  mounts?: readonly { hostPath: string; sandboxPath: string }[];
  anonymousVolumes?: readonly string[];
  namedVolumes?: readonly { target: string }[];
}): Promise<void> {
  const worktreeRoot = resolve(options.worktreePath);
  const mounts = options.mounts ?? [];
  const workspaceMount = mounts.find((mount) => resolve(mount.hostPath) === worktreeRoot);
  const sandboxWorkspace = normalizeSandboxPath(
    workspaceMount?.sandboxPath ?? "/home/agent/workspace",
    "/home/agent/workspace",
  );
  const directories = new Set<string>();
  for (const mount of mounts) {
    const hostTarget = resolveWorktreeMountpoint(worktreeRoot, sandboxWorkspace, mount.sandboxPath);
    if (!hostTarget) continue;
    const hostStat = await stat(mount.hostPath).catch(() => undefined);
    directories.add(hostStat?.isFile() ? dirname(hostTarget) : hostTarget);
  }
  for (const target of [
    ...(options.anonymousVolumes ?? []),
    ...(options.namedVolumes ?? []).map((volume) => volume.target),
  ]) {
    const hostTarget = resolveWorktreeMountpoint(worktreeRoot, sandboxWorkspace, target);
    if (hostTarget) directories.add(hostTarget);
  }
  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
  }
}

/** All execution stages use the same container-local cache. */
export function dockerSandbox(options: DockerSandboxOptions) {
  const { daemonAccess, ...dockerOptions } = options;
  if (daemonAccess && (!Number.isSafeInteger(daemonAccess.socketGroupId) || daemonAccess.socketGroupId < 0))
    throw new Error("Docker socket group 必须为非负整数 GID。");
  if (daemonAccess && options.network !== "host")
    throw new Error("共享宿主 Docker 的 sandbox 必须显式使用 host networking。");
  const provider = docker({
    ...dockerOptions,
    ...(daemonAccess
      ? { daemonSocket: "/var/run/docker.sock", groups: [...(options.groups ?? []), daemonAccess.socketGroupId] }
      : {}),
    env: {
      ...options.env,
      TURBO_CACHE_DIR: turboCacheDirectory,
      ...(daemonAccess ? { DOCKER_HOST: "unix:///var/run/docker.sock" } : {}),
    },
  });
  return {
    ...provider,
    create: async (createOptions: Parameters<typeof provider.create>[0]) => {
      await prepareWorkspaceMountpoints({
        worktreePath: createOptions.worktreePath,
        mounts: [...createOptions.mounts, ...(dockerOptions.mounts ?? [])],
        anonymousVolumes: dockerOptions.anonymousVolumes,
        namedVolumes: dockerOptions.namedVolumes,
      });
      return provider.create(createOptions);
    },
  };
}

/** The SDK checks agent command exit codes; its ready hooks do not. */
export function withCachePreflight(provider: AgentProvider): AgentProvider {
  return withPreparation(provider, cachePreflight);
}

/** Run as the actual agent user, before any model command or workspace installation. */
export function withDockerPreflight(provider: AgentProvider): AgentProvider {
  return withPreparation(provider, dockerPreflight);
}

export function withWorkspacePreparation(provider: AgentProvider): AgentProvider {
  return withPreparation(
    provider,
    `timeout --kill-after=10s 1200s sh -c ${shellQuote(workspacePreparation)}` +
      " && . scripts/sandcastle/enable-git-hooks.sh",
  );
}

function withPreparation(provider: AgentProvider, preparation: string): AgentProvider {
  return {
    ...provider,
    buildPrintCommand(options) {
      const result = provider.buildPrintCommand(options);
      return { ...result, command: `${preparation} && ( ${result.command} )` };
    },
  };
}

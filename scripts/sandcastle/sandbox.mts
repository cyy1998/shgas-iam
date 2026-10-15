import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentProvider } from "@ai-hero/sandcastle";
import type { DockerOptions } from "@ai-hero/sandcastle/sandboxes/docker";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { shellQuote } from "./codex-provider.mts";

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

export const frontendGeneratedPaths = ["admin", "sso"].flatMap((app) =>
  [".umi", ".umi-production", ".umi-test"].map((directory) => `apps/${app}/src/${directory}`),
);

/** One execution owns these mounts; neither host output nor another ticket is reused. */
export async function withFrontendMounts<T>(
  use: (mounts: NonNullable<DockerOptions["mounts"]>) => Promise<T>,
  canClose: () => boolean = () => true,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "iam-sandcastle-generated-"));
  const failures: unknown[] = [];
  let result: T | undefined;
  try {
    const mounts = await Promise.all(
      frontendGeneratedPaths.map(async (path) => {
        const hostPath = join(directory, path);
        await mkdir(hostPath, { recursive: true });
        return { hostPath, sandboxPath: `/home/agent/workspace/${path}` };
      }),
    );
    result = await use(mounts);
  } catch (error) {
    failures.push(error);
  } finally {
    if (canClose()) {
      try {
        await rm(directory, { recursive: true, force: true });
      } catch (error) {
        failures.push(error);
      }
    } else console.error(`创建者 sandbox 尚未确认停止，保留前端挂载：${directory}`);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, "执行与前端挂载收尾同时失败。");
  return result!;
}

export const workspacePreparation = `${cachePreflight} && sh scripts/sandcastle/prepare-workspace.sh </dev/null`;

export type DockerDaemonAccess = { socketGroupId: number };
type DockerSandboxOptions = DockerOptions & { daemonAccess?: DockerDaemonAccess };

/** All execution stages use the same container-local cache. */
export function dockerSandbox(options: DockerSandboxOptions) {
  const { daemonAccess, ...dockerOptions } = options;
  if (daemonAccess && (!Number.isSafeInteger(daemonAccess.socketGroupId) || daemonAccess.socketGroupId < 0))
    throw new Error("Docker socket group 必须为非负整数 GID。");
  if (daemonAccess && options.network !== "host")
    throw new Error("共享宿主 Docker 的 sandbox 必须显式使用 host networking。");
  return docker({
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

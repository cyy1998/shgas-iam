import type { AgentProvider } from "@ai-hero/sandcastle";
import type { DockerOptions } from "@ai-hero/sandcastle/sandboxes/docker";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

export const frontendGeneratedPaths = ["admin", "sso"].flatMap(app =>
  [".umi", ".umi-production", ".umi-test"].map(directory => `apps/${app}/src/${directory}`));

/** One execution owns these mounts; neither host output nor another ticket is reused. */
export async function withFrontendMounts<T>(use: (mounts: NonNullable<DockerOptions["mounts"]>) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "iam-sandcastle-generated-"));
  try {
    const mounts = await Promise.all(frontendGeneratedPaths.map(async (path) => {
      const hostPath = join(directory, path);
      await mkdir(hostPath, { recursive: true });
      return { hostPath, sandboxPath: `/home/agent/workspace/${path}` };
    }));
    return await use(mounts);
  }
  finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export const workspacePreparation = `${cachePreflight} && sh scripts/sandcastle/prepare-workspace.sh </dev/null`;

/** All execution stages use the same container-local cache. */
export function dockerSandbox(options: DockerOptions) {
  return docker({ ...options, env: { ...options.env, TURBO_CACHE_DIR: turboCacheDirectory } });
}

/** The SDK checks agent command exit codes; its ready hooks do not. */
export function withCachePreflight(provider: AgentProvider): AgentProvider {
  return withPreparation(provider, cachePreflight);
}

export function withWorkspacePreparation(provider: AgentProvider): AgentProvider {
  return withPreparation(provider, `timeout --kill-after=10s 1200s sh -c ${shellQuote(workspacePreparation)}`);
}

function withPreparation(provider: AgentProvider, preparation: string): AgentProvider {
  return {
    ...provider,
    buildPrintCommand(options) {
      const result = provider.buildPrintCommand(options);
      return { ...result, command: `${preparation} && ${result.command}` };
    },
  };
}

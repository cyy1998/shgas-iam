import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { DockerOptions } from "@ai-hero/sandcastle/sandboxes/docker";

export type DockerConfig = {
  mounts: NonNullable<DockerOptions["mounts"]>;
  recoveryDirectory?: string;
  close: () => Promise<void>;
};

function executorConfigDirectory(runId: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(runId))
    throw new Error("Invalid Docker configuration executor ID");
  const root = resolve(tmpdir(), "iam-sandcastle-docker");
  const directory = resolve(root, `executor-${runId}`);
  if (!directory.startsWith(`${root}${sep}`)) throw new Error("Invalid Docker configuration recovery directory");
  return directory;
}

export async function closeDockerConfig(runId: string): Promise<void> {
  const directory = executorConfigDirectory(runId);
  await rm(directory, { recursive: true, force: true });
}

async function readDockerConfig(cwd: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const source = env.SANDCASTLE_DOCKER_CONFIG_FILE?.trim();
  if (!source) return;
  let contents: string;
  try {
    const file = resolve(cwd, source);
    if (!(await stat(file)).isFile()) throw new Error();
    contents = await readFile(file, "utf8");
  } catch {
    throw new Error("SANDCASTLE_DOCKER_CONFIG_FILE 必须指向可读取的普通 JSON 文件。");
  }
  let config: unknown;
  try {
    config = JSON.parse(contents);
  } catch {
    // SyntaxError may include the original JSON and its credential values.
    throw new Error("SANDCASTLE_DOCKER_CONFIG_FILE 不是有效 JSON；未暂存配置。");
  }
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const validAuth = (value: unknown): boolean =>
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.entries(value).every(
      ([key, credential]) =>
        ["auth", "identitytoken", "registrytoken"].includes(key) &&
        typeof credential === "string" &&
        !!credential.trim(),
    );
  if (
    !isRecord(config) ||
    Object.keys(config).length !== 1 ||
    !isRecord(config.auths) ||
    Object.keys(config.auths).length !== 1 ||
    !validAuth(config.auths["docker.xuanyuan.run"])
  )
    throw new Error(
      "SANDCASTLE_DOCKER_CONFIG_FILE 只接受自包含的 docker.xuanyuan.run auths；不支持 credsStore、credHelpers、credentialHelpers 或其他配置。",
    );
  return contents;
}

export async function checkDockerConfig(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return (await readDockerConfig(cwd, env)) !== undefined;
}

export async function prepareDockerConfig(
  runId: string,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DockerConfig> {
  const contents = await readDockerConfig(cwd, env);
  if (contents === undefined) return { mounts: [], close: async () => {} };
  const directory = executorConfigDirectory(runId);
  await mkdir(resolve(tmpdir(), "iam-sandcastle-docker"), { recursive: true, mode: 0o700 });
  await mkdir(directory, { mode: 0o700 });
  const hostPath = join(directory, "config.json");
  try {
    await writeFile(hostPath, contents, { mode: 0o600, flag: "wx" });
  } catch (error) {
    try {
      await closeDockerConfig(runId);
    } catch (closeError) {
      throw new AggregateError([error, closeError], "Docker 配置暂存与收尾同时失败。");
    }
    throw error;
  }
  return {
    recoveryDirectory: directory,
    mounts: [{ hostPath, sandboxPath: "/home/agent/.docker/config.json", readonly: true }],
    close: () => closeDockerConfig(runId),
  };
}

import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { DockerAuthConfig, PreparedAuth } from "./config.ts";

export async function stageCredential(name: string, contents: string) {
  const directory = await mkdtemp(join(tmpdir(), "sandcastle-auth-"));
  const path = join(directory, name);
  const close = () => rm(directory, { recursive: true, force: true });
  try {
    await writeFile(path, contents, { flag: "wx", mode: 0o600 });
  } catch (error) {
    await close();
    throw error;
  }
  return { path, directory, close };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validCredential(value: unknown): boolean {
  return (
    object(value) &&
    Object.keys(value).length > 0 &&
    Object.entries(value).every(
      ([field, secret]) =>
        ["auth", "identitytoken", "registrytoken"].includes(field) &&
        typeof secret === "string" &&
        Boolean(secret.trim()),
    )
  );
}

export function dockerRegistryAuth(config: DockerAuthConfig) {
  const registries = new Set(config.registries);
  async function read(cwd: string) {
    const path = resolve(cwd, config.source);
    let contents: string;
    let parsed: unknown;
    try {
      if (!(await stat(path)).isFile()) throw new Error();
      contents = await readFile(path, "utf8");
      parsed = JSON.parse(contents);
    } catch {
      throw new Error("Docker registry authentication requires a readable JSON file.");
    }
    if (
      !object(parsed) ||
      Object.keys(parsed).length !== 1 ||
      !object(parsed.auths) ||
      Object.keys(parsed.auths).length === 0 ||
      !Object.entries(parsed.auths).every(([registry, auth]) => registries.has(registry) && validCredential(auth))
    ) {
      throw new Error(
        "Docker registry configuration must contain self-contained credentials for configured registries.",
      );
    }
    return contents;
  }
  return {
    async check(cwd: string) {
      await read(cwd);
    },
    async prepare(cwd: string): Promise<PreparedAuth> {
      const staged = await stageCredential("config.json", await read(cwd));
      return {
        mounts: [{ hostPath: staged.path, sandboxPath: config.sandboxPath ?? "~/.docker/config.json", readonly: true }],
        close: staged.close,
      };
    },
  };
}

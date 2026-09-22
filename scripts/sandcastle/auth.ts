import type { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

export type CodexAuth = {
  mode: "chatgpt" | "api-key";
  env: Record<string, string>;
  mounts: { hostPath: string; sandboxPath: string; readonly?: boolean }[];
  close: () => Promise<void>;
};

export async function prepareCodexAuth(env: NodeJS.ProcessEnv = process.env): Promise<CodexAuth> {
  const mode = env.CODEX_AUTH?.trim().toLowerCase() || "chatgpt";
  if (mode === "api-key") {
    const key = env.CODEX_API_KEY?.trim();
    if (!key)
      throw new Error("CODEX_AUTH=api-key 时需要 CODEX_API_KEY；或改用默认的 ChatGPT 登录模式。");
    return { mode, env: { CODEX_API_KEY: key }, mounts: [], close: async () => {} };
  }
  if (mode !== "chatgpt")
    throw new Error(`不支持的 CODEX_AUTH：${mode}；可选 chatgpt 或 api-key。`);

  const hostHome = env.CODEX_HOME?.trim() || join(homedir(), ".codex");
  const source = env.CODEX_AUTH_FILE?.trim() || join(hostHome, "auth.json");
  let original: Buffer;
  let permissions: number;
  try {
    original = await readFile(source);
    permissions = (await stat(source)).mode & 0o777;
  }
  catch {
    throw new Error(`找不到 Codex 登录凭据：${source}。请先执行 codex login；Docker AFK 需要文件凭据存储（cli_auth_credentials_store = "file"）。`);
  }
  const staged = await mkdtemp(join(tmpdir(), "iam-sandcastle-codex-"));
  const stagedAuth = join(staged, "auth.json");
  try {
    await writeFile(stagedAuth, original, { mode: 0o600 });
  }
  catch (error) {
    await rm(staged, { recursive: true, force: true });
    throw error;
  }
  let closed = false;
  return {
    mode,
    env: { CODEX_HOME: "/home/agent/.codex" },
    mounts: [{ hostPath: staged, sandboxPath: "/home/agent/.codex" }],
    close: async () => {
      if (closed)
        return;
      try {
        const refreshed = await readFile(stagedAuth);
        if (!refreshed.equals(original)) {
          const current = await readFile(source);
          if (!current.equals(original) && !current.equals(refreshed))
            throw new Error("宿主登录状态在 AFK 期间已改变，未覆盖宿主凭据。");
          if (!current.equals(refreshed)) {
            const replacement = `${source}.sandcastle-${randomUUID()}.tmp`;
            try {
              await writeFile(replacement, refreshed, { mode: permissions, flag: "wx" });
              if (!(await readFile(source)).equals(original))
                throw new Error("保存前宿主登录状态已改变，未覆盖宿主凭据。");
              await rename(replacement, source);
            }
            finally {
              await rm(replacement, { force: true });
            }
          }
        }
      }
      catch (error) {
        throw new Error(`Codex 凭据未同步；保留恢复目录 ${staged}。${error instanceof Error ? error.message : String(error)}`);
      }
      await rm(staged, { recursive: true, force: true });
      closed = true;
    },
  };
}

export async function checkCodexAuth(): Promise<string> {
  const auth = await prepareCodexAuth();
  await auth.close();
  return auth.mode;
}

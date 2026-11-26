import { randomUUID } from "node:crypto";
import { lstat, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AgentProvider } from "@ai-hero/sandcastle";
import { stageCredential } from "../core/auth.ts";
import type { AuthAdapter } from "../core/config.ts";

async function readAuth(path: string) {
  try {
    const file = await lstat(path);
    if (!file.isFile()) throw new Error();
    return { contents: await readFile(path, "utf8"), mode: file.mode & 0o777 };
  } catch {
    throw new Error("Codex file authentication requires a readable auth.json.");
  }
}

export function codexFileAuth(config: {
  source: string;
  sandboxHome: string;
  providers: readonly AgentProvider[];
}): AuthAdapter {
  const providers = new Set(config.providers);
  let writebacks: Promise<void> = Promise.resolve();
  return {
    appliesTo: (provider) => providers.has(provider),
    checkScope: "adapter",
    async check({ cwd }) {
      await readAuth(resolve(cwd, config.source));
    },
    async prepare({ cwd }) {
      const source = resolve(cwd, config.source);
      const original = await readAuth(source);
      const staged = await stageCredential("auth.json", original.contents);
      let close: Promise<void> | undefined;
      return {
        env: { CODEX_HOME: config.sandboxHome },
        mounts: [{ hostPath: staged.directory, sandboxPath: config.sandboxHome }],
        close: () => {
          close ??= writebacks
            .then(async () => {
              const refreshed = await readAuth(staged.path);
              if (refreshed.contents !== original.contents) {
                const current = await readAuth(source);
                if (current.contents !== refreshed.contents) {
                  if (current.contents !== original.contents) throw new Error("The source login changed.");
                  const temp = `${source}.${randomUUID()}.tmp`;
                  try {
                    await writeFile(temp, refreshed.contents, { flag: "wx", mode: current.mode });
                    await rename(temp, source);
                  } finally {
                    await rm(temp, { force: true });
                  }
                }
              }
              await staged.close();
            })
            .catch((cause) => {
              throw new Error(
                `Codex authentication writeback did not complete. Credentials retained in ${staged.directory}.`,
                { cause },
              );
            });
          writebacks = close.catch(() => {});
          return close;
        },
      };
    },
  };
}

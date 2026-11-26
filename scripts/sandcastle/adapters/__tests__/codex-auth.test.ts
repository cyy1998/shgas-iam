import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCode, codex } from "@ai-hero/sandcastle";
import { codexFileAuth } from "../codex-auth.ts";

test("the optional file adapter selects only configured providers and preserves a newer login", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-credentials-"));
  let stagedDir: string | undefined;
  try {
    const provider = codex("file-auth");
    const adapter = codexFileAuth({ source: "auth.json", sandboxHome: "/agent/.codex", providers: [provider] });
    expect(adapter.appliesTo(provider)).toBe(true);
    expect(adapter.appliesTo(codex("api-key"))).toBe(false);
    expect(adapter.appliesTo(claudeCode("review"))).toBe(false);
    const source = join(cwd, "auth.json");
    await writeFile(source, '{"tokens":"original fixture"}');
    const staged = await adapter.prepare({ cwd, provider });
    stagedDir = staged.mounts?.[0]?.hostPath;
    if (!stagedDir) throw new Error("Expected writable credentials");
    expect(staged.env?.CODEX_HOME).toBe("/agent/.codex");
    const updated = '{"tokens":"refreshed fixture"}';
    await writeFile(join(stagedDir, "auth.json"), updated);
    await staged.close();
    const refreshed = await readFile(source, "utf8");
    expect(refreshed).toBe(updated);

    const concurrent = await adapter.prepare({ cwd, provider });
    stagedDir = concurrent.mounts?.[0]?.hostPath;
    if (!stagedDir) throw new Error("Expected credentials recovery directory");
    await writeFile(join(stagedDir, "auth.json"), '{"tokens":"another refresh fixture"}');
    const newer = '{"tokens":"new login fixture"}';
    await writeFile(source, newer);
    const error = await concurrent.close().catch((reason: unknown) => reason);
    const preserved = await readFile(source, "utf8");
    expect(error).toBeInstanceOf(Error);
    expect(preserved).toBe(newer);
  } finally {
    if (stagedDir) await rm(stagedDir, { recursive: true, force: true });
    await rm(cwd, { recursive: true, force: true });
  }
});

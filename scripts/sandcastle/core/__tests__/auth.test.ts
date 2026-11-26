import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dockerRegistryAuth } from "../auth.ts";

test("registry credentials are scoped to configured domains and only the private copy is removed", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-registry-"));
  try {
    const path = join(cwd, "registry.json");
    const content = JSON.stringify({
      auths: { "one.example": { auth: "one-fixture" }, "two.example:5000": { identitytoken: "two-fixture" } },
    });
    await writeFile(path, content);
    const allowed = dockerRegistryAuth({ source: "registry.json", registries: ["one.example", "two.example:5000"] });
    await allowed.check(cwd);
    const staged = await allowed.prepare(cwd);
    const mount = staged.mounts?.[0];
    if (!mount) throw new Error("Expected a credential mount");
    try {
      const stagedContents = await readFile(mount.hostPath, "utf8");
      expect(stagedContents).toBe(content);
      expect(mount.readonly).toBe(true);
    } finally {
      await staged.close();
    }
    const removed = await readFile(mount.hostPath).catch((reason: unknown) => reason);
    const source = await readFile(path, "utf8");
    expect(removed).toMatchObject({ code: "ENOENT" });
    expect(source).toBe(content);
    const denied = await dockerRegistryAuth({ source: "registry.json", registries: ["one.example"] })
      .check(cwd)
      .catch((reason: unknown) => reason);
    expect(denied).toBeInstanceOf(Error);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

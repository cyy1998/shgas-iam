import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireRunLock } from "../lock.ts";

test("the kernel excludes a second runner and releases the same inode after SIGKILL", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-lock-"));
  const holder = Bun.spawn(
    [
      process.execPath,
      "-e",
      `import { acquireRunLock } from ${JSON.stringify(fileURLToPath(new URL("../lock.ts", import.meta.url)))};
      const release = await acquireRunLock(process.cwd());
      console.log("locked");
      for await (const _chunk of Bun.stdin.stream()) {}
      await release();`,
    ],
    { cwd, stdin: "pipe", stdout: "pipe", stderr: "inherit", timeout: 3_000 },
  );
  try {
    const output = holder.stdout.getReader();
    const ready = await output.read();
    output.releaseLock();
    expect(new TextDecoder().decode(ready.value).trim()).toBe("locked");

    const runner = join(cwd, ".sandcastle", "locks", "runner");
    const inode = (await stat(runner)).ino;
    const rejection = await acquireRunLock(cwd).then(
      async (release) => {
        await release();
        return undefined;
      },
      (error: unknown) => error,
    );
    expect(rejection).toBeInstanceOf(Error);
    const owner = JSON.parse(await readFile(runner, "utf8"));
    expect(owner).toEqual({ pid: holder.pid });

    holder.kill("SIGKILL");
    await holder.exited;
    const release = await acquireRunLock(cwd);
    await release();
    const after = await stat(runner);
    expect(after.ino).toBe(inode);
    expect(holder.signalCode).toBe("SIGKILL");
  } finally {
    holder.kill("SIGKILL");
    await holder.exited;
    await rm(cwd, { recursive: true, force: true });
  }
});

test("diagnostic PID records never prevent takeover when the kernel lock is free", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-lock-"));
  try {
    const directory = join(cwd, ".sandcastle");
    const locks = join(directory, "locks");
    await mkdir(locks, { recursive: true });
    const previous = JSON.stringify({ pid: process.pid, token: "old record" });
    const legacy = join(directory, "run.lock");
    const runner = join(locks, "runner");
    await writeFile(legacy, previous);
    await writeFile(runner, previous);
    const release = await acquireRunLock(cwd);
    try {
      expect(JSON.parse(await readFile(runner, "utf8"))).toEqual({ pid: process.pid });
      expect(await readFile(legacy, "utf8")).toBe(previous);
    } finally {
      await release();
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

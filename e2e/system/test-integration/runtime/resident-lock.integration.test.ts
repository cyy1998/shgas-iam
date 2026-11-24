import { expect, test } from "bun:test";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireResidentLock } from "../../src/resident-lock.ts";

test("another worktree sees the live owner, and concurrent contenders cannot share a dead owner's stack", async () => {
  const otherWorktree = await realpath(tmpdir());
  const state = await mkdtemp(join(otherWorktree, "iam-e2e-lock-"));
  const modulePath = import.meta.resolve("../../src/resident-lock.ts");
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `await (await import(${JSON.stringify(modulePath)})).acquireResidentLock(process.argv[1], process.cwd()); console.log("locked");`,
      state,
    ],
    { stdout: "pipe", stderr: "inherit", cwd: otherWorktree },
  );
  try {
    const reader = child.stdout.getReader();
    const first = await reader.read();
    reader.releaseLock();
    expect(new TextDecoder().decode(first.value).trim()).toBe("locked");

    const owner = JSON.parse(await readFile(join(state, "owner.lock"), "utf8"));
    expect(owner.pid).toBe(child.pid);
    expect(owner.worktree).toBe(otherWorktree);
    expect(Date.parse(owner.startedAt)).toBeGreaterThan(0);
    const conflict = await acquireResidentLock(state, process.cwd()).catch((error: unknown) => error);
    expect(conflict).toMatchObject({
      message: expect.stringContaining(`PID ${child.pid}, worktree ${otherWorktree}, started ${owner.startedAt}`),
    });

    child.kill("SIGKILL");
    await child.exited;
    const contenders = await Promise.allSettled([
      acquireResidentLock(state, process.cwd()),
      acquireResidentLock(state, process.cwd()),
    ]);
    const acquired = contenders.filter((result) => result.status === "fulfilled");
    try {
      expect(acquired).toHaveLength(1);
      expect(contenders.find((result) => result.status === "rejected")).toMatchObject({
        reason: { message: expect.stringContaining(`PID ${process.pid}`) },
      });
    } finally {
      for (const result of acquired) await result.value.release();
    }
  } finally {
    child.kill();
    await child.exited;
    await rm(state, { recursive: true, force: true });
  }
});

import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "../command.ts";
import { acquireRunLock } from "../lock.ts";

test("a live PID prevents takeover and an exited PID admits exactly one successor", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-lock-"));
  try {
    await mkdir(join(cwd, ".sandcastle"));
    const path = join(cwd, ".sandcastle", "run.lock");
    const activeRecord = JSON.stringify({ pid: process.pid });
    await writeFile(path, activeRecord);
    const rejection = await acquireRunLock(cwd).catch((reason: unknown) => reason);
    const owner = await readFile(path, "utf8");
    expect(rejection).toBeInstanceOf(Error);
    expect(owner).toBe(activeRecord);
    const departed = await command("sh", ["-c", 'echo "$$"'], cwd);
    await writeFile(path, JSON.stringify({ pid: Number(departed) }));
    const attempts = await Promise.allSettled([acquireRunLock(cwd), acquireRunLock(cwd)]);
    const acquired = attempts.flatMap((attempt) => (attempt.status === "fulfilled" ? [attempt.value] : []));
    try {
      expect(acquired).toHaveLength(1);
      expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    } finally {
      for (const release of acquired) await release();
    }
    const release = await acquireRunLock(cwd);
    await release();
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

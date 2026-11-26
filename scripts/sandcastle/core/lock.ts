import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hasCode } from "./command.ts";

async function lockDescriptor(fd: number): Promise<void> {
  // flock locks the shared open file description, which the runner retains after the child exits.
  const status = await new Promise<number | null>((resolve, reject) => {
    const child = spawn("flock", ["-n", "-E", "73", "3"], { stdio: ["ignore", "ignore", "ignore", fd] });
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (status === 73) throw new Error("Another Sandcastle runner holds the lock.");
  if (status !== 0) throw new Error("Unable to acquire the Sandcastle runner lock.");
}

function ownerExited(text: string): boolean {
  let pid: unknown;
  try {
    pid = JSON.parse(text)?.pid;
  } catch {
    throw new Error("Could not identify the runner lock owner. Preserve the lock for inspection.");
  }
  if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid < 1 || pid > 2 ** 31 - 1) {
    throw new Error("Could not identify the runner lock owner. Preserve the lock for inspection.");
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (hasCode(error, "ESRCH")) return true;
    if (hasCode(error, "EPERM")) return false;
    throw error;
  }
}

export async function acquireRunLock(cwd: string): Promise<() => Promise<void>> {
  const directory = join(cwd, ".sandcastle");
  const locks = join(directory, "locks");
  const path = join(directory, "run.lock");
  await mkdir(locks, { recursive: true, mode: 0o700 });
  // A stable inode serializes PID checking and stale-record replacement across contenders.
  const gate = await open(join(locks, "runner"), "a", 0o600);
  const token = randomUUID();
  const contents = JSON.stringify({ pid: process.pid, token });
  try {
    await lockDescriptor(gate.fd);
    const previous = await readFile(path, "utf8").catch((error) => {
      if (!hasCode(error, "ENOENT")) throw error;
    });
    if (previous !== undefined) {
      if (!ownerExited(previous)) throw new Error("Another Sandcastle runner has a live PID.");
      await unlink(path);
    }
    const temporary = join(locks, token);
    try {
      await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
      await link(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  } catch (error) {
    await gate.close();
    throw error;
  }
  let released: Promise<void> | undefined;
  return () => {
    released ??= (async () => {
      try {
        if ((await readFile(path, "utf8")) !== contents) throw new Error("Runner lock ownership changed.");
        await unlink(path);
      } finally {
        await gate.close();
      }
    })();
    return released;
  };
}

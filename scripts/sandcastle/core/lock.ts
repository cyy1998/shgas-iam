import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";

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

export async function acquireRunLock(cwd: string): Promise<() => Promise<void>> {
  const locks = join(cwd, ".sandcastle", "locks");
  await mkdir(locks, { recursive: true, mode: 0o700 });
  const gate = await open(join(locks, "runner"), "a", 0o600);
  try {
    await lockDescriptor(gate.fd);
    await gate.truncate();
    await gate.writeFile(JSON.stringify({ pid: process.pid }));
  } catch (error) {
    await gate.close();
    throw error;
  }
  let released: Promise<void> | undefined;
  return () => (released ??= gate.close());
}

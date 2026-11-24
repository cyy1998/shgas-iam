import { createHash } from "node:crypto";
import { mkdir, realpath, rm } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { join } from "node:path";
import { writeAtomicResourceRecord } from "../../../scripts/test-resources/managed-resources.mjs";

interface ResidentOwner {
  pid: number;
  worktree: string;
  startedAt: string;
}

export async function acquireResidentLock(directory: string, worktree: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const canonicalDirectory = await realpath(directory);
  const key = createHash("sha256").update(canonicalDirectory).digest();
  const port = 20_000 + (key.readUInt16BE(0) % 10_000);
  const owner: ResidentOwner = { pid: process.pid, worktree, startedAt: new Date().toISOString() };
  const identity = key.toString("hex");
  const lockPath = join(canonicalDirectory, "owner.lock");
  // The loopback listener serializes publication/removal of the lock file and is released
  // by the OS on process death. A stale file cannot grant ownership, even after PID reuse.
  const server = createServer((socket) => {
    socket.on("error", () => socket.destroy());
    socket.end(JSON.stringify({ identity, owner }), () => socket.destroy());
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
    });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EADDRINUSE")) throw error;
    const occupant = await readOccupant(port, identity);
    throw new Error(
      occupant
        ? `E2E resident stack is held by PID ${occupant.pid}, worktree ${occupant.worktree}, started ${occupant.startedAt}`
        : `Cannot acquire E2E resident lock at ${lockPath}: loopback port ${port} has an unknown owner`,
      { cause: error },
    );
  }

  const close = () =>
    new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  try {
    await writeAtomicResourceRecord(lockPath, owner);
  } catch (error) {
    await close();
    throw error;
  }
  let release: Promise<void> | undefined;
  return {
    release: () =>
      (release ??= (async () => {
        try {
          await rm(lockPath, { force: true });
        } finally {
          await close();
        }
      })()),
  };
}

async function readOccupant(port: number, identity: string): Promise<ResidentOwner | undefined> {
  return await new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let data = "";
    socket.setEncoding("utf8");
    socket.setTimeout(300, () => socket.destroy());
    socket.on("error", () => socket.destroy());
    socket.on("data", (chunk: string) => {
      data += chunk;
      if (data.length > 8192) socket.destroy();
    });
    socket.on("close", () => {
      try {
        const response = JSON.parse(data);
        const owner = response.owner;
        resolve(
          response.identity === identity &&
            Number.isInteger(owner?.pid) &&
            typeof owner.worktree === "string" &&
            typeof owner.startedAt === "string"
            ? owner
            : undefined,
        );
      } catch {
        resolve(undefined);
      }
    });
  });
}

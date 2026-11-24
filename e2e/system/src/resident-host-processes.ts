import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { closeOwnedProcessScope, ownedProcessScopeEnvironment } from "@iam/runtime/process";
import { writeAtomicResourceRecord } from "../../../scripts/test-resources/managed-resources.mjs";
import { runWithCleanup } from "./bounded-operation.ts";

const identityPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const recordName = "host-process-scope.json";

// Both entry points require the resident lock. Record ownership before any child can run.
export async function withResidentHostProcesses<T>(directory: string, use: (env: NodeJS.ProcessEnv) => Promise<T>) {
  const id = randomUUID();
  const activeFile = permitPath(directory, id);
  await writeAtomicResourceRecord(join(directory, recordName), { id });
  return await runWithCleanup(
    async () => {
      await writeFile(activeFile, "", { flag: "wx", mode: 0o600 });
      return await use(ownedProcessScopeEnvironment({ id, activeFile }));
    },
    () => recoverResidentHostProcesses(directory),
  );
}

export async function recoverResidentHostProcesses(directory: string) {
  const recordPath = join(directory, recordName);
  const content = await readFile(recordPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (content === undefined) return;
  const record: { id?: unknown } | null = JSON.parse(content);
  const id = record?.id;
  if (typeof id !== "string" || !identityPattern.test(id)) {
    throw new Error(`Invalid resident host process scope at ${recordPath}`);
  }
  // Revocation fences late launches even when a crashed owner was interrupted while spawning.
  await rm(permitPath(directory, id), { force: true });
  try {
    await closeOwnedProcessScope(id, { timeoutMs: 5_000, forceAfterMs: 3_000 });
  } catch (error) {
    throw new Error(`Could not recover resident host processes; preserved ${recordPath}`, { cause: error });
  }
  await rm(recordPath);
}

function permitPath(directory: string, id: string) {
  return join(directory, `host-process-${id}.active`);
}

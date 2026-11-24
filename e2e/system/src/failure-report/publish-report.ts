import { mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { writeAtomicTextFile } from "../atomic-json-file.ts";

interface ReportContents {
  json: string;
  markdown: string;
}

export async function writeReportHistory(root: string, runId: string, contents: ReportContents) {
  if (!/^[a-z\d][a-z\d_-]{0,95}$/iu.test(runId)) throw new Error("Invalid E2E failure report run ID");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = join(root, runId);
  await mkdir(directory, { mode: 0o700 });
  const paths = { markdown: join(directory, "failure-summary.md"), json: join(directory, "failure-summary.json") };
  await writeAtomicTextFile(paths.markdown, contents.markdown, 0o600);
  await writeAtomicTextFile(paths.json, contents.json, 0o600);
  return paths;
}

export async function publishLastFailure(root: string, runId: string, contents: ReportContents) {
  const lockPath = join(root, ".last-failure.lock");
  const lock = await acquirePublicationLock(lockPath);
  try {
    await lock.writeFile(`pid=${process.pid}\nrunId=${runId}\n`);
    // The lock serializes different Playwright processes. Each rename publishes a whole file to readers.
    await writeAtomicTextFile(join(root, "last-failure.md"), contents.markdown, 0o600);
    await writeAtomicTextFile(join(root, "last-failure.json"), contents.json, 0o600);
  } finally {
    try {
      await lock.close();
    } finally {
      await rm(lockPath);
    }
  }
}

async function acquirePublicationLock(path: string) {
  const deadline = performance.now() + 5_000;
  for (;;) {
    try {
      return await open(path, "wx", 0o600);
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      if (performance.now() >= deadline) {
        throw new Error(
          `E2E failure report publication lock at ${path}. Check its owner has exited before removing it.`,
        );
      }
    }
    await delay(25);
  }
}

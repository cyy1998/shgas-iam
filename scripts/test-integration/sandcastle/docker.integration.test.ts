import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recoverExecutorResources } from "../../sandcastle/resources.ts";
import { dockerSandbox } from "../../sandcastle/sandbox.mts";

test("daemon access preserves ordinary client file mount validation", () => {
  const missing = join(tmpdir(), `iam-missing-${randomUUID()}`);
  expect(() =>
    dockerSandbox({
      network: "host",
      daemonAccess: { socketGroupId: 123 },
      mounts: [{ hostPath: missing, sandboxPath: "/tmp/ordinary-file" }],
    }),
  ).toThrow();
});

test("executor recovery rejects a descriptor naming another container and preserves the record", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "iam-afk-recovery-"));
  const runId = randomUUID();
  const directory = `.sandcastle/resources/executor-${runId}`;
  const path = `${directory}/executor.json`;
  const contents = JSON.stringify({
    runId,
    containerName: `unrelated-${runId}`,
    socketProbeName: `iam-afk-socket-${runId}`,
    registryFile: `${directory}/registry.jsonl`,
  });
  try {
    await mkdir(join(cwd, directory), { recursive: true });
    await writeFile(join(cwd, path), contents);
    let failure: unknown;
    try {
      await recoverExecutorResources(cwd, path);
    } catch (error) {
      failure = error;
    }
    const retained = await readFile(join(cwd, path), "utf8");
    expect(String(failure)).toContain("Invalid executor recovery record");
    expect(retained).toBe(contents);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

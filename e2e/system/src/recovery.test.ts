import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { createRunDescriptor, persistRunDescriptor } from "./descriptor.ts";
import { recoverExactProject } from "./recovery.ts";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory !== undefined)
    await rm(temporaryDirectory, { force: true, recursive: true });
  temporaryDirectory = undefined;
});

describe("exact-project recovery", () => {
  test("cleans only an explicit descriptor or exact project target", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "iam-e2e-recovery-"));
    const descriptor = createRunDescriptor({
      artifactRoot: temporaryDirectory,
      gatewayPort: 43877,
      runId: "run-recovery-01",
    });
    const descriptorPath = await persistRunDescriptor(descriptor);
    const cleaned: string[] = [];
    const cleanup = async (project: string) => cleaned.push(project);

    await recoverExactProject({ descriptorPath }, cleanup);
    await recoverExactProject({ project: "iam-e2e-run-recovery-02" }, cleanup);

    expect(cleaned).toEqual([
      "iam-e2e-run-recovery-01",
      "iam-e2e-run-recovery-02",
    ]);
  });

  test("rejects ambiguous, prefix, and non-E2E targets before cleanup", async () => {
    const cleaned: string[] = [];
    const cleanup = async (project: string) => cleaned.push(project);

    await expect(recoverExactProject({}, cleanup)).rejects.toThrow("exactly one");
    await expect(recoverExactProject({
      descriptorPath: "run-descriptor.json",
      project: "iam-e2e-run-recovery-02",
    }, cleanup)).rejects.toThrow("exactly one");
    await expect(
      recoverExactProject({ project: "iam-e2e-*" }, cleanup),
    ).rejects.toThrow("exact E2E project");
    expect(cleaned).toEqual([]);
  });

  test("bounds a hung best-effort recovery attempt", async () => {
    let cleanupSignal: AbortSignal | undefined;
    const recovery = recoverExactProject(
      { project: "iam-e2e-run-recovery-timeout" },
      async (_project, signal) => {
        cleanupSignal = signal;
        await new Promise(() => undefined);
      },
      { abortSettleTimeoutMs: 10, timeoutMs: 5 },
    );

    await expect(recovery).rejects.toThrow(
      "E2E explicit recovery cleanup timed out after 5ms",
    );
    expect(cleanupSignal?.aborted).toBe(true);
  });

  test("returns the ordinary cleanup failure for later retry", async () => {
    const cleanupFailure = new Error("synthetic cleanup failure");
    await expect(recoverExactProject(
      { project: "iam-e2e-run-recovery-failure" },
      async () => {
        throw cleanupFailure;
      },
    )).rejects.toBe(cleanupFailure);
  });
});

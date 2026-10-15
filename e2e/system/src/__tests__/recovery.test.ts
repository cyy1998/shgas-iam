import { describe, expect, test } from "bun:test";
import { recoverExactProject } from "../recovery.ts";

describe("exact-project recovery", () => {
  test("rejects ambiguous, prefix, and non-E2E targets before cleanup", async () => {
    const cleaned: string[] = [];
    const cleanup = async (project: string) => cleaned.push(project);

    await expect(recoverExactProject({}, cleanup)).rejects.toThrow("exactly one");
    await expect(
      recoverExactProject(
        {
          descriptorPath: "run-descriptor.json",
          project: "iam-e2e-run-recovery-02",
        },
        cleanup,
      ),
    ).rejects.toThrow("exactly one");
    await expect(recoverExactProject({ project: "iam-e2e-*" }, cleanup)).rejects.toThrow("exact E2E project");
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

    await expect(recovery).rejects.toThrow("E2E explicit recovery cleanup timed out after 5ms");
    expect(cleanupSignal?.aborted).toBe(true);
  });

  test("returns the ordinary cleanup failure for later retry", async () => {
    const cleanupFailure = new Error("synthetic cleanup failure");
    await expect(
      recoverExactProject({ project: "iam-e2e-run-recovery-failure" }, async () => {
        throw cleanupFailure;
      }),
    ).rejects.toBe(cleanupFailure);
  });
});

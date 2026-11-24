import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recoverExactProject } from "../../src/recovery.ts";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory !== undefined) await rm(temporaryDirectory, { force: true, recursive: true });
  temporaryDirectory = undefined;
});

describe("exact-project recovery", () => {
  test("cleans only an explicit descriptor or exact project target", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "iam-e2e-recovery-"));
    const descriptorPath = join(temporaryDirectory, "run-descriptor.json");
    await writeFile(
      descriptorPath,
      JSON.stringify({
        version: 1,
        runId: "run-recovery-01",
        project: "iam-e2e-run-recovery-01",
        labels: {
          "com.docker.compose.project": "iam-e2e-run-recovery-01",
          "com.shgas-iam.e2e.run-id": "run-recovery-01",
        },
      }),
    );
    const cleaned: string[] = [];
    const cleanup = async (project: string) => cleaned.push(project);

    await recoverExactProject({ descriptorPath }, cleanup);
    await recoverExactProject({ project: "iam-e2e-run-recovery-02" }, cleanup);

    expect(cleaned).toEqual(["iam-e2e-run-recovery-01", "iam-e2e-run-recovery-02"]);
  });
});

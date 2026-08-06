import type { RunDescriptor } from "./lifecycle.ts";
import { mkdir, mkdtemp, open, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  collectPlaywrightEvidence,
  playwrightEvidenceLimits,
  playwrightStagingDirectory,
} from "./playwright-evidence.ts";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory !== undefined)
    await rm(temporaryDirectory, { force: true, recursive: true });
  temporaryDirectory = undefined;
});

describe("Playwright raw evidence intake", () => {
  test("moves raw trace, screenshot, and video into the run artifact", async () => {
    const descriptor = await createDescriptor("raw-intake");
    const staging = playwrightStagingDirectory(descriptor);
    await mkdir(join(staging, "nested"), { recursive: true });
    await Promise.all([
      writeFile(join(staging, "trace.zip"), "RAW-TRACE"),
      writeFile(join(staging, "failure.png"), "RAW-SCREENSHOT"),
      writeFile(join(staging, "nested", "recording.webm"), "RAW-VIDEO"),
    ]);

    const result = await collectPlaywrightEvidence({ descriptor });

    expect(await readFile(
      join(descriptor.artifactDirectory, "playwright", "trace.zip"),
      "utf8",
    )).toBe("RAW-TRACE");
    expect(await readFile(
      join(descriptor.artifactDirectory, "playwright", "failure.png"),
      "utf8",
    )).toBe("RAW-SCREENSHOT");
    expect(await readFile(
      join(descriptor.artifactDirectory, "playwright", "nested", "recording.webm"),
      "utf8",
    )).toBe("RAW-VIDEO");
    const metadata = await readFile(result.metadataPath, "utf8");
    expect(metadata).toContain("playwright/trace.zip");
    expect(metadata).toContain("playwright/failure.png");
    expect(metadata).toContain("playwright/nested/recording.webm");
  });

  test("rejects symlinks without deleting the staged raw file", async () => {
    const descriptor = await createDescriptor("raw-symlink");
    const staging = playwrightStagingDirectory(descriptor);
    await mkdir(staging, { recursive: true });
    const artifactRoot = dirname(descriptor.artifactDirectory);
    const outside = join(artifactRoot, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "outside.png"), "OUTSIDE-RAW");
    await symlink(outside, join(staging, "linked"), "junction");

    await expect(collectPlaywrightEvidence({ descriptor })).rejects.toThrow(
      "symbolic links are forbidden",
    );
    expect(await readFile(join(outside, "outside.png"), "utf8"))
      .toBe("OUTSIDE-RAW");
  });

  test("keeps an oversized staged file for recovery", async () => {
    const descriptor = await createDescriptor("raw-limit");
    const staging = playwrightStagingDirectory(descriptor);
    await mkdir(staging, { recursive: true });
    const trace = join(staging, "trace.zip");
    await writeFile(trace, "x");
    const file = await open(trace, "r+");
    await file.truncate(playwrightEvidenceLimits.maxBytesPerFile + 1);
    await file.close();

    await expect(collectPlaywrightEvidence({ descriptor })).rejects.toThrow(
      "byte limit",
    );
    expect(await Bun.file(trace).exists()).toBe(true);
  });
});

async function createDescriptor(runId: string): Promise<RunDescriptor> {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "iam-e2e-playwright-"));
  return {
    version: 1,
    runId,
    project: `iam-e2e-${runId}`,
    gatewayPort: 43124,
    origin: "http://127.0.0.1:43124",
    artifactDirectory: join(temporaryDirectory, runId),
    labels: {
      "com.docker.compose.project": `iam-e2e-${runId}`,
      "com.shgas-iam.e2e.run-id": runId,
    },
  };
}

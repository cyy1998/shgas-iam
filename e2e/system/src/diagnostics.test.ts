import type { RunDescriptor } from "./lifecycle.ts";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { collectRunDiagnostics } from "./diagnostics.ts";
import { playwrightStagingDirectory } from "./playwright-evidence.ts";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory !== undefined)
    await rm(temporaryDirectory, { force: true, recursive: true });
  temporaryDirectory = undefined;
});

describe("run diagnostics", () => {
  test("keeps bounded synthetic diagnostics and raw Playwright evidence", async () => {
    const descriptor = await createDescriptor("raw-evidence");
    const staging = playwrightStagingDirectory(descriptor);
    await mkdir(staging, { recursive: true });
    await writeFile(join(staging, "trace.zip"), "SYNTHETIC-RAW-TRACE");
    await writeFile(join(staging, "failure.png"), "SYNTHETIC-RAW-PNG");
    await writeFile(
      join(descriptor.artifactDirectory, "migration-receipt.json"),
      "{\"status\":\"applied\"}\n",
    );

    const result = await collectRunDiagnostics({
      descriptor,
      maxBytesPerArtifact: 96,
      readComposePs: async () => "SYNTHETIC_PASSWORD=compose-password",
      readRecentLogs: async () => `Authorization: Bearer synthetic-token\n${"x".repeat(200)}`,
      readGatewayState: async () => "{\"privateKey\":\"synthetic-key\"}",
    });

    expect(await readFile(
      join(descriptor.artifactDirectory, "compose-ps.json"),
      "utf8",
    )).toContain("compose-password");
    expect(await readFile(
      join(descriptor.artifactDirectory, "compose-logs.txt"),
      "utf8",
    )).toContain("synthetic-token");
    expect(await readFile(
      join(descriptor.artifactDirectory, "gateway-state.json"),
      "utf8",
    )).toContain("synthetic-key");
    expect(await readFile(
      join(descriptor.artifactDirectory, "playwright", "trace.zip"),
      "utf8",
    )).toBe("SYNTHETIC-RAW-TRACE");
    expect(await readFile(
      join(descriptor.artifactDirectory, "playwright", "failure.png"),
      "utf8",
    )).toBe("SYNTHETIC-RAW-PNG");
    const index = JSON.parse(await readFile(result.indexPath, "utf8")) as {
      existingArtifacts: string[];
      unavailableSources: string[];
    };
    expect(index.existingArtifacts).toEqual(["migration-receipt.json"]);
    expect(index.unavailableSources).toEqual([]);
  });

  test("writes available sources and an index before reporting required failures", async () => {
    const descriptor = await createDescriptor("source-failure");

    const collection = collectRunDiagnostics({
      descriptor,
      readComposePs: async () => {
        throw new Error("compose unavailable");
      },
      readPlaywrightEvidence: async () => {
        throw new Error("Playwright unavailable");
      },
      readRecentLogs: async () => "available logs",
      readGatewayState: async () => "available gateway state",
    });

    await expect(collection).rejects.toThrow("required diagnostic source failed");
    expect(await readFile(
      join(descriptor.artifactDirectory, "compose-logs.txt"),
      "utf8",
    )).toBe("available logs");
    expect(JSON.parse(await readFile(
      join(descriptor.artifactDirectory, "playwright-evidence.json"),
      "utf8",
    ))).toEqual({
      version: 1,
      status: "unavailable",
      artifacts: [],
    });
    const index = await readFile(
      join(descriptor.artifactDirectory, "diagnostics-index.json"),
      "utf8",
    );
    expect(index).toContain("compose-ps.json");
    expect(index).toContain("playwright-evidence");
  });

  test("bounds a hung source and still writes other evidence", async () => {
    const descriptor = await createDescriptor("source-timeout");
    let sourceSignal: AbortSignal | undefined;

    const collection = collectRunDiagnostics({
      abortSettleTimeoutMs: 10,
      descriptor,
      sourceTimeoutMs: 5,
      readComposePs: async (signal) => {
        sourceSignal = signal;
        return new Promise(() => undefined);
      },
      readPlaywrightEvidence: async () => undefined,
      readRecentLogs: async () => "available logs",
      readGatewayState: async () => "available gateway state",
    });

    await expect(collection).rejects.toThrow("required diagnostic source failed");
    expect(sourceSignal?.aborted).toBe(true);
    expect(await readFile(
      join(descriptor.artifactDirectory, "compose-logs.txt"),
      "utf8",
    )).toBe("available logs");
  });
});

async function createDescriptor(runId: string): Promise<RunDescriptor> {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "iam-e2e-diagnostics-"));
  const artifactDirectory = join(temporaryDirectory, runId);
  await mkdir(artifactDirectory, { recursive: true });
  return {
    version: 1,
    runId,
    project: `iam-e2e-${runId}`,
    gatewayPort: 43124,
    origin: "http://127.0.0.1:43124",
    artifactDirectory,
    labels: {
      "com.docker.compose.project": `iam-e2e-${runId}`,
      "com.shgas-iam.e2e.run-id": runId,
    },
  };
}

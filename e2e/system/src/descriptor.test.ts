import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createRunDescriptor,
  persistRunDescriptor,
} from "./descriptor.ts";

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory !== undefined)
    await rm(temporaryDirectory, { force: true, recursive: true });
  temporaryDirectory = undefined;
});

describe("run descriptor", () => {
  test("records only the exact project inventory before resources can be created", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "iam-e2e-descriptor-"));
    const descriptor = createRunDescriptor({
      artifactRoot: temporaryDirectory,
      gatewayPort: 43876,
      runId: "20260805-contract-ab12cd34",
    });

    const descriptorPath = await persistRunDescriptor(descriptor);
    const persisted = JSON.parse(await readFile(descriptorPath, "utf8"));

    expect(persisted).toEqual({
      version: 1,
      runId: "20260805-contract-ab12cd34",
      project: "iam-e2e-20260805-contract-ab12cd34",
      gatewayPort: 43876,
      origin: "http://127.0.0.1:43876",
      artifactDirectory: join(
        temporaryDirectory,
        "20260805-contract-ab12cd34",
      ),
      labels: {
        "com.docker.compose.project": "iam-e2e-20260805-contract-ab12cd34",
        "com.shgas-iam.e2e.run-id": "20260805-contract-ab12cd34",
      },
    });
    expect(JSON.stringify(persisted)).not.toMatch(/password|token|secret/iu);
    await expect(persistRunDescriptor(descriptor)).rejects.toThrow();
  });
});
